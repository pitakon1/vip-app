"""电子签合同模型。

根据租约与用户信息自动生成合同（HTML 渲染），由各方数字签名，
生成签名 SVG 与哈希并入库，输出可下载的合同文件。
"""
import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

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
    expired = "expired"  # 超过签署有效期：不再接受签署（定向提示重发）
    revoked = "revoked"  # 人工撤回：未完成签署前由员工撤回，终态且旧签署链接立即失效


class ContractSignOrder(str, Enum):
    """多人签署顺序模式。"""

    parallel = "parallel"  # 并行：任意签署方随时可签
    sequential = "sequential"  # 串行：前序 sign_order 未签完时后序不可签


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
    # 串行签署序号：0=未编排（视为并行）；sequential 模式下按从小到大依次签署
    sign_order: int = Field(default=0, description="签署顺序（0=不限制）")
    # 免登录签署链接令牌（未注册客户走此通道）；签署后清空，一次性使用
    sign_token: Optional[str] = Field(default=None, index=True, unique=True)
    sign_token_expires_at: Optional[datetime] = None
    declined_at: Optional[datetime] = None
    decline_reason: Optional[str] = None
    # 签署催办留痕：累计次数与最近一次时间（同一方 24 小时内不重复催办）
    reminded_count: Optional[int] = Field(default=0)
    last_reminded_at: Optional[datetime] = None


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
    # 最近一次 PDF 定位签章失败的原因（成功签署后清空），用于运维追溯
    last_sign_error: Optional[str] = Field(
        default=None, max_length=500, description="最近一次 PDF 签章失败原因"
    )
    last_sign_error_at: Optional[datetime] = None
    # 合同原件一次性预览令牌（15 分钟），供无鉴权预览接口取回原始文件
    preview_token: Optional[str] = Field(default=None, index=True, unique=True)
    preview_token_expires_at: Optional[datetime] = None
    # 签署有效期：过期后拒绝签署并把状态置 expired（不删除已签留痕）
    expires_at: Optional[datetime] = None
    # 多人签署顺序：parallel（默认）/ sequential
    sign_order_type: ContractSignOrder = Field(default=ContractSignOrder.parallel)
    # 签署完成回调：url 为空表示不回调；secret 用于 HMAC-SHA256 签名请求体
    callback_url: Optional[str] = Field(default=None, max_length=500)
    callback_secret: Optional[str] = Field(default=None, max_length=128)
    counters: Optional[Dict[str, Any]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    # 由模板生成时记录来源与版本快照（模板后续编辑不影响已创建合同）
    template_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="contract_templates.id", index=True
    )
    template_version: Optional[int] = None


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
    # 实际执行签署的账号：本人签署=本人；代签=被授权员工
    signer_user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    signer_name: str
    signature_svg: Optional[str] = None
    signature_hash: Optional[str] = None
    ip: Optional[str] = None
    # 代签留痕：非空表示本条为「员工代签」，值为所依据的授权记录；
    # 为空表示签署方本人签署。验签报告据此区分本人签署与代签。
    proxy_authorization_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="contract_sign_authorizations.id", index=True
    )


class SignAssetScope(str, Enum):
    """签名资产归属范围。"""

    personal = "personal"  # 个人资产：仅本人可见可用
    company = "company"  # 企业印章库：全体员工可见可用


class SignAsset(TimestampMixin, table=True):
    """个人签名/印章资产库（「我的签名」）+ 企业印章库。

    - handwrite：手写签名面板生成的签名；seal：印章（系统生成/印模抠图/上传）。
    - personal：归属当前登录用户；company：企业印章，全体员工共用（仅员工可建）。
    """

    __tablename__ = "sign_assets"

    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    name: str
    asset_type: SignAssetType = Field(default=SignAssetType.handwrite)
    source: SignAssetSource = Field(default=SignAssetSource.drew)
    scope: SignAssetScope = Field(default=SignAssetScope.personal, index=True)
    # 企业印章类别（仅 scope=company 时有意义）：company=公章, contract=合同章, legal_rep=法人章
    seal_type: Optional[str] = Field(default=None, max_length=32)
    data_url: str  # base64 data URL（PNG），手写签名或印章（透明底）图


class ContractCallbackStatus(str, Enum):
    """签署完成回调投递状态。"""

    pending = "pending"  # 已生成、尚未成功投递（可重试）
    delivered = "delivered"  # 对端返回 2xx
    failed = "failed"  # 重试耗尽仍失败（人工重试可再投）


