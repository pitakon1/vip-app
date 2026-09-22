"""分页工具类"""
from typing import TypeVar, Generic, List
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from app.core.logging import get_logger

logger = get_logger(__name__)

T = TypeVar("T")

# 单页条数硬顶。无上限时客户端传 `page_size=100000` 就能让服务端一次拉全表，
# 既是内存风险也是慢查询入口，所以必须有闸。
MAX_PAGE_SIZE = 100

class Page(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int

class PaginationParams:
    """分页参数，`page_size` 硬顶 `MAX_PAGE_SIZE`。

    截断本身**必须留痕**：调用方（尤其前端那些把分页接口当「取全量」用的地方）
    传了超限值却只拿回 100 条时不会报错，表现为「下拉少选项 / 总数偏小 / 筛选不全」
    这类静默错误，是排查成本最高的一类问题。这里记 warning 让问题自己浮出来，
    而不是安静地把请求改小。
    """

    def __init__(self, page: int = 1, page_size: int = 20):
        self.page = max(1, page)
        self.page_size = min(MAX_PAGE_SIZE, max(1, page_size))
        if page_size > MAX_PAGE_SIZE or page_size < 1:
            logger.warning(
                "pagination.page_size_clamped",
                requested=page_size,
                clamped_to=self.page_size,
                hint=(
                    "调用方要求的分页大小超出 [1, 100] 区间，已强制收敛。"
                    "若本意是取全量，请改用真·分页或按条件缩小范围。"
                ),
            )

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size

def paginate(items: list, total: int, params: PaginationParams) -> Page:
    return Page(
        items=items,
        total=total,
        page=params.page,
        page_size=params.page_size,
        total_pages=(total + params.page_size - 1) // params.page_size,
    )

def paginate_query(
    session: Session,
    stmt,
    params: PaginationParams,
    count_stmt=None,
) -> Page:
    """执行「计数 + 取页」两段查询并组装 Page。

    各列表路由此前把这段写了一遍又一遍（count_stmt / total / offset / limit），
    `stmt` 已带好 where 与 order_by 时直接交给这里即可。

    默认计数走子查询（`select(func.count()).select_from(stmt)`），这样带 join 或
    去重的查询也能算对；若已有更省的计数语句（例如按主键计数的 join 查询），
    用 `count_stmt` 传入。
    """
    if count_stmt is None:
        # 计数与顺序无关，去掉 order_by 省一次排序
        count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = session.exec(count_stmt).one()
    items = session.exec(stmt.offset(params.offset).limit(params.limit)).all()
    return paginate(items, total, params)
