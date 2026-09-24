"""收付款路由：支付单管理、发起支付、统一回调、状态查询、退款与对账。

对应设计文档 §7 支付系统设计：
- POST   /payments               创建支付单（租客可创建，含幂等键）
- GET    /payments/channels      可用支付渠道（按币种智能推荐）
- GET    /payments/me            我的付款记录
- POST   /payments/upload        上传付款凭证（旧版兼容）
- POST   /payments/webhook/{channel}  支付结果回调（统一入口，公开）
- GET    /payments/{id}          支付单详情
- GET    /payments/{id}/status   主动查询支付状态并同步
- POST   /payments/{id}/pay      发起支付（生成 checkout_url / QR）
- POST   /payments/{id}/cancel   取消支付单
- POST   /payments/{id}/proof    登记转账凭证
- GET    /payments/{id}/proof-file  读取付款凭证原件（带鉴权）
- POST   /payments/{id}/refund   退款（原路退回 / 线下人工）
- POST   /payments/{id}/late-fee/waive  减免逾期滞纳金（员工及以上）
- GET    /payments/reconciliations  对账统计（Admin）
"""
import mimetypes
import uuid
from datetime import date as date_type, datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import (
    get_current_user,
    get_current_user_allow_query_token,
    require_agent,
    require_admin,
)
from app.core.events import publish_event
from app.core.pagination import Page, PaginationParams, paginate_query
from app.core.payments import payment_bucket
from app.core.csv_export import csv_response
from app.core.uploads import (
    detect_document_mime,
    resolve_stored_path,
    save_upload,
    validate_internal_url,
)
from app.models import (
    Lease,
    Owner,
    Payment,
    PaymentType,
    PaymentStatus,
    Tenant,
    User,
    UserRole,
)
from app.providers.payment.service import payment_service, UnmatchedWebhookError

router = APIRouter(prefix="/payments", tags=["payments"])

# 付款凭证落盘目录（backend/uploads/receipts）。
# 与文档目录同理：该目录不经静态服务托管（main.py 只挂载了 uploads/properties），
# 转账截图含银行账号、金额、户名，不能靠"猜文件名"公网可读，一律经下方
# `GET /payments/{id}/proof-file` 带鉴权分发。
RECEIPT_DIR = Path(__file__).resolve().parents[3] / "uploads" / "receipts"
MAX_RECEIPT_SIZE = 10 * 1024 * 1024  # 单个凭证 10MB
RECEIPT_URL_PREFIX = "/uploads/receipts/"

# 凭证允许的内容类型（按文件头嗅探，扩展名可伪造）
ALLOWED_RECEIPT_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"}
ALLOWED_RECEIPT_CONTAINERS = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
}

# 支付渠道目录（供前端展示与推荐）
CHANNEL_CATALOG: List[dict] = [
    {"channel": "promptpay", "name": "PromptPay QR", "region": "TH", "type": "qr", "fee": "0.5%", "desc": "泰国本地最普及，扫码即时到账"},
    {"channel": "stripe", "name": "Stripe", "region": "INTL", "type": "card", "fee": "2.9% + $0.30", "desc": "Visa/Mastercard/Apple Pay/Google Pay"},
    {"channel": "wechat", "name": "微信支付", "region": "CN", "type": "qr", "fee": "0.6%", "desc": "国内用户首选"},
    {"channel": "alipay", "name": "支付宝", "region": "CN", "type": "qr", "fee": "0.6%", "desc": "国内用户常用"},
    {"channel": "wise", "name": "Wise", "region": "INTL", "type": "bank", "fee": "0.5%", "desc": "跨境银行转账"},
    {"channel": "paypal", "name": "PayPal", "region": "INTL", "type": "wallet", "fee": "3.9% + 固定", "desc": "国际电子钱包"},
    {"channel": "bank_transfer", "name": "银行转账", "region": "ALL", "type": "bank", "fee": "免费", "desc": "线下转账，上传凭证核销"},
]


class PaymentCreate(BaseModel):
    lease_id: Optional[uuid.UUID] = None
    property_id: Optional[uuid.UUID] = None
    payer_id: uuid.UUID
    payee_id: Optional[uuid.UUID] = None
    amount: float = Field(gt=0)
    currency: str = "THB"
    payment_type: PaymentType = PaymentType.rent
    channel: Optional[str] = None
    idempotency_key: Optional[str] = None
    due_date: Optional[datetime] = None
    description: Optional[str] = None


