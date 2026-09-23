"""接口全量×角色鉴权矩阵测试（测试脚本核心：后端「每一个接口」）。

思路：对后端全部路由做行为级穷举——
1. 匿名请求：受保护接口一律 401（不允许"静默放行"或裸奔公开）。
2. 管理员：所有接口均不被 401/403 拒绝（管理员是全端通用角色）。
3. 任何角色命中任何接口都不允许 500（接口崩溃 = BUG，直接暴露）。
4. 角色×接口：通过反射路由依赖树提取 `require_role` 声明的角色集合，
   与行为结果逐条比对（声明放行 vs 实际放行必须一致），发现鉴权缺口或过度收紧。

边界说明：
- 依赖树反射只能看到 `Depends(require_role(...))`；函数体内手动 `if user.role not in ...`
  的接口不参与比对，避免误报——判定方式见 `_has_manual_role_gate()`（逐端点源码探测）。
- 细粒度权限点（require_permission）与手工角色判断的接口只做 1/2/3 项断言。
- websocket 路由 /uploads 静态挂载不参与 HTTP 矩阵。
- 公开面 = `PUBLIC_ROUTES` 显式清单 + `PUBLIC_PATH_PREFIXES` 前缀（C 端公开 API 层）。
  登录类端点若"参数校验先于鉴权"会返回 422 而非 401，属正常，必须登记。
- 503 不算崩溃：它是服务端主动声明依赖未就绪（未配置的 provider），与 500 未捕获异常区分。
"""
# ruff: noqa: E402
import inspect
import logging
import pathlib
import re
import sys
import uuid
from types import SimpleNamespace

logging.getLogger("httpx").setLevel(logging.WARNING)

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

BASE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.core import auth as auth_module  # noqa: E402
from app.core.rbac import seed_permissions  # noqa: E402
from app.db import get_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models import *  # noqa: E402,F401,F403  # 导入全部模型以注册 metadata（create_all 依赖）
from app.models import User, UserRole  # noqa: E402,F401
from app.services import backup_service  # noqa: E402

ROLES = [UserRole.tenant, UserRole.owner, UserRole.employee, UserRole.agent, UserRole.admin]

# 真正公开（无需登录）的接口
# 注意：登录类端点在**参数校验先于鉴权**时会返回 422 而非 401，这是正常的，
# 必须登记进来，否则匿名断言会把它们误判成"裸奔公开"。
PUBLIC_ROUTES = {
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/register"),
    ("POST", "/api/v1/auth/refresh"),
    ("POST", "/api/v1/auth/otp/request"),
    ("POST", "/api/v1/auth/login/otp"),
    ("POST", "/api/v1/auth/wx/login"),
    ("GET", "/api/v1/auth/oauth/status"),
    ("POST", "/api/v1/auth/oauth/google"),
    ("POST", "/api/v1/auth/oauth/apple"),
    ("POST", "/api/v1/payments/webhook/{channel}"),
    ("GET", "/"),
    ("GET", "/health"),
    ("GET", "/health/ready"),
    # 公司信息：设计上就是公开接口（公司名称/地址/电话/社媒），供落地页/对外展示
    ("GET", "/api/v1/company/info"),
}

# 依赖树反射无法看到"函数体内手动角色判断"的接口文件
# ⚠️ 这是一份**兜底白名单**，不是主判据：曾经因为漏登记 app.api.v1.listings /
# app.api.v1.dedupe_reviews（两者都是 `Depends(get_current_user)` + 函数体内
# `if user.role not in STAFF_ROLES: 403`），导致矩阵把 tenant/owner 的 403 当成
# "应放行却被拒"，测试长期假红。现改为逐端点源码探测 _has_manual_role_gate()，
# 本名单只保留历史条目以防正则覆盖不到的写法。
MANUAL_GATE_FILES = {
    "app.api.v1.documents",
    "app.api.v1.brokers",
    "app.api.v1.exports",
    "app.api.v1.maintenance",
    "app.api.v1.leases",
    "app.api.v1.market_data",
    "app.api.v1.markets",
    "app.api.v1.payments",
    "app.api.v1.sale_listings",
    "app.api.v1.service_orders",
    "app.api.v1.commission_rules",
}
# 已移出名单：`app.api.v1.property_deals` —— 其员工门控已改为声明式
# `Depends(require_employee)`，依赖树反射能直接看到，不再需要文件级豁免。

# 函数体内手动角色判断的形态：`if user.role not in STAFF_ROLES` / `user.role != ...`
_MANUAL_GATE_RE = re.compile(r"\.role\s+not\s+in|\.role\s*!=")


