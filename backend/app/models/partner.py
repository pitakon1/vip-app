"""合作公司模型。

对应该合作公司/合作伙伴账号体系：经纪公司作为合作方入驻平台。
- Partner         合作公司档案，`admin_user_id` 为该公司的合作公司管理员账号。
- PartnerStatus   合作公司状态。
"""
import uuid
from enum import Enum
from typing import Optional

from sqlmodel import Field

from .base import TimestampMixin


class PartnerStatus(str, Enum):
    """合作公司状态。"""

    active = "active"
    suspended = "suspended"
    pending = "pending"


class Partner(TimestampMixin, table=True):
    """合作公司。

    `Partner.admin_user_id` 指向合作公司管理员账号；公司旗下经纪人
    通过 `User.partner_id` 归属到本公司。`created_by` 记录平台侧开通人。
    """

    __tablename__ = "partners"

    name: str = Field(index=True)
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    license_no: Optional[str] = Field(default=None, unique=True)
    admin_user_id: Optional[uuid.UUID] = Field(
        foreign_key="users.id", index=True, default=None
    )
    status: PartnerStatus = Field(default=PartnerStatus.pending, index=True)
    is_active: bool = Field(default=True)
    # 坐席数上限：为空表示不限；创建成员/批量导入时校验。
    seat_limit: Optional[int] = Field(default=None)
    # 品牌展示（P2 白标）。先落字段，独立域名/主题暂不做。
    brand_name: Optional[str] = Field(default=None, max_length=120)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    created_by: Optional[uuid.UUID] = Field(foreign_key="users.id", default=None)