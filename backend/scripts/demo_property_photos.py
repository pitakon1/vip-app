"""开发库演示照片注入（仅本地开发，不属于种子 / 迁移逻辑）。

用途：给指定上架单对应的房源档案补一组项目本地占位照片，用于复验 C 端详情页
画廊在有图状态下的效果。不新增迁移、不改后端业务代码，可一键回滚。

用法（在 backend 目录执行）：
    .venv/Scripts/python scripts/demo_property_photos.py
    .venv/Scripts/python scripts/demo_property_photos.py --revert

默认目标：D-016（listing 083da18c-7fd5-493d-8aa2-d5c79c26c912）。
回滚状态保存在 scripts/.demo_property_photos_backup.json。
"""
from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image, ImageDraw  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from app.db import engine  # noqa: E402
from app.models import Listing, Property  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]
PUBLIC_MEDIA_DIR = BACKEND_DIR / "uploads" / "properties"
BACKUP_FILE = Path(__file__).resolve().parent / ".demo_property_photos_backup.json"

DEFAULT_LISTING_ID = "083da18c-7fd5-493d-8aa2-d5c79c26c912"
DEMO_DIR_NAME = "demo-sukhumvit-d016"
PHOTO_FILES = ["living.jpg", "bedroom.jpg", "kitchen.jpg", "balcony.jpg"]
URL_PREFIX = f"/uploads/properties/{DEMO_DIR_NAME}/"


# ==================== 图片生成（纯本地，无外链依赖） ====================

def _draw_living(d: ImageDraw.ImageDraw, w: int, h: int) -> None:
    d.rectangle([0, 0, w, int(h * 0.72)], fill=(238, 233, 224))
    d.rectangle([0, int(h * 0.72), w, h], fill=(206, 186, 161))
    for x in range(0, w, 60):
        d.line([(x, int(h * 0.72)), (x, h)], fill=(198, 178, 154), width=2)
    d.rectangle([int(w * 0.66), int(h * 0.12), int(w * 0.94), int(h * 0.58)], fill=(196, 220, 228))
    d.rectangle([int(w * 0.66), int(h * 0.12), int(w * 0.94), int(h * 0.58)], outline=(236, 232, 226), width=8)
    d.line([(int(w * 0.8), int(h * 0.12)), (int(w * 0.8), int(h * 0.58))], fill=(236, 232, 226), width=6)
    # 地毯 / 沙发 / 茶几 / 绿植
    d.ellipse([int(w * 0.12), int(h * 0.62), int(w * 0.62), int(h * 0.86)], fill=(222, 209, 191))
    d.rounded_rectangle([int(w * 0.16), int(h * 0.5), int(w * 0.52), int(h * 0.68)], radius=18, fill=(122, 145, 152))
    d.rounded_rectangle([int(w * 0.18), int(h * 0.52), int(w * 0.5), int(h * 0.62)], radius=14, fill=(146, 168, 174))
    d.rounded_rectangle([int(w * 0.3), int(h * 0.7), int(w * 0.44), int(h * 0.76)], radius=8, fill=(168, 141, 110))
    d.rounded_rectangle([int(w * 0.08), int(h * 0.38), int(w * 0.16), int(h * 0.74)], radius=10, fill=(186, 205, 186))


def _draw_bedroom(d: ImageDraw.ImageDraw, w: int, h: int) -> None:
    d.rectangle([0, 0, w, int(h * 0.7)], fill=(240, 234, 224))
    d.rectangle([0, int(h * 0.7), w, h], fill=(201, 180, 153))
    d.rectangle([int(w * 0.12), int(h * 0.14), int(w * 0.3), int(h * 0.52)], fill=(205, 225, 231))
    d.rectangle([int(w * 0.12), int(h * 0.14), int(w * 0.3), int(h * 0.52)], outline=(240, 236, 229), width=7)
    # 床 / 枕头 / 床头柜 / 挂画
    d.rectangle([int(w * 0.34), int(h * 0.42), int(w * 0.74), int(h * 0.74)], fill=(226, 219, 208))
    d.rounded_rectangle([int(w * 0.34), int(h * 0.36), int(w * 0.74), int(h * 0.5)], radius=12, fill=(160, 141, 122))
    d.rounded_rectangle([int(w * 0.37), int(h * 0.4), int(w * 0.5), int(h * 0.48)], radius=8, fill=(248, 246, 242))
    d.rounded_rectangle([int(w * 0.53), int(h * 0.4), int(w * 0.66), int(h * 0.48)], radius=8, fill=(248, 246, 242))
    d.rectangle([int(w * 0.78), int(h * 0.46), int(w * 0.9), int(h * 0.58)], fill=(170, 146, 118))
    d.rectangle([int(w * 0.42), int(h * 0.14), int(w * 0.62), int(h * 0.28)], fill=(200, 214, 214))
    d.rectangle([int(w * 0.42), int(h * 0.14), int(w * 0.62), int(h * 0.28)], outline=(246, 243, 237), width=5)


