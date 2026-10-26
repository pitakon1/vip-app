"""业绩路由：系统自动核算的业绩报表与排行榜。

平台租约成交由系统根据佣金结算（CommissionSettlement）自动聚合业绩；
非平台成交（平台对接客户 / 销售自主拓客）通过 `manual_deals` 手工补录，
补录后同样计入当月业绩。
"""
import uuid
from collections import defaultdict
from datetime import date as date_type, datetime, timedelta
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import require_employee
from app.models import (
    CommissionSettlement,
    DealSource,
    DealType,
    Employee,
    ManualDeal,
    Partner,
    Property,
    User,
    UserRole,
)

router = APIRouter(prefix="/performance", tags=["performance"])

DEAL_TYPE_LABELS = {
    DealType.new_rental: "新租成交",
    DealType.renewal: "续约成交",
    DealType.management: "托管服务",
}

# 手工补录的成交类型展示名（deal_type 为字符串，不含 sale_transaction 的原枚举）
MANUAL_DEAL_TYPE_LABELS = {
    "new_rental": "租赁成交",
    "renewal": "续约成交",
    "sale_transaction": "买卖成交",
    "management": "托管服务",
}


# ---------------- 响应模型（OpenAPI 契约） ----------------
class PerformanceBreakdownItem(BaseModel):
    """成交类型拆分条目。"""

    model_config = ConfigDict(extra="allow")

    deal_type: Optional[str] = None
    label: Optional[str] = None
    amount: Optional[float] = None
    count: Optional[int] = None
    percent: Optional[float] = None


class PerformanceSummary(BaseModel):
    """业绩汇总口径（本年/本月/累计/成交类型拆分）。"""

    model_config = ConfigDict(extra="allow")

    year: Optional[int] = None
    month: Optional[int] = None
    year_total: Optional[float] = None
    month_total: Optional[float] = None
    deals_total: Optional[int] = None
    month_deals: Optional[int] = None
    commission_total: Optional[float] = None
    month_commission: Optional[float] = None
    new_rentals: Optional[int] = None
    renewals: Optional[int] = None
    management: Optional[int] = None
    breakdown: Optional[List[PerformanceBreakdownItem]] = None


class PerformanceMonthRow(BaseModel):
    """月度业绩序列条目。"""

    model_config = ConfigDict(extra="allow")

    year: Optional[int] = None
    month: Optional[int] = None
    revenue: Optional[float] = None
    commission: Optional[float] = None
    deals: Optional[int] = None


class MyPerformanceOut(BaseModel):
    """我的业绩报表响应。"""

    model_config = ConfigDict(extra="allow")

    summary: Optional[PerformanceSummary] = None
    monthly: Optional[List[PerformanceMonthRow]] = None


# ---------------- 手工补录业绩（非平台成交） ----------------
class ManualDealCreate(BaseModel):
    """手工补录业绩请求体。"""

    source: Literal["platform_customer", "self_sourced"]
    deal_type: Literal["new_rental", "renewal", "sale_transaction", "management"]
    deal_date: date_type
    deal_amount: float = Field(gt=0)
    commission_amount: float = Field(default=0, ge=0)
    currency: str = Field(default="THB", max_length=3)
    customer_name: Optional[str] = None
    property_id: Optional[uuid.UUID] = None
    note: Optional[str] = None
    employee_id: Optional[uuid.UUID] = None

    @field_validator("deal_date")
    @classmethod
    def _reject_future_date(cls, value: date_type) -> date_type:
        """成交日期必填，且不能晚于今天 +1 天（容忍时区差异）。"""
        if value > datetime.utcnow().date() + timedelta(days=1):
            raise ValueError("deal_date cannot be later than tomorrow")
        return value


