"""通用数据字典（data dictionary）模型。

对标参考项目（房少 ERP）的 `peizhi` 配置表：把此前散落在 Python Enum
（Orientation / Decoration / PropertyStatus…）与前端 i18n 的枚举，收敛为
**数据库可维护**的字典项，后台可增删改；前端「优先取接口字典、缺失回落硬编码」，
保证字典缺项时 C 端不空白。

同一 `type` 分组下 `value` 唯一（如 orientation 下 north 只能有一条）。
"""
from typing import Dict, Optional

from sqlalchemy import JSON
from sqlmodel import Field, UniqueConstraint

from .base import TimestampMixin


class OptionItem(TimestampMixin, table=True):
    """字典项：按 type 分组、value 唯一。"""

    __tablename__ = "options"
    __table_args__ = (
        UniqueConstraint("type", "value", name="uq_option_type_value"),
    )

    # 分组：orientation / decoration / amenity / property_type ...
    type: str = Field(index=True, max_length=64, description="字典分组")
    value: str = Field(max_length=128, description="枚举值（稳定、不改写）")
    label: str = Field(default="", max_length=255, description="默认展示文案")
    # 多语言文案 {zh,en,th}；缺失语言回落 label
    label_i18n: Optional[Dict[str, str]] = Field(
        default=None,
        sa_type=JSON,
        sa_column_kwargs={"nullable": True},
        description="多语言文案 {zh,en,th}",
    )
    sort: int = Field(default=0, description="排序（小在前）")
    is_active: bool = Field(default=True, description="是否启用")
    # 系统内置项由种子写入：禁用可以，删除会拒绝，避免误删导致 C 端枚举空白
    is_system: bool = Field(default=False, description="系统内置（不可删除）")


__all__ = ["OptionItem"]
