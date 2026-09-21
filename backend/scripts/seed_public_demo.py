"""C 端公开站点演示数据种子（仅用于本地开发 / 演示）。

⚠️ 这不是真实业务数据。
   脚本只做两件事：
   1) 把已有的房源档案补上「上架单」（`listings`），让 C 端前台有东西可展示；
   2) 铺几条**占位**学校与开发商，让「按学校找房 / 小区页」能被点开。

   刻意留空的字段（不编造）：
   - `schools.tuition_range` / `student_count` / `website` / `phone`
   - `projects.avg_price` / `management_fee_per_sqm`
   这些是决策型数据，编一个「看起来合理」的数字比留空更危险。
   上线前请清空 `schools` / `developers` 并录入真实数据。

幂等：重复执行不会重复插入（按固定 id 判断）。

用法：
    python scripts/seed_public_demo.py
"""
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlmodel import Session, select  # noqa: E402

from app.db import engine  # noqa: E402
from app.models import (  # noqa: E402
    Developer,
    Listing,
    ListingStatus,
    ListingType,
    Project,
    Property,
    PublisherType,
    School,
    SchoolCurriculum,
    SchoolStage,
    User,
)

# 固定 id：让脚本可重复执行而不产生重复行
NS = uuid.UUID("6f1b9e2c-0000-4000-8000-000000000de0")
DEMO_TAG = "demo-seed"


def _did(key: str) -> uuid.UUID:
    return uuid.uuid5(NS, key)


# 曼谷市区近似坐标（仅用于演示，不是精确测绘结果）
DEMO_SCHOOLS = [
    {
        "key": "school-sukhumvit",
        "name": "Demo International School (Sukhumvit)",
        "name_en": "Demo International School",
        "stage": SchoolStage.k12,
        "curriculum": SchoolCurriculum.ib,
        "district": "Sukhumvit",
        "lat": 13.7300,
        "lng": 100.5700,
        "age_range": "3-18",
    },
    {
        "key": "school-sathorn",
        "name": "Demo Bilingual Academy (Sathorn)",
        "name_en": "Demo Bilingual Academy",
        "stage": SchoolStage.primary,
        "curriculum": SchoolCurriculum.bilingual,
        "district": "Sathorn",
        "lat": 13.7200,
        "lng": 100.5300,
        "age_range": "3-12",
    },
    {
        "key": "school-bangna",
        "name": "Demo British School (Bang Na)",
        "name_en": "Demo British School",
        "stage": SchoolStage.k12,
        "curriculum": SchoolCurriculum.british,
        "district": "Bang Na",
        "lat": 13.6700,
        "lng": 100.6100,
        "age_range": "2-18",
    },
    {
        "key": "school-nonthaburi",
        "name": "Demo American School (Nonthaburi)",
        "name_en": "Demo American School",
        "stage": SchoolStage.k12,
        "curriculum": SchoolCurriculum.american,
        "district": "Nonthaburi",
        "lat": 13.8600,
        "lng": 100.5100,
        "age_range": "4-18",
    },
    {
        "key": "school-silom",
        "name": "Demo Kindergarten (Silom)",
        "name_en": "Demo Kindergarten",
        "stage": SchoolStage.kindergarten,
        "curriculum": SchoolCurriculum.bilingual,
        "district": "Silom",
        "lat": 13.7280,
        "lng": 100.5350,
        "age_range": "2-6",
    },
    {
        "key": "school-rama9",
        "name": "Demo Language Institute (Rama 9)",
        "name_en": "Demo Language Institute",
        "stage": SchoolStage.university,
        "curriculum": SchoolCurriculum.other,
        "district": "Rama 9",
        "lat": 13.7500,
        "lng": 100.5650,
    },
]


def seed_schools(session: Session) -> int:
    created = 0
    for item in DEMO_SCHOOLS:
        sid = _did(item["key"])
        if session.get(School, sid):
            continue
        session.add(
            School(
                id=sid,
                name=item["name"],
                name_en=item.get("name_en"),
                stage=item["stage"],
                curriculum=item["curriculum"],
                city="Bangkok",
                country="Thailand",
                district=item.get("district"),
                lat=item["lat"],
                lng=item["lng"],
                age_range=item.get("age_range"),
                description=(
                    "演示占位数据，非真实学校。上线前请清空 schools 表并录入真实学校信息。"
                ),
                sort_weight=0,
            )
        )
        created += 1
    return created


def seed_developer(session: Session) -> int:
    did = _did("developer-demo")
    if session.get(Developer, did):
        return 0
    session.add(
        Developer(
            id=did,
            name="Demo Developer Co., Ltd.",
            short_name="Demo Dev",
            city="Bangkok",
            country="Thailand",
            address="演示占位数据，非真实开发商",
            sort_weight=0,
        )
    )
    return 1


def seed_project_geo(session: Session) -> int:
    """楼盘缺经纬度就补一个演示坐标——否则地图找房与「周边学校」全空。"""
    updated = 0
    for project in session.exec(select(Project)).all():
        if project.lat is not None and project.lng is not None:
            continue
        project.lat = 13.7220
        project.lng = 100.5100
        project.developer_id = _did("developer-demo")
        session.add(project)
        updated += 1
    return updated


def seed_listings(session: Session) -> int:
    """给每个还没有上架单的房源档案补一条「在租、已上架」记录。

    没有这一层，C 端房源列表 / 地图 / 小区页全都是空的——
    因为公开接口只认 `listings.status == active`。
    """
    publisher = session.exec(select(User)).first()
    if publisher is None:
        raise SystemExit("库里没有任何 user，先跑 seed.py 再来")

    created = 0
    properties = session.exec(select(Property).where(Property.deleted_at.is_(None))).all()
    existing = {
        row.property_id
        for row in session.exec(select(Listing)).all()
    }
    for prop in properties:
        if prop.id in existing:
            continue
        session.add(
            Listing(
                id=_did(f"listing-{prop.id}"),
                property_id=prop.id,
                listing_type=ListingType.rent,
                publisher=PublisherType.broker,
                publisher_user_id=publisher.id,
                owner_id=prop.owner_id,
                status=ListingStatus.active,
                monthly_rent=prop.monthly_rent,
                currency=prop.currency or "THB",
                broker_company="Demo Agency",
                broker_real_name="演示经纪人",
                broker_phone="+66 00 000 0000",
                owner_contact_visible=False,
            )
        )
        created += 1
    return created


def main() -> None:
    with Session(engine) as session:
        schools = seed_schools(session)
        session.commit()
        developers = seed_developer(session)
        session.commit()
        geos = seed_project_geo(session)
        session.commit()
        listings = seed_listings(session)
        session.commit()

    print(
        f"[{DEMO_TAG}] schools +{schools} | developers +{developers} | "
        f"project-geo ~{geos} | listings +{listings}"
    )
    print(
        "提醒：这些是演示占位数据（学校 / 开发商 / 楼盘坐标 / 经纪人联系方式），"
        "上线前必须替换为真实数据。"
    )


if __name__ == "__main__":
    main()
