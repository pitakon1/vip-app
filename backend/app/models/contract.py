"""电子签合同模型。

根据租约与用户信息自动生成合同（HTML 渲染），由各方数字签名，
生成签名 SVG 与哈希并入库，输出可下载的合同文件。
"""
import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional

from sqlalchemy import Column, JSON
from sqlmodel import Field

from .base import TimestampMixin


class ContractStatus(str, Enum):
    draft = "draft"
    sent = "sent"
    partially_signed = "partially_signed"
    signed = "signed"
    completed = "completed"
    voided = "voided"


class ContractKind(str, Enum):
    """合同/协议类型。"""

    lease = "lease"  # 房屋租赁合同
    broker_distributor = "broker_distributor"  # 《平台经纪人分销协议》(客源分销经纪人)
    listing_agent = "listing_agent"  # 《房源经纪人上架房源协议》(房源上架经纪人)


class SignerRole(str, Enum):
    landlord = "landlord"  # 房东/业主
    tenant = "tenant"  # 租客
    agent = "agent"  # 经纪公司/经办
    witness = "witness"


class ContractParty(TimestampMixin, table=True):
    """合同签署方。"""

    __tablename__ = "contract_parties"

    contract_id: uuid.UUID = Field(foreign_key="contracts.id", index=True)
    user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    name: str
    email: str = ""
    id_number: Optional[str] = None
    phone: Optional[str] = None
    role: SignerRole = Field(default=SignerRole.tenant)
    signed: bool = Field(default=False)
    signed_at: Optional[datetime] = None
    signature: Optional[str] = None  # 签名 SVG / base64


class Contract(TimestampMixin, table=True):
    """合同表。"""

    __tablename__ = "contracts"

    lease_id: Optional[uuid.UUID] = Field(default=None, foreign_key="leases.id")
    property_id: Optional[uuid.UUID] = Field(default=None, foreign_key="properties.id")
    title: str
    kind: ContractKind = Field(
        default=ContractKind.lease, index=True, description="合同/协议类型"
    )
    language: str = "zh"  # 生成语言
    content_html: str = ""  # 渲染后的合同 HTML
    status: ContractStatus = Field(default=ContractStatus.draft, index=True)
    signed_at: Optional[datetime] = None
    file_path: Optional[str] = None  # 生成的合同文件
    document_hash: Optional[str] = None  # 全文 SHA-256
    counters: Optional[Dict[str, Any]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )


class SignatureRecord(TimestampMixin, table=True):
    """签名留痕（审计）。"""

    __tablename__ = "signature_records"

    contract_id: uuid.UUID = Field(foreign_key="contracts.id", index=True)
    party_id: uuid.UUID = Field(foreign_key="contract_parties.id")
    signer_user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    signer_name: str
    signature_svg: Optional[str] = None
    signature_hash: Optional[str] = None
    ip: Optional[str] = None