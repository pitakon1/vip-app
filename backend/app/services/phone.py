"""手机号归一化：统一 E.164 + 多形态比对键。

国家/区号数据来自 `app/data/countries.json`（唯一数据源，前端三端由
`scripts/sync-countries.mjs` 生成同一份副本），因此：
- 客户端按同一份 `lens` 做本地校验，提交 E.164（`+` + 区号 + 号码）；
- 后端用这里的 `to_e164()` 再收敛一次并落库；
- CRM 线索匹配用 `phone_keys()` 做多形态比对，泰国本地 `0xxxxxxxx` 与
  `+66xxxxxxxxx` 视为同号，同时兼容存量的非 E.164 数据。

处理号码格式差异的做法：
1. 先做 Unicode NFKC（全角＋、数字转半角）；
2. 去掉空格、短横线、括号、点等所有非数字字符；
3. `00` 与 `+` 视为同一国际前缀；带 `+`/`00` 时按「最长区号前缀」拆分；
4. 国内长途前缀 `0` 在国际格式中剔除（意大利等 `k=1` 国家保留）；
5. 没有国际前缀时，可用 default_iso 指定国家，或按本地号型提示
   （10 位 0 开头 / 9 位 6、8、9 开头视为泰国，11 位 1 开头视为中国）。
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Optional

_DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "countries.json"
_RAW: list[dict] = json.loads(_DATA_FILE.read_text(encoding="utf-8"))
COUNTRIES: dict[str, dict] = {item["i"]: item for item in _RAW}

# 区号按长度倒序，保证 +1 / +7 这类短码不会抢先匹配 +1246 / +7 之外的号码
_DIALS: list[str] = sorted({item["d"] for item in _RAW}, key=len, reverse=True)

# 共享区号时优先归属的国家（+1 → 美国、+44 → 英国 …）
_DIAL_PRIMARY: dict[str, str] = {
    "1": "US",
    "7": "RU",
    "39": "IT",
    "44": "GB",
    "47": "NO",
    "61": "AU",
    "212": "MA",
    "262": "RE",
    "290": "SH",
    "358": "FI",
    "590": "GP",
    "599": "CW",
    "672": "NF",
}

_DIAL_TO_ISO: dict[str, str] = {}
for _item in _RAW:
    _dial = _item["d"]
    if _dial not in _DIAL_TO_ISO or _item["i"] == _DIAL_PRIMARY.get(_dial):
        _DIAL_TO_ISO[_dial] = _item["i"]

MIN_NATIONAL_LEN = 4
MAX_NATIONAL_LEN = 15


def _digits(raw: object) -> str:
    text = unicodedata.normalize("NFKC", str(raw or "").strip())
    return re.sub(r"\D", "", text)


def country_by_iso(iso2: Optional[str]) -> Optional[dict]:
    return COUNTRIES.get((iso2 or "").strip().upper())


def country_by_dial(dial: Optional[str]) -> Optional[dict]:
    iso = _DIAL_TO_ISO.get(re.sub(r"\D", "", str(dial or "")))
    return COUNTRIES.get(iso) if iso else None


def _parse(raw: object, default_iso: Optional[str] = None) -> Optional[tuple[str, str]]:
    """拆成 (ISO2, 去掉长途前缀 0 的本地号码)；无法判定返回 None。"""
    text = unicodedata.normalize("NFKC", str(raw or "")).strip()
    if not text or "*" in text:
        return None

    digits = _digits(text)
    if not digits:
        return None

    if text.startswith("+"):
        international = True
    elif text.startswith("00"):
        international = True
        digits = digits[2:]
    else:
        international = False

    iso: Optional[str] = None
    national = ""

    if international:
        for code in _DIALS:
            if digits.startswith(code) and len(digits) - len(code) >= MIN_NATIONAL_LEN:
                iso = _DIAL_TO_ISO[code]
                national = digits[len(code):]
                break
        if iso is None:
            return None
    elif default_iso and default_iso.strip().upper() in COUNTRIES:
        iso = default_iso.strip().upper()
        national = digits
    else:
        # 无国际前缀且无国家上下文：
        # a) 若去掉区号后位数恰好命中该国规则，认定为「区号+本地号」（跳过 +1/+7，
        #    这两类与 11 位中国手机号、10 位本地号存在歧义）；
        for code in _DIALS:
            if code in ("1", "7") or not digits.startswith(code):
                continue
            candidate = digits[len(code):]
            if len(candidate) < MIN_NATIONAL_LEN:
                continue
            trimmed = candidate[1:] if candidate.startswith("0") else candidate
            lens = COUNTRIES[_DIAL_TO_ISO[code]].get("l")
            if lens and len(trimmed) in lens:
                iso, national = _DIAL_TO_ISO[code], candidate
                break
        if iso is None:
            # b) 旧客户端的本地号型兜底（泰国 0 开头 / 中国 11 位 1 开头）
            if len(digits) == 10 and digits.startswith("0"):
                iso, national = "TH", digits
            elif len(digits) == 9 and digits[0] in "689":
                iso, national = "TH", digits
            elif len(digits) == 11 and digits.startswith("1"):
                iso, national = "CN", digits
            else:
                return None

    country = COUNTRIES[iso]
    if not country.get("k") and national.startswith("0"):
        national = national[1:]
    if not national or not national.isdigit():
        return None

    lens = country.get("l")
    if lens:
        if len(national) not in lens:
            return None
    elif not MIN_NATIONAL_LEN <= len(national) <= MAX_NATIONAL_LEN:
        return None
    return iso, national


def to_e164(raw: object, default_iso: Optional[str] = None) -> Optional[str]:
    """任意写法 → E.164（`+区号+本地号码`）；无法解析/位数不符返回 None。"""
    parsed = _parse(raw, default_iso)
    if parsed is None:
        return None
    iso, national = parsed
    return f"+{COUNTRIES[iso]['d']}{national}"


def phone_keys(raw: object, default_iso: Optional[str] = None) -> set[str]:
    """同一号码的多形态比对键（用于容忍存量非 E.164 数据）。

    例：`+66 81 234 5678` / `0066 812345678` / `66812345678` / `0812345678`
    都会产出 `{"66812345678", "812345678", "0812345678"}`。
    """
    text = unicodedata.normalize("NFKC", str(raw or "")).strip()
    if not text or "*" in text:
        return set()

    keys: set[str] = set()
    digits = _digits(text)
    if text.startswith("00"):
        digits = digits[2:]
    if digits:
        keys.add(digits)
        if digits.startswith("0"):
            keys.add(digits[1:])

    parsed = _parse(raw, default_iso)
    if parsed is not None:
        iso, national = parsed
        dial = COUNTRIES[iso]["d"]
        keys.add(f"{dial}{national}")
        keys.add(national)
        if not COUNTRIES[iso].get("k"):
            keys.add(f"0{national}")
    keys.discard("")
    return keys


def is_same_phone(left: object, right: object) -> bool:
    """两个号码是否指向同一用户号码（任一形态重叠即视为相同）。"""
    return bool(phone_keys(left) & phone_keys(right))
