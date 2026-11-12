"""Dashboard 路由：运营数据概览。"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import property_visibility_conditions, require_agent, require_admin
from app.core.cache import get_cache, set_cache
from app.schemas.dashboard import (
    DashboardSummaryOut,
    ExpiringLeasesOut,
    FinancialReconciliationOut,
    OperationalDailyTrendOut,
    OperationalTrendOut,
    PropertyStatusDistributionOut,
    RecentPaymentsOut,
)
from app.models import (
    Employee,
    Lead,
    LeadStage,
    Lease,
    LeaseStatus,
    MaintenanceTicket,
    Property,
    PropertyStatus,
    Payment,
    PaymentStatus,
    Tenant,
    User,
    ViewingAppointment,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _prop_name(p: Property | None) -> str | None:
    """房源展示名：房号优先，其次地址（与 Property.display_name 同一口径）。"""
    return p.display_name if p is not None else None


def _shift_month(back: int) -> tuple[int, int]:
    """返回「当前月往前推 back 个月」的 (年, 月)。

    用整数月序号做减法，避免 `datetime.replace(month=负数)` 抛
    `ValueError: month must be in 1..12`（months 超过当前月份时会越界）。
    """
    now = datetime.utcnow()
    total = now.year * 12 + (now.month - 1) - back
    return total // 12, total % 12 + 1


def _month_keys(months: int) -> list[str]:
    """近 months 个月的月份标签（`YYYY-MM`），从最早到最新。"""
    return [
        f"{year:04d}-{month:02d}" for year, month in (
            _shift_month(back) for back in range(months - 1, -1, -1)
        )
    ]


def _monthly_counts(session: Session, model, date_field, start: datetime) -> dict[str, int]:
    """按月统计行数，聚合下推到 SQL（GROUP BY 年月），避免把窗口内所有行拉进内存。"""
    year_expr = func.extract("year", date_field)
    month_expr = func.extract("month", date_field)
    rows = session.exec(
        select(year_expr, month_expr, func.count(model.id))
        .where(model.deleted_at.is_(None), date_field >= start)
        .group_by(year_expr, month_expr)
    ).all()
    return {
        f"{int(year):04d}-{int(month):02d}": int(count or 0)
        for year, month, count in rows
        if year is not None and month is not None
    }


def _day_keys(days: int) -> list[str]:
    """近 days 天的日期标签（`YYYY-MM-DD`，UTC 日界），从最早到最新。"""
    today = datetime.utcnow().date()
    return [(today - timedelta(days=back)).isoformat() for back in range(days - 1, -1, -1)]


def _day_of(value) -> str:
    """把 SQLite 的 'YYYY-MM-DD HH:MM:SS' 或 PG 的 date 统一成 'YYYY-MM-DD'。"""
    return str(value)[:10]


def _daily_counts(session: Session, model, date_field, start: datetime) -> dict[str, int]:
    """按自然日统计行数（GROUP BY date），与 `_monthly_counts` 同口径（UTC）。"""
    day_expr = func.date(date_field)
    rows = session.exec(
        select(day_expr, func.count(model.id))
        .where(model.deleted_at.is_(None), date_field >= start)
        .group_by(day_expr)
    ).all()
    return {_day_of(day): int(count or 0) for day, count in rows if day is not None}


def _has_value(session: Session, model, *conditions) -> bool:
    """该表在统计窗口外是否至少有一行可用样本（用于判断曲线是否该绘制）。"""
    total = session.exec(
        select(func.count(model.id)).where(model.deleted_at.is_(None), *conditions)
    ).one()
    return int(total or 0) > 0


@router.get("/summary", response_model=DashboardSummaryOut)
def get_summary(
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """获取运营概览：房源总数、空置、已出租、即将到期合同、即将到期租金等。

    统计范围与 `GET /properties` 同源：按当前用户的数据范围收窄，缓存键也按
    「角色 + 用户」隔离，避免不同角色/不同数据范围共用同一份全局缓存，出现
    「管理员首页总房源 25，而员工首页也是 25」这类串号。
    """
    scope_conditions = property_visibility_conditions(session, user)
    # 角色前缀保证「角色变更后不会命中旧角色缓存」，用户 id 保证不同数据范围
    # （如 agent 只看自己录入的房源）互不串用。
    cache_key = f"cache:dashboard:summary:{user.role.value}:{user.id}"
    cached = get_cache(cache_key)
    if cached is not None:
        return cached

    # ---- 房源状态：只统计「在库」（未软删）且在数据范围内的房源 ----
    # 在租判定以「存在生效租约」为准，而不是 Property.status：房源状态字段经常
    # 没随租约回写，会出现「在租合同 2 / 在租合同营收 55,000 / 已出租 0」的矛盾。
    # 口径统一为：有生效租约 → 在租；无生效租约且非维修中 → 空置；维修中 → 维修。
    # 软删房源整体不计入（总数 / 在租 / 空置 / 出租率），关联到软删房源的生效
    # 租约也不再计入 active_leases 与在租合同营收。
    visible_property_ids = select(Property.id).where(
        Property.deleted_at.is_(None), *scope_conditions
    )
    leased_property_ids = select(Lease.property_id).where(
        Lease.deleted_at.is_(None),
        Lease.status == LeaseStatus.active,
        Lease.property_id.in_(visible_property_ids),
    )
    prop_row = session.exec(
        select(
            func.count(Property.id),
            func.sum(
                case(
                    (
                        (Property.status != PropertyStatus.maintenance)
                        & (Property.id.not_in(leased_property_ids)),
                        1,
                    ),
                    else_=0,
                )
            ),
            func.sum(
                case(
                    (
                        (Property.status == PropertyStatus.maintenance)
                        & (Property.id.not_in(leased_property_ids)),
                        1,
                    ),
                    else_=0,
                )
            ),
            func.sum(case((Property.id.in_(leased_property_ids), 1), else_=0)),
        ).where(Property.deleted_at.is_(None), *scope_conditions)
    ).one()
    total = int(prop_row[0] or 0)
    vacant = int(prop_row[1] or 0)
    maintenance = int(prop_row[2] or 0)
    rented = int(prop_row[3] or 0)

    # M-06：已软删的业主房源整体不计入（总数 / 在租 / 空置 / 出租率），
    # 不再把「仍有生效租约的软删房源」补回分子分母。
    now = datetime.utcnow()
    thirty_days_later = now + timedelta(days=30)

    # ---- 租约：即将到期数量 + 活跃租约月租金收入，合并为一次条件聚合 ----
    # 只统计「数据范围内、未软删房源」上的租约：房源不可见/已删除时，
    # 其合同也不再计入「在租合同 / 在租合同营收 / 即将到期」。
    lease_scope = [
        Lease.deleted_at.is_(None),
        Lease.property_id.in_(visible_property_ids),
    ]
    lease_row = session.exec(
        select(
            func.sum(
                case(
                    (
                        (Lease.end_date <= thirty_days_later)
                        & (Lease.end_date >= now)
                        & (Lease.status == LeaseStatus.active),
                        1,
                    ),
                    else_=0,
                )
            ),
            func.coalesce(
                func.sum(
                    case(
                        (Lease.status == LeaseStatus.active, Lease.monthly_rent),
                        else_=0,
                    )
                ),
                0,
            ),
            func.sum(case((Lease.status == LeaseStatus.active, 1), else_=0)),
        ).where(*lease_scope)
    ).one()
    expiring_leases = int(lease_row[0] or 0)
    active_lease_revenue = lease_row[1] or 0
    active_leases = int(lease_row[2] or 0)

    seven_days_later = now + timedelta(days=7)

    # 月度收入（当月已成功的付款），与字段语义一致，仅统计本月
    _this_month = datetime.utcnow()
    _month_start = datetime(_this_month.year, _this_month.month, 1)
    if _month_start.month == 12:
        _next_month_start = datetime(_month_start.year + 1, 1, 1)
    else:
        _next_month_start = datetime(_month_start.year, _month_start.month + 1, 1)

    # ---- 付款：即将到期待付数量 + 本月已成功收入，合并为一次条件聚合 ----
    payment_row = session.exec(
        select(
            func.sum(
                case(
                    (
                        (Payment.due_date <= seven_days_later)
                        & (Payment.due_date >= now)
                        & (Payment.status == PaymentStatus.pending),
                        1,
                    ),
                    else_=0,
                )
            ),
            func.coalesce(
                func.sum(
                    case(
                        (
                            (Payment.status == PaymentStatus.succeeded)
                            & (Payment.paid_at >= _month_start)
                            & (Payment.paid_at < _next_month_start),
                            Payment.amount,
                        ),
                        else_=0,
                    )
                ),
                0,
            ),
            # 「待收款」笔数：全部未结清账单（pending + processing），不限日期。
            # 此前只算「7 天内到期且 pending」，processing 与已逾期单都不计入，
            # 于是首页出现「欠租 35,000 / 逾期占比 37% / 待收款 0 笔」的自相矛盾。
            func.sum(
                case(
                    (
                        Payment.status.in_(
                            (PaymentStatus.pending, PaymentStatus.processing)
                        ),
                        1,
                    ),
                    else_=0,
                )
            ),
        ).where(Payment.deleted_at.is_(None))
    ).one()
    upcoming_payments = int(payment_row[0] or 0)
    monthly_revenue = payment_row[1] or 0
    outstanding_payments = int(payment_row[2] or 0)

    # 入住率
    occupancy_rate = round(rented / total * 100, 1) if total > 0 else 0

    # ---- 线索：活跃 / 已成交数量，合并为一次条件聚合 ----
    lead_row = session.exec(
        select(
            func.sum(case((Lead.stage != LeadStage.closed, 1), else_=0)),
            func.sum(case((Lead.stage == LeadStage.closed, 1), else_=0)),
        ).where(Lead.deleted_at.is_(None))
    ).one()
    active_leads = int(lead_row[0] or 0)
    closed_leads = int(lead_row[1] or 0)

    # 成交率
    conversion_rate = round(closed_leads / (closed_leads + active_leads) * 100, 1) if (closed_leads + active_leads) > 0 else 0

    # ---- 员工规模：总数 + 本月新增，合并为一次条件聚合 ----
    # 口径与 /employees 列表一致（未软删除的员工档案）；本月新增按 created_at
    # 归属当月，与前端原先「拉列表后按本月过滤」的算法同源。
    employee_row = session.exec(
        select(
            func.count(Employee.id),
            func.sum(case((Employee.created_at >= _month_start, 1), else_=0)),
        ).where(Employee.deleted_at.is_(None))
    ).one()
    employee_count = int(employee_row[0] or 0)
    new_employees = int(employee_row[1] or 0)

    result = {
        "total_properties": total,
        "vacant": vacant,
        "rented": rented,
        "maintenance": maintenance,
        "expiring_leases": expiring_leases,
        "active_leases": active_leases,
        "upcoming_payments": upcoming_payments,
        "outstanding_payments": outstanding_payments,
        "monthly_revenue": float(monthly_revenue),
        "active_lease_revenue": float(active_lease_revenue),
        "occupancy_rate": occupancy_rate,
        "active_leads": active_leads,
        "closed_leads": closed_leads,
        "conversion_rate": conversion_rate,
        "employee_count": employee_count,
        "new_employees": new_employees,
    }
    set_cache(cache_key, result, ttl=60)
    return result


@router.get("/recent-payments", response_model=RecentPaymentsOut)
def get_recent_payments(
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """获取最近 10 笔付款记录（附带付款人名称）。"""
    payments = session.exec(
        select(Payment)
        .where(Payment.deleted_at.is_(None))
        .order_by(Payment.created_at.desc())
        .limit(10)
    ).all()
    payer_ids = {p.payer_id for p in payments if p.payer_id}
    users = (
        {u.id: u for u in session.exec(select(User).where(User.id.in_(payer_ids))).all()}
        if payer_ids
        else {}
    )
    return {
        "items": [
            {
                "id": str(p.id),
                "amount": p.amount,
                "currency": p.currency,
                "payment_type": p.payment_type.value if p.payment_type else None,
                "status": p.status.value if p.status else None,
                "channel": p.channel,
                "due_date": p.due_date.isoformat() if p.due_date else None,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "description": p.description,
                "payer_name": users.get(p.payer_id).full_name
                if users.get(p.payer_id)
                else None,
            }
            for p in payments
        ]
    }


@router.get("/expiring-leases", response_model=ExpiringLeasesOut)
def get_expiring_leases(
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """获取 30 天内即将到期的租约（附带房源与租客名称）。

    与概览的「即将到期合同」同范围：只看当前数据范围内、未软删房源上的租约。
    """
    now = datetime.utcnow()
    thirty_days_later = now + timedelta(days=30)
    visible_property_ids = select(Property.id).where(
        Property.deleted_at.is_(None),
        *property_visibility_conditions(session, user),
    )
    leases = session.exec(
        select(Lease)
        .where(
            Lease.end_date <= thirty_days_later,
            Lease.end_date >= now,
            Lease.status == LeaseStatus.active,
            Lease.deleted_at.is_(None),
            Lease.property_id.in_(visible_property_ids),
        )
        .order_by(Lease.end_date.asc())
    ).all()
    # 只加载被这批租约引用的房源 / 租客 / 用户，避免全表加载
    prop_ids = {lease.property_id for lease in leases}
    props = {}
    if prop_ids:
        props = {
            p.id: p
            for p in session.exec(select(Property).where(Property.id.in_(prop_ids))).all()
        }
    tenant_ids = {lease.tenant_id for lease in leases}
    tenants = {}
    if tenant_ids:
        tenants = {
            t.id: t
            for t in session.exec(select(Tenant).where(Tenant.id.in_(tenant_ids))).all()
        }
    user_ids = {t.user_id for t in tenants.values() if t.user_id}
    users = {}
    if user_ids:
        users = {
            u.id: u
            for u in session.exec(select(User).where(User.id.in_(user_ids))).all()
        }
    return {
        "items": [
            {
                "id": str(lease.id),
                "property_id": str(lease.property_id),
                "property_name": _prop_name(props.get(lease.property_id)),
                "tenant_id": str(lease.tenant_id),
                "tenant_name": users.get(tenants.get(lease.tenant_id).user_id).full_name
                if tenants.get(lease.tenant_id)
                and users.get(tenants[lease.tenant_id].user_id)
                else None,
                "monthly_rent": lease.monthly_rent,
                "currency": lease.currency,
                "end_date": lease.end_date.isoformat(),
                "days_left": max(0, (lease.end_date - now).days),
            }
            for lease in leases
        ]
    }


@router.get(
    "/property-status-distribution", response_model=PropertyStatusDistributionOut
)
def get_property_status_distribution(
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """获取房源状态分布。

    与 `/summary` 同口径：按数据范围收窄；有生效租约 → 在租，无租约且非维修中
    → 空置，维修中（且无生效租约）→ 维修。直接按 `Property.status` 分组会让
    「状态字段未随租约回写」的房源在图表与概览卡里对不上。
    """
    scope_conditions = property_visibility_conditions(session, user)
    visible_property_ids = select(Property.id).where(
        Property.deleted_at.is_(None), *scope_conditions
    )
    leased_property_ids = select(Lease.property_id).where(
        Lease.deleted_at.is_(None),
        Lease.status == LeaseStatus.active,
        Lease.property_id.in_(visible_property_ids),
    )
    effective_status = case(
        (Property.id.in_(leased_property_ids), PropertyStatus.rented),
        (Property.status == PropertyStatus.maintenance, PropertyStatus.maintenance),
        else_=PropertyStatus.vacant,
    )
    statuses = session.exec(
        select(effective_status, func.count(Property.id))
        .where(Property.deleted_at.is_(None), *scope_conditions)
        .group_by(effective_status)
    ).all()
    return {
        "items": [
            {
                "status": s.value if isinstance(s, PropertyStatus) else str(s),
                "count": c,
            }
            for s, c in statuses
        ]
    }


@router.get("/financial-reconciliation", response_model=FinancialReconciliationOut)
def financial_reconciliation(
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """财务对账明细（Admin）：按房源聚合已收/应收/逾期，并附逐笔记录。

    供管理端「财务对账」页面渲染，形成管理端财权闭环。

    - `totals` / `by_property` 由 SQL 条件聚合（CASE WHEN）得出，按房源分桶；
    - `records` 为逐笔明细，按创建时间倒序分页（`limit`/`offset`，默认 200 条），
      总笔数由 `records_total` 给出；
    - 房源名只按被引用的 ID 加载，不做全表加载。
    """
    now = datetime.utcnow()
    # 分桶口径：succeeded → 已收；其余只有「仍有收款义务」的状态才参与应收/逾期。
    # failed/refunded/disputed/expired 是终态（收不回来或已退回），到期也不该计入，
    # 否则失败/退款单会把逾期应收虚高（此前它们被 ~is_received 全兜进了分桶）。
    _OUTSTANDING = (PaymentStatus.pending, PaymentStatus.processing)
    is_received = Payment.status == PaymentStatus.succeeded
    is_outstanding = Payment.status.in_(_OUTSTANDING)
    is_overdue = (
        is_outstanding & Payment.due_date.is_not(None) & (Payment.due_date < now)
    )
    is_receivable = is_outstanding & ~is_overdue

    def _sum(condition):
        return func.coalesce(func.sum(case((condition, Payment.amount), else_=0.0)), 0.0)

    grouped = session.exec(
        select(
            Payment.property_id,
            func.count(Payment.id),
            _sum(is_received),
            _sum(is_receivable),
            _sum(is_overdue),
        )
        .where(Payment.deleted_at.is_(None))
        .group_by(Payment.property_id)
    ).all()

    by_property = []
    key_to_id = {}
    for property_id, count, received, receivable, overdue in grouped:
        key = str(property_id) if property_id else "none"
        if property_id:
            key_to_id[key] = property_id
        by_property.append(
            {
                "property_id": key,
                "property": None,  # 稍后按 ID 回填名称
                "received": round(float(received or 0), 2),
                "receivable": round(float(receivable or 0), 2),
                "overdue": round(float(overdue or 0), 2),
                "count": int(count or 0),
            }
        )
    by_property.sort(key=lambda row: row["property_id"])

    totals = {
        "received": round(sum(row["received"] for row in by_property), 2),
        "receivable": round(sum(row["receivable"] for row in by_property), 2),
        "overdue": round(sum(row["overdue"] for row in by_property), 2),
        "count": sum(row["count"] for row in by_property),
    }

    conditions = Payment.deleted_at.is_(None)
    records_total = session.exec(
        select(func.count(Payment.id)).where(conditions)
    ).one()
    payments = session.exec(
        select(Payment)
        .where(conditions)
        .order_by(Payment.created_at.desc(), Payment.id)
        .offset(offset)
        .limit(limit)
    ).all()

    records = []
    for p in payments:
        # 与上方聚合同一口径：终态单（failed/refunded/disputed/expired）不参与
        # 应收/逾期对账，逐笔按实际状态标记，避免「总额不算它、明细却标逾期」。
        if p.status == PaymentStatus.succeeded:
            bucket = "received"
        elif p.status in _OUTSTANDING:
            bucket = "overdue" if (p.due_date and p.due_date < now) else "pending"
        else:
            bucket = p.status.value
        if p.property_id:
            key_to_id.setdefault(str(p.property_id), p.property_id)
        records.append(
            {
                "id": str(p.id),
                "property_id": str(p.property_id) if p.property_id else None,
                "property": None,  # 稍后按 ID 回填名称
                "amount": p.amount or 0,
                "currency": p.currency,
                "payment_type": p.payment_type.value if p.payment_type else None,
                "status": p.status.value if p.status else None,
                "bucket": bucket,
                "channel": p.channel,
                "due_date": p.due_date.isoformat() if p.due_date else None,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "reconciliation_status": p.reconciliation_status or "unreconciled",
                "reconciled_at": p.reconciled_at.isoformat() if p.reconciled_at else None,
            }
        )

    # 只加载对账用到的房源（含已软删除的，保证历史记录仍能显示名称）
    props = {}
    if key_to_id:
        props = {
            p.id: p
            for p in session.exec(
                select(Property).where(Property.id.in_(set(key_to_id.values())))
            ).all()
        }

    for row in by_property:
        row["property"] = _prop_name(props.get(key_to_id.get(row["property_id"])))
    for record in records:
        property_id = record["property_id"]
        record["property"] = _prop_name(props.get(key_to_id.get(property_id)))

    return {
        "totals": totals,
        "by_property": by_property,
        "records": records,
        "records_total": records_total,
    }


@router.get("/trend", response_model=OperationalTrendOut)
def operational_trend(
    months: int = Query(12, ge=1, le=120),
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """运营趋势（Admin）：近 N 月新签租约、新线索、营收、新客看房预约逐月走势。"""
    year, month = _shift_month(months - 1)
    start = datetime(year, month, 1)

    # 营收统一按实付时间（paid_at）归月，与 /summary 的 monthly_revenue 同一口径；
    # paid_at 为空（如线下收据未回写实付时间）用 created_at 兜底，保证不丢单。
    paid_field = func.coalesce(Payment.paid_at, Payment.created_at)
    revenue_year = func.extract("year", paid_field)
    revenue_month = func.extract("month", paid_field)
    revenue_rows = session.exec(
        select(revenue_year, revenue_month, func.sum(Payment.amount))
        .where(
            Payment.deleted_at.is_(None),
            Payment.status == PaymentStatus.succeeded,
            paid_field >= start,
        )
        .group_by(revenue_year, revenue_month)
    ).all()
    monthly_revenue = {
        f"{int(y):04d}-{int(m):02d}": float(total or 0)
        for y, m, total in revenue_rows
        if y is not None and m is not None
    }

    lease_counts = _monthly_counts(session, Lease, Lease.created_at, start)
    lead_counts = _monthly_counts(session, Lead, Lead.created_at, start)
    viewing_counts = _monthly_counts(session, ViewingAppointment, ViewingAppointment.created_at, start)
    ticket_counts = _monthly_counts(session, MaintenanceTicket, MaintenanceTicket.created_at, start)

    # 生成完整的月份序列（含无数据的月份，避免前端折线出现断点）
    keys = _month_keys(months)
    series = [
        {
            "month": k,
            "revenue": round(monthly_revenue.get(k, 0), 2),
            "leases_new": lease_counts.get(k, 0),
            "leads_new": lead_counts.get(k, 0),
            "viewings_new": viewing_counts.get(k, 0),
            "maintenance_new": ticket_counts.get(k, 0),
        }
        for k in keys
    ]
    return {"months": len(keys), "series": series}


@router.get("/trend/daily", response_model=OperationalDailyTrendOut)
def operational_daily_trend(
    days: int = Query(7, ge=1, le=90),
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """运营趋势（日粒度，Admin）：近 N 天营收 / 新线索 / 新带看 / 新增房源 / 新签租约。

    与 `/trend`（月粒度）口径保持一致：
    - 营收：`status=succeeded`，按 `paid_at` 归日，`paid_at` 为空时用 `created_at` 兜底；
    - 租约/线索/带看：分别按各自 `created_at` 归日（`leases.start_date` 存在历史回填，
      与新签时间不一致，故不用于「新增」趋势）；
    - 时间一律为 UTC 自然日（库内时间为 `datetime.utcnow()` 写入的 naive UTC）。
    空档日期补 0，保证折线不跳点。
    """
    keys = _day_keys(days)
    start = datetime.combine(
        datetime.strptime(keys[0], "%Y-%m-%d").date(), datetime.min.time()
    )

    # 营收：与月趋势同一条件（succeeded + paid_at 优先，created_at 兜底）
    paid_field = func.coalesce(Payment.paid_at, Payment.created_at)
    paid_day = func.date(paid_field)
    revenue_rows = session.exec(
        select(paid_day, func.sum(Payment.amount))
        .where(
            Payment.deleted_at.is_(None),
            Payment.status == PaymentStatus.succeeded,
            paid_field >= start,
        )
        .group_by(paid_day)
    ).all()
    daily_revenue = {
        _day_of(day): float(total or 0) for day, total in revenue_rows if day is not None
    }

    lease_counts = _daily_counts(session, Lease, Lease.created_at, start)
    lead_counts = _daily_counts(session, Lead, Lead.created_at, start)
    viewing_counts = _daily_counts(
        session, ViewingAppointment, ViewingAppointment.created_at, start
    )
    property_counts = _daily_counts(session, Property, Property.created_at, start)

    # 数据源可用性：整表没有可用样本时返回 false，前端不画该曲线也不伪造零线
    availability = {
        "revenue": _has_value(
            session, Payment, Payment.status == PaymentStatus.succeeded
        ),
        "leases_new": _has_value(session, Lease),
        "leads_new": _has_value(session, Lead),
        "viewings_new": _has_value(session, ViewingAppointment),
        "properties_new": _has_value(session, Property),
    }

    series = [
        {
            "date": key,
            "revenue": round(daily_revenue.get(key, 0), 2),
            "leases_new": lease_counts.get(key, 0),
            "leads_new": lead_counts.get(key, 0),
            "viewings_new": viewing_counts.get(key, 0),
            "properties_new": property_counts.get(key, 0),
        }
        for key in keys
    ]
    return {
        "days": len(keys),
        "granularity": "day",
        "timezone": "UTC",
        "availability": availability,
        "series": series,
    }