class PayRequest(BaseModel):
    channel: str


class CancelRequest(BaseModel):
    reason: Optional[str] = None


class RefundRequest(BaseModel):
    amount: Optional[float] = None
    reason: str = ""


class ProofRequest(BaseModel):
    receipt_url: str
    channel: Optional[str] = None


class LateFeeWaiveRequest(BaseModel):
    # 不传表示把剩余滞纳金全额减免
    amount: Optional[float] = Field(default=None, gt=0)
    reason: str = ""


class ConfirmRequest(BaseModel):
    """管理端「确认到账」入参。"""

    paid_at: Optional[datetime] = None  # 缺省取当前时间
    note: Optional[str] = None  # 到账备注


class ReconcileRequest(BaseModel):
    """财务「核销」入参。"""

    note: Optional[str] = None


class PaymentChannelItem(BaseModel):
    """可用支付渠道条目（GET /payments/channels 的 items 元素）。"""

    channel: Optional[str] = None
    name: Optional[str] = None
    region: Optional[str] = None
    type: Optional[str] = None
    fee: Optional[str] = None
    desc: Optional[str] = None
    model_config = ConfigDict(extra="allow")


class ChannelsResponse(BaseModel):
    """支付渠道列表响应。"""

    items: Optional[List[PaymentChannelItem]] = None
    recommended: Optional[List[str]] = None
    currency: Optional[str] = None
    model_config = ConfigDict(extra="allow")


class MyPaymentsResponse(BaseModel):
    """我的付款记录响应（items 为 Payment 实例列表）。"""

    items: Optional[List[Payment]] = None
    total: Optional[int] = None
    model_config = ConfigDict(extra="allow")


class ReconciliationGroup(BaseModel):
    """对账聚合条目（按状态或按渠道）。"""

    status: Optional[str] = None
    channel: Optional[str] = None
    count: Optional[int] = None
    amount: Optional[float] = None
    model_config = ConfigDict(extra="allow")


class ReconciliationsResponse(BaseModel):
    """对账统计响应。"""

    by_status: Optional[List[ReconciliationGroup]] = None
    by_channel: Optional[List[ReconciliationGroup]] = None
    model_config = ConfigDict(extra="allow")


class ReceiptRecipient(BaseModel):
    """缴费凭证中的收款方信息。"""

    name: Optional[str] = None
    email: Optional[str] = None
    model_config = ConfigDict(extra="allow")


class PaymentReceiptResponse(BaseModel):
    """缴费凭证（收款收据）响应。"""

    payment_id: Optional[str] = None
    reference_no: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    payment_type: Optional[str] = None
    status: Optional[str] = None
    channel: Optional[str] = None
    channel_transaction_id: Optional[str] = None
    due_date: Optional[str] = None
    paid_at: Optional[str] = None
    created_at: Optional[str] = None
    description: Optional[str] = None
    recipient: Optional[ReceiptRecipient] = None
    property_id: Optional[str] = None
    lease_id: Optional[str] = None
    model_config = ConfigDict(extra="allow")


class InvoiceBillTo(BaseModel):
    """发票抬头信息。"""

    name: Optional[str] = None
    email: Optional[str] = None
    model_config = ConfigDict(extra="allow")


class PaymentInvoiceResponse(BaseModel):
    """税务发票导出数据响应。"""

    invoice_no: Optional[str] = None
    invoice_type: Optional[str] = None
    payment_id: Optional[str] = None
    issue_date: Optional[str] = None
    paid_at: Optional[str] = None
    bill_to: Optional[InvoiceBillTo] = None
    currency: Optional[str] = None
    net_amount: Optional[float] = None
    tax_amount: Optional[float] = None
    vat_rate: Optional[float] = None
    total_amount: Optional[float] = None
    payment_type: Optional[str] = None
    description: Optional[str] = None
    channel: Optional[str] = None
    channel_transaction_id: Optional[str] = None
    property_id: Optional[str] = None
    lease_id: Optional[str] = None
    model_config = ConfigDict(extra="allow")


