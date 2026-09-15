"""关键业务路径接口测试。

补齐后端最有业务风险的接口回归覆盖：
- 存活/就绪探针（/health、/health/ready）
- 房东管钱闭环（/owners/me/income、/owners/me/annual-financial-summary）
- 收付款分页与类型筛选（/payments/me）
- 管理端财务对账分页与聚合口径（/dashboard/financial-reconciliation）
- 房源列表分页/筛选与未认证访问拦截（/properties）

全部使用内存 SQLite + dependency_overrides，不依赖真实数据库与 Redis。
"""
import hashlib
import pathlib
import sys
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

BASE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app import main as main_module  # noqa: E402
from app.api.v1 import documents as documents_module  # noqa: E402
from app.core import auth as auth_module  # noqa: E402
from app.db import get_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Attendance,
    AttendanceStatus,
    ChurnSignal,
    CommissionSettlement,
    DealType,
    Document,
    DocumentType,
    Employee,
    Lead,
    Lease,
    LeaseStatus,
    Notification,
    Owner,
    Payment,
    PaymentStatus,
    PaymentType,
    Project,
    Property,
    PropertyMatch,
    PropertyStatus,
    ServiceOrder,
    ServiceOrderStatus,
    ServiceType,
    Tenant,
    User,
    UserRole,
)
from app.services.late_fee import accrue_late_fees  # noqa: E402


@pytest.fixture()
def engine():
    # StaticPool：TestClient 请求可能运行在不同线程，需共享同一内存库连接
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
    SQLModel.metadata.create_all(eng)
    return eng


@pytest.fixture()
def api(engine):
    """绑定内存库的 TestClient 工厂（可指定登录用户）。"""

    def _mk_user(role=UserRole.tenant):
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
        s = Session(engine)
        created_sessions.append(s)
        bound_user = s.get(User, user.id)
        app.dependency_overrides[get_session] = lambda: s
        app.dependency_overrides[auth_module.get_current_user] = lambda: bound_user
        return TestClient(app)

    factory = SimpleNamespace(mk_user=_mk_user, login=_login, engine=engine)
    try:
        yield factory
    finally:
        for s in created_sessions:
            s.close()
        app.dependency_overrides.clear()


def _mk_owner(engine, role=UserRole.owner) -> tuple[User, Owner]:
    """创建一个业主用户及其业主档案。"""
    with Session(engine) as s:
        u = User(
            email=f"{uuid.uuid4().hex[:12]}@test.com",
            hashed_password="x",
            full_name="业主",
            role=role,
        )
        s.add(u)
        s.commit()
        s.refresh(u)
        owner = Owner(user_id=u.id)
        s.add(owner)
        s.commit()
        s.refresh(owner)
        s.refresh(u)
        return u, owner


def _mk_property(engine, owner_id, monthly_rent=12000.0, status=PropertyStatus.rented):
    with Session(engine) as s:
        prop = Property(
            owner_id=owner_id,
            room_number=f"R{uuid.uuid4().hex[:4]}",
            address="曼谷 Sukhumvit 101",
            monthly_rent=monthly_rent,
            currency="THB",
            deposit_amount=monthly_rent * 2,
            status=status,
        )
        s.add(prop)
        s.commit()
        s.refresh(prop)
        return prop


def _mk_payment(
    engine,
    payer_id,
    amount,
    *,
    payment_type=PaymentType.rent,
    status=PaymentStatus.pending,
    property_id=None,
    payee_id=None,
    due_date=None,
    created_at=None,
    deleted_at=None,
):
    with Session(engine) as s:
        pay = Payment(
            payer_id=payer_id,
            payee_id=payee_id,
            property_id=property_id,
            amount=amount,
            currency="THB",
            payment_type=payment_type,
            status=status,
            idempotency_key=str(uuid.uuid4()),
            due_date=due_date,
            paid_at=datetime.utcnow() if status == PaymentStatus.succeeded else None,
        )
        if created_at:
            pay.created_at = created_at
        if deleted_at:
            pay.deleted_at = deleted_at
        s.add(pay)
        s.commit()
        s.refresh(pay)
        return pay.id


# ------------------------------------------------------------ 探针
def test_health_liveness_and_readiness(monkeypatch):
    """/health 只反映进程存活；/health/ready 真实探测依赖并按结果给状态码。"""

    def _boom():
        raise AssertionError("/health 不应探测外部依赖")

    # 存活探针：把依赖探测改成「一调用就失败」，能通过就说明它没碰依赖
    monkeypatch.setattr(main_module, "_check_database", _boom)
    client = TestClient(app)
    live = client.get("/health")
    assert live.status_code == 200, live.text
    assert live.json()["status"] == "ok"

    # 依赖全通 → ready
    monkeypatch.setattr(main_module, "_check_database", lambda: {"status": "ok"})
    monkeypatch.setattr(main_module, "_check_redis", lambda: {"status": "ok"})
    ready = client.get("/health/ready")
    assert ready.status_code == 200, ready.text
    assert ready.json()["status"] == "ok"
    assert ready.json()["checks"]["database"]["status"] == "ok"

    # 仅 Redis 异常 → 200 + degraded（缓存/限流降级，业务仍可用）
    monkeypatch.setattr(
        main_module, "_check_redis", lambda: {"status": "error", "detail": "down"}
    )
    degraded = client.get("/health/ready")
    assert degraded.status_code == 200, degraded.text
    assert degraded.json()["status"] == "degraded"

    # 数据库异常 → 503（服务无法提供数据能力，必须让编排系统摘掉实例）
    monkeypatch.setattr(
        main_module, "_check_database", lambda: {"status": "error", "detail": "down"}
    )
    unavailable = client.get("/health/ready")
    assert unavailable.status_code == 503, unavailable.text
    assert unavailable.json()["status"] == "unavailable"


