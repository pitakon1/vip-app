"""临时工具：导出应用全部路由清单（方法+路径）。

运行方式（在 backend 目录）：
    python -m tests.tools_dump_routes
输出 JSON 到 backend/tests/.routes_manifest.json，供鉴权测试 / 契约校验共用。

注意：新版 FastAPI（约 0.120 起）里 `app.include_router()` 不再把子路由拍平进
`app.routes`，而是放一个惰性包装对象，真正的路由挂在它内部的 router 上。
旧实现直接遍历 `app.routes`，在新版下只会导出 `/`、`/health` 等 4 条自带路由，
**且不报任何错**——等于悄悄产出残缺清单，让契约校验把所有调用点都判成「路径不存在」。
这里改为递归下钻并把每层 include 的 prefix 拼回路径，新旧版 FastAPI 都能导全。
"""
# ruff: noqa: E402
import json
import os
import pathlib
import sys

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("DEBUG", "false")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402


def walk(routes, prefix: str = ""):
    """递归展开路由；惰性 include 包装会带出内部 router 与其 prefix。"""
    for r in routes:
        inner = getattr(r, "original_router", None)
        if inner is not None:
            ctx = getattr(r, "include_context", None)
            yield from walk(inner.routes, prefix + (getattr(ctx, "prefix", "") or ""))
            continue
        path = getattr(r, "path", None)
        if not path:
            continue
        # 静态挂载与其下的自动路由不纳入接口契约
        if path.startswith("/uploads/") and r.__class__.__name__ == "Mount":
            continue
        methods = getattr(r, "methods", None)
        yield {
            "methods": sorted(list(methods) if methods else ["*"]) or ["*"],
            "path": prefix + path,
            "type": r.__class__.__name__,
        }


routes = list(walk(app.routes))

out = pathlib.Path(__file__).resolve().parent / ".routes_manifest.json"
out.write_text(json.dumps(routes, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"dumped {len(routes)} routes -> {out}")
for r in routes:
    print(r["methods"], r["path"])