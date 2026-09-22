"""四端前端 ↔ 后端 接口契约校验（测试脚本核心：前端「每一个接口」）。

做法：从三端 services/api.ts 里抽取全部 `(HTTP 方法, 路径)` 调用点，
与后端路由清单（tests/.routes_manifest.json）逐一比对：
- 前端调用了一条后端不存在的路径  -> 契约缺失（调用必 404）    => BUG
- 前端调用路径存在但 HTTP 方法不符 -> 契约不一致（调用必 405）  => BUG

运行（backend 目录）：
    python -m tests.tools_contract_check            正向校验，有问题退出码 1
    python -m tests.tools_contract_check --orphans  额外做反向孤儿检查（只报告，不影响退出码）

反向孤儿检查（--orphans）回答的是另一个方向的问题：
「后端有这条路由，但三端前端一处都没调用」——所谓孤儿接口。
与正向不同，这里**扫全 src**（*.ts/*.tsx）而不是只扫 api.ts：
页面里存在 `api.get('/dashboard/summary')` 这类直连调用，只看 api.ts 会把它们误判成孤儿。
已知「刻意无调用方」的内部端点写进 INTENTIONAL_ORPHANS 并附理由，避免每次重复报警。
注意：`api.get(path, ...)` 这类**动态变量路径**静态扫描不到，报告末尾会提示，
不要把它的调用者当成孤儿删掉。
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

# 反向检查的扫描根（全量源码，覆盖页面内直连调用）
FRONTEND_SRC = [
    ("frontend-web", REPO / "frontend-web" / "src"),
    ("mobile-app", REPO / "mobile-app" / "src"),
    ("miniapp", REPO / "miniapp" / "src"),
]

# 平台/基础设施路由：本就不由业务前端调用
INFRA_PATHS = {"/", "/health", "/health/ready", "/metrics", "/docs", "/redoc", "/openapi.json"}

# 已知「刻意无前端调用方」的内部端点：值=保留理由（写清楚，否则后人会当残留删掉）
# 只放「设计上就不该由 UI 调用」的；「接口就绪但页面还没做」的一律留在确认孤儿里，
# 不要往这里塞——那会把真实待办藏起来。代码里对应的 docstring 已加标注（可 grep「三端暂无调用方」）。
INTENTIONAL_ORPHANS = {
    "/api/v1/notifications/dispatch": "admin/Celery 内部广播入口，无 UI 调用方（见 notifications.py 注释）",
    "/api/v1/properties/map-points": "站内地图点位：已被匿名 /api/v1/public/map-points 取代，保留给鉴权后台场景",
    "/api/v1/payments/webhook/{p}": "支付网关服务端回调（公开接口），不属于 UI 调用",
}

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


# ---------- 反向检查：孤儿接口 ----------
# 扫「路径形状的字符串」而不是「api.xxx('...') 调用位」，因为前端有四种写法：
#   1. api.get('/dashboard/summary')                    调用位
#   2. axios.post('/api/v1/auth/refresh')               axios 直连（api. 前缀正则抓不到）
#   3. downloadReport('/exports/attendance', ...)       当参数传给 helper
#   4. `/documents/${id}/${cond ? 'download' : 'file'}` 动态拼接（末段无法静态判定）
# 只扫调用位会把 2/3/4 全部误报成孤儿，所以这里改为全源码字面量扫描。
_SEG = r"(?:[A-Za-z0-9\-_.]+|\$\{[^}]*\})"  # 一段：静态词 或 ${表达式}
RE_PATH_LITERAL = re.compile(rf"(?<![\w$:<>])/{_SEG}(?:/{_SEG})*")
RE_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
RE_LINE_COMMENT = re.compile(r"(?<!:)//[^\n]*")


def _strip_comments(text: str) -> str:
    """去掉注释再扫，避免「注释里提过一句」被当成调用方。"""
    return RE_LINE_COMMENT.sub(" ", RE_BLOCK_COMMENT.sub(" ", text))


def _to_api_path(lit: str) -> str:
    """把前端字面量统一成后端路由形态（带 /api/v1 前缀）。"""
    # `${x}` -> {p}：normalize_path 只认 {x}，会留下 $ 前缀，必须先处理模板表达式
    lit = normalize_path(re.sub(r"\$\{[^}]*\}", "{p}", lit.rstrip("/")))
    if lit.startswith("/api/"):
        return lit
    return normalize_path("/api/v1" + lit)


def _static_prefix(api_path: str) -> str:
    """路径里第一个 {p} 之前的静态段：动态拼接的证据只看这段。"""
    return api_path.split("{p}")[0].rstrip("/")


def collect_references(root: pathlib.Path) -> tuple[set[str], set[str]]:
    """扫前端全量源码，返回 (路径字面量集合, 静态前缀集合)。"""
    exact: set[str] = set()
    prefixes: set[str] = set()
    if not root.exists():
        return exact, prefixes
    for f in sorted(root.rglob("*")):
        if f.suffix not in (".ts", ".tsx") or not f.is_file():
            continue
        try:
            text = _strip_comments(f.read_text(encoding="utf-8"))
        except OSError:
            continue
        for m in RE_PATH_LITERAL.finditer(text):
            raw = m.group(0)
            if len(raw) < 4:
                continue
            api = _to_api_path(raw)
            exact.add(api)
            prefixes.add(_static_prefix(api))
    return exact, prefixes


def report_orphans() -> None:
    """反向检查：后端有路由、三端前端无调用点。只报告，不参与退出码。"""
    routes = load_manifest()
    exact: set[str] = set()
    prefixes: set[str] = set()
    for _name, src in FRONTEND_SRC:
        e, p = collect_references(src)
        exact |= e
        prefixes |= p

    confirmed: list[tuple[str, list[str]]] = []
    suspected: list[tuple[str, list[str], str]] = []
    intentional: list[tuple[str, list[str], str]] = []

    for path in sorted(routes):
        if path in INFRA_PATHS:
            continue
        methods = sorted(routes[path])
        if path in INTENTIONAL_ORPHANS:
            intentional.append((path, methods, INTENTIONAL_ORPHANS[path]))
        elif path in exact:
            continue
        else:
            sp = _static_prefix(path)
            # 只有「带参数 + 静态前缀里有别的字面量引用」才算疑似动态拼接，
            # 无参路由必须精确命中，否则就是真孤儿。
            if "{p}" in path and len(sp) > len("/api/v1") and sp in prefixes:
                suspected.append((path, methods, sp))
            else:
                confirmed.append((path, methods))

    # 反向检查只报告，不参与退出码
    print(f"== 反向孤儿检查（后端路由 {len(routes)} 条，前端字面量 {len(exact)} 个）==")
    print(f"\n-- 确认孤儿：后端有、三端源码无任何引用（{len(confirmed)}）--")
    for path, methods in confirmed:
        print(f"  {'/'.join(methods):<16} {path}")
    print(f"\n-- 疑似（动态拼接，末段静态判定不了）：需人工确认（{len(suspected)}）--")
    for path, methods, sp in suspected:
        print(f"  {'/'.join(methods):<16} {path}\n{'':>20}同前缀字面量：{sp}")
    print(f"\n-- 已知刻意无调用方（{len(intentional)}，不算问题）--")
    for path, methods, why in intentional:
        print(f"  {'/'.join(methods):<16} {path}\n{'':>20}理由：{why}")
    print(
        "\n注意：`api.get(path, ...)` 这类把路径存进变量的写法静态扫不到，"
        "确认孤儿前先 grep 一遍。新增刻意保留的端点请登记到 INTENTIONAL_ORPHANS。"
    )


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
    if "--orphans" in sys.argv:
        report_orphans()
        print()
    if problems:
        print("== 发现契约问题 ==")
        for p in problems:
            print("  " + p)
        return 1
    print("契约全部通过：四端 api 调用点均能命中后端路由（路径+方法）。")
    return 0


sys.exit(main())