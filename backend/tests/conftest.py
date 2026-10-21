"""测试夹具：共享内存 SQLite 引擎与会话。

使用独立的内存引擎 + SQLModel.metadata.create_all 构建隔离测试库，
不触碰全局 app.db 引擎或 .env 中的 DATABASE_URL，测试互不干扰。
"""
# ruff: noqa: E402, F401   # 模型 import 需晚于 sys.path 设置，且副作用注册表
import os
import sys
import pathlib

# 必须早于任何 app.* 导入：把全局引擎指向 SQLite，避免依赖 psycopg2/生产库
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("DEBUG", "false")
# 测试环境不依赖 Redis：限流计数器用进程内存，并把默认配额调大避免用例之间互相干扰
os.environ.setdefault("RATE_LIMIT_STORAGE_URI", "memory://")
os.environ.setdefault("RATE_LIMIT_DEFAULT", "10000/minute")
os.environ.setdefault("RATE_LIMIT_AUTH", "10000/minute")

# 确保 backend 目录在 sys.path，使 `from app...` 可导入
BACKEND_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest  # noqa: E402
from sqlmodel import SQLModel, Session, create_engine  # noqa: E402

# 测试客户端统一解包「统一返回信封」：
# 后端 EnvelopeMiddleware 会把成功 JSON 包成 {code,msg,data} 并打 X-Api-Envelope，
# 三端在 HTTP 中心层解包；测试里同样在客户端还原业务响应体，
# 这样既有断言仍按原响应结构读取，无需逐个用例改写。
import json as _json  # noqa: E402
import fastapi.testclient as _ftc  # noqa: E402


class _UnwrappedTestClient(_ftc.TestClient):
    def request(self, *args, **kwargs):
        response = super().request(*args, **kwargs)
        if response.headers.get("x-api-envelope") == "1":
            try:
                body = response.json()
            except ValueError:
                return response
            if isinstance(body, dict) and "data" in body:
                response._content = _json.dumps(body["data"], ensure_ascii=False).encode("utf-8")
        return response


_ftc.TestClient = _UnwrappedTestClient

# 导入全部模型，注册到 SQLModel.metadata（create_all 依赖）
# noqa: E402,F401
from app.models.employee import Employee
from app.models.lease import Lease
from app.models.notification import Notification
from app.models.payment import Payment
from app.models.payment_webhook_event import PaymentWebhookEvent
from app.models.user import User


@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, echo=False
    )
    SQLModel.metadata.create_all(eng)
    # 启动 lifespan 才会 seed 角色默认权限；直接构造函数式 TestClient 不跑 lifespan，
    # 这里补种一次，避免 admin 因权限表为空被 require_permission 误判 403。
    from app.core.rbac import seed_permissions

    with Session(eng) as s:
        seed_permissions(s)
    return eng


@pytest.fixture()
def session(engine):
    with Session(engine) as s:
        yield s
        s.rollback()