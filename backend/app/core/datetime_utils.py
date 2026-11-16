"""时间入参的 UTC 归一化。

数据库统一存 **naive UTC**（`TimestampMixin` 用 `datetime.utcnow`）。但「瞬时
时间」类入参（预约看房、日程、服务工单、实际到账时间、考勤校准）在三个前端
里的写法并不统一：

- `Date#toISOString()` → `2026-12-01T02:00:00.000Z`（带时区，正确）；
- 日期选择器直接拼串 → `2026-12-01T10:00:00`（不带时区，本地墙上时间）。

`DateTime` 列不带时区，第二种写法会**原样**落库；读出来再由前端
`new Date('2026-12-01T10:00:00')` 按浏览器本地时区解析，于是同一笔预约在
「提交端」与「查看端」相差数小时（在 UTC+8 环境实测差 8 小时）。

`UtcInstant` 把两类写法统一成 UTC naive：

- 带时区（`Z` / `+08:00`）→ 换算到 UTC 后去掉 tzinfo；
- 不带时区 → 视为**业务时区**（`settings.BUSINESS_TIMEZONE`，默认
  Asia/Bangkok，与 Celery 一致）的墙上时间，再换算到 UTC。

注意：只用于「瞬时时间」。租约起止日期、账单到期日这类**日期语义**字段
不要套用——它们按 `00:00` 存储，换算成 UTC 会把日期整体前移一天。
"""
from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic import AfterValidator
from typing import Annotated

from app.config import settings


@lru_cache(maxsize=4)
def business_zone(name: str) -> ZoneInfo:
    """业务时区对象；配置了非法时区名时回落到 UTC（不让配置错误打挂接口）。"""
    try:
        return ZoneInfo(name)
    except Exception:  # noqa: BLE001 - 非法时区名只降级，不影响业务
        return ZoneInfo("UTC")


def _business_zone() -> ZoneInfo:
    return business_zone(settings.BUSINESS_TIMEZONE or "Asia/Bangkok")


def to_utc_naive(value: datetime) -> datetime:
    """把瞬时时间统一成 UTC naive（数据库存储格式）。"""
    if value.tzinfo is None:
        value = value.replace(tzinfo=_business_zone())
    return value.astimezone(timezone.utc).replace(tzinfo=None)


# Pydantic 校验后转换：先按标准 ISO 解析，再统一到 UTC naive
UtcInstant = Annotated[datetime, AfterValidator(to_utc_naive)]