def _has_manual_role_gate(route) -> bool:
    """逐端点探测：该 handler 源码里是否含"手动角色判断"。

    比文件级白名单精确：同一个文件里，用 require_role 的端点仍参与矩阵比对，
    只有真正手动门控的端点被跳过，覆盖不丢。
    """
    endpoint = getattr(route, "endpoint", None)
    if endpoint is None:
        return False
    try:
        source = inspect.getsource(endpoint)
    except (OSError, TypeError):
        return False
    return bool(_MANUAL_GATE_RE.search(source))


# 设计上匿名可访问的路径前缀（C 端公开 API 层：浏览/搜索/留资/学校/小区/开发商等）
PUBLIC_PATH_PREFIXES = ("/api/v1/public/",)


def _is_public(method: str, path: str) -> bool:
    """是否属于"公开接口"（不参与匿名 401 断言、不参与角色矩阵比对）。"""
    if (method, path) in PUBLIC_ROUTES:
        return True
    return path.startswith(PUBLIC_PATH_PREFIXES)


def _route_entries():
    """遍历 app.routes，产出 (methods, path, route) 元组。"""
    for r in app.routes:
        path = getattr(r, "path", None)
        methods = getattr(r, "methods", None)
        if not path or not methods:
            continue
        if path.startswith("/uploads/") or "/ws/" in path:
            continue
        yield sorted(methods), path, r


def _collect_gates(dep, roles: set, perm_gated: list) -> None:
    """递归收集依赖树中的角色 / 权限点依赖。"""
    call = getattr(dep, "call", None)
    if call is not None:
        closure = getattr(call, "__closure__", None) or ()
        for cell in closure:
            try:
                v = cell.cell_contents
            except ValueError:
                continue
            if isinstance(v, tuple) and v:
                if all(isinstance(x, UserRole) for x in v):
                    roles.update(v)
                elif all(isinstance(x, str) for x in v):
                    perm_gated.append(v)
    for sub in getattr(dep, "dependencies", None) or []:
        _collect_gates(sub, roles, perm_gated)


def _expected_roles(route):
    """返回 (roles 集合, 是否权限点门控)。反射依赖树。"""
    dep = getattr(route, "dependant", None)
    roles: set = set()
    perm_gated: list = []
    if dep is not None:
        _collect_gates(dep, roles, perm_gated)
    return roles, bool(perm_gated)


def _substitute(path: str) -> str:
    """把路径参数替换成合法占位值。"""
    out = []
    for seg in path.split("/"):
        if seg.startswith("{") and seg.endswith("}"):
            name = seg[1:-1]
            if name == "role":
                seg = "admin"
            elif name == "channel":
                seg = "test"
            else:
                seg = str(uuid.uuid4())
        out.append(seg)
    return "/".join(out)


# 手动备份动作在测试环境不能真的落盘：用桩替换
class _FakeBackupJob:
    def __init__(self):
        self.id = uuid.uuid4()
        self.status = SimpleNamespace(value="succeeded")
        self.file_path = "/tmp/fake-backup.sqlite3"
        self.size_bytes = 0
        self.error = None
        self.started_at = None
        self.finished_at = None


@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
    SQLModel.metadata.create_all(eng)
    with Session(eng) as s:
        seed_permissions(s)
    return eng


@pytest.fixture()
def api(engine, monkeypatch):
    monkeypatch.setattr(backup_service, "run_backup", lambda *a, **k: _FakeBackupJob())

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
        app.dependency_overrides[auth_module.get_current_user_allow_query_token] = (
            lambda: bound_user
        )
        return TestClient(app)

    factory = SimpleNamespace(mk_user=_mk_user, login=_login, engine=engine)
    try:
        yield factory
    finally:
        for s in created_sessions:
            s.close()
        app.dependency_overrides.clear()


# ------------------------------------------------------------ 1. 匿名访问
def test_anonymous_requests_are_rejected(api, engine):
    """除公开路由外，匿名访问全部接口必须 401（不能静默放行）。

    会话绑定到测试库（schema 完整）：任何"漏过鉴权"的接口会正常执行并返回非 401，
    从而被精确暴露，而不是撞上"表不存在"这类环境噪音。
    """
    app.dependency_overrides.clear()
    app.dependency_overrides[get_session] = lambda: Session(engine)
    try:
        client = TestClient(app)
        fails = []
        for methods, path, route in _route_entries():
            url = _substitute(path)
            for method in methods:
                if method == "*":
                    continue
                if _is_public(method, path):
                    continue
                r = client.request(method, url)
                if r.status_code != 401:
                    fails.append((method, path, r.status_code))
        assert not fails, f"匿名可访问（应为 401）：{fails[:20]}"
    finally:
        app.dependency_overrides.clear()


