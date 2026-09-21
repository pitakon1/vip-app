"""开发商模型。

替代原来 `Project.developer` 的纯字符串字段。字符串无法聚合、无法成页、无法被
搜索引擎收录，而开发商是楼盘字典的一级实体（贝壳 L1 中「开发商/小区」层）。

建独立实体后可以：
- 开发商列表页 / 详情页（旗下项目聚合）
- `Project.developer_id` 外键（迁移脚本负责把历史字符串映射过来）
- 按开发商筛选房源
"""
from typing import Optional

from sqlmodel import Field

from .base import TimestampMixin


class Developer(TimestampMixin, table=True):
    """开发商表。"""

    __tablename__ = "developers"

    name: str = Field(index=True, description="开发商名称（中文/常用名）")
    name_en: Optional[str] = Field(default=None, index=True, description="英文名")
    name_th: Optional[str] = Field(default=None, description="泰文名")
    short_name: Optional[str] = Field(
        default=None, max_length=100, index=True, description="简称（用于与历史 Project.developer 字符串匹配迁移）"
    )

    # 联系方式
    phone: Optional[str] = Field(default=None, max_length=50)
    fax: Optional[str] = Field(default=None, max_length=50)
    email: Optional[str] = Field(default=None, max_length=200)
    website: Optional[str] = Field(default=None, max_length=500)

    # 地址与坐标
    address: Optional[str] = None
    district: Optional[str] = Field(default=None, index=True)
    city: Optional[str] = Field(default=None, index=True)
    country: Optional[str] = Field(default="Thailand")
    lat: Optional[float] = None
    lng: Optional[float] = None

    logo_url: Optional[str] = Field(default=None, max_length=500)
    description_zh: Optional[str] = Field(default=None, description="中文介绍")
    description_en: Optional[str] = Field(default=None, description="英文介绍")
    stock_code: Optional[str] = Field(
        default=None, max_length=50, description="上市代码（如 SET 上市开发商）"
    )

    sort_weight: int = Field(default=0, index=True, description="排序权重，越大越靠前")