class ManualDealOut(BaseModel):
    """手工补录业绩响应。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    source: Optional[str] = None
    deal_type: Optional[str] = None
    deal_date: Optional[date_type] = None
    deal_amount: Optional[float] = None
    commission_amount: Optional[float] = None
    currency: Optional[str] = None
    customer_name: Optional[str] = None
    property_id: Optional[str] = None
    note: Optional[str] = None
    created_at: Optional[datetime] = None


class PerformanceLeaderboardRow(BaseModel):
    """业绩排行榜条目。"""

    model_config = ConfigDict(extra="allow")

    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    total_commission: Optional[float] = None
    total_revenue: Optional[float] = None
    deals: Optional[int] = None


def _get_employee(session: Session, user: User) -> Employee:
    employee = session.exec(
        select(Employee).where(
            Employee.user_id == user.id,
            Employee.deleted_at.is_(None),
        )
    ).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee profile not found")
    return employee


def _get_employee_by_id(session: Session, employee_id: uuid.UUID) -> Employee:
    employee = session.get(Employee, employee_id)
    if not employee or employee.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Employee profile not found")
    return employee


def _employee_name_map(
    session: Session, employee_ids
) -> Dict[uuid.UUID, Optional[str]]:
    """批量加载员工姓名（员工 -> 用户 full_name），避免逐条查询。"""
    ids = {e for e in employee_ids if e}
    if not ids:
        return {}
    employees = {
        e.id: e
        for e in session.exec(select(Employee).where(Employee.id.in_(ids))).all()
    }
    user_ids = {e.user_id for e in employees.values() if e.user_id}
    users = (
        {u.id: u for u in session.exec(select(User).where(User.id.in_(user_ids))).all()}
        if user_ids
        else {}
    )
    return {
        emp_id: (users.get(emp.user_id).full_name if users.get(emp.user_id) else None)
        for emp_id, emp in employees.items()
    }


def _serialize_manual_deal(
    deal: ManualDeal, employee_name: Optional[str]
) -> Dict:
    return {
        "id": str(deal.id),
        "employee_id": str(deal.employee_id),
        "employee_name": employee_name,
        "source": deal.source.value
        if isinstance(deal.source, DealSource)
        else str(deal.source),
        "deal_type": deal.deal_type,
        "deal_date": deal.deal_date,
        "deal_amount": deal.deal_amount,
        "commission_amount": deal.commission_amount,
        "currency": deal.currency,
        "customer_name": deal.customer_name,
        "property_id": str(deal.property_id) if deal.property_id else None,
        "note": deal.note,
        "created_at": deal.created_at,
    }


@router.post("/deals", response_model=ManualDealOut)
def create_manual_deal(
    payload: ManualDealCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """手工补录非平台成交业绩（平台对接客户 / 销售自主拓客）。

    仅 admin 可指定为他人补录；其他角色只能给自己补录。
    """
    if payload.employee_id is not None and user.role != UserRole.admin:
        me = _get_employee(session, user)
        if payload.employee_id != me.id:
            raise HTTPException(
                status_code=403,
                detail="Cannot record deals for other employees",
            )
    if payload.employee_id is not None and user.role == UserRole.admin:
        employee = _get_employee_by_id(session, payload.employee_id)
    else:
        employee = _get_employee(session, user)

    if payload.property_id is not None:
        prop = session.get(Property, payload.property_id)
        if not prop or prop.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Property not found")

    deal = ManualDeal(
        employee_id=employee.id,
        source=DealSource(payload.source),
        deal_type=payload.deal_type,
        deal_date=payload.deal_date,
        deal_amount=payload.deal_amount,
        commission_amount=payload.commission_amount,
        currency=payload.currency,
        customer_name=payload.customer_name,
        property_id=payload.property_id,
        note=payload.note,
        created_by=user.id,
    )
    session.add(deal)
    session.commit()
    session.refresh(deal)
    return _serialize_manual_deal(
        deal, _employee_name_map(session, [employee.id]).get(employee.id)
    )


@router.get("/deals", response_model=List[ManualDealOut])
def list_manual_deals(
    year: Optional[int] = None,
    month: Optional[int] = None,
    employee_id: Optional[uuid.UUID] = None,
    source: Optional[Literal["platform_customer", "self_sourced"]] = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """月度补录业绩列表（默认当前月）。

    非 admin 只能查看自己的补录；admin 可查看全部或按 employee_id 过滤。
    """
    is_admin = user.role == UserRole.admin
    conditions = [ManualDeal.deleted_at.is_(None)]

    if employee_id is not None:
        if not is_admin:
            me = _get_employee(session, user)
            if employee_id != me.id:
                raise HTTPException(
                    status_code=403,
                    detail="Cannot view other employees' deals",
                )
        conditions.append(ManualDeal.employee_id == employee_id)
    elif not is_admin:
        conditions.append(ManualDeal.employee_id == _get_employee(session, user).id)

    if source is not None:
        conditions.append(ManualDeal.source == DealSource(source))

    now = datetime.utcnow()
    if year is None and month is None:
        year, month = now.year, now.month
    if year and month:
        start = date_type(year, month, 1)
        end = (
            date_type(year + 1, 1, 1)
            if month == 12
            else date_type(year, month + 1, 1)
        )
        conditions.append(ManualDeal.deal_date >= start)
        conditions.append(ManualDeal.deal_date < end)
    elif year:
        conditions.append(ManualDeal.deal_date >= date_type(year, 1, 1))
        conditions.append(ManualDeal.deal_date < date_type(year + 1, 1, 1))
    elif month:
        # 仅传月：任意年份的该月（与排行榜口径一致，跨方言）
        conditions.append(func.extract("month", ManualDeal.deal_date) == month)

    deals = session.exec(
        select(ManualDeal)
        .where(*conditions)
        .order_by(ManualDeal.deal_date.desc(), ManualDeal.created_at.desc())
    ).all()
    names = _employee_name_map(session, [d.employee_id for d in deals])
    return [_serialize_manual_deal(d, names.get(d.employee_id)) for d in deals]


@router.delete("/deals/{deal_id}")
def delete_manual_deal(
    deal_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """软删除补录记录：仅本人或 admin。"""
    deal = session.get(ManualDeal, deal_id)
    if not deal or deal.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Deal not found")
    if user.role != UserRole.admin:
        me = _get_employee(session, user)
        if deal.employee_id != me.id:
            raise HTTPException(
                status_code=403,
                detail="Cannot delete other employees' deals",
            )
    deal.deleted_at = datetime.utcnow()
    session.add(deal)
    session.commit()
    return {"id": str(deal.id), "deleted": True}


def _settlement_rows(
    session: Session, employee_id: uuid.UUID
) -> List[CommissionSettlement]:
    """当前员工的全部佣金结算（系统自动核算的业绩依据）。"""
    return session.exec(
        select(CommissionSettlement).where(
            CommissionSettlement.employee_id == employee_id,
            CommissionSettlement.deleted_at.is_(None),
        )
    ).all()


def _month_series(settlements: List[CommissionSettlement], n: int = 12) -> List[Dict]:
    """按自然月聚合最近 n 个月的业绩序列（含空月份）。

    一条成交可能拆成多条角色结算（listing_agent / partner_company 等），
    revenue 与 deals 必须按 lease_id 去重，避免同一笔成交被重复计入。
    """
    monthly: Dict[tuple, dict] = defaultdict(
        lambda: {"year": 0, "month": 0, "revenue": 0.0, "commission": 0.0, "deals": 0}
    )
    seen_leases: set = set()
    for s in settlements:
        ts = s.created_at
        key = (ts.year, ts.month)
        monthly[key]["year"] = ts.year
        monthly[key]["month"] = ts.month
        # commission 是该角色分到的钱，应累加；revenue/deals 按成交去重
        monthly[key]["commission"] += s.commission_amount or 0
        if s.lease_id in seen_leases:
            continue
        seen_leases.add(s.lease_id)
        monthly[key]["revenue"] += s.commission_base or 0
        monthly[key]["deals"] += 1

    now = datetime.utcnow()
    series = []
    for offset in range(n - 1, -1, -1):
        y = now.year
        m = now.month - offset
        while m <= 0:
            m += 12
            y -= 1
        row = monthly.get((y, m))
        series.append(
            row
            if row
            else {"year": y, "month": m, "revenue": 0.0, "commission": 0.0, "deals": 0}
        )
    return series


def _build_summary(
    settlements: List[CommissionSettlement], now: datetime
) -> Dict:
    """汇总口径：本年/本月业绩、累计成交、累计佣金与成交类型拆分。

    成交笔数（revenue/deals/breakdown count）按 lease_id 去重；
    commission 为该角色实际分到的钱，累加（多角色拆分的全部分成之和即佣金池）。
    """
    year_total = month_total = commission_total = month_commission = 0.0
    deals_total = month_deals = new_rentals = renewals = management = 0
    seen_leases: set = set()
    breakdown: Dict[str, dict] = {}

    for s in settlements:
        ts = s.created_at
        revenue = s.commission_base or 0
        commission = s.commission_amount or 0
        is_primary = s.lease_id not in seen_leases
        if is_primary:
            seen_leases.add(s.lease_id)
            deals_total += 1
            if ts.year == now.year:
                year_total += revenue
            if ts.month == now.month:
                month_deals += 1
                month_total += revenue
        commission_total += commission

        if ts.year == now.year and ts.month == now.month:
            month_commission += commission
            key = s.deal_type.value
            if key not in breakdown:
                breakdown[key] = {
                    "deal_type": key,
                    "label": DEAL_TYPE_LABELS.get(s.deal_type, key),
                    "amount": 0.0,
                    "count": 0,
                }
            breakdown[key]["amount"] += commission
            if is_primary:
                breakdown[key]["count"] += 1

        if s.deal_type == DealType.new_rental:
            new_rentals += 1
        elif s.deal_type == DealType.renewal:
            renewals += 1
        elif s.deal_type == DealType.management:
            management += 1

    total_amt = sum(b["amount"] for b in breakdown.values()) or 1.0
    for b in breakdown.values():
        b["percent"] = round(b["amount"] / total_amt * 100, 1)

    return {
        "year": now.year,
        "month": now.month,
        "year_total": round(year_total, 2),
        "month_total": round(month_total, 2),
        "deals_total": deals_total,
        "month_deals": month_deals,
        "commission_total": round(commission_total, 2),
        "month_commission": round(month_commission, 2),
        "new_rentals": new_rentals,
        "renewals": renewals,
        "management": management,
        "breakdown": sorted(breakdown.values(), key=lambda b: -b["amount"]),
    }


def _merge_manual_deals(
    summary: Dict,
    monthly: List[Dict],
    deals: List[ManualDeal],
    now: datetime,
) -> None:
    """把手工补录业绩合并进 `_build_summary` / `_month_series` 的结果。

    无补录记录时不改变任何口径；有记录时：
    - 当月：month_deals/month_total/month_commission 计入并按成交类型拆 breakdown；
    - 本年：year_total 计入；
    - 全部：commission_total 计入；
    - monthly：按 deal_date 所属月份累加 revenue/commission/deals。
    """
    by_month = {(row["year"], row["month"]): row for row in monthly}
    manual_breakdown: Dict[str, dict] = {}

    for deal in deals:
        deal_date = deal.deal_date
        amount = deal.deal_amount or 0
        commission = deal.commission_amount or 0

        summary["commission_total"] += commission
        # 与 _build_summary 同口径：deals_total 统计全部补录笔数，
        # new_rentals/renewals/management 按成交类型累计（不限本月）
        summary["deals_total"] += 1
        if deal.deal_type == "new_rental":
            summary["new_rentals"] += 1
        elif deal.deal_type == "renewal":
            summary["renewals"] += 1
        elif deal.deal_type == "management":
            summary["management"] += 1

        if deal_date.year == now.year:
            summary["year_total"] += amount
        if deal_date.year == now.year and deal_date.month == now.month:
            summary["month_deals"] += 1
            summary["month_total"] += amount
            summary["month_commission"] += commission
            key = deal.deal_type
            item = manual_breakdown.get(key)
            if item is None:
                item = manual_breakdown[key] = {
                    "deal_type": key,
                    "label": MANUAL_DEAL_TYPE_LABELS.get(key, key),
                    "amount": 0.0,
                    "count": 0,
                }
            item["amount"] += commission
            item["count"] += 1

        row = by_month.get((deal_date.year, deal_date.month))
        if row is not None:
            row["revenue"] += amount
            row["commission"] += commission
            row["deals"] += 1

    breakdown = {b["deal_type"]: b for b in summary["breakdown"]}
    for key, item in manual_breakdown.items():
        existing = breakdown.get(key)
        if existing is None:
            existing = {
                "deal_type": key,
                "label": item["label"],
                "amount": 0.0,
                "count": 0,
            }
            summary["breakdown"].append(existing)
        existing["amount"] += item["amount"]
        existing["count"] += item["count"]

    total_amt = sum(b["amount"] for b in summary["breakdown"]) or 1.0
    for item in summary["breakdown"]:
        item["percent"] = round(item["amount"] / total_amt * 100, 1)
    summary["breakdown"].sort(key=lambda b: -b["amount"])

    summary["year_total"] = round(summary["year_total"], 2)
    summary["month_total"] = round(summary["month_total"], 2)
    summary["commission_total"] = round(summary["commission_total"], 2)
    summary["month_commission"] = round(summary["month_commission"], 2)
    for row in monthly:
        row["revenue"] = round(row["revenue"], 2)
        row["commission"] = round(row["commission"], 2)


@router.get("/me", response_model=MyPerformanceOut)
def get_my_performance(
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """我的业绩报表（平台成交自动核算 + 非平台成交手工补录）。"""
    employee = _get_employee(session, user)
    settlements = _settlement_rows(session, employee.id)
    manual_deals = session.exec(
        select(ManualDeal).where(
            ManualDeal.employee_id == employee.id,
            ManualDeal.deleted_at.is_(None),
        )
    ).all()
    now = datetime.utcnow()
    summary = _build_summary(settlements, now)
    monthly = _month_series(settlements, 12)
    if manual_deals:
        _merge_manual_deals(summary, monthly, manual_deals, now)
    return {"summary": summary, "monthly": monthly}


@router.get("/leaderboard", response_model=List[PerformanceLeaderboardRow])
def get_performance_leaderboard(
    year: Optional[int] = None,
    month: Optional[int] = None,
    limit: int = 20,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """业绩排行榜（系统按佣金结算自动核算，按佣金降序，可按年月筛选）。

    仅员工可看：排行榜暴露全公司佣金（敏感财务数据），租客不应可见。

    年月筛选用日期区间比较而非 `func.strftime`（SQLite 专属，PostgreSQL 下
    直接 ProgrammingError）：
    - 年 + 月：`created_at >= (year,month,1)` 且 `< 下个月 1 日`；
    - 仅年：`>= (year,1,1)` 且 `< (year+1,1,1)`；
    - 仅月：保持原语义（任意年份的该月），`func.extract` 跨方言。
    """
    conditions = [CommissionSettlement.deleted_at.is_(None)]
    if year and month:
        start = datetime(year, month, 1)
        end = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
        conditions.append(CommissionSettlement.created_at >= start)
        conditions.append(CommissionSettlement.created_at < end)
    elif year:
        conditions.append(CommissionSettlement.created_at >= datetime(year, 1, 1))
        conditions.append(CommissionSettlement.created_at < datetime(year + 1, 1, 1))
    elif month:
        conditions.append(
            func.extract("month", CommissionSettlement.created_at) == month
        )

    settlements = session.exec(
        select(CommissionSettlement).where(*conditions)
    ).all()

    # 只加载被结算记录实际引用的员工 / 用户，避免全表加载
    employee_ids = {s.employee_id for s in settlements if s.employee_id}
    employees = (
        {
            e.id: e
            for e in session.exec(
                select(Employee).where(Employee.id.in_(employee_ids))
            ).all()
        }
        if employee_ids
        else {}
    )
    user_ids = {e.user_id for e in employees.values() if e.user_id}
    users = (
        {u.id: u for u in session.exec(select(User).where(User.id.in_(user_ids))).all()}
        if user_ids
        else {}
    )
    leaderboard: dict = {}
    for s in settlements:
        key = str(s.employee_id)
        if key not in leaderboard:
            emp = employees.get(s.employee_id)
            usr = users.get(emp.user_id) if emp else None
            leaderboard[key] = {
                "employee_id": key,
                "employee_name": usr.full_name if usr else None,
                "total_commission": 0.0,
                "total_revenue": 0.0,
                "deals": 0,
            }
        leaderboard[key]["total_commission"] += s.commission_amount or 0
        leaderboard[key]["total_revenue"] += s.commission_base or 0
        leaderboard[key]["deals"] += 1

    result = sorted(
        leaderboard.values(),
        key=lambda x: x["total_commission"],
        reverse=True,
    )
    return result[: max(1, min(limit, 100))]


class AgentPerformanceRow(BaseModel):
    """单个经纪/销售员的业绩追踪（提成与分佣）。"""

    model_config = ConfigDict(extra="allow")

    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    total_commission: Optional[float] = None
    total_revenue: Optional[float] = None
    deals: Optional[int] = None


class PartnerPerformanceRow(BaseModel):
    """单个合作公司的业绩/分佣汇总。"""

    model_config = ConfigDict(extra="allow")

    partner_id: Optional[str] = None
    partner_name: Optional[str] = None
    total_commission: Optional[float] = None
    total_revenue: Optional[float] = None
    deals: Optional[int] = None


def _load_agent_names(session: Session, settlements) -> Dict[uuid.UUID, str]:
    """按结算记录实际引用的员工/用户加载姓名，避免全表扫。"""
    emp_ids = {s.employee_id for s in settlements if s.employee_id}
    emps = (
        {e.id: e for e in session.exec(select(Employee).where(Employee.id.in_(emp_ids))).all()}
        if emp_ids
        else {}
    )
    user_ids = {e.user_id for e in emps.values() if e.user_id}
    users = (
        {u.id: u for u in session.exec(select(User).where(User.id.in_(user_ids))).all()}
        if user_ids
        else {}
    )
    return {
        e.id: (users[e.user_id].full_name if e.user_id in users else None)
        for e in emps.values()
    }


@router.get("/agents", response_model=List[AgentPerformanceRow])
def list_agents_performance(
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """全员业绩追踪：每个经纪/销售员的佣金（提成）与成交笔数。

    系统按结算记录自动聚合；deals/revenue 按 lease_id 去重，
    commission 为该员工名下所有角色的分佣金额之和。
    """
    settlements = session.exec(
        select(CommissionSettlement).where(
            CommissionSettlement.employee_id.is_not(None),
            CommissionSettlement.deleted_at.is_(None),
        )
    ).all()
    names = _load_agent_names(session, settlements)
    rows: dict = {}
    for s in settlements:
        key = str(s.employee_id)
        row = rows.get(key)
        if row is None:
            row = rows[key] = {
                "employee_id": key,
                "employee_name": names.get(s.employee_id),
                "total_commission": 0.0,
                "total_revenue": 0.0,
                "deals": 0,
            }
        row["total_commission"] += s.commission_amount or 0
    # 结合 lease 去重的独立统计（deals/revenue 只算每笔成交的首条结算）
    seen_leases: Dict[str, set] = defaultdict(set)
    for s in settlements:
        key = str(s.employee_id)
        row = rows[key]
        if s.lease_id in seen_leases[key]:
            continue
        seen_leases[key].add(s.lease_id)
        row["total_revenue"] += s.commission_base or 0
        row["deals"] += 1
    result = sorted(rows.values(), key=lambda x: (x["total_commission"] or 0), reverse=True)
    return result


@router.get("/partners", response_model=List[PartnerPerformanceRow])
def list_partners_performance(
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """合作公司业绩/分佣汇总：按结算的 partner_id 聚合。"""
    settlements = session.exec(
        select(CommissionSettlement).where(
            CommissionSettlement.partner_id.is_not(None),
            CommissionSettlement.deleted_at.is_(None),
        )
    ).all()
    pid_set = {s.partner_id for s in settlements if s.partner_id}
    partners = (
        {p.id: p for p in session.exec(select(Partner).where(Partner.id.in_(pid_set))).all()}
        if pid_set
        else {}
    )
    rows: dict = {}
    seen_leases: Dict[str, set] = defaultdict(set)
    for s in settlements:
        key = str(s.partner_id)
        row = rows.get(key)
        if row is None:
            row = rows[key] = {
                "partner_id": key,
                "partner_name": partners.get(s.partner_id).name
                if partners.get(s.partner_id)
                else None,
                "total_commission": 0.0,
                "total_revenue": 0.0,
                "deals": 0,
            }
        row["total_commission"] += s.commission_amount or 0
        if s.lease_id in seen_leases[key]:
            continue
        seen_leases[key].add(s.lease_id)
        row["total_revenue"] += s.commission_base or 0
        row["deals"] += 1
    return sorted(rows.values(), key=lambda x: (x["total_commission"] or 0), reverse=True)
