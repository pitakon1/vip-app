"""四端前端 ↔ 后端 接口契约校验（测试脚本核心：前端「每一个接口」）。

做法：从三端 services/api.ts 里抽取全部 `(HTTP 方法, 路径)` 调用点，
与后端路由清单（tests/.routes_manifest.json）逐一比对：
- 前端调用了一条后端不存在的路径  -> 契约缺失（调用必 404）    => BUG
- 前端调用路径存在但 HTTP 方法不符 -> 契约不一致（调用必 405）  => BUG

运行（backend 目录）：python -m tests.tools_contract_check [--fix]
"""
# ruff: noqa: E402
import json
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parents[2]
MANIFEST_PATH = pathlib.Path(__file__).resolve().parent / ".routes_manifest.json"

FRONTENDS = [
    ("frontend-web", REPO / "frontend-web" / "src" / "services" / "api.ts"),
    ("mobile-app", REPO / "mobile-app" / "src" / "services" / "api.ts"),
    ("miniapp", REPO / "miniapp" / "src" / "services" / "api.ts"),
]

# 抽取 (method, path) 调用点
# Pattern: 捕获 api.get/post/patch/put/delete('/path' ...) 或 url: '/path', method: 'X'
RE_WEB = re.compile(
    r"api\.(get|post|patch|put|delete)\(\s*(?:`[^`]*?`|'[^']*'|\"[^\"]*\")(?=[,);])"
)
RE_URL = re.compile(r"url:\s*(`[^`]*?`|'[^']*'|\"[^\"]*\"),\s*method:\s*'(\w+)'")


def _strip_payload(lit: str) -> str:
    """'...' 或 `...` 或 "..." 去引号，模板 `${x}` -> {param}。

    qs(...) 段（把查询串拼到 url）不参与路由匹配，第一个 `${qs` 起截断；
    该段内可能含 `${qs({ a }) }` 这类嵌套大括号，故不能单靠正则剥离。
    """
    s = lit[1:-1]
    if "${qs" in s:
        s = s[: s.index("${qs")]
    s = re.sub(r"\$\{[^}]*\}", "{p}", s)
    s = s.split("?")[0]
    s = re.sub(r"\)+$", "", s)
    return s.rstrip("/") or "/"


def normalize_path(path: str) -> str:
    """后端模板路径与前端实际路径统一成正则可匹配的形态。"""
    return re.sub(r"\{[^}]*\}", "{p}", path)


def load_manifest() -> dict:
    data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    # 后端路由：(router方法集合, 模板路径)
    routes: dict[str, set] = {}  # path -> {methods}
    for r in data:
        if r["type"] != "APIRoute":
            continue
        routes.setdefault(normalize_path(r["path"]), set()).update(r["methods"])
    return routes


def extract(path_: pathlib.Path) -> list[tuple[str, str, int]]:
    """返回 [(method, normalized_path, line)]. method 未知则为 None。"""
    text = path_.read_text(encoding="utf-8")
    out: list[tuple[str, str, int]] = []
    for line_no, line in enumerate(text.splitlines(), 1):
        line_s = line.strip()
        for m in RE_WEB.finditer(line):
            method = m.group(1)
            lit = m.group(0).split("(", 1)[1].strip()
            path = _strip_payload(lit)
            if path.startswith("/"):
                out.append((method, normalize_path(f"/api/v1{path}"), line_no))
        for m in RE_URL.finditer(line):
            lit, method = m.group(1), m.group(2)
            path = _strip_payload(lit)
            if path.startswith("/"):
                out.append((method.lower(), normalize_path(f"/api/v1{path}"), line_no))
    return out


def main() -> int:
    routes = load_manifest()
    problems: list[str] = []
    report: list[str] = []
    for name, fpath in FRONTENDS:
        if not fpath.exists():
            report.append(f"[{name}] api.ts 不存在: {fpath}")
            continue
        seen = set()
        for method, path, line in extract(fpath):
            key = (method, path)
            if key in seen:
                continue
            seen.add(key)
            methods = routes.get(path)
            if methods is None:
                problems.append(f"{name}:{line} 路径不存在 {method.upper()} {path} ({fpath.name})")
            elif method and method.upper() not in methods:
                problems.append(
                    f"{name}:{line} 方法不符 {method.upper()} {path}（后端仅 {sorted(methods)}）"
                )
    if problems:
        print("== 发现契约问题 ==")
        for p in problems:
            print("  " + p)
        return 1
    print("契约全部通过：四端 api 调用点均能命中后端路由（路径+方法）。")
    return 0


sys.exit(main())