# ------------------------------------------------------------ 收付款
def test_payments_me_filters_by_type_and_paginates(api, engine):
    """/payments/me 必须真正按 payment_type 过滤（此前参数被静默忽略），且支持分页。"""
    tenant = api.mk_user(UserRole.tenant)
    other = api.mk_user(UserRole.tenant)

    # 2 笔本人支付的租金 + 1 笔他人支付但收款方是本人的租金 + 1 笔本人支付的押金
    _mk_payment(engine, tenant.id, 1000, payment_type=PaymentType.rent)
    _mk_payment(engine, tenant.id, 2000, payment_type=PaymentType.rent)
    _mk_payment(
        engine,
        other.id,
        3000,
        payment_type=PaymentType.rent,
        payee_id=tenant.id,
    )
    _mk_payment(engine, tenant.id, 4000, payment_type=PaymentType.deposit)

    client = api.login(tenant)
    all_rows = client.get("/api/v1/payments/me")
    assert all_rows.status_code == 200, all_rows.text
    assert all_rows.json()["total"] == 4

    rent_rows = client.get("/api/v1/payments/me", params={"payment_type": "rent"})
    assert rent_rows.status_code == 200, rent_rows.text
    body = rent_rows.json()
    # 收/付两侧都要算：本人付 2 笔 + 本人收 1 笔
    assert body["total"] == 3
    assert {item["payment_type"] for item in body["items"]} == {"rent"}

    paged = client.get(
        "/api/v1/payments/me", params={"payment_type": "rent", "limit": 1, "offset": 1}
    )
    assert paged.status_code == 200, paged.text
    assert len(paged.json()["items"]) == 1
    assert paged.json()["total"] == 3

    # 参数越界由 FastAPI 校验拦截（limit 上限 2000）
    assert client.get("/api/v1/payments/me", params={"limit": 5000}).status_code == 422


# ------------------------------------------------------------ 财务对账
def test_financial_reconciliation_totals_and_pagination(api, engine):
    """管理端对账：聚合口径（已收/应收/逾期）正确，且 records 分页时总数不丢。"""
    admin = api.mk_user(UserRole.admin)
    owner_user, owner = _mk_owner(engine)
    prop_a = _mk_property(engine, owner.id)
    prop_b = _mk_property(engine, owner.id)
    now = datetime.utcnow()

    _mk_payment(engine, owner_user.id, 1000, status=PaymentStatus.succeeded, property_id=prop_a.id)
    _mk_payment(
        engine,
        owner_user.id,
        2000,
        property_id=prop_a.id,
        due_date=now + timedelta(days=10),
    )
    _mk_payment(
        engine,
        owner_user.id,
        3000,
        property_id=prop_b.id,
        due_date=now - timedelta(days=10),
    )

    client = api.login(admin)
    r = client.get(
        "/api/v1/dashboard/financial-reconciliation",
        params={"limit": 1, "offset": 0},
    )
    assert r.status_code == 200, r.text
    payload = r.json()

    assert payload["totals"] == {
        "received": 1000.0,
        "receivable": 2000.0,
        "overdue": 3000.0,
        "count": 3,
    }
    # 逐笔只返回 1 条，但总数必须仍是 3（否则前端会把"截断"当成"只有 1 笔"）
    assert len(payload["records"]) == 1
    assert payload["records_total"] == 3

    by_property = {row["property_id"]: row for row in payload["by_property"]}
    assert len(by_property) == 2
    assert by_property[str(prop_a.id)]["received"] == 1000.0
    assert by_property[str(prop_a.id)]["receivable"] == 2000.0
    assert by_property[str(prop_b.id)]["overdue"] == 3000.0
    # 房源名按被引用 ID 回填（不再全表加载）
    assert by_property[str(prop_b.id)]["property"]

    # 分页取第二笔，命中不同记录
    second = client.get(
        "/api/v1/dashboard/financial-reconciliation",
        params={"limit": 1, "offset": 1},
    )
    assert second.status_code == 200, second.text
    assert second.json()["records"][0]["id"] != payload["records"][0]["id"]


# ------------------------------------------------------------ 房东管钱
def test_owner_income_closed_loop(api, engine):
    """/owners/me/income 三个金额口径（已收/应收/逾期）与房源隔离必须准确。"""
    owner_user, owner = _mk_owner(engine)
    prop = _mk_property(engine, owner.id)
    # 他人房源，不应计入
    _, other_owner = _mk_owner(engine)
    other_prop = _mk_property(engine, other_owner.id)
    now = datetime.utcnow()

    _mk_payment(
        engine,
        owner_user.id,
        12000,
        status=PaymentStatus.succeeded,
        property_id=prop.id,
    )
    _mk_payment(
        engine,
        owner_user.id,
        5000,
        property_id=prop.id,
        due_date=now + timedelta(days=15),
    )
    _mk_payment(
        engine,
        owner_user.id,
        7000,
        property_id=prop.id,
        due_date=now - timedelta(days=15),
    )
    # 非租金不入收入口径
    _mk_payment(
        engine,
        owner_user.id,
        9999,
        payment_type=PaymentType.deposit,
        status=PaymentStatus.succeeded,
        property_id=prop.id,
    )
    # 他人房源的租金不入本业主口径
    _mk_payment(
        engine,
        other_owner.user_id,
        8888,
        status=PaymentStatus.succeeded,
        property_id=other_prop.id,
    )

    client = api.login(owner_user)
    r = client.get("/api/v1/owners/me/income")
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["total_income"] == 12000.0
    assert body["receivable_total"] == 12000.0
    assert body["overdue_total"] == 7000.0
    assert body["property_count"] == 1
    assert body["rented_count"] == 1
    assert sorted(rec["status"] for rec in body["records"]) == [
        "overdue",
        "pending",
        "received",
    ]
    assert body["by_property"][0]["property_id"] == str(prop.id)
    assert body["by_property"][0]["income"] == 12000.0


