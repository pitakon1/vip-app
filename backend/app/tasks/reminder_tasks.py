"""定时提醒任务 - 租金到期、合同到期提醒。

租金缴费通知策略（同时通知租客与负责员工，提前分级提醒）：
  | 时间节点        | 触发条件                 | 租客内容         | 员工(agent)内容 |
  |----------------|--------------------------|------------------|------------------|
  | 到期前 7 天     | due_date = 今天+7        | 提前 7 天提醒     | 跟进催缴提醒     |
  | 到期前 3 天     | due_date = 今天+3        | 3 天跟进提醒      | 催缴提醒         |
  | 到期前 1 天     | due_date = 今天+1        | 明日到期提醒      | 明日到期催办     |
  | 今日到期        | due_date = 今天          | 今日到期缴费提醒  | 今日跟进收款     |
  | 逾期            | due_date < 今天 仍待支付 | 逾期催缴         | 逾期处理与升级   |

每个阶段对同一支付单幂等（template_key + related_entity_id 去重），避免重复推送。
"""
from datetime import datetime, timedelta, timezone
from sqlmodel import Session, select

from app.celery_app import celery_app
from app.db import engine
from app.models.lease import Lease, LeaseStatus
from app.models.employee import Employee
from app.models.tenant import Tenant
from app.models.payment import Payment, PaymentStatus, PaymentType
from app.models.notification import Notification, NotificationChannel, NotificationStatus
import uuid


@celery_app.task(name="check_expiring_leases")
def check_expiring_leases():
    """每天 9:00 执行，检查即将到期的合同（30天/7天/1天前）"""
    now = datetime.now(timezone.utc)

    with Session(engine) as session:
        for days_before in [30, 7, 1]:
            target_date = now + timedelta(days=days_before)
            start = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
            end = target_date.replace(hour=23, minute=59, second=59, microsecond=999999)

            leases = session.exec(
                select(Lease).where(
                    Lease.end_date >= start,
                    Lease.end_date <= end,
                    Lease.status == LeaseStatus.active,
                )
            ).all()

            for lease in leases:
                # 收件人必须是登录账号（users.id）：Lease.tenant_id 指向 tenants.id，
                # 直接当 user_id 用会写到不存在的用户上（Postgres 下外键直接报错）。
                tenant = session.get(Tenant, lease.tenant_id)
                _notify(
                    session,
                    tenant.user_id if tenant else None,
                    "lease_expiring",
                    f"您的租约将在 {days_before} 天后到期",
                    f"租约编号 {lease.id} 将在 {days_before} 天后到期，请联系我们续约。",
                    lease.id,
                    related_entity_type="lease",
                )

        session.commit()

    return {"checked": True}


def _resolve_employee_user_id(session: Session, payment: Payment):
    """通过支付单关联的租约，找到负责员工(agent)的 user_id。

    Lease.agent_id 指向 employees.id，需回查 Employee 取其 user_id 才能建通知。
    """
    if not payment.lease_id:
        return None
    lease = session.get(Lease, payment.lease_id)
    if not lease or not lease.agent_id:
        return None
    employee = session.get(Employee, lease.agent_id)
    return employee.user_id if employee else None


def _notify(
    session: Session,
    user_id,
    template_key: str,
    subject: str,
    content: str,
    related_entity_id,
    related_entity_type: str = "payment",
):
    """创建站内通知并幂等去重：同一实体 + 同一模板 + 同一正文只推送一次。

    正文参与去重键是必要的：滞纳金按逾期天数重算，金额变大时正文会变，
    此时应当再推一条（见 `accrue_late_fees_task`）；而同一阶段的催缴提醒
    正文固定，任务重跑不会重复推送。

    `related_entity_id` 必须是 UUID 对象而非 str —— 该列是 UUID 类型，
    传字符串会在绑定时抛 `'str' object has no attribute 'hex'`。
    """
    if not user_id:
        return
    exists = session.exec(
        select(Notification).where(
            Notification.template_key == template_key,
            Notification.related_entity_id == related_entity_id,
            Notification.content == content,
        )
    ).first()
    if exists:
        return
    session.add(
        Notification(
            id=uuid.uuid4(),
            user_id=user_id,
            channel=NotificationChannel.in_app,
            template_key=template_key,
            recipient=str(user_id),
            subject=subject,
            content=content,
            status=NotificationStatus.queued,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
        )
    )


