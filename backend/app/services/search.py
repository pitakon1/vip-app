"""房源搜索的相关性打分。

**为什么需要**：`ILIKE '%关键词%'` 只能回答「命中 / 不命中」，于是带关键词的
列表只能按时间倒序——搜「苏坤逸」时，楼盘名正好叫「苏坤逸」的房源可能排在
「地址里顺带提到苏坤逸」的房源后面，用户要翻到第 3 页才找到最该看到的那条。

这里用 SQL 的 `CASE WHEN` 给每条记录算一个分数放进 `ORDER BY`：**只改变顺序，
不改变命中集合**（`WHERE` 仍是原来的 ILIKE 条件），因此不会出现「搜不到」的回归。

打分口径（多关键词命中累加，数值仅用于排序，无业务含义）：

| 命中位置 | 分数 |
|---|---|
| 房号完全等于关键词 | 100 |
| 楼盘名完全等于关键词 | 80 |
| 房号包含关键词 | 60 |
| 楼盘名包含关键词 | 50 |
| 地址 / 楼栋包含关键词 | 40 |
| 城区 / 城市包含关键词 | 30 |
| 房源描述包含关键词 | 20 |

调用方需保证 `Project` 已在查询的 JOIN 链上（`/public/listings` 与
`/properties` 都满足），否则 SQL 会因找不到表而报错。
"""
from typing import List, Optional

from sqlalchemy import case, func

from ..models import Project, Property


def _exact(column, term: str):
    """大小写不敏感的全等比较。

    刻意不用 `ilike(term)`：关键词里一旦出现 `%` 或 `_`（如「100%」），
    它就变成了通配符，会命中所有记录并把排序彻底打乱。
    """
    return func.lower(column) == term.lower()


def relevance_score(terms: List[str]):
    """返回可放进 `ORDER BY ... DESC` 的相关性分数表达式；无关键词时返回 None。"""
    if not terms:
        return None
    score = None
    for term in terms:
        pattern = f"%{term}%"
        per_term = case(
            (_exact(Property.room_number, term), 100),
            (_exact(Project.name, term), 80),
            (Property.room_number.ilike(pattern), 60),
            (Project.name.ilike(pattern), 50),
            (Property.address.ilike(pattern), 40),
            (Property.building.ilike(pattern), 40),
            (Project.district.ilike(pattern), 30),
            (Project.city.ilike(pattern), 30),
            (Property.description.ilike(pattern), 20),
            else_=0,
        )
        score = per_term if score is None else score + per_term
    return score


def resolve_sort(
    sort: Optional[str], terms: List[str], *, allowed: List[str]
) -> str:
    """把「未显式指定排序」解释成「有关键词就按相关性，否则最新」。

    前端历来会显式传 `sort=latest`（各端筛选栏的默认值），所以这里只在
    `sort` 缺省（None/空）时才启用相关性——不改变显式 `latest` 的语义，
    避免「我明明选了最新，却按相关度排」这种说不清的体验。
    """
    if sort:
        return sort if sort in allowed else allowed[0]
    return "relevance" if terms else "latest"
