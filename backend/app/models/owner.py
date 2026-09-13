"""业主模型。

对应设计文档中的业主主数据，敏感字段（证件号/银行账户）以加密形式存储。
"""
import uuid
from enum import Enum
from typing import Optional

from sqlmodel import Field

from .base import TimestampMixin


class OwnerType(str, Enum):
    """业主类型：对私（个人）或 对公（公司），影响押金规则。"""

    individual = "individual"
    corporate = "corporate"


class Owner(TimestampMixin, table=True):
    """业主表。

    敏感字段以 _enc 结尾，表示应用层加密后存储的密文。
    """

    __tablename__ = "owners"

    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    owner_type: OwnerType = Field(
        default=OwnerType.individual, description="对私/对公，决定押金规则"
    )
    nationality: Optional[str] = None
    id_passport_enc: Optional[str] = Field(default=None, description="加密的证件号")
    tax_id: Optional[str] = None
    bank_account_enc: Optional[str] = Field(default=None, description="加密的银行账户")
    address: Optional[str] = None
    contact_preference: str = Field(
        default="email", description="首选联系方式: email/phone/line/wechat"
    )