class PaymentStatusResponse(BaseModel):
    """支付状态查询响应。"""

    ok: Optional[bool] = None
    payment_id: Optional[str] = None
    status: Optional[str] = None
    channel_transaction_id: Optional[str] = None
    error: Optional[str] = None
    model_config = ConfigDict(extra="allow")


def _can_manage(user: User, payment: Payment) -> bool:
    """当前用户是否为支付单的付款方 / 收款方 / 管理端。"""
    if user.id == payment.payer_id or user.id == payment.payee_id:
        return True
    return user.role in (UserRole.admin, UserRole.agent, UserRole.employee)


def _get_payment_or_404(payment_id: uuid.UUID, session: Session) -> Payment:
    payment = session.get(Payment, payment_id)
    if not payment or payment.deleted_at:
        raise HTTPException(status_code=404, detail="Payment not found")
    return payment


def _validate_receipt_url(receipt_url: str) -> str:
    """校验入库的 receipt_url：只接受服务端生成的站内路径。

    此前该字段直接采信调用方传入的任意字符串，既可被写成外部地址用于钓鱼，
    也让「凭证文件」根本不存在于本机。
    """
    return validate_internal_url(receipt_url, RECEIPT_URL_PREFIX, "receipt_url")


def _stored_receipt_path(payment: Payment) -> Path:
    """把落库的 receipt_url 反解为磁盘路径，并确保不逃出凭证目录。"""
    return resolve_stored_path(
        payment.receipt_url or "",
        RECEIPT_DIR,
        RECEIPT_URL_PREFIX,
        url_name="receipt_url",
        not_found_message="Receipt file not found on disk",
    )


def _save_receipt(upload: UploadFile) -> str:
    """校验并落盘付款凭证，返回可供落库的站内路径。

    与文档上传同一套校验链：扩展名白名单 + 文件头魔数（挡住改名伪装）+
    体积上限 + 文件名由服务端生成（不采用客户端文件名，避免穿越与覆盖）。
    """
    return save_upload(
        upload,
        RECEIPT_DIR,
        MAX_RECEIPT_SIZE,
        ALLOWED_RECEIPT_EXTENSIONS,
        {ext: ALLOWED_RECEIPT_CONTAINERS for ext in ALLOWED_RECEIPT_EXTENSIONS},
        detector=detect_document_mime,
        name_prefix="receipt",
        url_prefix=RECEIPT_URL_PREFIX,
        label="receipt",
        supported_text="（支持 JPG / PNG / WEBP / GIF / PDF）",
    )


