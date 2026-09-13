"""支付成功闭环通知的单元测试。

覆盖：支付成功仅通知租客、租客+员工双端通知、幂等去重。
"""
from datetime import datetime, timedelta
import uuid

from sqlmodel import select

from app.models.employee import Employee
from app.models.lease import Lease
from app.models.notification import Notification
from app.models.payment import Payment, PaymentStatus, PaymentType
from app.providers.payment.service import payment_service


def _payment_with_agent(session, with_agent=True):
    agent_user_id = None
    if with_agent:
        agent_user_id = uuid.uuid4()
        employee = Employee(user_id=agent_user_id, employee_code="E002")
        session.add(employee)
        session.flush()
        agent_id = employee.id
    else:
        agent_id = None
    lease = Lease(
        property_id=uuid.uuid4(), tenant_id=uuid.uuid4(), owner_id=uuid.uuid4(),
        agent_id=agent_id,
        start_date=datetime.utcnow(), end_date=datetime.utcnow() + timedelta(days=365),
        monthly_rent=1000, deposit_amount=0, currency="THB",
    )
    session.add(lease)
    session.flush()
    pay = Payment(
        payer_id=uuid.uuid4(), amount=6000, currency="USD", lease_id=lease.id,
        payment_type=PaymentType.rent, status=PaymentStatus.pending,
        idempotency_key=str(uuid.uuid4()),
    )
    session.add(pay)
    session.commit()
    return pay, agent_user_id


def test_payment_success_no_agent_notifies_tenant_only(session):
    """支付单未关联员工：仅通知租客缴费成功。"""
    pay, agent_user_id = _payment_with_agent(session, with_agent=False)
    payment_service._notify_succeeded(
        session, pay, pay.amount, pay.currency, "stripe"
    )
    session.commit()

    rows = session.exec(
        select(Notification).where(Notification.related_entity_id == pay.id)
    ).all()
    assert len(rows) == 1
    assert rows[0].user_id == pay.payer_id
    assert rows[0].template_key == "payment_received"


def test_payment_success_agent_notifies_both_and_idempotent(session):
    """支付成功双端通知（租客+员工核销），且重复调用不产生重复通知。"""
    pay, agent_user_id = _payment_with_agent(session, with_agent=True)
    assert agent_user_id is not None

    payment_service._notify_succeeded(
        session, pay, pay.amount, pay.currency, "stripe"
    )
    session.commit()
    payment_service._notify_succeeded(
        session, pay, pay.amount, pay.currency, "stripe"
    )
    session.commit()

    rows = session.exec(
        select(Notification).where(Notification.related_entity_id == pay.id)
    ).all()
    users = {r.user_id for r in rows}
    tpls = {r.template_key for r in rows}
    # 仍只有 2 条：租客 + 员工，每条模板唯一（幂等）
    assert len(rows) == 2, f"expected 2, got {len(rows)}"
    assert users == {pay.payer_id, agent_user_id}
    assert tpls == {"payment_received", "payment_received_admin"}