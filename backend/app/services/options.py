"""数据字典服务：读取字典项、按语言取文案，带 Redis 缓存。

**为什么带缓存**：字典是「读多写极少」的数据，三端首屏和筛选面板都会取；
每次请求都查库不划算。整表一次读出并缓存，写操作后按前缀失效即可。

Redis 不可用时 `get_cache` / `set_cache` 自动降级，业务无感（回源查库）。
"""
from typing import Dict, List, Optional

from sqlmodel import Session, select

from app.core.cache import delete_cache_pattern, get_cache, set_cache
from app.models import OptionItem

_CACHE_TTL = 300
_CACHE_KEY = "cache:options:all"
_CACHE_PREFIX = "cache:options:*"


def _serialize(item: OptionItem) -> dict:
    """ORM → 可缓存 dict（避免把 ORM 对象塞进 json 序列化路径）。"""
    return {
        "id": str(item.id),
        "type": item.type,
        "value": item.value,
        "label": item.label,
        "label_i18n": item.label_i18n or {},
        "sort": item.sort,
        "is_active": item.is_active,
        "is_system": item.is_system,
    }


def invalidate_cache() -> None:
    """字典写操作后调用：清空缓存，下次读回源。"""
    delete_cache_pattern(_CACHE_PREFIX)


def _load_all(session: Session) -> List[dict]:
    """全量活跃字典项（缓存）。级联按 type / sort / created_at 排序。"""
    cached = get_cache(_CACHE_KEY)
    if isinstance(cached, list):
        return cached
    rows = session.exec(
        select(OptionItem).where(OptionItem.deleted_at.is_(None))
    ).all()
    rows.sort(key=lambda r: (r.type, r.sort, r.created_at))
    data = [_serialize(r) for r in rows]
    set_cache(_CACHE_KEY, data, _CACHE_TTL)
    return data


def list_options(
    session: Session, type_: Optional[str] = None, active_only: bool = True
) -> List[dict]:
    """按分组列出字典项。`type_` 为空返回全部；`active_only` 只返回启用项。"""
    items = _load_all(session)
    out = [i for i in items if (not active_only or i["is_active"])]
    if type_:
        out = [i for i in out if i["type"] == type_]
    return out


def _resolve_label(item: dict, lang: str) -> str:
    """取某语言文案：label_i18n[lang] → label → value（逐级回落，绝不空白）。"""
    i18n = item.get("label_i18n") or {}
    return i18n.get(lang) or item.get("label") or item.get("value") or ""


def option_map(session: Session, type_: str, lang: str = "zh") -> Dict[str, str]:
    """某分组 value → 本地化文案（供前端枚举映射使用）。"""
    return {
        i["value"]: _resolve_label(i, lang) for i in list_options(session, type_)
    }


def bundle(session: Session, lang: str = "zh") -> Dict[str, Dict[str, str]]:
    """全部分组：{type: {value: 本地化文案}}（一次取全部，减少请求数）。"""
    result: Dict[str, Dict[str, str]] = {}
    for i in list_options(session):
        result.setdefault(i["type"], {})[i["value"]] = _resolve_label(i, lang)
    return result


def get_label(
    session: Session, type_: str, value: str, lang: str = "zh"
) -> Optional[str]:
    """单值取文案，命中不到返回 None（调用方自行回落硬编码）。"""
    for i in list_options(session, type_):
        if i["value"] == value:
            return _resolve_label(i, lang)
    return None
