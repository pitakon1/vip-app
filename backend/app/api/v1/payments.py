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
import os
import secrets
import uuid
from datetime import date as date_type, datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
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
from app.core.uploads import HEAD_BYTES, detect_document_mime
from app.models import (
    Payment,
    PaymentType,
    PaymentStatus,
    User,
    UserRole,
)
from app.providers.payment.service import payment_service

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
    amount: float
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
    value = (receipt_url or "").strip()
    if "://" in value or not value.startswith(RECEIPT_URL_PREFIX):
        raise HTTPException(
            status_code=400,
            detail=f"receipt_url must be an internal {RECEIPT_URL_PREFIX} path",
        )
    name = value[len(RECEIPT_URL_PREFIX):]
    if not name or "/" in name or "\\" in name or name in {".", ".."}:
        raise HTTPException(
            status_code=400, detail="receipt_url must not contain directory traversal"
        )
    return value


def _stored_receipt_path(payment: Payment) -> Path:
    """把落库的 receipt_url 反解为磁盘路径，并确保不逃出凭证目录。"""
    url = _validate_receipt_url(payment.receipt_url or "")
    path = (RECEIPT_DIR / url[len(RECEIPT_URL_PREFIX):]).resolve()
    if RECEIPT_DIR.resolve() not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Receipt file not found on disk")
    return path


def _save_receipt(upload: UploadFile) -> str:
    """校验并落盘付款凭证，返回可供落库的站内路径。

    与文档上传同一套校验链：扩展名白名单 + 文件头魔数（挡住改名伪装）+
    体积上限 + 文件名由服务端生成（不采用客户端文件名，避免穿越与覆盖）。
    """
    original_name = upload.filename or "receipt"
    ext = os.path.splitext(original_name)[1].lower()
    if ext not in ALLOWED_RECEIPT_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported receipt type: {ext or 'none'}"
                "（支持 JPG / PNG / WEBP / GIF / PDF）"
            ),
        )
    head = upload.file.read(HEAD_BYTES)
    upload.file.seek(0)
    detected = detect_document_mime(head)
    if detected not in ALLOWED_RECEIPT_CONTAINERS:
        raise HTTPException(
            status_code=400,
            detail=f"File content does not match its extension: {original_name}",
        )

    RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"receipt_{secrets.token_hex(16)}{ext}"
    dest = RECEIPT_DIR / filename
    size = 0
    try:
        with dest.open("wb") as buffer:
            while True:
                chunk = upload.file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_RECEIPT_SIZE:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "File too large (max "
                            f"{MAX_RECEIPT_SIZE // (1024 * 1024)}MB)"
                        ),
                    )
                buffer.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    except Exception:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Failed to save receipt")
    return f"{RECEIPT_URL_PREFIX}{filename}"


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
            # 派生状态：待收且已过缴费截止日（与 dashboard/employees 口径一致）
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
    """可用支付渠道列表，并按币种给出推荐排序。"""
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
    session.commit()
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

    流程：验签 → 幂等检查 → 解析 → 落库 → 触发业务事件。
    签名校验所需请求头（如 Stripe-Signature）由渠道 provider 负责读取。
    """
    try:
        result = payment_service.handle_webhook(
            session, channel, payload, headers=dict(request.headers)
        )
        return result
    except PermissionError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/reconciliations", response_model=ReconciliationsResponse)
def payment_reconciliations(
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """对账统计（Admin）：按状态 / 渠道聚合支付单。"""
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
    return payment_service.refund(session, payment, amount=req.amount, reason=req.reason)


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
