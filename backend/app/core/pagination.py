"""分页工具类"""
from typing import TypeVar, Generic, List
from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

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
    """分页参数，`page` 与 `page_size` 越界时**显式 422**（不再静默纠正）。

    静默纠错会让调用方以为请求生效，实际拿到的是被改小的结果，表现为
    「总数偏小 / 翻不到后面的数据」这类无报错的错数据；宁可让调用方看到 422。
    """

    def __init__(self, page: int = 1, page_size: int = 20):
        if page < 1 or page_size < 1 or page_size > MAX_PAGE_SIZE:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"分页参数越界：page 需 >= 1，page_size 需在 "
                    f"[1, {MAX_PAGE_SIZE}]（收到 page={page}, page_size={page_size}）"
                ),
            )
        self.page = page
        self.page_size = page_size

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
