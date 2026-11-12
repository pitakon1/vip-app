"""合同审批流回归测试。

覆盖：
- 默认规则逐条命中 / 不命中（阈值边界）；
- 命中后合同进入 pending_approval 且 send 被 409 拦截；
- 驳回退回草稿、意见保留、重新提交生成新审批单；
- 自审被拒并落 failure 审计；
- 业主本人发起不进入审批流；
- 大额升级两级审批路径；
- 24 小时未处理提醒只发一次；
- 改规则阈值即时生效（配置化，不改代码）。
"""

import pathlib
import sys
import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

BASE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.core import auth as auth_module  # noqa: E402
from app.core.migrations import seed_approval_rules  # noqa: E402
from app.core.rbac import invalidate_role_permissions, seed_permissions  # noqa: E402
from app.db import get_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Contract,
    ContractApprovalRequest,
    ContractApprovalRule,
    ContractApprovalStatus,
    ContractAuditLog,
    ContractStatus,
    Notification,
    User,
    UserRole,
)
from app.services import contract_jobs  # noqa: E402


@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
    SQLModel.metadata.create_all(eng)
    seed_approval_rules(eng)
    # 审批分级按权限位判定：先补种默认角色权限（employee=L1、admin=L2），
    # 并清掉进程内按角色缓存，避免其他用例留下的空权限集合干扰本文件。
    invalidate_role_permissions()
    with Session(eng) as s:
        seed_permissions(s)
    return eng


@pytest.fixture()
def api(engine):
    def _mk_user(role=UserRole.employee):
        with Session(engine) as s:
            u = User(
                email=f"{uuid.uuid4().hex[:12]}@test.com",
                hashed_password="x",
                full_name="测试用户",
                role=role,
            )
            s.add(u)
            s.commit()
            s.refresh(u)
            return u

    created_sessions = []

    def _login(user):
        def _session_override():
            s = Session(engine)
            created_sessions.append(s)
            return s

        def _user_override():
            s = Session(engine)
            created_sessions.append(s)
            return s.get(User, user.id)

        app.dependency_overrides[get_session] = _session_override
        app.dependency_overrides[auth_module.get_current_user] = _user_override
        app.dependency_overrides[
            auth_module.get_current_user_allow_query_token
        ] = _user_override
        return TestClient(app)

    factory = SimpleNamespace(mk_user=_mk_user, login=_login, engine=engine)
    try:
        yield factory
    finally:
        for s in created_sessions:
            s.close()
        app.dependency_overrides.clear()