@router.get("", response_model=Page[Payment])
def list_payments(
    pagination: PaginationParams = Depends(),
    status: Optional[str] = Query(
        None, description="状态筛选；overdue 为派生状态（pending 且已过截止日）"
    ),
    payment_type: Optional[PaymentType] = None,
    lease_id: Optional[uuid.UUID] = None,
    channel: Optional[str] = None,
    date_from: Optional[date_type] = None,
    date_to: Optional[date_type] = None,
    keyword: Optional[str] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """收付款列表（分页），管理端可见全部，其他角色仅见与自己相关的。"""
    conditions = [Payment.deleted_at.is_(None)]
    if user.role not in (UserRole.admin, UserRole.agent, UserRole.employee):
        conditions.append(
            (Payment.payer_id == user.id) | (Payment.payee_id == user.id)
        )
    if status:
        if status == "overdue":
            # 派生状态：待收且已过缴费截止日。这是 SQL 侧筛选（只算 pending），
            # 与 core.payments.payment_bucket 的"逾期"口径（含 failed / 非 refunded）
            # 不同，属既有行为，勿强行对齐。
            conditions.append(
                (Payment.status == PaymentStatus.pending)
                & (Payment.due_date.is_not(None))
                & (Payment.due_date < datetime.utcnow())
            )
        else:
            try:
                conditions.append(Payment.status == PaymentStatus(status))
            except ValueError:
                raise HTTPException(
                    status_code=400, detail=f"Invalid status: {status}"
                )
    if payment_type:
        conditions.append(Payment.payment_type == payment_type)
    if lease_id:
        conditions.append(Payment.lease_id == lease_id)
    if channel:
        conditions.append(Payment.channel == channel)
    if date_from:
        conditions.append(
            Payment.created_at >= datetime.combine(date_from, datetime.min.time())
        )
    if date_to:
        conditions.append(
            Payment.created_at <= datetime.combine(date_to, datetime.max.time())
        )
    if keyword:
        kw = keyword.strip()
        # 按付款方/收款方姓名模糊搜索（租约/合同暂无合同号字段，仅支持人名）
        matched_user_ids = {
            r[0]
            for r in session.exec(
                select(User.id).where(User.full_name.contains(kw))
            ).all()
        }
        if matched_user_ids:
            conditions.append(
                (Payment.payer_id.in_(matched_user_ids))
                | (
                    Payment.payee_id.is_not(None)
                    & Payment.payee_id.in_(matched_user_ids)
                )
            )
        else:
            # 无人名命中 → 空结果
            conditions.append(Payment.id.is_(None))

    stmt = select(Payment).where(*conditions).order_by(Payment.created_at.desc())
    return paginate_query(session, stmt, pagination)


@router.get("/channels", response_model=ChannelsResponse)
def list_channels(
    currency: str = "THB",
    user: User = Depends(get_current_user),
):
    """可用支付渠道列表，并按币种给出推荐排序。

    三端暂无调用方（见 tests/tools_contract_check.py --orphans）：移动端收银台把渠道
    写死在本地，未回服务端取排序。
    """
    order = {
        "THB": ["promptpay", "stripe", "bank_transfer", "wechat", "alipay"],
        "CNY": ["wechat", "alipay", "stripe", "bank_transfer"],
        "USD": ["stripe", "paypal", "wise", "bank_transfer"],
        "EUR": ["stripe", "paypal", "wise"],
    }
    recommended = order.get(currency.upper(), ["stripe", "paypal", "bank_transfer"])

    catalog = {c["channel"]: c for c in CHANNEL_CATALOG}
    items = [catalog[r] for r in recommended if r in catalog]
    # 补齐未推荐但在目录中的渠道
    for c in CHANNEL_CATALOG:
        if c["channel"] not in recommended:
            items.append(c)

    return {"items": items, "recommended": recommended, "currency": currency.upper()}


@router.post("")
def create_payment(
    req: PaymentCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """创建支付单（租客 / 管理端均可，含幂等键防重复下单）。"""
    # 租客只能为自己创建支付单
    if user.role == UserRole.tenant and req.payer_id != user.id:
        raise HTTPException(
            status_code=403, detail="Tenant can only create payment for self"
        )

    # 归属校验：带了租约的支付单必须与调用方相关，否则任意登录用户
    # 都能给别人租约乱开支付单。租客 → 仅本人租约；业主 → 仅本人房源；
    # 员工（admin/agent/employee）视为管理端不受限。
    if req.lease_id:
        lease = session.get(Lease, req.lease_id)
        if lease is None or lease.deleted_at:
            raise HTTPException(status_code=404, detail="Lease not found")
        if user.role not in (UserRole.admin, UserRole.agent, UserRole.employee):
            tenant = session.exec(
                select(Tenant).where(
                    Tenant.id == lease.tenant_id, Tenant.deleted_at.is_(None)
                )
            ).first()
            owner = session.exec(
                select(Owner).where(
                    Owner.id == lease.owner_id, Owner.deleted_at.is_(None)
                )
            ).first()
            is_related = (tenant is not None and tenant.user_id == user.id) or (
                owner is not None and owner.user_id == user.id
            )
            if not is_related:
                raise HTTPException(
                    status_code=403,
                    detail="Not allowed to create payment for this lease",
                )

    data = req.model_dump()
    if not data.get("idempotency_key"):
        data["idempotency_key"] = str(uuid.uuid4())

    # 幂等键复用：相同 key 直接返回已有支付单
    existing = session.exec(
        select(Payment).where(Payment.idempotency_key == data["idempotency_key"])
    ).first()
    if existing:
        return existing

    payment = Payment(**data, status=PaymentStatus.pending)
    session.add(payment)
    try:
        session.commit()
    except IntegrityError:
        # 并发下同一幂等键触发唯一约束冲突：回滚后重查并返回已存在的支付单（幂等）。
        session.rollback()
        existing = session.exec(
            select(Payment).where(Payment.idempotency_key == data["idempotency_key"])
        ).first()
        if existing:
            return existing
        raise
    session.refresh(payment)
    return payment


@router.get("/me", response_model=MyPaymentsResponse)
def list_my_payments(
    payment_type: Optional[PaymentType] = None,
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """当前用户相关的付款记录（可按 payment_type 过滤，分页返回）。

    `total` 为真实总笔数（而非当前页条数），供前端展示完整的分页信息。
    """
    conditions = [
        (Payment.payer_id == user.id) | (Payment.payee_id == user.id),
        Payment.deleted_at.is_(None),
    ]
    if payment_type:
        conditions.append(Payment.payment_type == payment_type)
    total = session.exec(select(func.count(Payment.id)).where(*conditions)).one()
    payments = session.exec(
        select(Payment)
        .where(*conditions)
        .order_by(Payment.created_at.desc(), Payment.id)
        .offset(offset)
        .limit(limit)
    ).all()
    return {"items": payments, "total": total}


@router.post("/upload")
def upload_payment_proof(
    amount: float = Form(...),
    payment_date: str = Form(...),
    payment_method: str = Form("bank_transfer"),
    receipt: Optional[UploadFile] = File(None),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """上传付款凭证（旧版兼容）：创建一条待审核支付记录。

    凭证此前只记了 `receipt.filename`（客户端可随意伪造的名字），文件本身
    从没落盘，「已上传」其实是假的。现在校验后真正写入 uploads/receipts，
    并通过 `GET /payments/{id}/proof-file` 带鉴权读取。
    """
    receipt_url = _save_receipt(receipt) if receipt else None
    payment = Payment(
        payer_id=user.id,
        amount=amount,
        currency="THB",
        payment_type=PaymentType.service_fee,
        status=PaymentStatus.pending,
        channel=payment_method if payment_method != "cash" else "bank_transfer",
        idempotency_key=str(uuid.uuid4()),
        paid_at=datetime.now(),
        due_date=None,
        description=f"凭证上传 {payment_method}",
        receipt_url=receipt_url,
    )
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


@router.post("/webhook/{channel}")
def payment_webhook(
    channel: str,
    payload: dict,
    request: Request,
    session: Session = Depends(get_session),
):
    """支付结果回调统一入口（渠道回调，公开接口）。

    流程：验签 → 定位支付单 → 幂等落库 → 业务流转 → 领域事件。
    签名校验所需请求头（如 Stripe-Signature）由渠道 provider 负责读取。

    幂等口径：`payment_webhook_events` 表 `(channel, transaction_id)` 唯一约束，
    与业务变更同事务提交；重复投递返回 200 `duplicate webhook`。

    状态码约定（渠道据此决定是否重投）：
    - 200：已处理 / 重复投递 / 无需变更
    - 400：验签失败或报文缺引用键（重投无用）
    - 409：**本地暂时匹配不到支付单**（多为回调早于下单落库），渠道应重投。
      返回 2xx 会让这笔支付在本地永久丢失，故必须是非 2xx。

    [刻意保留] 无前端调用方：由支付网关（Stripe/Omise 等）服务端回调，不属于 UI 调用；
    已在契约工具 INTENTIONAL_ORPHANS 登记，不再报警。
    """
    try:
        result = payment_service.handle_webhook(
            session, channel, payload, headers=dict(request.headers)
        )
        return result
    except UnmatchedWebhookError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except PermissionError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/reconciliations", response_model=ReconciliationsResponse)
def payment_reconciliations(
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """对账统计（Admin）：按状态 / 渠道聚合支付单。

    三端暂无调用方（见 tests/tools_contract_check.py --orphans）：Web 财务对账页取的是
    /dashboard/financial-reconciliation，本接口与下面导 CSV 同因未接。
    """
    by_status = session.exec(
        select(Payment.status, func.count(Payment.id), func.sum(Payment.amount))
        .where(Payment.deleted_at.is_(None))
        .group_by(Payment.status)
    ).all()
    by_channel = session.exec(
        select(Payment.channel, func.count(Payment.id), func.sum(Payment.amount))
        .where(Payment.deleted_at.is_(None))
        .group_by(Payment.channel)
    ).all()
    return {
        "by_status": [
            {"status": s, "count": c, "amount": float(a or 0)} for s, c, a in by_status
        ],
        "by_channel": [
            {"channel": ch, "count": c, "amount": float(a or 0)} for ch, c, a in by_channel
        ],
    }


@router.get("/reconciliations/export.csv")
def export_reconciliation_csv(
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """导出对账单明细 CSV（Admin）：与财务对账列表同口径。

    三端暂无调用方（见 tests/tools_contract_check.py --orphans）：同 GET /payments/reconciliations。

    复用财务对账的分桶口径（received / pending / overdue，见 core.payments），
    导出逐笔明细，供线下对账归档。
    """
    now = datetime.now()
    conditions = [Payment.deleted_at.is_(None)]
    payments = session.exec(
        select(Payment).where(*conditions).order_by(Payment.created_at.desc())
    ).all()

    payer_ids = {p.payer_id for p in payments} | {
        p.payee_id for p in payments if p.payee_id
    }
    names = {
        u.id: (u.full_name or u.email)
        for u in session.exec(select(User).where(User.id.in_(payer_ids))).all()
    }

    header = [
        "创建时间", "支付单号", "类型", "金额", "币种", "状态", "对账口径",
        "渠道", "应付日期", "实收日期", "付款方", "收款方", "核销状态", "核销时间",
    ]
    rows = [
        [
            p.created_at.strftime("%Y-%m-%d %H:%M:%S") if p.created_at else "",
            str(p.id),
            p.payment_type.value if p.payment_type else "",
            p.amount,
            p.currency,
            p.status.value if p.status else "",
            payment_bucket(p, now),
            p.channel or "",
            p.due_date.strftime("%Y-%m-%d") if p.due_date else "",
            p.paid_at.strftime("%Y-%m-%d %H:%M:%S") if p.paid_at else "",
            names.get(p.payer_id, ""),
            names.get(p.payee_id, "") if p.payee_id else "",
            p.reconciliation_status or "unreconciled",
            p.reconciled_at.strftime("%Y-%m-%d %H:%M:%S") if p.reconciled_at else "",
        ]
        for p in payments
    ]
    return csv_response(header, rows, f"reconciliations_{now.strftime('%Y%m%d')}.csv")


@router.get("/{payment_id}", response_model=Payment)
def get_payment(
    payment_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """获取付款记录详情。"""
    payment = _get_payment_or_404(payment_id, session)
    if not _can_manage(user, payment):
        raise HTTPException(status_code=403, detail="Access denied")
    return payment


@router.get("/{payment_id}/receipt", response_model=PaymentReceiptResponse)
def get_payment_receipt(
    payment_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """缴费凭证（收款收据）。返回结构化凭证数据，供租客查看/打印/下载。"""
    payment = _get_payment_or_404(payment_id, session)
    if not _can_manage(user, payment):
        raise HTTPException(status_code=403, detail="Access denied")

    payer = session.get(User, payment.payer_id)
    payer_name = payer.full_name if payer else None
    payer_email = payer.email if payer else None

    return {
        "payment_id": str(payment.id),
        "reference_no": payment.idempotency_key,
        "amount": payment.amount,
        "currency": payment.currency,
        "payment_type": payment.payment_type.value if payment.payment_type else None,
        "status": payment.status.value if payment.status else None,
        "channel": payment.channel,
        "channel_transaction_id": payment.channel_transaction_id,
        "due_date": payment.due_date.isoformat() if payment.due_date else None,
        "paid_at": payment.paid_at.isoformat() if payment.paid_at else None,
        "created_at": payment.created_at.isoformat() if payment.created_at else None,
        "description": payment.description,
        "recipient": {"name": payer_name, "email": payer_email},
        "property_id": str(payment.property_id) if payment.property_id else None,
        "lease_id": str(payment.lease_id) if payment.lease_id else None,
    }


@router.get("/{payment_id}/invoice", response_model=PaymentInvoiceResponse)
def get_payment_invoice(
    payment_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """税务发票导出数据（Invoice/Tax Invoice）。返回含税费拆分的结构化发票，
    供打印或下载（前端渲染为 PDF/图片）。"""
    payment = _get_payment_or_404(payment_id, session)
    if not _can_manage(user, payment):
        raise HTTPException(status_code=403, detail="Access denied")

    payer = session.get(User, payment.payer_id)
    # 泰国增值税 7%（THB 默认；不含税或零税率场景按税额 0）
    vat_rate = 0.07
    if payment.currency.upper() == "THB" and payment.payment_type in (
        PaymentType.rent,
        PaymentType.deposit,
        PaymentType.utility,
    ):
        tax = round(payment.amount * vat_rate / (1 + vat_rate), 2)
        net = round(payment.amount - tax, 2)
    else:
        tax = 0.0
        net = payment.amount

    return {
        "invoice_no": payment.idempotency_key,
        "invoice_type": "tax_invoice",
        "payment_id": str(payment.id),
        "issue_date": datetime.utcnow().isoformat(),
        "paid_at": payment.paid_at.isoformat() if payment.paid_at else None,
        "bill_to": {
            "name": payer.full_name if payer else None,
            "email": payer.email if payer else None,
        },
        "currency": payment.currency,
        "net_amount": net,
        "tax_amount": tax,
        "vat_rate": vat_rate if tax else 0,
        "total_amount": payment.amount,
        "payment_type": payment.payment_type.value if payment.payment_type else None,
        "description": payment.description or f"Payment {payment.idempotency_key}",
        "channel": payment.channel,
        "channel_transaction_id": payment.channel_transaction_id,
        "property_id": str(payment.property_id) if payment.property_id else None,
        "lease_id": str(payment.lease_id) if payment.lease_id else None,
    }


@router.get("/{payment_id}/status", response_model=PaymentStatusResponse)
def get_payment_status(
    payment_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """主动向支付渠道查询状态并同步本地。"""
    payment = _get_payment_or_404(payment_id, session)
    if not _can_manage(user, payment):
        raise HTTPException(status_code=403, detail="Access denied")
    return payment_service.query_status(session, payment)


@router.post("/{payment_id}/pay")
def pay_payment(
    payment_id: uuid.UUID,
    req: PayRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """发起支付：调用渠道 provider，返回 checkout_url / QR 码。"""
    payment = _get_payment_or_404(payment_id, session)
    if not _can_manage(user, payment):
        raise HTTPException(status_code=403, detail="Access denied")

    # 已终态的支付单不可再发起
    if payment.status in (
        PaymentStatus.succeeded,
        PaymentStatus.refunded,
        PaymentStatus.expired,
    ):
        raise HTTPException(
            status_code=400, detail=f"Payment already in final state: {payment.status.value}"
        )

    return payment_service.create_order(
        session, payment, req.channel, customer_email=user.email
    )


@router.post("/{payment_id}/cancel")
def cancel_payment(
    payment_id: uuid.UUID,
    req: CancelRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """取消支付单（仅 pending / processing 状态可取消）。"""
    payment = _get_payment_or_404(payment_id, session)
    if not _can_manage(user, payment):
        raise HTTPException(status_code=403, detail="Access denied")
    if payment.status not in (PaymentStatus.pending, PaymentStatus.processing):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel payment in state: {payment.status.value}",
        )
    payment.status = PaymentStatus.expired
    payment.failure_reason = req.reason or "cancelled by user"
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return {"ok": True, "payment_id": str(payment.id), "status": payment.status.value}


@router.post("/{payment_id}/proof")
def submit_payment_proof(
    payment_id: uuid.UUID,
    req: ProofRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """登记转账凭证（线下渠道）：更新 receipt_url，等待管理端审核。

    `receipt_url` 只接受 `/payments/upload` 生成的站内路径，不接受外部地址。
    """
    payment = _get_payment_or_404(payment_id, session)
    if not _can_manage(user, payment):
        raise HTTPException(status_code=403, detail="Access denied")

    payment.receipt_url = _validate_receipt_url(req.receipt_url)
    if req.channel:
        payment.channel = req.channel
    if payment.status not in (
        PaymentStatus.succeeded,
        PaymentStatus.refunded,
    ):
        payment.status = PaymentStatus.pending
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


@router.post("/{payment_id}/confirm")
def confirm_payment(
    payment_id: uuid.UUID,
    req: ConfirmRequest,
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """管理端确认到账：把待确认 / 处理中的线下收款置为已到账。

    适用于「租客上传银行转账凭证后，后台人工核销到账」的场景。确认后写
    核销字段，便于财务对账留痕。
    """
    payment = _get_payment_or_404(payment_id, session)
    if payment.status not in (PaymentStatus.pending, PaymentStatus.processing):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot confirm payment in state: {payment.status.value}",
        )

    payment.status = PaymentStatus.succeeded
    payment.paid_at = req.paid_at or datetime.now()
    payment.channel = payment.channel or "bank_transfer"
    if req.note:
        payment.description = (
            (payment.description + " | ") if payment.description else ""
        ) + req.note
    # 写财务核销字段：确认到账即视为已核销
    payment.reconciled_at = datetime.now()
    payment.reconciled_by = user.id
    payment.reconciliation_status = "reconciled"
    payment.reconciliation_note = req.note or "管理端确认到账"
    # 与 webhook 成功路径对齐：回发到账事件并通知租客/员工
    channel = payment.channel or "bank_transfer"
    payment_service._notify_succeeded(
        session, payment, payment.amount, payment.currency or "THB", channel
    )
    publish_event(
        session,
        "payment.received",
        "payment",
        payment.id,
        {
            "payment_id": str(payment.id),
            "amount": float(payment.amount),
            "currency": payment.currency,
            "channel": channel,
        },
    )
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


@router.post("/{payment_id}/reconcile")
def reconcile_payment(
    payment_id: uuid.UUID,
    req: ReconcileRequest,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """财务核销：标记某一笔应收已核对到账。

    与 confirm 的区别：confirm 会改变收付款状态，reconcile 只改核销状态，
    用于对账时对「已到账/未到账」的单据做财务核对留痕。
    """
    payment = _get_payment_or_404(payment_id, session)
    if payment.status in (
        PaymentStatus.refunded,
        PaymentStatus.expired,
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reconcile payment in state: {payment.status.value}",
        )

    payment.reconciled_at = datetime.now()
    payment.reconciled_by = user.id
    payment.reconciliation_status = "reconciled"
    payment.reconciliation_note = req.note or payment.reconciliation_note
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


@router.get("/{payment_id}/proof-file")
def read_payment_proof(
    payment_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user_allow_query_token),
):
    """读取付款凭证原件（内联返回，供预览/打印使用）。

    receipts 目录不对外静态托管，只能经此端点按支付单权限分发。
    认证支持 `Authorization` 头或 `?token=`（后者供无法设置请求头的
    预览/下载场景兜底，见 `get_current_user_allow_query_token`）。
    """
    payment = _get_payment_or_404(payment_id, session)
    if not _can_manage(user, payment):
        raise HTTPException(status_code=403, detail="Access denied")
    if not payment.receipt_url:
        raise HTTPException(status_code=404, detail="Receipt not found")
    path = _stored_receipt_path(payment)
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(path, media_type=media_type)


@router.post("/{payment_id}/refund")
def refund_payment(
    payment_id: uuid.UUID,
    req: RefundRequest,
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """退款：有渠道交易号原路退回，否则标记线下人工退款。"""
    payment = _get_payment_or_404(payment_id, session)
    try:
        return payment_service.refund(session, payment, amount=req.amount, reason=req.reason)
    except ValueError as e:
        # 退款金额超限等参数错误 → 400（对齐 webhook 端点对 ValueError 的映射）
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{payment_id}/late-fee/waive")
def waive_late_fee(
    payment_id: uuid.UUID,
    req: LateFeeWaiveRequest,
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """减免逾期滞纳金（员工及以上）。

    滞纳金毛额由定时任务按「逾期天数 × 日费率」重算，减免额单独累计在
    `late_fee_waived`，因此减免不会被下一次计提覆盖；不传 amount 表示全额减免。
    """
    payment = _get_payment_or_404(payment_id, session)
    remaining = round(payment.late_fee_accrued - payment.late_fee_waived, 2)
    if remaining <= 0:
        raise HTTPException(
            status_code=400, detail="No late fee to waive for this payment"
        )
    amount = round(req.amount if req.amount is not None else remaining, 2)
    if amount > remaining:
        raise HTTPException(
            status_code=400,
            detail=f"Waive amount {amount} exceeds remaining late fee {remaining}",
        )

    payment.late_fee_waived = round(payment.late_fee_waived + amount, 2)
    session.add(payment)
    publish_event(
        session,
        "payment.late_fee_waived",
        "payment",
        payment.id,
        {
            "amount": amount,
            "reason": req.reason,
            "waived_by": str(user.id),
            "late_fee_accrued": payment.late_fee_accrued,
            "late_fee_waived": payment.late_fee_waived,
        },
    )
    session.commit()
    session.refresh(payment)
    return payment