def test_owner_annual_financial_summary_groups_by_month(api, engine):
    """年度汇总按月份分桶，已收/待收/逾期与笔数需与逐笔数据一致。"""
    owner_user, owner = _mk_owner(engine)
    prop = _mk_property(engine, owner.id)
    now = datetime.utcnow()

    _mk_payment(
        engine,
        owner_user.id,
        10000,
        status=PaymentStatus.succeeded,
        property_id=prop.id,
    )
    _mk_payment(
        engine,
        owner_user.id,
        2000,
        property_id=prop.id,
        due_date=now + timedelta(days=20),
    )
    _mk_payment(
        engine,
        owner_user.id,
        3000,
        property_id=prop.id,
        due_date=now - timedelta(days=20),
    )

    client = api.login(owner_user)
    r = client.get("/api/v1/owners/me/annual-financial-summary")
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["year"] == now.year
    assert body["totals"] == {
        "received": 10000.0,
        "pending": 2000.0,
        "overdue": 3000.0,
        "count": 3,
    }
    assert len(body["by_month"]) == 1
    assert body["by_month"][0]["month"] == now.strftime("%Y-%m")
    assert body["by_month"][0]["count"] == 3


# ------------------------------------------------------------ 房源与鉴权
def test_properties_pagination_filters_and_auth_required(api, engine):
    """房源列表分页/状态筛选可用；缺少凭证时必须 401（不能静默放行）。"""
    owner_user, owner = _mk_owner(engine)
    _mk_property(engine, owner.id, status=PropertyStatus.vacant)
    _mk_property(engine, owner.id, status=PropertyStatus.rented)

    agent = api.mk_user(UserRole.agent)
    client = api.login(agent)

    paged = client.get("/api/v1/properties", params={"page_size": 1})
    assert paged.status_code == 200, paged.text
    body = paged.json()
    assert len(body["items"]) == 1
    assert body["total"] == 2
    assert body["total_pages"] == 2

    vacant = client.get("/api/v1/properties", params={"status": "vacant"})
    assert vacant.status_code == 200, vacant.text
    assert vacant.json()["total"] == 1
    # response_model=Page[Property] 不得截断前端依赖的字段
    item = vacant.json()["items"][0]
    assert {"id", "room_number", "address", "monthly_rent", "currency", "status"} <= set(
        item
    )
    assert item["status"] == "vacant"

    # 移除登录态覆盖，走真实鉴权依赖
    app.dependency_overrides.pop(auth_module.get_current_user, None)
    anonymous = TestClient(app)
    assert anonymous.get("/api/v1/properties").status_code == 401


# ------------------------------------------------------------ 房源关键词搜索
def test_property_keyword_search_and_sort(api, engine):
    """关键词 / 区域同义词 / 价格区间 / 户型 / 排序下推到 SQL 后，命中与顺序需一致。

    覆盖两个易错点：
    1. 关键词要能命中「关联楼盘」的字段（房源地址里没写区域时不应漏搜）；
    2. 排序参数必须真的改变 SQL 的 ORDER BY，而不是前端排序。
    """
    owner_user, owner = _mk_owner(engine)
    with Session(engine) as s:
        proj = Project(
            name="Noble Sukhumvit",
            address="Sukhumvit Soi 33",
            city="Bangkok",
            district="Watthana",
        )
        s.add(proj)
        s.commit()
        s.refresh(proj)
        project_id = proj.id

    def _mk(room, address, rent, bedrooms=None, size=None, building=None, project=None):
        with Session(engine) as s:
            prop = Property(
                owner_id=owner.id,
                room_number=room,
                address=address,
                monthly_rent=rent,
                currency="THB",
                bedrooms=bedrooms,
                size_sqm=size,
                building=building,
                project_id=project,
            )
            s.add(prop)
            s.commit()
            s.refresh(prop)
            return prop.id

    cheap = _mk("B-202", "Silom Road 5", 8000.0, bedrooms=1, size=30.0, building="Silom Tower")
    mid = _mk("A-101", "Sukhumvit Soi 24", 20000.0, bedrooms=2, size=55.0)
    pricey = _mk("C-303", "Rama 9 Road", 35000.0, bedrooms=4, size=120.0, project=project_id)

    agent = api.mk_user(UserRole.agent)
    client = api.login(agent)
    base = "/api/v1/properties"

    # 关键词：mid 命中房源地址，pricey 命中关联楼盘（地址里没有 sukhumvit）
    hit = client.get(base, params={"q": "sukhumvit"})
    assert hit.status_code == 200, hit.text
    assert {i["id"] for i in hit.json()["items"]} == {str(mid), str(pricey)}

    # 区域/地铁同义词：多关键词之间是「或」，命中任一即算
    syn = client.get(base, params={"keywords": ["silom", "rama 9"]})
    assert syn.status_code == 200, syn.text
    assert {i["id"] for i in syn.json()["items"]} == {str(cheap), str(pricey)}

    # 价格区间 / 户型区间
    ranged = client.get(base, params={"price_min": 10000, "price_max": 30000})
    assert {i["id"] for i in ranged.json()["items"]} == {str(mid)}
    roomy = client.get(base, params={"bedrooms_min": 4})
    assert {i["id"] for i in roomy.json()["items"]} == {str(pricey)}

    # 排序：价格升/降序需真的换掉 SQL 的 ORDER BY（前端不再依赖自排序）
    asc = client.get(base, params={"sort": "price_asc"}).json()["items"]
    assert [i["id"] for i in asc] == [str(cheap), str(mid), str(pricey)]
    desc = client.get(base, params={"sort": "price_desc"}).json()["items"]
    assert [i["id"] for i in desc] == [str(pricey), str(mid), str(cheap)]

    # 视频看房筛选：video_url 为空时不应误命中
    assert client.get(base, params={"has_video": True}).json()["total"] == 0
    patched = client.patch(
        f"{base}/{mid}", json={"video_url": "/uploads/properties/demo.mp4"}
    )
    assert patched.status_code == 200, patched.text
    only_video = client.get(base, params={"has_video": True, "page_size": 5})
    assert only_video.json()["total"] == 1
    assert only_video.json()["items"][0]["video_url"] == "/uploads/properties/demo.mp4"

    # 非法枚举状态直接 422（前端据此做白名单，避免整页变空）
    assert client.get(base, params={"status": "reserved"}).status_code == 422
    # 非法排序参数同样 422，不能被当成默认排序静默吞掉
    assert client.get(base, params={"sort": "whatever"}).status_code == 422


