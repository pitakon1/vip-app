"""业绩路由：系统自动核算的业绩报表与排行榜。

业绩不再由员工手动填报，而是由系统根据佣金结算（CommissionSettlement）自动聚合：
签约/续约时自动生成结算记录，业绩口径以结算记录为准。
"""
import uuid
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import require_employee
from app.models import CommissionSettlement, DealType, Employee, User

router = APIRouter(prefix="/performance", tags=["performance"])

DEAL_TYPE_LABELS = {
    DealType.new_rental: "新租成交",
    DealType.renewal: "续约成交",
    DealType.management: "托管服务",
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
    """按自然月聚合最近 n 个月的业绩序列（含空月份）。"""
    monthly: Dict[tuple, dict] = defaultdict(
        lambda: {"year": 0, "month": 0, "revenue": 0.0, "commission": 0.0, "deals": 0}
    )
    for s in settlements:
        ts = s.created_at
        key = (ts.year, ts.month)
        monthly[key]["year"] = ts.year
        monthly[key]["month"] = ts.month
        monthly[key]["revenue"] += s.commission_base or 0
        monthly[key]["commission"] += s.commission_amount or 0
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
    """汇总口径：本年/本月业绩、累计成交、累计佣金与成交类型拆分。"""
    year_total = month_total = commission_total = month_commission = 0.0
    deals_total = month_deals = new_rentals = renewals = management = 0
    breakdown: Dict[str, dict] = {}

    for s in settlements:
        ts = s.created_at
        revenue = s.commission_base or 0
        commission = s.commission_amount or 0
        deals_total += 1
        commission_total += commission

        if ts.year == now.year:
            year_total += revenue
            if ts.month == now.month:
                month_total += revenue
                month_commission += commission
                month_deals += 1
                key = s.deal_type.value
                if key not in breakdown:
                    breakdown[key] = {
                        "deal_type": key,
                        "label": DEAL_TYPE_LABELS.get(s.deal_type, key),
                        "amount": 0.0,
                        "count": 0,
                    }
                breakdown[key]["amount"] += commission
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


@router.get("/me", response_model=MyPerformanceOut)
def get_my_performance(
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """我的业绩报表（系统按佣金结算自动核算）。"""
    employee = _get_employee(session, user)
    settlements = _settlement_rows(session, employee.id)
    now = datetime.utcnow()
    return {
        "summary": _build_summary(settlements, now),
        "monthly": _month_series(settlements, 12),
    }


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