class ContractCallbackEvent(TimestampMixin, table=True):
    """签署完成回调事件（出站 webhook）。

    - `idempotency_key` 唯一：同一合同同一事件只投递一次（重试复用同一行）；
    - `payload` 落请求体快照，重试时按原样重发（避免合同后续变更影响幂等）；
    - `signature` 为 HMAC-SHA256(payload, contract.callback_secret)，对端据此验真。
    """

    __tablename__ = "contract_callback_events"

    contract_id: uuid.UUID = Field(foreign_key="contracts.id", index=True)
    event: str = Field(default="contract.signed", max_length=64)
    url: str = Field(max_length=500)
    payload: Optional[Dict[str, Any]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    idempotency_key: str = Field(max_length=96, index=True, unique=True)
    signature: Optional[str] = Field(default=None, max_length=128)
    status: ContractCallbackStatus = Field(default=ContractCallbackStatus.pending)
    attempts: int = Field(default=0)
    last_error: Optional[str] = Field(default=None, max_length=500)
    last_attempt_at: Optional[datetime] = None
    # 下一次计划重投时间（后台补投任务据此扫描；成功/耗尽后为空）
    next_attempt_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    # 多订阅：该事件归属的订阅（为空表示旧版「合同级单地址」事件，保持原口径）
    subscription_id: Optional[uuid.UUID] = Field(default=None, index=True)


class ContractCallbackSubscription(TimestampMixin, table=True):
    """合同回调订阅（一个合同可挂多个地址，各自独立投递与重试）。

    与 `Contract.callback_url`（旧版单地址）的关系：
    - 未配置任何订阅时，沿用 `callback_url` 单地址路径，行为完全不变；
    - 配置了订阅后，每个订阅各生成一条 `contract_callback_events`，
      `idempotency_key = 合同id:事件#订阅id`，失败互不影响。
    """

    __tablename__ = "contract_callback_subscriptions"

    contract_id: uuid.UUID = Field(foreign_key="contracts.id", index=True)
    url: str = Field(max_length=500)
    label: Optional[str] = Field(default=None, max_length=64)
    active: bool = Field(default=True)
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")


class ContractTemplate(TimestampMixin, table=True):
    """合同模板（可编辑、带版本历史）。

    模板只描述「标题 + 字段表 + 条款」，字段 key 即变量占位符：
    条款里可用 `{{key}}` 引用；生成合同时一次性渲染成正文并落库，
    因此后续改模板不会影响已经创建的合同。
    """

    __tablename__ = "contract_templates"

    name: str = Field(max_length=120)
    kind: ContractKind = Field(default=ContractKind.lease)
    # 适用业务（自由文本，如「住宅租赁」「商业租赁」「二手房买卖」）
    business_scope: Optional[str] = Field(default=None, max_length=64)
    title: str = Field(max_length=200)
    # [{"key": "monthly_rent", "label": "月租金", "default": "8000"}]
    fields: Optional[List[Dict[str, Any]]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    # 条款文本列表，支持 {{key}} 占位符
    clauses: Optional[List[str]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    # 模板内容版本号（与 TimestampMixin.version 的乐观锁无关）
    version_no: int = Field(default=1)
    active: bool = Field(default=True)
    note: Optional[str] = Field(default=None, max_length=255)
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    updated_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")


class ContractTemplateVersion(TimestampMixin, table=True):
    """模板版本快照：每次创建/编辑都留一份不可变副本。"""

    __tablename__ = "contract_template_versions"

    template_id: uuid.UUID = Field(foreign_key="contract_templates.id", index=True)
    version_no: int
    name: str = Field(max_length=120)
    kind: ContractKind = Field(default=ContractKind.lease)
    business_scope: Optional[str] = Field(default=None, max_length=64)
    title: str = Field(max_length=200)
    fields: Optional[List[Dict[str, Any]]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    clauses: Optional[List[str]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    note: Optional[str] = Field(default=None, max_length=255)
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")


class ContractSignAuthorization(TimestampMixin, table=True):
    """代签授权：谁（授权人）授权谁（员工）在什么范围内代签。

    员工代签前必须有覆盖该合同的有效授权，否则拒绝签署：
    - 授权范围：`property_ids`（房源，空=不限）、`contract_kinds`（合同类型，空=不限）、
      `seal_scope`（允许使用的签章方式，空=不限）；
    - 有效期：`valid_from` ~ `valid_until`（`valid_until` 必填）；
    - 可撤销：`revoked_at` 非空后立即失效；
    - 授权凭证：`credential_path`（上传的授权书 / 签署版授权书），供审计追溯。
    """

    __tablename__ = "contract_sign_authorizations"

    grantor_user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    grantee_user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    property_ids: Optional[List[str]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    contract_kinds: Optional[List[str]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    # 允许的签章方式（SignMethod 值集合）；空表示不限
    seal_scope: Optional[List[str]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    valid_from: Optional[datetime] = None
    valid_until: datetime
    revoked_at: Optional[datetime] = None
    revoked_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    # 授权凭证（授权书）站内文件路径
    credential_path: Optional[str] = Field(default=None, max_length=500)
    note: Optional[str] = Field(default=None, max_length=255)
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")


class ContractAuditLog(TimestampMixin, table=True):
    """合同操作审计日志（只追加，不参与业务事务）。

    覆盖合同全生命周期的关键动作：创建、发送/续期、签署、拒签、作废、撤回、
    撤销链接、下载已签件、下载存证报告、权限拒绝。写入失败不得阻断主流程，
    由 `app.services.contract_audit` 统一旁路处理。

    **存量不追溯**：本表只记录上线后发生的操作，历史合同没有对应记录，
    不做任何回填（回填只能凭 `counters` 里的局部留痕推测，会伪造操作人与 IP）。
    """

    __tablename__ = "contract_audit_logs"

    contract_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="contracts.id", index=True
    )
    # 动作标识，如 contract.create / contract.sign / contract.permission_denied
    action: str = Field(max_length=48, index=True)
    # success / failure
    result: str = Field(default="success", max_length=16, index=True)
    # 操作人：站内员工/用户记 user_id，免登录签署方记签署方姓名与 role=signer
    actor_user_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="users.id", index=True
    )
    actor_name: Optional[str] = Field(default=None, max_length=128)
    actor_role: Optional[str] = Field(default=None, max_length=32)
    # 目标对象：合同（后续可扩展 party / sign_field）
    target_type: str = Field(default="contract", max_length=32)
    target_id: Optional[str] = Field(default=None, max_length=64)
    ip: Optional[str] = Field(default=None, max_length=64)
    # 关键参数摘要（已脱敏，禁止写入签名图/正文/证件号）
    detail: Optional[Dict[str, Any]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    error: Optional[str] = Field(default=None, max_length=500)