# ------------------------------------------------------------ 房源展示名
def test_property_display_name_used_by_viewings_and_workbench(api, engine):
    """带看/员工工作台返回的房源名来自 `Property.display_name`。

    回归守卫：房源表没有 `title` 列，此前这些接口直接读 `prop.title` 会 500。
    """
    owner_user, owner = _mk_owner(engine)
    prop = _mk_property(engine, owner.id, status=PropertyStatus.vacant)

    tenant_user = api.mk_user(UserRole.tenant)
    with Session(engine) as s:
        tenant = Tenant(user_id=tenant_user.id)
        s.add(tenant)
        s.commit()
        s.refresh(tenant)

    employee_user = api.mk_user(UserRole.employee)
    with Session(engine) as s:
        employee = Employee(user_id=employee_user.id, employee_code="E0001")
        s.add(employee)
        s.commit()
        s.refresh(employee)
        lease = Lease(
            property_id=prop.id,
            tenant_id=tenant.id,
            owner_id=owner.id,
            agent_id=employee.id,
            start_date=datetime.utcnow() - timedelta(days=10),
            # 30 天内到期，命中工作台的"即将到期"清单
            end_date=datetime.utcnow() + timedelta(days=10),
            monthly_rent=12000,
            deposit_amount=24000,
            status=LeaseStatus.active,
        )
        s.add(lease)
        s.commit()

    # 租客提交预约看房：响应中的房源名取房号
    tenant_client = api.login(tenant_user)
    created = tenant_client.post(
        "/api/v1/viewings",
        json={
            "property_id": str(prop.id),
            "scheduled_at": (datetime.utcnow() + timedelta(days=1)).isoformat(),
            "visitor_name": "看房客",
        },
    )
    assert created.status_code == 200, created.text
    assert created.json()["property_title"] == prop.room_number

    employee_client = api.login(employee_user)
    listed = employee_client.get("/api/v1/viewings")
    assert listed.status_code == 200, listed.text
    assert listed.json()["items"][0]["property_title"] == prop.room_number

    workbench = employee_client.get("/api/v1/employees/workbench")
    assert workbench.status_code == 200, workbench.text
    follow_up = workbench.json()["follow_up_leases"]
    assert follow_up[0]["property_title"] == prop.room_number

    # response_model=Page[Lease] 不得截断租约关键字段
    leases = employee_client.get("/api/v1/leases")
    assert leases.status_code == 200, leases.text
    lease_item = leases.json()["items"][0]
    assert {"id", "monthly_rent", "status", "start_date", "end_date"} <= set(lease_item)


def test_annual_financial_summary_without_properties(api, engine):
    """无房源时年度汇总也要给出完整口径，且 year 必须有值。"""
    owner_user, _ = _mk_owner(engine)
    now = datetime.utcnow()

    client = api.login(owner_user)
    r = client.get("/api/v1/owners/me/annual-financial-summary")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["year"] == now.year
    assert body["by_month"] == []
    assert body["totals"] == {
        "received": 0.0,
        "pending": 0.0,
        "overdue": 0.0,
        "count": 0,
    }


# ------------------------------------------------------------ 数据导出
def test_export_csv_reports_content_and_scope(api, engine):
    """导出报表：内容/编码正确，且可见范围不能被导出绕过。"""
    owner_user, owner = _mk_owner(engine)
    prop = _mk_property(engine, owner.id, status=PropertyStatus.vacant)

    tenant_user = api.mk_user(UserRole.tenant)
    employee_user = api.mk_user(UserRole.employee)
    outsider_user = api.mk_user(UserRole.tenant)
    with Session(engine) as s:
        tenant = Tenant(user_id=tenant_user.id)
        s.add(tenant)
        s.commit()
        s.refresh(tenant)
        employee = Employee(
            user_id=employee_user.id,
            employee_code="E0001",
            department="租赁部",
            position="顾问",
            phone="0890000000",
        )
        s.add(employee)
        s.commit()
        s.refresh(employee)
        lease = Lease(
            property_id=prop.id,
            tenant_id=tenant.id,
            owner_id=owner.id,
            agent_id=employee.id,
            start_date=datetime.utcnow() - timedelta(days=10),
            end_date=datetime.utcnow() + timedelta(days=10),
            monthly_rent=12000,
            deposit_amount=24000,
            status=LeaseStatus.active,
        )
        s.add(lease)
        s.commit()
        s.refresh(lease)
        s.add(
            CommissionSettlement(
                employee_id=employee.id,
                lease_id=lease.id,
                deal_type=DealType.new_rental,
                commission_base=12000,
                commission_rate=0.5,
                commission_amount=6000,
            )
        )
        attendance_date = datetime.utcnow().date()
        s.add(
            Attendance(
                employee_id=employee.id,
                date=attendance_date,
                check_in_time=datetime.utcnow(),
                status=AttendanceStatus.present,
            )
        )
        s.commit()
        employee_id = employee.id

    # 租客的两笔收付款：一笔付给员工，一笔与当前租客无关
    mine = _mk_payment(engine, tenant_user.id, 12000, payee_id=employee_user.id)
    _mk_payment(engine, outsider_user.id, 999)
    with Session(engine) as s:
        s.get(Payment, mine).property_id = prop.id
        s.commit()

    client = api.login(employee_user)
    # 房源导出：带 BOM 的 CSV，含表头与数据行
    res = client.get("/api/v1/exports/properties")
    assert res.status_code == 200, res.text
    assert res.headers["content-type"].startswith("text/csv")
    assert "attachment" in res.headers["content-disposition"]
    text = res.content.decode("utf-8")
    assert text.startswith("\ufeff")
    assert text.lstrip("\ufeff").splitlines()[0].startswith("房号,")
    assert prop.room_number in text

    # 佣金 / 考勤导出只含自己的数据
    commission_csv = client.get("/api/v1/exports/commissions")
    assert commission_csv.status_code == 200, commission_csv.text
    assert "6000" in commission_csv.content.decode("utf-8")
    attendance_csv = client.get(
        "/api/v1/exports/attendance",
        # 显式传日期：接口默认区间取「本地今天」，与用例写入的 UTC 日期在跨零点时会差一天
        params={"start_date": str(attendance_date), "end_date": str(attendance_date)},
    )
    assert attendance_csv.status_code == 200, attendance_csv.text
    assert "E0001" in attendance_csv.content.decode("utf-8")

    # 收付款导出非员工角色只看与自己相关的：租客只导出自己的那笔
    tenant_client = api.login(tenant_user)
    tenant_csv = tenant_client.get("/api/v1/exports/payments").content.decode("utf-8")
    assert "12000" in tenant_csv
    assert len(tenant_csv.strip().splitlines()) == 2  # 表头 + 仅自己的 1 行

    # 房源导出对租客关闭（403），避免导出成为越权取数入口
    assert tenant_client.get("/api/v1/exports/properties").status_code == 403
    # 通讯录与通讯录导出同样只对员工开放（须在切换登录态之前断言：overrides 是全局的）
    assert tenant_client.get("/api/v1/exports/employees").status_code == 403
    assert tenant_client.get("/api/v1/employees/directory").status_code == 403
    # employee_code 不会出现在别人的佣金导出里（employee_id 入参对非 admin 无效）
    other = api.login(api.mk_user(UserRole.employee))
    assert other.get("/api/v1/exports/commissions").status_code == 404

    # 同事通讯录：全体员工可见，仅协作联系方式，部门清单来自真实数据
    directory = client.get("/api/v1/employees/directory")
    assert directory.status_code == 200, directory.text
    body = directory.json()
    assert [i["employee_no"] for i in body["items"]] == ["E0001"]
    assert body["items"][0]["department"] == "租赁部"
    assert body["items"][0]["phone"] == "0890000000"
    assert body["departments"] == ["租赁部"]
    # 按关键词 / 部门筛选
    assert client.get("/api/v1/employees/directory", params={"keyword": "顾问"}).json()["total"] == 1
    assert client.get("/api/v1/employees/directory", params={"keyword": "财务"}).json()["total"] == 0
    assert client.get("/api/v1/employees/directory", params={"department": "市场部"}).json()["total"] == 0
    # 通讯录导出表头与内容
    directory_csv = client.get("/api/v1/exports/employees")
    assert directory_csv.status_code == 200, directory_csv.text
    text = directory_csv.content.decode("utf-8")
    assert text.lstrip("\ufeff").splitlines()[0] == "工号,姓名,部门,职位,手机,邮箱,微信,Line,入职日期"
    assert "E0001" in text and "租赁部" in text
    assert employee_id is not None


