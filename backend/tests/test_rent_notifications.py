"""租金缴费提醒双端通知的单元测试。

覆盖：分级提醒文案（7/3/1/今日/逾期）、租客+员工双端通知、幂等去重。
"""
from datetime import datetime, timedelta
import uuid

from sqlmodel import select

from app.models.employee import Employee
from app.models.lease import Lease
from app.models.notification import Notification, NotificationStatus
from app.models.payment import Payment, PaymentStatus, PaymentType
from app.tasks.reminder_tasks import _remind_payment, _notify, _rent_stage_message


def _stage(title, content, tpl, agent_title, agent_content, agent_tpl):
    return title, content, tpl, agent_title, agent_content, agent_tpl


def test_rent_stage_message_all_stages():
    """分级提醒文案：7/3/1天、今日到期、逾期，返回正确模板键与文案。"""
    pay = Payment(
        payer_id=uuid.uuid4(), amount=5000, currency="THB",
        payment_type=PaymentType.rent, status=PaymentStatus.pending,
        idempotency_key=str(uuid.uuid4()),
    )
    cases = [
        # (days_before, overdue, expected 模板键)
        (7, False, ("rent_due_7d", "rent_due_7d_admin")),
        (3, False, ("rent_due_3d", "rent_due_3d_admin")),
        (1, False, ("rent_due_1d", "rent_due_1d_admin")),
        (0, False, ("rent_due_today", "rent_due_today_admin")),
        (None, True, ("rent_overdue", "rent_overdue_admin")),
    ]
    for days, overdue, expected in cases:
        got = _rent_stage_message(pay, days, overdue)
        assert got[2] == expected[0], f"D{days} tenant template wrong"
        assert got[5] == expected[1], f"D{days} agent template wrong"
        assert "5000" in got[1], "content should include amount"


def test_remind_payment_single_notification_idempotent(session):
    """无租约支付单：仅通知租客，且同一阶段只推送一次。"""
    pay = Payment(
        payer_id=uuid.uuid4(), amount=3000, currency="THB",
        payment_type=PaymentType.rent, status=PaymentStatus.pending,
        idempotency_key=str(uuid.uuid4()),
    )
    session.add(pay)
    session.commit()

    _remind_payment(session, pay, 3, overdue=False)
    session.commit()
    _remind_payment(session, pay, 3, overdue=False)
    session.commit()

    rows = session.exec(
        select(Notification).where(Notification.related_entity_id == pay.id)
    ).all()
    # 仅租客 1 条（无员工），且去重
    assert len(rows) == 1, f"expected 1 notification, got {len(rows)}"
    assert rows[0].user_id == pay.payer_id
    assert rows[0].template_key == "rent_due_3d"
    assert rows[0].status == NotificationStatus.queued


def test_notify_skips_empty_user(session):
    """user_id 为空时不创建通知，避免脏数据。"""
    pay = Payment(
        payer_id=uuid.uuid4(), amount=100, currency="THB",
        payment_type=PaymentType.rent, status=PaymentStatus.pending,
        idempotency_key=str(uuid.uuid4()),
    )
    session.add(pay)
    session.commit()
    _notify(session, None, "rent_due_7d", "s", "c", pay)
    session.commit()
    rows = session.exec(select(Notification)).all()
    assert rows == []


def test_lease_agent_resolution_chain(session):
    """通过租约 agent -> employee.user_id 解析员工，验证双端通知。"""
    agent_user_id = uuid.uuid4()
    employee = Employee(user_id=agent_user_id, employee_code="E001")
    session.add(employee)
    session.flush()

    lease = Lease(
        property_id=uuid.uuid4(), tenant_id=uuid.uuid4(), owner_id=uuid.uuid4(),
        agent_id=employee.id,
        start_date=datetime.utcnow(), end_date=datetime.utcnow() + timedelta(days=365),
        monthly_rent=1000, deposit_amount=0, currency="THB",
    )
    session.add(lease)
    session.flush()

    pay = Payment(
        payer_id=uuid.uuid4(), amount=5000, currency="THB", lease_id=lease.id,
        payment_type=PaymentType.rent, status=PaymentStatus.pending,
        idempotency_key=str(uuid.uuid4()),
    )
    session.add(pay)
    session.commit()

    _remind_payment(session, pay, 1, overdue=False)
    session.commit()

    rows = session.exec(
        select(Notification).where(Notification.related_entity_id == pay.id)
    ).all()
    users = {r.user_id for r in rows}
    # 租客 + 员工 双端
    assert users == {pay.payer_id, agent_user_id}
    tpls = {r.template_key for r in rows}
    assert tpls == {"rent_due_1d", "rent_due_1d_admin"}