def _generate(client, counters: dict) -> str:
    r = client.post(
        "/api/v1/contracts/generate",
        json={
            "counters": {"title": "房屋租赁合同", **counters},
            "language": "zh",
            "kind": "lease",
        },
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _submit(client, contract_id: str):
    return client.post(f"/api/v1/contracts/{contract_id}/submit-approval")


def _hit_fields(resp) -> list:
    body = resp.json()
    approval = body.get("approval") or {}
    return [h["field"] for h in approval.get("rule_hits", [])]


def _add_party(client, contract_id: str) -> None:
    r = client.post(
        f"/api/v1/contracts/{contract_id}/parties",
        json={"name": "租客甲", "role": "tenant"},
    )
    assert r.status_code == 200, r.text


def test_each_default_rule_hits_and_misses(api):
    employee = api.mk_user()
    client = api.login(employee)

    cases = [
        # (counters, 期望命中字段, 是否命中)
        ({"monthly_rent": 8000, "listing_price": 10000}, "rent_ratio", True),
        ({"monthly_rent": 9000, "listing_price": 10000}, "rent_ratio", False),
        ({"monthly_rent": 8000, "rent_free_days": 20}, "rent_free_days", True),
        ({"monthly_rent": 8000, "rent_free_days": 10}, "rent_free_days", False),
        ({"monthly_rent": 8000, "term_months": 2}, "term_months", True),
        ({"monthly_rent": 8000, "term_months": 24}, "term_months", False),
        ({"monthly_rent": 8000, "term_months": 48}, "term_months", True),
        ({"monthly_rent": 8000, "deposit": 5000}, "deposit_months", True),
        ({"monthly_rent": 8000, "deposit": 8000}, "deposit_months", False),
        ({"monthly_rent": 8000, "total_discount_rate": 30}, "total_discount_rate", True),
        ({"monthly_rent": 8000, "total_discount_rate": 10}, "total_discount_rate", False),
    ]
    for counters, field, expected in cases:
        contract_id = _generate(client, counters)
        resp = _submit(client, contract_id)
        assert resp.status_code == 200, resp.text
        hits = _hit_fields(resp)
        assert (field in hits) is expected, (counters, field, hits)
        body = resp.json()
        assert body["requires_approval"] is expected
        if not expected:
            assert body["approval"] is None


def test_send_blocked_until_approved(api):
    employee = api.mk_user()
    supervisor = api.mk_user(UserRole.employee)  # 只有 L1 权限
    client = api.login(employee)

    contract_id = _generate(client, {"monthly_rent": 8000, "rent_free_days": 20})
    _add_party(client, contract_id)
    submitted = _submit(client, contract_id)
    assert submitted.status_code == 200, submitted.text
    body = submitted.json()
    assert body["requires_approval"] is True
    approval_id = body["approval"]["id"]

    detail = client.get(f"/api/v1/contracts/{contract_id}").json()
    assert detail["status"] == ContractStatus.pending_approval.value
    assert detail["approval"]["id"] == approval_id
    assert detail["approval"]["comment"] is None

    blocked = client.post(f"/api/v1/contracts/{contract_id}/send", json={})
    assert blocked.status_code == 409, blocked.text
    assert blocked.json()["detail"] == "APPROVAL_REQUIRED"

    supervisor_client = api.login(supervisor)
    approved = supervisor_client.post(
        f"/api/v1/contracts/approvals/{approval_id}/approve"
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == ContractApprovalStatus.approved.value
    assert approved.json()["contract_status"] == ContractStatus.draft.value

    sent = client.post(f"/api/v1/contracts/{contract_id}/send", json={})
    assert sent.status_code == 200, sent.text

    with Session(api.engine) as session:
        actions = session.exec(
            select(ContractAuditLog.action).where(
                ContractAuditLog.contract_id == uuid.UUID(contract_id)
            )
        ).all()
    assert "contract.submit_approval" in actions
    assert "contract.approve" in actions


def test_reject_returns_to_draft_and_resubmit_creates_new_request(api):
    employee = api.mk_user()
    supervisor = api.mk_user(UserRole.employee)  # L1 审批人
    admin = api.mk_user(UserRole.admin)  # 仅用于查看历史审批单
    client = api.login(employee)

    contract_id = _generate(client, {"monthly_rent": 8000, "rent_free_days": 20})
    first = _submit(client, contract_id).json()["approval"]
    supervisor_client = api.login(supervisor)

    rejected = supervisor_client.post(
        f"/api/v1/contracts/approvals/{first['id']}/reject",
        json={"comment": "免租期过长，请修改"},
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == ContractApprovalStatus.rejected.value

    detail = client.get(f"/api/v1/contracts/{contract_id}").json()
    assert detail["status"] == ContractStatus.draft.value
    assert detail["approval"]["status"] == ContractApprovalStatus.rejected.value
    assert detail["approval"]["comment"] == "免租期过长，请修改"

    second = _submit(client, contract_id)
    assert second.status_code == 200, second.text
    second_approval = second.json()["approval"]
    assert second_approval["id"] != first["id"]

    admin_client = api.login(admin)
    old = admin_client.get(f"/api/v1/contracts/approvals/{first['id']}")
    assert old.status_code == 200
    assert old.json()["status"] == ContractApprovalStatus.rejected.value

    with Session(api.engine) as session:
        rows = session.exec(
            select(ContractApprovalRequest).where(
                ContractApprovalRequest.object_id == uuid.UUID(contract_id)
            )
        ).all()
        assert len(rows) == 2
        actions = session.exec(
            select(ContractAuditLog.action).where(
                ContractAuditLog.contract_id == uuid.UUID(contract_id)
            )
        ).all()
    assert "contract.reject" in actions


def test_self_approval_is_rejected_and_audited(api):
    admin = api.mk_user(UserRole.admin)
    client = api.login(admin)

    contract_id = _generate(client, {"monthly_rent": 8000, "rent_free_days": 20})
    approval_id = _submit(client, contract_id).json()["approval"]["id"]

    resp = client.post(f"/api/v1/contracts/approvals/{approval_id}/approve")
    assert resp.status_code == 403, resp.text
    assert "提交人" in resp.json()["detail"]

    with Session(api.engine) as session:
        row = session.exec(
            select(ContractAuditLog).where(
                ContractAuditLog.contract_id == uuid.UUID(contract_id),
                ContractAuditLog.action == "contract.approve",
                ContractAuditLog.result == "failure",
            )
        ).first()
    assert row is not None
    assert row.error == "SELF_APPROVAL_FORBIDDEN"


def test_owner_initiated_contract_skips_approval(api):
    employee = api.mk_user()
    owner = api.mk_user(UserRole.owner)
    client = api.login(employee)

    contract_id = _generate(client, {"monthly_rent": 8000, "rent_free_days": 20})
    with Session(api.engine) as session:
        contract = session.get(Contract, uuid.UUID(contract_id))
        contract.created_by = owner.id
        session.add(contract)
        session.commit()

    resp = _submit(client, contract_id)
    assert resp.status_code == 200, resp.text
    assert resp.json()["requires_approval"] is False
    assert resp.json()["approval"] is None

    detail = client.get(f"/api/v1/contracts/{contract_id}").json()
    assert detail["status"] == ContractStatus.draft.value


def test_two_level_escalation_path(api):
    employee = api.mk_user()
    supervisor = api.mk_user(UserRole.employee)  # L1：contract.approve.l1
    finance = api.mk_user(UserRole.admin)  # L2：contract.approve.l2
    client = api.login(employee)

    # 总租金 30000 × 12 = 36 万 > 30 万，只命中第 2 级大额规则
    contract_id = _generate(client, {"monthly_rent": 30000, "term_months": 12})
    _add_party(client, contract_id)
    submitted = _submit(client, contract_id).json()
    approval = submitted["approval"]
    assert approval["required_level"] == 2
    assert [lv["role"] for lv in approval["levels"]] == ["supervisor", "finance"]

    first = api.login(supervisor).post(
        f"/api/v1/contracts/approvals/{approval['id']}/approve"
    )
    assert first.status_code == 200, first.text
    assert first.json()["status"] == ContractApprovalStatus.pending.value
    assert first.json()["current_level"] == 2

    detail = client.get(f"/api/v1/contracts/{contract_id}").json()
    assert detail["status"] == ContractStatus.pending_approval.value

    second = api.login(finance).post(
        f"/api/v1/contracts/approvals/{approval['id']}/approve"
    )
    assert second.status_code == 200, second.text
    assert second.json()["status"] == ContractApprovalStatus.approved.value
    assert len(second.json()["approval"]["steps"]) == 2

    sent = client.post(f"/api/v1/contracts/{contract_id}/send", json={})
    assert sent.status_code == 200, sent.text


def test_approval_levels_are_permission_separated(api):
    """只有 L1 的账号不能批 L2，只有 L2 的账号不能批 L1，且返回明确原因。"""
    submitter = api.mk_user()
    l1_only = api.mk_user(UserRole.employee)  # contract.approve.l1
    l2_only = api.mk_user(UserRole.admin)  # contract.approve.l2（默认不含 L1）
    client = api.login(submitter)

    contract_id = _generate(client, {"monthly_rent": 30000, "term_months": 12})
    approval_id = _submit(client, contract_id).json()["approval"]["id"]

    # 第 1 级：只有 L2 的 admin 被拒，原因点名 l1 权限
    denied_l1 = api.login(l2_only).post(
        f"/api/v1/contracts/approvals/{approval_id}/approve"
    )
    assert denied_l1.status_code == 403, denied_l1.text
    assert "contract.approve.l1" in denied_l1.json()["detail"]

    # 同层级：只有 L1 的员工可以批
    first = api.login(l1_only).post(
        f"/api/v1/contracts/approvals/{approval_id}/approve"
    )
    assert first.status_code == 200, first.text
    assert first.json()["current_level"] == 2

    # 第 2 级：只有 L1 的员工被拒，原因点名 l2 权限
    denied_l2 = api.login(l1_only).post(
        f"/api/v1/contracts/approvals/{approval_id}/approve"
    )
    assert denied_l2.status_code == 403, denied_l2.text
    assert "contract.approve.l2" in denied_l2.json()["detail"]

    # 只有 L2 的 admin 完成第 2 级
    second = api.login(l2_only).post(
        f"/api/v1/contracts/approvals/{approval_id}/approve"
    )
    assert second.status_code == 200, second.text
    assert second.json()["status"] == ContractApprovalStatus.approved.value


def test_reminder_sent_only_once_after_24_hours(api):
    employee = api.mk_user()
    api.mk_user(UserRole.employee)  # L1 审批人（admin 无 L1，不在提醒范围）
    client = api.login(employee)

    contract_id = _generate(client, {"monthly_rent": 8000, "rent_free_days": 20})
    approval_id = _submit(client, contract_id).json()["approval"]["id"]

    with Session(api.engine) as session:
        approval = session.get(ContractApprovalRequest, uuid.UUID(approval_id))
        approval.level_started_at = datetime.utcnow() - timedelta(hours=25)
        session.add(approval)
        session.commit()

        before = len(
            session.exec(
                select(Notification).where(
                    Notification.template_key == "contract_approval_reminder"
                )
            ).all()
        )
        sent = contract_jobs.remind_stale_approvals(session)
        after = len(
            session.exec(
                select(Notification).where(
                    Notification.template_key == "contract_approval_reminder"
                )
            ).all()
        )
    assert sent == 1
    assert after - before == 1  # 仅一个 L1 可审批人，提交人已排除

    with Session(api.engine) as session:
        again = contract_jobs.remind_stale_approvals(session)
        total = len(
            session.exec(
                select(Notification).where(
                    Notification.template_key == "contract_approval_reminder"
                )
            ).all()
        )
        approval = session.get(ContractApprovalRequest, uuid.UUID(approval_id))
    assert again == 0
    assert total == after
    assert approval.remind_count == 1
    assert approval.reminded_at is not None


def test_rule_threshold_is_configurable_via_api(api):
    admin = api.mk_user(UserRole.admin)
    admin_client = api.login(admin)

    rules = admin_client.get("/api/v1/contracts/approval-rules").json()
    rent_rule = next(r for r in rules if r["field"] == "rent_ratio")

    patched = admin_client.patch(
        f"/api/v1/contracts/approval-rules/{rent_rule['id']}",
        json={"threshold": 95},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["threshold"] == 95

    employee = api.mk_user()
    client = api.login(employee)
    # 93% < 95%，改阈值后命中；默认 90% 时不会命中
    contract_id = _generate(client, {"monthly_rent": 9300, "listing_price": 10000})
    resp = _submit(client, contract_id)
    assert resp.status_code == 200, resp.text
    assert "rent_ratio" in _hit_fields(resp)

    with Session(api.engine) as session:
        rule = session.get(ContractApprovalRule, uuid.UUID(rent_rule["id"]))
        assert rule.threshold == 95
