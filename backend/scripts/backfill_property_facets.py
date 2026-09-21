"""为现有房源补齐 C 端筛选维度（朝向 / 装修 / 楼层 / 配套设施），幂等。

为什么需要：找房筛选对齐贝壳后新增「朝向 / 楼层 / 装修 / 配套」四组条件，
但存量房源这些字段是 NULL——筛选一选就全空。本脚本用**确定性伪随机**（基于
房源 id 哈希，重跑结果一致）给缺失字段填上合理取值，不编造未提供的字段。

只补 NULL：已有值的房源一律不动；重复执行无副作用。

用法：
    python scripts/backfill_property_facets.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import hashlib  # noqa: E402

from sqlmodel import Session, select  # noqa: E402

from app.db import engine  # noqa: E402
from app.models import Decoration, Orientation, Property  # noqa: E402

# 朝向 8 向（泰国西晒极强，西/西南是硬决策因素，保留全向）
_ORIENTATIONS = [
    Orientation.north,
    Orientation.south,
    Orientation.east,
    Orientation.west,
    Orientation.northeast,
    Orientation.northwest,
    Orientation.southeast,
    Orientation.southwest,
]

# 装修：精装 / 带家具为主（东南亚出租房源主流），毛坯简装少量
_DECORATIONS = [
    Decoration.standard,
    Decoration.fully_furnished,
    Decoration.fully_furnished,
    Decoration.luxury,
    Decoration.simple,
]

# 配套：东南亚口径（无供暖/暖气/天然气）。
# 空调是普适项；泳池/健身房/电梯是公寓标配；别墅/独栋偏向泳池/花园/停车位。
_AMENITY_POOL = {
    "condo": ["aircon", "pool", "gym", "elevator", "parking", "balcony"],
    "apartment": ["aircon", "gym", "elevator", "parking", "balcony"],
    "villa": ["aircon", "pool", "parking", "garden"],
    "house": ["aircon", "pool", "parking", "garden"],
    "shop": ["aircon", "parking"],
    "commercial": ["aircon", "parking", "elevator"],
    "office": ["aircon", "parking", "elevator"],
}
_DEFAULT_POOL = ["aircon", "parking"]


def _pick(seed_key: str, items: list) -> object:
    """基于字符串的确定性选择：同一房源永远得到同一结果。"""
    digest = hashlib.md5(seed_key.encode("utf-8")).digest()
    return items[digest[0] % len(items)]


def _amenities_for(prop: Property) -> list:
    pool = _AMENITY_POOL.get(prop.property_type, _DEFAULT_POOL)
    digest = hashlib.md5(f"{prop.id}:amenities".encode("utf-8")).digest()
    # 至少 3 项、最多全量：空调恒在（首项）
    count = 3 + (digest[1] % max(1, len(pool) - 2))
    chosen = [pool[0]] + [a for a in pool[1:] if a in pool[:count]]
    return chosen


def backfill(session: Session) -> dict:
    props = session.exec(
        select(Property).where(Property.deleted_at.is_(None))
    ).all()
    stats = {"orientation": 0, "decoration": 0, "floor": 0, "amenities": 0}
    for prop in props:
        seed = str(prop.id)
        if prop.orientation is None:
            prop.orientation = _pick(f"{seed}:orientation", _ORIENTATIONS)
            stats["orientation"] += 1
        if prop.decoration is None:
            prop.decoration = _pick(f"{seed}:decoration", _DECORATIONS)
            stats["decoration"] += 1
        if prop.floor is None:
            # 低层 1-5 / 中层 6-15 / 高层 16-30
            band = _pick(f"{seed}:floorband", ["low", "low", "mid", "mid", "high"])
            lo, hi = {"low": (1, 5), "mid": (6, 15), "high": (16, 30)}[band]
            prop.floor = lo + (hashlib.md5(f"{seed}:floor".encode()).digest()[0] % (hi - lo + 1))
            stats["floor"] += 1
        if prop.amenities is None or not prop.amenities:
            prop.amenities = _amenities_for(prop)
            stats["amenities"] += 1
        session.add(prop)
    session.commit()
    return stats


def main() -> None:
    with Session(engine) as session:
        stats = backfill(session)
    print(f"[backfill-facets] {stats}")
    print("提醒：演示用确定性回填（朝向/装修/楼层/配套），上线前应替换为真实录入数据。")


if __name__ == "__main__":
    main()