def test_public_routes_do_not_require_auth(api, engine):
    """公开路由（登录/注册/刷新/健康探针）匿名可响应，且 webhook 不 500。"""
    app.dependency_overrides.clear()
    app.dependency_overrides[get_session] = lambda: Session(engine)
    try:
        client = TestClient(app)
        for method, path in PUBLIC_ROUTES:
            url = _substitute(path)
            r = client.request(method, url)
            # 503 = 依赖未配置的主动降级（如 otp 发送通道未配），公开但不等于可用
            assert r.status_code in (200, 400, 401, 422, 503), (method, path, r.status_code)
            assert r.status_code != 500, (method, path, "公开接口 500")
        # webhook 无签名调用：不能 404/500（要么 400 要么 401）
        hook = client.post("/api/v1/payments/webhook/test")
        assert hook.status_code in (400, 401, 422), hook.status_code
    finally:
        app.dependency_overrides.clear()


# ------------------------------------------------------------ 2. 管理员全通
def test_admin_can_access_every_route(api, engine):
    """管理员访问全部接口：不应被 401/403 拒绝（可能 4xx 资源不存在/参数校验）。"""
    admin = api.mk_user(UserRole.admin)
    client = api.login(admin)
    fails = []
    for methods, path, route in _route_entries():
        url = _substitute(path)
        for method in methods:
            if method == "*":
                continue
            body = {} if method in ("POST", "PATCH", "PUT") else None
            r = client.request(method, url, json=body)
            if r.status_code in (401, 403):
                fails.append((method, path, r.status_code, r.text[:80]))
    assert not fails, f"管理员被拒绝：{fails[:20]}"


# ------------------------------------------------------------ 3. 任何角色任何接口不允许 500
def test_no_500_errors_for_any_role(api, engine):
    """所有角色命中所有接口：不允许出现 500（接口崩溃）。

    503 不算崩溃：它是服务端**主动声明依赖未就绪**（如 OAuth provider 未配置、
    外部服务不可达），属于预期的优雅降级；而 500 代表未捕获异常。二者必须区分，
    否则"依赖没配"会一直压在 500 断言上，真正的崩溃反而被淹没。
    """
    crashes = []
    users = {r: api.mk_user(r) for r in ROLES}
    for role, user in users.items():
        client = api.login(user)
        for methods, path, route in _route_entries():
            url = _substitute(path)
            for method in methods:
                if method == "*":
                    continue
                body = {} if method in ("POST", "PATCH", "PUT") else None
                r = client.request(method, url, json=body)
                if r.status_code >= 500 and r.status_code != 503:
                    crashes.append((role.value, method, path, r.status_code, r.text[:120]))
    assert not crashes, f"发现接口 500：{crashes[:20]}"


# ------------------------------------------------------------ 4. 角色×接口放行矩阵
def test_role_access_matrix_matches_declared_roles(api, engine):
    """反射 require_role 声明的角色集合，与实际响应逐条比对。"""
    users = {r: api.mk_user(r) for r in ROLES}
    mismatches = []
    skipped = 0
    for methods, path, route in _route_entries():
        module = getattr(route.endpoint, "__module__", "")
        declared_roles, perm_gated = _expected_roles(route)
        if (
            module in MANUAL_GATE_FILES
            or _has_manual_role_gate(route)
            or perm_gated
            or (not declared_roles and _is_public("GET", path))
            or (not declared_roles and _is_public("POST", path))
        ):
            # 手动门控 / 权限点门控 / 公开路由：不参与自动比对
            skipped += 1
            continue
        for role, user in users.items():
            client = api.login(user)
            url = _substitute(path)
            for method in methods:
                if method == "*":
                    continue
                body = {} if method in ("POST", "PATCH", "PUT") else None
                r = client.request(method, url, json=body)
                denied = r.status_code in (401, 403)
                if declared_roles:
                    should_allow = role in declared_roles
                else:
                    should_allow = True  # 未声明角色 → 任何登录用户可访问
                if denied and should_allow:
                    mismatches.append((method, path, role.value, r.status_code, "应放行却被拒"))
                elif (not denied) and (not should_allow):
                    mismatches.append((method, path, role.value, r.status_code, "应拒绝却放行"))
    assert not mismatches, f"鉴权矩阵不一致：{mismatches[:20]}（跳过手工门控 {skipped} 条）"