def test_document_upload_and_soft_delete(api, engine, tmp_path, monkeypatch):
    """文档中心上传/删除：内容与扩展名双重校验，业主只能操作自己名下文档。"""
    owner_user, owner = _mk_owner(engine)
    other_user, other_owner = _mk_owner(engine)

    # 落到临时目录，避免污染真实 uploads/documents
    upload_dir = tmp_path / "documents"
    monkeypatch.setattr(documents_module, "UPLOAD_DIR", upload_dir)

    client = api.login(owner_user)
    payload = b"%PDF-1.4 fake pdf body"
    res = client.post(
        "/api/v1/documents/upload",
        data={"type": "contract", "title": "租赁合同"},
        files={"file": ("lease.pdf", payload, "application/pdf")},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["owner_id"] == str(owner.id)
    assert body["title"] == "租赁合同"
    assert body["type"] == "contract"
    assert body["file_size"] == len(payload)
    assert body["file_hash"] == hashlib.sha256(payload).hexdigest()
    assert body["file_url"].startswith("/uploads/documents/")
    # 文件名由服务端生成，不采用客户端文件名
    assert "lease.pdf" not in body["file_url"]
    assert (upload_dir / pathlib.Path(body["file_url"]).name).exists()

    # 未提供标题时用客户端文件名（去扩展名）兜底
    fallback = client.post(
        "/api/v1/documents/upload",
        data={"type": "other"},
        files={"file": ("物业费凭证.png", b"\x89PNG\r\n\x1a\n", "image/png")},
    )
    assert fallback.status_code == 200, fallback.text
    assert fallback.json()["title"] == "物业费凭证"

    # 改名伪装（扩展名是 pdf、内容是脚本）与非白名单扩展名都被拒
    disguised = client.post(
        "/api/v1/documents/upload",
        data={"type": "other"},
        files={"file": ("evil.pdf", b"<script>alert(1)</script>", "application/pdf")},
    )
    assert disguised.status_code == 400
    assert client.post(
        "/api/v1/documents/upload",
        data={"type": "other"},
        files={"file": ("note.txt", b"hello", "text/plain")},
    ).status_code == 400

    # 上传后出现在业主文档列表里
    listed = client.get("/api/v1/owners/me/documents").json()
    assert any(d["id"] == body["id"] for d in listed)

    # 他人文档：业主不能删
    with Session(engine) as s:
        foreign = Document(
            owner_id=other_owner.id,
            type=DocumentType.other,
            title="他人文档",
            file_url="/uploads/documents/foreign.pdf",
            uploaded_by=other_user.id,
        )
        s.add(foreign)
        s.commit()
        s.refresh(foreign)
        foreign_id = foreign.id
    assert client.delete(f"/api/v1/documents/{foreign_id}").status_code == 403

    # 删自己的文档：软删除后从列表消失，重复删除返回 404
    assert client.delete(f"/api/v1/documents/{body['id']}").status_code == 200
    assert all(
        d["id"] != body["id"]
        for d in client.get("/api/v1/owners/me/documents").json()
    )
    assert client.delete(f"/api/v1/documents/{body['id']}").status_code == 404

    # 租客不具备文档上传能力
    tenant_client = api.login(api.mk_user(UserRole.tenant))
    assert tenant_client.post(
        "/api/v1/documents/upload",
        data={"type": "other"},
        files={"file": ("a.pdf", payload, "application/pdf")},
    ).status_code == 403


def _mk_service_order(engine, orderer_id, property_id, status=None):
    """直接落一条服务订单，供评价/可见性用例使用。"""
    with Session(engine) as s:
        order = ServiceOrder(
            orderer_id=orderer_id,
            orderer_type="owner",
            property_id=property_id,
            service_type=ServiceType.cleaning,
            status=status or ServiceOrderStatus.pending,
            amount=1500.0,
            currency="THB",
        )
        s.add(order)
        s.commit()
        s.refresh(order)
        return order


def test_service_order_review_flow(api, engine):
    """服务订单评价闭环：仅已完成订单、仅下单人、仅可评价一次，且列表按角色收敛。"""
    owner_user, owner = _mk_owner(engine)
    other_user, other_owner = _mk_owner(engine)
    prop = _mk_property(engine, owner.id)
    other_prop = _mk_property(engine, other_owner.id)
    admin = api.mk_user(role=UserRole.admin)

    client = api.login(owner_user)
    created = client.post(
        "/api/v1/service-orders",
        json={
            "orderer_id": str(owner_user.id),
            "orderer_type": "owner",
            "property_id": str(prop.id),
            "service_type": "cleaning",
            "amount": 1500,
            "currency": "THB",
        },
    )
    assert created.status_code == 200, created.text
    order_id = created.json()["id"]

    # 未完成不可评价
    assert (
        client.post(
            f"/api/v1/service-orders/{order_id}/review", json={"rating": 5}
        ).status_code
        == 409
    )

    # 业主无权改状态（派单/完成属员工及以上角色）
    assert (
        client.patch(
            f"/api/v1/service-orders/{order_id}/status", json={"status": "completed"}
        ).status_code
        == 403
    )

    staff = api.login(admin)
    assert (
        staff.patch(
            f"/api/v1/service-orders/{order_id}/status", json={"status": "completed"}
        ).status_code
        == 200
    )
    # 员工可见全部订单
    all_orders = staff.get("/api/v1/service-orders").json()["items"]
    assert order_id in {o["id"] for o in all_orders}

    # 回到业主身份（fixture 的 login 会切换全局当前用户）
    client = api.login(owner_user)
    foreign = _mk_service_order(
        engine, other_user.id, other_prop.id, ServiceOrderStatus.completed
    )
    assert (
        client.post(
            f"/api/v1/service-orders/{foreign.id}/review", json={"rating": 4}
        ).status_code
        == 403
    )
    # 他人订单详情也不可见
    assert client.get(f"/api/v1/service-orders/{foreign.id}").status_code == 403

    # 本人评价成功，字段落库
    reviewed = client.post(
        f"/api/v1/service-orders/{order_id}/review",
        json={"rating": 5, "comment": "保洁很细致"},
    )
    assert reviewed.status_code == 200, reviewed.text
    body = reviewed.json()
    assert body["rating"] == 5
    assert body["review_comment"] == "保洁很细致"
    assert body["reviewed_at"]

    # 重复评价被拒
    assert (
        client.post(
            f"/api/v1/service-orders/{order_id}/review", json={"rating": 1}
        ).status_code
        == 409
    )
    # 星级越界由 pydantic 拦下
    assert (
        client.post(
            f"/api/v1/service-orders/{order_id}/review", json={"rating": 6}
        ).status_code
        == 422
    )

    # 列表按角色收敛：业主只看自己的订单
    mine = client.get("/api/v1/service-orders").json()["items"]
    assert {o["id"] for o in mine} == {order_id}


def test_property_map_points_and_project_geocode(api, engine):
    """地图找房：点位坐标一律取所属项目，未维护坐标的项目不外露；geocode 可回填坐标。

    覆盖两个易错点：
    1. `/map-points` 必须注册在 `GET /{property_id}` 之前，否则会被当成房源 id 解析成 422；
    2. 项目坐标缺失时不能返回 (None, None) 点位，否则前端地图会画到几内亚湾。
    """
    owner_user, owner = _mk_owner(engine)
    with Session(engine) as s:
        located = Project(
            name="Noble Ploenchit",
            address="Ploenchit Road",
            city="Bangkok",
            district="Pathum Wan",
            lat=13.7437,
            lng=100.5489,
        )
        unlocated = Project(
            name="Nocoord Tower", address="Rama 9 Road", city="Bangkok"
        )
        s.add(located)
        s.add(unlocated)
        s.commit()
        s.refresh(located)
        s.refresh(unlocated)
        located_id, unlocated_id = located.id, unlocated.id

    def _mk(room, project_id=None, video=None):
        with Session(engine) as s:
            prop = Property(
                owner_id=owner.id,
                room_number=room,
                address=f"{room} address",
                monthly_rent=15000.0,
                currency="THB",
                project_id=project_id,
                video_url=video,
            )
            s.add(prop)
            s.commit()
            s.refresh(prop)
            return prop.id

    plain = _mk("M-101", located_id)
    with_video = _mk("M-102", located_id, video="/uploads/properties/m102.mp4")
    unlocated_prop = _mk("U-201", unlocated_id)
    _mk("N-301")  # 不属于任何项目 → 不应出现在地图

    agent = api.mk_user(UserRole.agent)
    client = api.login(agent)
    base = "/api/v1/properties"

    res = client.get(f"{base}/map-points")
    assert res.status_code == 200, res.text
    points = res.json()
    assert {p["id"] for p in points} == {str(plain), str(with_video)}
    # 坐标取项目，且带项目名供前端卡片展示
    assert all(p["lat"] == 13.7437 and p["lng"] == 100.5489 for p in points)
    assert all(p["project_name"] == "Noble Ploenchit" for p in points)
    assert str(unlocated_prop) not in {p["id"] for p in points}

    # 与列表同源的筛选条件：关键词命中项目名 / 只看视频 / 城市
    by_keyword = client.get(f"{base}/map-points", params={"q": "ploenchit"}).json()
    assert {p["id"] for p in by_keyword} == {str(plain), str(with_video)}
    only_video = client.get(f"{base}/map-points", params={"has_video": True}).json()
    assert [p["id"] for p in only_video] == [str(with_video)]
    other_city = client.get(f"{base}/map-points", params={"city": "Chiang Mai"}).json()
    assert other_city == []

    # 无坐标项目：geocode 回填后即可出现在地图上
    geo = client.post(f"/api/v1/projects/{unlocated_id}/geocode")
    assert geo.status_code == 200, geo.text
    assert geo.json()["lat"] is not None and geo.json()["lng"] is not None
    after = client.get(f"{base}/map-points").json()
    assert str(unlocated_prop) in {p["id"] for p in after}

    # 业主无权 geocode（项目写入属员工及以上）
    client = api.login(owner_user)
    assert client.post(f"/api/v1/projects/{located_id}/geocode").status_code == 403


def test_late_fee_accrual_and_waiver(api, engine):
    """逾期滞纳金：宽限期内不计提、按日线性计提、封顶本金比例，减免可累计且不被重算覆盖。"""
    owner_user, owner = _mk_owner(engine)
    prop = _mk_property(engine, owner.id)
    now = datetime.now(timezone.utc)

    overdue = _mk_payment(
        engine, owner_user.id, 10000.0, property_id=prop.id,
        due_date=now - timedelta(days=10),
    )
    in_grace = _mk_payment(
        engine, owner_user.id, 10000.0, property_id=prop.id,
        due_date=now - timedelta(days=2),
    )
    capped = _mk_payment(
        engine, owner_user.id, 10000.0, property_id=prop.id,
        due_date=now - timedelta(days=400),
    )
    # 已支付 / 非租金类型都不计提
    paid = _mk_payment(
        engine, owner_user.id, 10000.0, property_id=prop.id,
        status=PaymentStatus.succeeded, due_date=now - timedelta(days=30),
    )
    deposit = _mk_payment(
        engine, owner_user.id, 10000.0, property_id=prop.id,
        payment_type=PaymentType.deposit, due_date=now - timedelta(days=30),
    )

    with Session(engine) as s:
        changed = accrue_late_fees(s, now=now)
        assert {str(p.id) for p in changed} == {str(overdue), str(capped)}

    def _fee(pid):
        with Session(engine) as s:
            return s.get(Payment, pid).late_fee_accrued

    # 日费率 0.05%：扣掉 3 天宽限期后按 7 天计提
    assert _fee(overdue) == round(10000 * 0.0005 * 7, 2)
    assert _fee(in_grace) == 0
    assert _fee(capped) == 1000  # 封顶为本金 10%
    assert _fee(paid) == 0
    assert _fee(deposit) == 0

    # 同一时刻重复执行幂等：无金额变化即不返回任何单
    with Session(engine) as s:
        assert accrue_late_fees(s, now=now) == []

    agent = api.mk_user(UserRole.agent)
    staff = api.login(agent)

    # 部分减免 + 剩余全额减免
    partial = staff.post(
        f"/api/v1/payments/{overdue}/late-fee/waive",
        json={"amount": 10, "reason": "老客户"},
    )
    assert partial.status_code == 200, partial.text
    assert partial.json()["late_fee_waived"] == 10
    rest = staff.post(f"/api/v1/payments/{overdue}/late-fee/waive", json={})
    assert rest.status_code == 200, rest.text
    assert rest.json()["late_fee_waived"] == 35
    # 已无剩余可减免
    assert (
        staff.post(f"/api/v1/payments/{overdue}/late-fee/waive", json={}).status_code
        == 400
    )
    # 超额减免被拒
    assert (
        staff.post(
            f"/api/v1/payments/{capped}/late-fee/waive", json={"amount": 99999}
        ).status_code
        == 400
    )
    # 减免属员工权限，业主不可操作
    owner_client = api.login(owner_user)
    assert (
        owner_client.post(f"/api/v1/payments/{capped}/late-fee/waive", json={}).status_code
        == 403
    )

    # 次日重算：毛额继续增长，但已减免部分不会被冲掉
    with Session(engine) as s:
        accrue_late_fees(s, now=now + timedelta(days=1))
    with Session(engine) as s:
        refreshed = s.get(Payment, overdue)
        assert refreshed.late_fee_accrued == round(10000 * 0.0005 * 8, 2)
        assert refreshed.late_fee_waived == 35
        assert refreshed.late_fee_due == round(40 - 35, 2)
        assert refreshed.total_due == round(10000 + 5, 2)


# ------------------------------------------------------------ 匹配推送 / 预警派发
def test_match_notify_and_churn_assign(api, engine):
    """智能匹配推送给租客、流失信号派发给员工：幂等去重 + 缺接收人/缺跟进人拦截 + 权限。"""
    owner_user, owner = _mk_owner(engine)
    prop = _mk_property(engine, owner.id, status=PropertyStatus.vacant)
    tenant_user = api.mk_user(UserRole.tenant)
    employee_user = api.mk_user(UserRole.employee)
    agent_user = api.mk_user(UserRole.agent)

    with Session(engine) as s:
        employee = Employee(user_id=employee_user.id, employee_code="E0002")
        s.add(employee)
        s.commit()
        s.refresh(employee)
        tenant = Tenant(user_id=tenant_user.id)
        s.add(tenant)
        s.commit()
        s.refresh(tenant)
        lease = Lease(
            property_id=prop.id,
            tenant_id=tenant.id,
            owner_id=owner.id,
            agent_id=employee.id,
            start_date=datetime.utcnow() - timedelta(days=100),
            end_date=datetime.utcnow() + timedelta(days=30),
            monthly_rent=12000,
            deposit_amount=24000,
            status=LeaseStatus.active,
        )
        s.add(lease)
        s.commit()
        s.refresh(lease)
        lead = Lead(
            name="Somchai",
            phone="0800000000",
            budget_min=10000,
            budget_max=15000,
        )
        s.add(lead)
        s.commit()
        s.refresh(lead)
        match = PropertyMatch(lead_id=lead.id, property_id=prop.id, score=80)
        s.add(match)
        s.commit()
        s.refresh(match)
        signal = ChurnSignal(
            signal_type="lease_expiring",
            level="warning",
            detail="租约 30 天内到期",
            suggested_action="安排续约回访",
            tenant_id=tenant.id,
            lease_id=lease.id,
        )
        orphan_signal = ChurnSignal(
            signal_type="low_engagement", level="info", detail="近 60 天无互动"
        )
        s.add(signal)
        s.add(orphan_signal)
        s.commit()
        s.refresh(signal)
        s.refresh(orphan_signal)
        lead_id, match_id = lead.id, match.id
        signal_id, orphan_id = signal.id, orphan_signal.id
        employee_id = employee.id

    staff = api.login(agent_user)

    # 匹配未关联接收人且请求未指定 → 400（不能悄悄推给空气）
    no_target = staff.post(f"/api/v1/market-data/matches/{match_id}/notify", json={})
    assert no_target.status_code == 400, no_target.text

    pushed = staff.post(
        f"/api/v1/market-data/matches/{match_id}/notify",
        json={"user_id": str(tenant_user.id)},
    )
    assert pushed.status_code == 200, pushed.text
    assert pushed.json()["notification_created"] is True
    assert pushed.json()["notified_at"]

    # 列表带上房源信息与推送状态，撮合页才能直接展示
    listed = staff.get("/api/v1/market-data/matches", params={"lead_id": str(lead_id)})
    assert listed.status_code == 200, listed.text
    row = listed.json()[0]
    assert row["room_number"] == prop.room_number
    assert row["monthly_rent"] == prop.monthly_rent
    assert row["notified_at"]

    # 重复推送幂等：不再新建通知，也不刷新推送时间
    again = staff.post(f"/api/v1/market-data/matches/{match_id}/notify", json={})
    assert again.status_code == 200, again.text
    assert again.json()["already_notified"] is True
    assert again.json()["notification_created"] is False
    assert again.json()["notified_at"] == pushed.json()["notified_at"]

    # 已推送后即使换了收件人也不再补发（首次推送时间即闸门）
    other_tenant = api.mk_user(UserRole.tenant)
    other_push = staff.post(
        f"/api/v1/market-data/matches/{match_id}/notify",
        json={"user_id": str(other_tenant.id)},
    )
    assert other_push.status_code == 200, other_push.text
    assert other_push.json()["notification_created"] is False
    assert other_push.json()["already_notified"] is True

    with Session(engine) as s:
        notifications = s.exec(
            select(Notification).where(
                Notification.template_key == "property_match_recommend"
            )
        ).all()
        assert len(notifications) == 1
        assert notifications[0].user_id == tenant_user.id
        assert notifications[0].related_entity_id == match_id

    # 派发：未指定跟进人时取租约上的负责员工
    assigned = staff.post(
        f"/api/v1/market-data/churn-signals/{signal_id}/assign",
        json={"note": "本周内联系"},
    )
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["assigned_to"] == str(employee_id)
    assert assigned.json()["notification_created"] is True

    signals = staff.get("/api/v1/market-data/churn-signals").json()["items"]
    signal_row = next(i for i in signals if i["id"] == str(signal_id))
    assert signal_row["assigned_to_name"] == employee_user.full_name
    assert signal_row["assigned_at"]

    with Session(engine) as s:
        follow_up = s.exec(
            select(Notification).where(
                Notification.template_key == "churn_signal_followup"
            )
        ).all()
        assert len(follow_up) == 1
        assert follow_up[0].user_id == employee_user.id

    # 无租约、无跟进人 → 400；显式指定员工后可派发
    assert (
        staff.post(
            f"/api/v1/market-data/churn-signals/{orphan_id}/assign", json={}
        ).status_code
        == 400
    )
    explicit = staff.post(
        f"/api/v1/market-data/churn-signals/{orphan_id}/assign",
        json={"assignee_id": str(employee_id)},
    )
    assert explicit.status_code == 200, explicit.text
    assert explicit.json()["reassigned"] is False

    # 重复派发给同一人：不重复提醒（同一收件人 + 同一模板 + 同一实体去重）
    same = staff.post(
        f"/api/v1/market-data/churn-signals/{orphan_id}/assign",
        json={"assignee_id": str(employee_id)},
    )
    assert same.status_code == 200, same.text
    assert same.json()["reassigned"] is True
    assert same.json()["notification_created"] is False

    # 改派另一名员工：跟进人更新且补发一条提醒
    employee2_user = api.mk_user(UserRole.employee)
    with Session(engine) as s:
        employee2 = Employee(user_id=employee2_user.id, employee_code="E0003")
        s.add(employee2)
        s.commit()
        s.refresh(employee2)
        employee2_id = employee2.id
    reassigned = staff.post(
        f"/api/v1/market-data/churn-signals/{orphan_id}/assign",
        json={"assignee_id": str(employee2_id)},
    )
    assert reassigned.status_code == 200, reassigned.text
    assert reassigned.json()["assigned_to"] == str(employee2_id)
    assert reassigned.json()["notification_created"] is True

    with Session(engine) as s:
        follow_ups = s.exec(
            select(Notification).where(
                Notification.template_key == "churn_signal_followup"
            )
        ).all()
        assert {n.user_id for n in follow_ups} == {
            employee_user.id,
            employee2_user.id,
        }

    # 已处理的信号不再派发
    assert (
        staff.post(f"/api/v1/market-data/churn-signals/{signal_id}/resolve").status_code
        == 200
    )
    assert (
        staff.post(
            f"/api/v1/market-data/churn-signals/{signal_id}/assign", json={}
        ).status_code
        == 400
    )

    # 推送/派发属员工动作，租客无权
    tenant_client = api.login(tenant_user)
    assert (
        tenant_client.post(
            f"/api/v1/market-data/matches/{match_id}/notify", json={}
        ).status_code
        == 403
    )
    assert (
        tenant_client.post(
            f"/api/v1/market-data/churn-signals/{orphan_id}/assign",
            json={"assignee_id": str(employee_id)},
        ).status_code
        == 403
    )