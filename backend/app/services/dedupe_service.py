"""房源去重服务。

策略（已与用户确认）：结构化唯一键为主 + 自由地址哈希校验 + 相似度辅助人工审核。

- 结构化唯一键：楼盘 project_id + 楼栋 building + 房号 room 归一化后拼 `project|building|room`；
  同一套房在平台上仓库 `Property.dedupe_key` 唯一索引保证只一行档案，重复上架自动并入。
- 自由地址：地址归一化 + 房号归一化后做 SHA-256 哈希作为 key。
- 相似度：地址编辑距离 + bigram Jaccard 加权；房号必须一致才进入候选；阈值以上标记疑似进人工审核。

纯 Python 实现，不引入重依赖。
"""
import unicodedata
from typing import Dict, Optional
from uuid import UUID

from sqlalchemy import select
from sqlmodel import Session

from app.models import (
    DedupeType,
    Property,
)

# 相似度阈值（如命中则标记 suspect 进人工审核）；≥ 0.9 视为疑似
FUZZY_SUSPECT_THRESHOLD = 0.90
# LIKE 前缀匹配用的地址末段长度（留下足够前段避免漏检）
_ADDR_PREFIX_LEN = 60

# 地址中常见道路后缀（英文为主，泰语街道常用 soi/road），用于归一化
_ROAD_SUFFIXES = (
    "street", "st", "avenue", "ave", "road", "rd", "lane", "ln",
    "soi", "alley", "unit", "suite", "block",
)
_ROOM_SUFFIXES = ("号", "室", "unit", "apt", "apartment", "flat", "room", "rm", "#")

# 统一清理的分隔符
_SEPARATORS = ("-", "/", "\\", "_", "·", " ", "\t")


def norm_room(s: Optional[str]) -> str:
    """房号归一化：全角转半角、去分隔符、去前导零、去房间后缀、统一小写。"""
    if not s:
        return ""
    v = unicodedata.normalize("NFKC", s)
    for sep in _SEPARATORS:
        v = v.replace(sep, "")
    v = v.lower()
    for suf in _ROOM_SUFFIXES:
        v = v.replace(suf, "")
    # 去前导零（如 07 -> 7）
    v = v.lstrip("0") or "0"
    # 去首尾空白
    return v.strip()


def norm_building(s: Optional[str]) -> str:
    """楼栋归一路（A 栋 / BUILDING-A 归一到 a）。"""
    if not s:
        return ""
    v = unicodedata.normalize("NFKC", s or "")
    for sep in _SEPARATORS:
        v = v.replace(sep, "")
    v = v.lower()
    for suf in _ROAD_SUFFIXES:
        v = v.replace(suf, "")
    return v.strip()


def normalize_address(s: Optional[str]) -> str:
    """地址归一化：NFKC、小写、去常见道路后缀、折叠空白。"""
    if not s:
        return ""
    v = unicodedata.normalize("NFKC", s or "")
    v = v.lower()
    for suf in _ROAD_SUFFIXES:
        v = v.replace(f" {suf}", "").replace(f"{suf} ", "").replace(suf, "")
    v = " ".join(v.split())
    return v.strip()


def build_structured_key(
    project_id: UUID, building: Optional[str], room: Optional[str]
) -> str:
    """结构化唯一键：project|building|room。"""
    return "|".join([str(project_id), norm_building(building), norm_room(room)])


def build_free_key(address: Optional[str], room: Optional[str]) -> str:
    """自由地址唯一键：对归一化地址+房号做 SHA-256 前缀哈希。"""
    import hashlib

    key = f"{normalize_address(address)}|{norm_room(room)}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]


def levenshtein(a: str, b: str) -> int:
    """编辑距离（滚动数组 DP）。"""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i] + [0] * len(b)
        for j, cb in enumerate(b, 1):
            cur[j] = min(
                prev[j] + 1,      # 删除
                cur[j - 1] + 1,   # 插入
                prev[j - 1] + (ca != cb),  # 替换
            )
        prev = cur
    return prev[-1]


def jaccard(a: str, b: str) -> float:
    """字符 bigram Jaccard 相似度（0-1）。"""
    def bigrams(s: str):
        if len(s) < 2:
            return {s} if s else set()
        return {s[i:i + 2] for i in range(len(s) - 1)}

    ba, bb = bigrams(a), bigrams(b)
    if not ba and not bb:
        return 1.0
    inter = len(ba & bb)
    union = len(ba | bb)
    return inter / union if union else 0.0


def address_similarity(a: str, b: str) -> float:
    """地址相似度：0.6*归一化编辑距离 + 0.4*Jaccard。"""
    an, bn = normalize_address(a), normalize_address(b)
    if not an or not bn:
        return 0.0
    lr = 1.0 - levenshtein(an, bn) / max(len(an), len(bn))
    return 0.6 * lr + 0.4 * jaccard(an, bn)


def resolve(
    session: Session,
    *,
    project_id: Optional[UUID],
    building: Optional[str],
    room_number: str,
    address: str,
) -> Dict[str, object]:
    """解析房源档案归属。

    返回：
    {
      "existing": Property | None   # 强命中的现有档案（结构化/自由地址哈希命中）
      "dedupe_type": str,
      "dedupe_key": str,
      "address_norm": str,
      "fuzzy": [{"property_id", "score"}],   # 相似度 ≥ 阈值的疑似候选
    }
    本函数只负责定位档案，不创建/不提交任何行；新建 Property 由调用方完成并带上必填字段。
    """
    if project_id:
        key = build_structured_key(project_id, building, room_number)
        dedupe_type = DedupeType.project
    else:
        key = build_free_key(address, room_number)
        dedupe_type = DedupeType.free_address

    existing = session.exec(
        select(Property).where(
            Property.dedupe_key == key,
            Property.deleted_at.is_(None),
        )
    ).first()

    # 相似度辅助：对同类型候选做内存比对（房号一致才进入）
    fuzzy = []
    addr_norm = normalize_address(address)
    room_n = norm_room(room_number)
    if not existing and addr_norm:
        candidates = session.exec(
            select(Property).where(
                Property.dedupe_type == dedupe_type,
                Property.deleted_at.is_(None),
                Property.dedupe_key.is_not(None),
            )
        ).all()
        for cand in candidates:
            if norm_room(getattr(cand, "room_number", None)) != room_n:
                continue  # 房号不同视为不同单元
            score = address_similarity(addr_norm, getattr(cand, "address", "") or "")
            if score >= FUZZY_SUSPECT_THRESHOLD:
                fuzzy.append({"property_id": cand.id, "score": round(score * 100, 2)})

    return {
        "existing": existing,
        "dedupe_type": dedupe_type,
        "dedupe_key": key,
        "address_norm": addr_norm,
        "fuzzy": fuzzy,
    }