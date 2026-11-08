"""INT-10：Web 端匿名路由白名单的单一来源契约校验。

Web 端 `frontend-web/src/lib/publicRoutes.ts` 决定「收到 401 时是否把访客踢回
登录页」。这份清单此前靠手写，容易与实际路由表漂移：新增公开页漏配时只在
未登录态复现，删除页面后残留条目又会让本该跳登录的页面静默留在原地。

本测试只读源码文本，不启动前端、不共享组件，做三方向对账：
  1) 白名单 -> App.tsx 公开路由块：每条规则都必须有真实路由；
  2) App.tsx 公开路由块 -> 白名单：每个公开路由都必须被覆盖（防漏配）；
  3) 后端 `/api/v1/public/` 前缀确实由 public router 统一承载（防前后端前缀漂移）。
"""

from __future__ import annotations

import pathlib
import re

import pytest

BASE_DIR = pathlib.Path(__file__).resolve().parents[2]
APP_TSX = BASE_DIR / "frontend-web" / "src" / "App.tsx"
PUBLIC_ROUTES_TS = BASE_DIR / "frontend-web" / "src" / "lib" / "publicRoutes.ts"

PUBLIC_BLOCK_START = "===== 公共路由"
PUBLIC_BLOCK_END = "业主端旧路径别名"

RULE_RE = re.compile(r"\{\s*path:\s*'([^']+)'\s*,\s*match:\s*'(exact|prefix)'\s*\}")
ROUTE_RE = re.compile(r'<Route[^>]*?\spath="([^"]+)"')


def _read(path: pathlib.Path) -> str:
    assert path.is_file(), f"契约校验依赖的文件不存在：{path}"
    return path.read_text(encoding="utf-8")


def _frontend_rules() -> list[tuple[str, str]]:
    return [(m.group(1), m.group(2)) for m in RULE_RE.finditer(_read(PUBLIC_ROUTES_TS))]


def _declared_public_routes() -> list[str]:
    """截取 App.tsx 的「公共路由」区块，避免把受保护路由误算成公开路由。"""
    text = _read(APP_TSX)
    start = text.index(PUBLIC_BLOCK_START)
    end = text.index(PUBLIC_BLOCK_END, start)
    block = text[start:end]
    return [m.group(1) for m in ROUTE_RE.finditer(block)]


def _covered_by_rule(route: str, rule_path: str, match: str) -> bool:
    if match == "exact":
        return route == rule_path
    return route == rule_path or route.startswith(f"{rule_path}/")


def _matches_declared(rule_path: str, match: str, declared: list[str]) -> bool:
    if match == "exact":
        return rule_path in declared
    return any(_covered_by_rule(route, rule_path, "prefix") for route in declared)


def test_frontend_public_rules_exist_in_route_table() -> None:
    rules = _frontend_rules()
    declared = _declared_public_routes()
    assert rules, "publicRoutes.ts 未解析到任何公开路由规则"
    missing = [
        path for path, match in rules if not _matches_declared(path, match, declared)
    ]
    assert not missing, f"白名单存在 App.tsx 没有的公开路由（残留/拼写错误）：{missing}"


def test_every_declared_public_route_is_whitelisted() -> None:
    rules = _frontend_rules()
    declared = _declared_public_routes()
    assert declared, "App.tsx 未解析到公开路由区块"
    uncovered = [
        route
        for route in declared
        if not any(_covered_by_rule(route, path, match) for path, match in rules)
    ]
    assert not uncovered, (
        "App.tsx 存在未登记的公开路由，401 时会被误踢回登录页："
        f"{uncovered}；请在 publicRoutes.ts 补规则"
    )


def test_backend_public_prefix_is_single_source() -> None:
    """公开 API 前缀直接来自 public router，测试与前端不再各写一份字符串。"""
    pytest.importorskip("app.main")
    from app.api.v1 import api_router
    from app.api.v1.public import router as public_router
    from app.main import app

    assert public_router.prefix == "/public"
    assert api_router.prefix == "/api/v1"
    public_prefix = f"{api_router.prefix}{public_router.prefix}/"
    assert public_prefix == "/api/v1/public/"
    mounted = [
        path
        for path in app.openapi().get("paths", {})
        if path.startswith(public_prefix)
    ]
    assert mounted, f"FastAPI app 未挂载任何 {public_prefix}* 端点"
