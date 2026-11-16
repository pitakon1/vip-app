"""房产自助绑定申请模型。

C 端不再区分「业主 / 租客」两套身份：任何登录用户都可以提交「我的房产」绑定申请，
由后台审核通过后才建立用户与房源的关联（创建 Owner 档案 + Property 记录）。

附件（产权证明 / 购房合同 / 身份证明等）以 JSON 形式记录服务端落盘路径，
目录不对外静态托管，只能通过带鉴权的下载接口读取。
"""
from datetime import datetime
from enum import Enum
from typing import Any, List, Optional
import uuid

from sqlalchemy import Column, JSON
from sqlmodel import Field

from .base import TimestampMixin


class PropertyBindingStatus(str, Enum):
    """绑定申请状态。"""

    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class PropertyBindingKind(str, Enum):
    """绑定申请类型。

    - claim：认领系统内已有房源（审核通过后把该房源关联到申请人，不新建房源）；
    - new：业主自助录入新房源（审核通过前房源处于待审状态，不对外展示）。
    """

    claim = "claim"
    new = "new"


class PropertyBinding(TimestampMixin, table=True):
    """房产绑定申请表。"""

    __tablename__ = "property_bindings"

    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    status: PropertyBindingStatus = Field(
        default=PropertyBindingStatus.pending, index=True
    )

    kind: PropertyBindingKind = Field(
        default=PropertyBindingKind.new, index=True
    )

    # 申请的房产信息（new 类型审核通过前先落在 Property.review_status=pending 上）
    address: str = Field(max_length=300)
    room_number: str = Field(max_length=50)
    size_sqm: Optional[float] = None
    property_type: str = Field(default="apartment", max_length=30)
    note: Optional[str] = None

    # 附件列表：[{name, url, size, content_type}]
    attachments: Optional[List[Any]] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True, comment="证明材料附件列表"),
    )

    # 审核信息
    reviewed_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = None
    reject_reason: Optional[str] = None

    # 认领目标：提交时命中的既有房源（kind=claim 时必填）
    matched_property_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="properties.id", index=True
    )
    # 审核通过后生效的房源（claim=命中的既有房源，new=提交时创建的待审房源）
    property_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="properties.id", index=True
    )
