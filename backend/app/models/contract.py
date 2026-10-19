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
    rejected = "rejected"  # 被拒签：至少一方拒签，签署流程终止


class SignAssetType(str, Enum):
    """签名资产类型。"""

    handwrite = "handwrite"  # 手写签名
    seal = "seal"  # 印章


class SignAssetSource(str, Enum):
    """签名资产来源。"""

    drew = "drew"  # 手写面板绘制
    upload = "upload"  # 直接上传图片
    imprint = "imprint"  # 印模：扫描真实章自动透明抠图


class ContractKind(str, Enum):
    """合同/协议类型。"""

    lease = "lease"  # 房屋租赁合同
    purchase = "purchase"  # 房屋买卖合同
    broker = "broker"  # 经纪人协议（通用入口，渲染为房源上架协议主体）
    broker_distributor = "broker_distributor"  # 《平台经纪人分销协议》(客源分销经纪人)
    listing_agent = "listing_agent"  # 《房源经纪人上架房源协议》(房源上架经纪人)


class SignerRole(str, Enum):
    landlord = "landlord"  # 房东/业主
    tenant = "tenant"  # 租客
    agent = "agent"  # 经纪公司/经办
    witness = "witness"


class ContractSource(str, Enum):
    """合同来源：平台生成 / 经纪人上传自有电子合同。"""

    generated = "generated"
    uploaded = "uploaded"


class SignFieldType(str, Enum):
    """签署区字段类型。"""

    signature = "signature"  # 手写签名
    hand_stamp = "hand_stamp"  # 手章/私人印章
    seal = "seal"  # 公司公章
    date = "date"  # 日期


class SignMethod(str, Enum):
    """签署行为所使用的签署方式。"""

    personal_handwrite = "personal_handwrite"  # 个人手写签名
    personal_seal = "personal_seal"  # 个人印章/手章
    company_seal = "company_seal"  # 公司盖章
    date = "date"  # 日期


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
    sign_method: SignMethod = Field(
        default=SignMethod.personal_handwrite, description="该签署方默认签署方式"
    )
    real_name_verified_at: Optional[datetime] = None  # 实名认证完成时间（P3 用）
    real_name_hash: Optional[str] = None  # 证件号 SHA-256（十六进制），避免明文留存
    signed: bool = Field(default=False)
    signed_at: Optional[datetime] = None
    signature: Optional[str] = None  # 签名 SVG / base64
    # 免登录签署链接令牌（未注册客户走此通道）；签署后清空，一次性使用
    sign_token: Optional[str] = Field(default=None, index=True, unique=True)
    sign_token_expires_at: Optional[datetime] = None
    declined_at: Optional[datetime] = None
    decline_reason: Optional[str] = None


class Contract(TimestampMixin, table=True):
    """合同表。"""

    __tablename__ = "contracts"

    # 对外合同编号（如 HT202610000001），由编号服务写入；历史行为 NULL（已回填）
    contract_no: Optional[str] = Field(
        default=None, max_length=32, index=True, description="对外合同编号"
    )
    lease_id: Optional[uuid.UUID] = Field(default=None, foreign_key="leases.id")
    property_id: Optional[uuid.UUID] = Field(default=None, foreign_key="properties.id")
    title: str
    kind: ContractKind = Field(
        default=ContractKind.lease, index=True, description="合同/协议类型"
    )
    source: ContractSource = Field(
        default=ContractSource.generated, index=True, description="平台生成/经纪人上传"
    )
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    language: str = "zh"  # 生成语言
    content_html: str = ""  # 渲染后的合同 HTML
    status: ContractStatus = Field(default=ContractStatus.draft, index=True)
    signed_at: Optional[datetime] = None
    file_path: Optional[str] = None  # 生成的合同文件
    document_hash: Optional[str] = None  # 全文 SHA-256
    # kaifangqian->Python 引擎产物：可签署的合同 PDF 原件、已签署的 PDF 存档
    pdf_path: Optional[str] = Field(default=None, description="引擎生成的合同 PDF 路径")
    signed_pdf_path: Optional[str] = Field(
        default=None, description="引擎完成定位签署后的 PDF 存档路径"
    )
    # 合同原件一次性预览令牌（15 分钟），供无鉴权预览接口取回原始文件
    preview_token: Optional[str] = Field(default=None, index=True, unique=True)
    preview_token_expires_at: Optional[datetime] = None
    counters: Optional[Dict[str, Any]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )


class ContractSignField(TimestampMixin, table=True):
    """合同签署区字段（签字/盖章/日期占位）。

    坐标以文档百分比(0-100)存储，由前端在渲染画面上拖放置入。
    """

    __tablename__ = "contract_sign_fields"

    contract_id: uuid.UUID = Field(foreign_key="contracts.id", index=True)
    party_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="contract_parties.id", index=True
    )  # 归属签署方；None 表示任意签署人可签
    field_type: SignFieldType = Field(default=SignFieldType.signature)
    page: int = 1
    x: float = 0.0
    y: float = 0.0
    w: float = 0.0
    h: float = 0.0
    required: bool = Field(default=True)
    signed: bool = Field(default=False)
    signed_at: Optional[datetime] = None
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")


class SignatureRecord(TimestampMixin, table=True):
    """签名留痕（审计）。"""

    __tablename__ = "signature_records"

    contract_id: uuid.UUID = Field(foreign_key="contracts.id", index=True)
    party_id: uuid.UUID = Field(foreign_key="contract_parties.id")
    field_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="contract_sign_fields.id", index=True
    )
    method: SignMethod = Field(default=SignMethod.personal_handwrite)
    signer_user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    signer_name: str
    signature_svg: Optional[str] = None
    signature_hash: Optional[str] = None
    ip: Optional[str] = None


class SignAsset(TimestampMixin, table=True):
    """个人签名/印章资产库（「我的签名」）。

    - handwrite：手写签名面板生成的签名；seal：印章（系统生成/印模抠图/上传）。
    - 归属当前登录用户，签署时可从本库取用复用。
    """

    __tablename__ = "sign_assets"

    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    name: str
    asset_type: SignAssetType = Field(default=SignAssetType.handwrite)
    source: SignAssetSource = Field(default=SignAssetSource.drew)
    data_url: str  # base64 data URL（PNG），手写签名或印章（透明底）图