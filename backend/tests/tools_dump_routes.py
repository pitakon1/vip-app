"""临时工具：导出应用全部路由清单（方法+路径）。

运行方式（在 backend 目录）：
    python -m tests.tools_dump_routes
输出 JSON 到 backend/tests/.routes_manifest.json，供鉴权测试 / 契约校验共用。
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

routes = []
for r in app.routes:
    methods = getattr(r, "methods", None)
    path = getattr(r, "path", None)
    if not path:
        continue
    # 静态挂载与其下的自动路由不纳入接口契约
    if path.startswith("/uploads/") and r.__class__.__name__ == "Mount":
        continue
    key = (list(methods) if methods else ["*"]) or ["*"]
    routes.append({"methods": sorted(key), "path": path, "type": r.__class__.__name__})

out = pathlib.Path(__file__).resolve().parent / ".routes_manifest.json"
out.write_text(json.dumps(routes, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"dumped {len(routes)} routes -> {out}")
for r in routes:
    print(r["methods"], r["path"])