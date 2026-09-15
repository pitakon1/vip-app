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
- POST   /payments/{id}/refund   退款（原路退回 / 线下人工）
- POST   /payments/{id}/late-fee/waive  减免逾期滞纳金（员工及以上）
- GET    /payments/reconciliations  对账统计（Admin）
"""
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user, require_agent, require_admin
from app.core.events import publish_event
from app.core.pagination import Page, PaginationParams, paginate
from app.models import (
    Payment,
    PaymentType,
    PaymentStatus,
    User,
    UserRole,
)
from app.providers.payment.service import payment_service

router = APIRouter(prefix="/payments", tags=["payments"])

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


@router.get("", response_model=Page[Payment])
def list_payments(
    pagination: PaginationParams = Depends(),
    status: Optional[PaymentStatus] = None,
    payment_type: Optional[PaymentType] = None,
    lease_id: Optional[uuid.UUID] = None,
    channel: Optional[str] = None,
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
        conditions.append(Payment.status == status)
    if payment_type:
        conditions.append(Payment.payment_type == payment_type)
    if lease_id:
        conditions.append(Payment.lease_id == lease_id)
    if channel:
        conditions.append(Payment.channel == channel)

    stmt = select(Payment).where(*conditions).order_by(Payment.created_at.desc())
    count_stmt = select(func.count(Payment.id)).where(*conditions)
    total = session.exec(count_stmt).one()
    items = session.exec(
        stmt.offset(pagination.offset).limit(pagination.limit)
    ).all()
    return paginate(items, total, pagination)


@router.get("/channels")
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


@router.get("/me")
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
    receipt: Optional[UploadFile] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """上传付款凭证（旧版兼容）：创建一条待审核支付记录。

    生产环境应将 receipt 文件上传到对象存储，此处仅记录元数据。
    """
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
        receipt_url=receipt.filename if receipt else None,
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


@router.get("/reconciliations")
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


@router.get("/{payment_id}")
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


@router.get("/{payment_id}/receipt")
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


@router.get("/{payment_id}/invoice")
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


@router.get("/{payment_id}/status")
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
    """登记转账凭证（线下渠道）：更新 receipt_url，等待管理端审核。"""
    payment = _get_payment_or_404(payment_id, session)
    if not _can_manage(user, payment):
        raise HTTPException(status_code=403, detail="Access denied")

    payment.receipt_url = req.receipt_url
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