def _draw_kitchen(d: ImageDraw.ImageDraw, w: int, h: int) -> None:
    d.rectangle([0, 0, w, int(h * 0.72)], fill=(242, 238, 231))
    d.rectangle([0, int(h * 0.72), w, h], fill=(192, 172, 148))
    d.rectangle([int(w * 0.58), int(h * 0.1), int(w * 0.9), int(h * 0.42)], fill=(198, 222, 228))
    d.rectangle([int(w * 0.58), int(h * 0.1), int(w * 0.9), int(h * 0.42)], outline=(245, 242, 236), width=7)
    # 台面 / 柜门 / 水槽 / 吊灯
    d.rectangle([0, int(h * 0.52), w, int(h * 0.6)], fill=(217, 205, 188))
    for i in range(5):
        x0 = int(w * (0.05 + i * 0.18))
        d.rounded_rectangle([x0, int(h * 0.6), x0 + int(w * 0.15), int(h * 0.84)], radius=8, fill=(228, 220, 208))
        d.line([(x0 + int(w * 0.07), int(h * 0.7)), (x0 + int(w * 0.08), int(h * 0.72))], fill=(170, 158, 144), width=3)
    d.rounded_rectangle([int(w * 0.12), int(h * 0.46), int(w * 0.24), int(h * 0.54)], radius=6, fill=(176, 184, 184))
    d.ellipse([int(w * 0.44), int(h * 0.03), int(w * 0.54), int(h * 0.11)], fill=(222, 212, 190))
    d.line([(int(w * 0.49), int(h * 0.11)), (int(w * 0.49), int(h * 0.2))], fill=(150, 140, 124), width=3)


def _draw_balcony(d: ImageDraw.ImageDraw, w: int, h: int) -> None:
    # 室外：天空 / 楼体 / 栏杆 / 休闲椅
    d.rectangle([0, 0, w, int(h * 0.62)], fill=(190, 216, 222))
    d.rectangle([0, int(h * 0.62), w, h], fill=(198, 182, 162))
    d.rectangle([int(w * 0.08), int(h * 0.18), int(w * 0.36), int(h * 0.62)], fill=(222, 214, 202))
    d.rectangle([int(w * 0.66), int(h * 0.26), int(w * 0.94), int(h * 0.62)], fill=(214, 208, 198))
    for i in range(6):
        d.rectangle([int(w * (0.08 + i * 0.145)), int(h * 0.1), int(w * (0.1 + i * 0.145)), int(h * 0.2)], fill=(176, 198, 202))
    d.line([(0, int(h * 0.62)), (w, int(h * 0.62))], fill=(150, 142, 128), width=4)
    for i in range(10):
        x = int(w * (0.05 + i * 0.1))
        d.line([(x, int(h * 0.52)), (x, int(h * 0.62))], fill=(132, 126, 116), width=3)
    d.line([(0, int(h * 0.52)), (w, int(h * 0.52))], fill=(132, 126, 116), width=4)
    d.rounded_rectangle([int(w * 0.2), int(h * 0.72), int(w * 0.42), int(h * 0.86)], radius=10, fill=(176, 152, 122))
    d.rounded_rectangle([int(w * 0.23), int(h * 0.65), int(w * 0.39), int(h * 0.74)], radius=8, fill=(210, 196, 178))


_ROOM_PAINTERS = {
    "living.jpg": _draw_living,
    "bedroom.jpg": _draw_bedroom,
    "kitchen.jpg": _draw_kitchen,
    "balcony.jpg": _draw_balcony,
}


def _ensure_images() -> list[str]:
    target = PUBLIC_MEDIA_DIR / DEMO_DIR_NAME
    target.mkdir(parents=True, exist_ok=True)
    for name in PHOTO_FILES:
        path = target / name
        if path.exists():
            continue
        img = Image.new("RGB", (1200, 800), (238, 233, 224))
        _ROOM_PAINTERS[name](ImageDraw.Draw(img), 1200, 800)
        img.save(path, "JPEG", quality=88)
    return [f"{URL_PREFIX}{name}" for name in PHOTO_FILES]


# ==================== 数据库注入 / 回滚 ====================

def _find_property(session: Session, listing_id: str) -> Property:
    listing = session.exec(select(Listing).where(Listing.id == uuid.UUID(listing_id))).first()
    if listing is None:
        raise SystemExit(f"未找到上架单 {listing_id}")
    prop = session.get(Property, listing.property_id)
    if prop is None:
        raise SystemExit(f"上架单对应的房源档案不存在：{listing.property_id}")
    return prop


def apply(listing_id: str) -> None:
    if BACKUP_FILE.exists():
        raise SystemExit(
            f"{BACKUP_FILE.name} 已存在，说明之前注入过；先执行 --revert 再重新注入。"
        )
    urls = _ensure_images()
    with Session(engine) as session:
        prop = _find_property(session, listing_id)
        property_id = str(prop.id)
        BACKUP_FILE.write_text(
            json.dumps(
                {
                    "listing_id": listing_id,
                    "property_id": property_id,
                    "original_photos": prop.photos,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        prop.photos = urls
        session.add(prop)
        session.commit()
    print(f"已注入 {len(urls)} 张演示照片 → 房源 {property_id}")
    for url in urls:
        print(f"  {url}")


def revert() -> None:
    if not BACKUP_FILE.exists():
        raise SystemExit("没有找到回滚备份，无需回滚。")
    meta = json.loads(BACKUP_FILE.read_text(encoding="utf-8"))
    with Session(engine) as session:
        prop = session.get(Property, uuid.UUID(meta["property_id"]))
        if prop is None:
            raise SystemExit(f"房源档案不存在，无法回滚：{meta['property_id']}")
        prop.photos = meta["original_photos"]
        session.add(prop)
        session.commit()
    BACKUP_FILE.unlink()
    print(f"已回滚房源 {meta['property_id']} 的 photos → {meta['original_photos']}")
    print(f"演示图片保留在 {PUBLIC_MEDIA_DIR / DEMO_DIR_NAME}（可手动删除，不影响数据）")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--listing-id", default=DEFAULT_LISTING_ID)
    parser.add_argument("--revert", action="store_true")
    args = parser.parse_args()
    if args.revert:
        revert()
    else:
        apply(args.listing_id)


if __name__ == "__main__":
    main()
