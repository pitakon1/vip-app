"""分页工具类"""
from typing import TypeVar, Generic, List
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

T = TypeVar("T")

class Page(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int

class PaginationParams:
    def __init__(self, page: int = 1, page_size: int = 20):
        self.page = max(1, page)
        self.page_size = min(100, max(1, page_size))
    
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