def _rent_stage_message(payment: Payment, days_before, overdue: bool):
    """返回 (租客标题, 租客正文, 租客模板, 员工标题, 员工正文, 员工模板)。"""
    amount = f"{payment.amount} {payment.currency or 'THB'}"
    if overdue:
        return (
            "租金逾期提醒",
            f"您的租金 {amount} 已逾期，请尽快缴纳，避免影响信用记录。",
            "rent_overdue",
            "租金逾期·跟进处理",
            f"租户 {payment.payer_id} 的租金 {amount} 已逾期，请及时跟进催缴并评估升级。",
            "rent_overdue_admin",
        )
    if days_before == 0:
        return (
            "今日租金缴纳提醒",
            f"您的租金 {amount} 今日到期，请及时缴纳。",
            "rent_due_today",
            "今日租金到期·跟进收款",
            f"租户 {payment.payer_id} 的租金 {amount} 今日到期，请跟进收款。",
            "rent_due_today_admin",
        )
    return (
        f"租金缴纳提醒 - {days_before} 天后到期",
        f"您的租金 {amount} 将于 {days_before} 天后到期，请及时缴纳。",
        f"rent_due_{days_before}d",
        f"租金 {days_before} 天后到期·跟进催缴",
        f"租户 {payment.payer_id} 的租金 {amount} 将于 {days_before} 天后到期，请跟进催缴。",
        f"rent_due_{days_before}d_admin",
    )


def _remind_payment(session: Session, payment: Payment, days_before, overdue: bool):
    """对单个待缴租金单，同时通知租客与负责员工。"""
    agent_user_id = _resolve_employee_user_id(session, payment)
    tenant_title, tenant_content, tenant_tpl, agent_title, agent_content, agent_tpl = (
        _rent_stage_message(payment, days_before, overdue)
    )

    _notify(session, payment.payer_id, tenant_tpl, tenant_title, tenant_content, payment.id)
    _notify(session, agent_user_id, agent_tpl, agent_title, agent_content, payment.id)


@celery_app.task(name="check_upcoming_rent_payments")
def check_upcoming_rent_payments():
    """每天 9:00 执行：租金提前提醒(7/3/1天)、今日到期、逾期催缴；同时通知租客与负责员工。"""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    with Session(engine) as session:
        # 1) 提前提醒 & 今日到期（按到期日精确匹配，天然幂等）
        for days_before in [7, 3, 1, 0]:
            target_date = now + timedelta(days=days_before)
            start = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
            end = target_date.replace(hour=23, minute=59, second=59, microsecond=999999)

            payments = session.exec(
                select(Payment).where(
                    Payment.due_date >= start,
                    Payment.due_date <= end,
                    Payment.status == PaymentStatus.pending,
                    Payment.payment_type == PaymentType.rent,
                )
            ).all()

            for payment in payments:
                _remind_payment(session, payment, days_before, overdue=False)

        session.commit()

        # 2) 逾期催缴（due_date 已过仍未支付）
        overdue_payments = session.exec(
            select(Payment).where(
                Payment.due_date < today_start,
                Payment.status == PaymentStatus.pending,
                Payment.payment_type == PaymentType.rent,
            )
        ).all()
        for payment in overdue_payments:
            _remind_payment(session, payment, days_before=None, overdue=True)

        session.commit()

    return {"checked": True}


@celery_app.task(name="accrue_late_fees")
def accrue_late_fees_task():
    """每天 9:30 执行：对逾期未缴的租金单按日计提滞纳金。

    计提额由「逾期天数 × 日费率」重算（宽限期内不计提、封顶为本金比例），
    因此重复执行不会重复计费；仅在金额变大时通知租客与负责员工。
    """
    from app.services.late_fee import accrue_late_fees

    with Session(engine) as session:
        changed = accrue_late_fees(session)

        for payment in changed:
            amount = f"{payment.amount} {payment.currency or 'THB'}"
            fee = f"{payment.late_fee_accrued} {payment.currency or 'THB'}"
            _notify(
                session,
                payment.payer_id,
                "rent_late_fee",
                "逾期滞纳金提醒",
                f"您的租金 {amount} 已逾期，当前累计滞纳金 {fee}，"
                f"合计应缴 {payment.total_due}，请尽快缴纳。",
                payment.id,
            )
            _notify(
                session,
                _resolve_employee_user_id(session, payment),
                "rent_late_fee_admin",
                "租金逾期·滞纳金计提",
                f"租户 {payment.payer_id} 的租金 {amount} 已计提滞纳金 {fee}，"
                f"合计应缴 {payment.total_due}，请跟进催缴或评估减免。",
                payment.id,
            )

        session.commit()
        return {
            "changed": len(changed),
            "accrued_total": round(sum(p.late_fee_accrued for p in changed), 2),
        }