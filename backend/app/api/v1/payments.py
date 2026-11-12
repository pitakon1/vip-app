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
import json
import mimetypes
import uuid
from datetime import date as date_type, datetime
from pathlib import Path
from typing import Annotated, List, Optional

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
from app.core.payments import (
    UNPAID_PAYMENT_STATUSES,
    bill_bucket,
    payment_bucket,
)
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
from app.providers.payment.base import PaymentChannel
from app.providers.payment.service import payment_service, UnmatchedWebhookError
from app.services.payment_partner import (
    can_view_payment,
    payment_visibility_conditions,
    resolve_payment_partner,
)
from app.services.serial_number import next_no

router = APIRouter(prefix="/payments", tags=["payments"])

# 对外只下发业务字段。`metadata_`（扩展元数据）与 `idempotency_key`（下单判重键）
# 属于内部台账：前者可能夹带渠道原始报文/风控标记，后者是可枚举的幂等凭证，
# 不应出现在任何客户端响应里。
# `deleted_at` 保留：客服/财务排查「这笔单为什么查不到」时要确认是否为软删，
# 且该字段不含敏感信息，保留比再开一个内部接口更简单。
_PAYMENT_INTERNAL_FIELDS = {"metadata_", "idempotency_key"}


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


class MyPaymentsResponse(BaseModel):
    """我的付款记录响应。

    `bucket` 为按 `due_date` 推导的展示分桶（received/pending/overdue/closed）；
    `summary` 与 items 同源计算，前端「列表 / 待缴合计 / 逾期笔数」直接复用，
    避免各端各自手写状态判断导致口径漂移。
    """

    items: Optional[List[dict]] = None
    total: Optional[int] = None
    summary: Optional[dict] = None
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
    """当前用户能否访问该支付单（与列表过滤同一口径）。

    规则集中在 `app.services.payment_partner.can_view_payment`：
    管理员全量；agent/employee 按所属 partner 收窄（未挂 partner 的平台员工保持
    全量）；partner_admin 按所属 partner；业主/租客仅本人 payer/payee 命中的账单。
    支付单 `partner_id` 为空（平台自营/历史无法判定）时，当事人与平台侧仍可读，
    不做直接拒绝，避免存量数据整体 403。
    """
    return can_view_payment(user, payment)


# 员工侧（含合作公司管理员）可以代客发起/取消支付、代传凭证；
# 业主/租客只能操作「自己该付」的账单，收款方（payee）无权发起付款动作。
_STAFF_ROLES = (
    UserRole.admin,
    UserRole.agent,
    UserRole.employee,
    UserRole.partner_admin,
)


def _assert_payer_action(user: User, payment: Payment) -> None:
    """付款类动作的归属校验：非员工必须是该账单的付款方。

    `/payments/me` 对业主收窄为 payee 之后，业主能看到租客的应收账单，
    但这只是「看」，不能点「去支付」。此前 pay/cancel/proof 全走 `_can_manage`，
    payee 业主可以替租客发起支付，属于越权。
    """
    if user.role in _STAFF_ROLES:
        return
    if payment.payer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the payer can pay this bill")


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


@router.get("/summary")
def payments_summary(
    payment_type: Optional[PaymentType] = None,
    channel: Optional[str] = None,
    date_from: Optional[date_type] = None,
    date_to: Optional[date_type] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """收付款全局汇总（不受分页影响）。

    前端统计卡此前只对「当前页」reduce，翻页时已收/待收/逾期金额会跳变。
    这里按筛选条件（类型/渠道/日期）在服务端聚合全量数据。
    状态口径复用 core.payments.payment_bucket，与对账导出一致。
    """
    conditions = [Payment.deleted_at.is_(None)]
    # 与列表/详情同一口径，避免汇总数字与能看到的分页对不上
    conditions.extend(payment_visibility_conditions(session, user))
    if payment_type:
        conditions.append(Payment.payment_type == payment_type)
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

    rows = session.exec(select(Payment).where(*conditions)).all()
    now = datetime.utcnow()
    received_amount = 0.0
    received_count = 0
    pending_amount = 0.0
    pending_count = 0
    overdue_amount = 0.0
    overdue_count = 0
    refund_amount = 0.0
    for p in rows:
        amount = float(p.amount or 0)
        if p.payment_type == PaymentType.refund:
            refund_amount += amount
            continue
        bucket = payment_bucket(p, now)
        if bucket == "received":
            received_amount += amount
            received_count += 1
        elif bucket == "overdue":
            overdue_amount += amount
            overdue_count += 1
        else:
            pending_amount += amount
            pending_count += 1
    return {
        "received_amount": received_amount,
        "received_count": received_count,
        "pending_amount": pending_amount,
        "pending_count": pending_count,
        "overdue_amount": overdue_amount,
        "overdue_count": overdue_count,
        "refund_amount": refund_amount,
        "total": len(rows),
    }


@router.get(
    "",
    response_model=Page[Payment],
    response_model_exclude={"items": {"__all__": _PAYMENT_INTERNAL_FIELDS}},
)
def list_payments(
    pagination: PaginationParams = Depends(),
    status: Optional[str] = Query(
        None,
        description=(
            "状态筛选；overdue 为派生状态（未结清账单 pending/processing 且 "
            "due_date 已过），与工作台「欠租与逾期」同一口径"
        ),
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
    """收付款列表（分页）。可见范围与详情/收据/发票共用同一口径：

    管理员全量；agent/employee 与 partner_admin 按所属合作公司收窄（未挂合作公司
    的平台员工保持全量）；业主/租客仅本人 payer/payee 命中的账单。
    """
    conditions = [Payment.deleted_at.is_(None)]
    conditions.extend(payment_visibility_conditions(session, user))
    if status:
        if status == "overdue":
            # 派生状态：未结清（pending + processing）且已过缴费截止日。
            # 与 dashboard 的 `_OUTSTANDING` / `is_overdue` 完全同源：processing
            # 的账单同样可能逾期，只看 pending 会把工作台显示的欠租在列表里漏掉。
            conditions.append(
                Payment.status.in_(
                    (PaymentStatus.pending, PaymentStatus.processing)
                )
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
        # 注意：select(User.id) 在 SQLModel 下返回的是标量 UUID，不是 Row，
        # 这里必须直接对结果取值；按 r[0] 取值会抛 TypeError 导致 500。
        matched_user_ids = set(
            session.exec(select(User.id).where(User.full_name.contains(kw))).all()
        )
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


@router.post("")
def create_payment(
    req: PaymentCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """创建支付单（租客 / 管理端均可，含幂等键防重复下单）。"""
    # 归属校验：非员工只能为自己创建支付单；带租约的支付单额外要求与租约相关
    # （此前只拦租客，owner 传任意 payer_id 即可给无关用户开虚假缴费单）。
    if (
        user.role not in (UserRole.admin, UserRole.agent, UserRole.employee)
        and req.payer_id != user.id
    ):
        raise HTTPException(
            status_code=403, detail="Non-staff can only create payment for self"
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
    # 归属合作公司由服务端推导，**不接受客户端传值**（否则可伪造归属绕开隔离）。
    # 推导规则见 `app.services.payment_partner.resolve_payment_partner`。
    data["partner_id"] = resolve_payment_partner(
        session,
        payer_id=req.payer_id,
        payee_id=req.payee_id,
        lease_id=req.lease_id,
        property_id=req.property_id,
    )
    if not data.get("idempotency_key"):
        data["idempotency_key"] = str(uuid.uuid4())

    # 幂等键复用：相同 key 直接返回已有支付单
    existing = session.exec(
        select(Payment).where(Payment.idempotency_key == data["idempotency_key"])
    ).first()
    if existing:
        return existing

    # 对外收款单编号（SK+YYYYMM+6 位序号）
    data["receipt_no"] = next_no(session, "SK")
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

    按角色收窄：租客只看自己应付的（payer），业主只看自己应收的（payee）；
    管理/员工侧保留双向可见（需要同时看到本人经手的收付款）。
    这样业主不会在「我的收益」里看到本应由租客支付的账单并点「去支付」。

    `total` 为真实总笔数（而非当前页条数），供前端展示完整的分页信息。
    `bucket` 与 `summary` 均按 `due_date` 同源推导：processing 计入待缴，
    已过截止日的未结清账单计入逾期。
    """
    if user.role == UserRole.tenant:
        party_condition = Payment.payer_id == user.id
    elif user.role == UserRole.owner:
        party_condition = Payment.payee_id == user.id
    else:
        party_condition = (Payment.payer_id == user.id) | (Payment.payee_id == user.id)

    conditions = [party_condition, Payment.deleted_at.is_(None)]
    if payment_type:
        conditions.append(Payment.payment_type == payment_type)

    now = datetime.utcnow()
    # 汇总必须覆盖全部匹配账单（不受分页/limit 影响），与列表同一份数据算出来
    all_payments = session.exec(
        select(Payment)
        .where(*conditions)
        .order_by(Payment.created_at.desc(), Payment.id)
    ).all()
    items = [
        {
            # 软删标记与扩展元数据属于内部台账字段，不下发到 C 端 /
            # 我的账单列表；其余字段保持原样以兼容三端映射。
            **{k: v for k, v in p.model_dump().items() if k not in {"deleted_at", "metadata_"}},
            "bucket": bill_bucket(p, now),
        }
        for p in all_payments[offset : offset + limit]
    ]
    summary = {
        "currency": next((p.currency for p in all_payments if p.currency), "THB"),
        "total_count": len(all_payments),
        "unpaid_count": 0,
        "unpaid_amount": 0.0,
        "pending_count": 0,
        "pending_amount": 0.0,
        "overdue_count": 0,
        "overdue_amount": 0.0,
        "received_count": 0,
        "received_amount": 0.0,
    }
    for p in all_payments:
        bucket = bill_bucket(p, now)
        amount = float(p.amount or 0)
        if bucket == "pending":
            summary["pending_count"] += 1
            summary["pending_amount"] += amount
            summary["unpaid_count"] += 1
            summary["unpaid_amount"] += amount
        elif bucket == "overdue":
            summary["overdue_count"] += 1
            summary["overdue_amount"] += amount
            summary["unpaid_count"] += 1
            summary["unpaid_amount"] += amount
        elif bucket == "received":
            summary["received_count"] += 1
            summary["received_amount"] += amount
    return {
        "items": items,
        "total": len(all_payments),
        "summary": summary,
    }


@router.post("/upload")
def upload_payment_proof(
    amount: Annotated[float, Form(gt=0)],
    payment_method: str = Form("bank_transfer"),
    receipt: Optional[UploadFile] = File(None),
    payment_id: Optional[uuid.UUID] = Form(None),
    payment_type: Optional[PaymentType] = Form(None),
    currency: str = Form("THB"),
    payment_date: Optional[date_type] = Form(None),
    lease_id: Optional[uuid.UUID] = Form(None),
    property_id: Optional[uuid.UUID] = Form(None),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """上传付款凭证。

    两种用法：
    1. 传 `payment_id`：把凭证挂到已有待缴账单上。账单状态 pending → processing
       （已提交待核销），因此待缴汇总会真实减少；金额必须与账单一致，避免
       「10 万账单上传 1 元凭证」冲账。这是租客「上传凭证」的正常路径。
    2. 不传 `payment_id`（旧版兼容）：新建一条付款记录，类型/币种/付款日/租约
       全部来自表单，不再写死 service_fee / THB / now。

    凭证文件校验后真正落盘 uploads/receipts，通过
    `GET /payments/{id}/proof-file` 带鉴权读取。
    """
    receipt_url = _save_receipt(receipt) if receipt else None
    channel = payment_method if payment_method != "cash" else "bank_transfer"
    paid_at = (
        datetime.combine(payment_date, datetime.min.time()).replace(hour=12)
        if payment_date
        else datetime.utcnow()
    )
    cur = (currency or "THB").upper()[:3]

    if payment_id:
        payment = session.get(Payment, payment_id)
        if payment is None or payment.deleted_at:
            raise HTTPException(status_code=404, detail="Payment not found")
        # 与详情/收据同一口径（此前这里引用了不存在的 UserRole.staff，
        # 非付款方上传会直接 AttributeError 500，且员工不受 partner 收窄）
        if not _can_manage(user, payment):
            raise HTTPException(status_code=403, detail="Not allowed to upload proof for this payment")
        _assert_payer_action(user, payment)
        if payment.status in (PaymentStatus.succeeded, PaymentStatus.refunded):
            raise HTTPException(status_code=409, detail="Payment already settled")
        if abs(float(payment.amount) - float(amount)) > 0.01:
            raise HTTPException(
                status_code=400,
                detail="Amount mismatch with the bill; upload the exact outstanding amount",
            )
        payment.receipt_url = receipt_url or payment.receipt_url
        payment.channel = channel
        payment.paid_at = paid_at
        if payment_type:
            payment.payment_type = payment_type
        if currency:
            payment.currency = cur
        if lease_id and payment.lease_id is None:
            payment.lease_id = lease_id
        if property_id and payment.property_id is None:
            payment.property_id = property_id
        # 挂上租约/房源后补齐归属（历史 NULL 单也能被正确收窄）
        if payment.partner_id is None:
            payment.partner_id = resolve_payment_partner(
                session,
                payer_id=payment.payer_id,
                payee_id=payment.payee_id,
                lease_id=payment.lease_id,
                property_id=payment.property_id,
            )
        # 已提交凭证：移出「待缴」口径，等待财务核销
        payment.status = PaymentStatus.processing
        session.add(payment)
        session.commit()
        session.refresh(payment)
        return payment

    # 新建凭证记录：租约能提供业主/房源时一并补齐，业主侧 /payments/me 才看得到
    payee_id: Optional[uuid.UUID] = None
    if lease_id:
        lease = session.get(Lease, lease_id)
        if lease is None or lease.deleted_at:
            raise HTTPException(status_code=404, detail="Lease not found")
        if user.role == UserRole.tenant:
            tenant = session.get(Tenant, lease.tenant_id)
            if tenant is None or tenant.user_id != user.id:
                raise HTTPException(status_code=403, detail="Not your lease")
        property_id = property_id or lease.property_id
        owner = session.get(Owner, lease.owner_id)
        if owner and owner.user_id:
            payee_id = owner.user_id

    payment = Payment(
        receipt_no=next_no(session, "SK"),
        partner_id=resolve_payment_partner(
            session,
            payer_id=user.id,
            payee_id=payee_id,
            lease_id=lease_id,
            property_id=property_id,
        ),
        payer_id=user.id,
        payee_id=payee_id,
        lease_id=lease_id,
        property_id=property_id,
        amount=amount,
        currency=cur,
        # 默认租金而不是服务费：租客上传的绝大多数是租金/押金凭证
        payment_type=payment_type or PaymentType.rent,
        status=PaymentStatus.processing,
        channel=channel,
        idempotency_key=str(uuid.uuid4()),
        paid_at=paid_at,
        due_date=None,
        description=f"凭证上传 {payment_method}",
        receipt_url=receipt_url,
    )
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


@router.post("/webhook/{channel}")
async def payment_webhook(
    channel: str,
    request: Request,
    session: Session = Depends(get_session),
):
    """支付结果回调统一入口（渠道回调，公开接口）。

    流程：验签 → 定位支付单 → 幂等落库 → 业务流转 → 领域事件。
    签名校验所需请求头（如 Stripe-Signature）由渠道 provider 负责读取。

    **原始报文透传**：Stripe 的签名针对原始请求 body 字节，不能拿解析后的
    JSON 重建签名负载（键序/转义不一致会导致真实回调验签失败、到账不入账）。
    这里先读原始字节，再解析出 dict 供业务使用；stripe 渠道把原始字节经
    headers 透传给 provider.verify_webhook（见 stripe_provider.py）。

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
    raw_body = await request.body()
    if channel == PaymentChannel.ALIPAY.value:
        # 支付宝异步通知是 application/x-www-form-urlencoded，不是 JSON；
        # 此前只做 json.loads 必然 400，回调被渠道判死、支付单永久 processing。
        payload = dict(await request.form())
    else:
        try:
            payload = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(status_code=400, detail="Invalid JSON body")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid webhook payload")

    webhook_headers = dict(request.headers)
    if channel == PaymentChannel.STRIPE.value:
        # Stripe 验签针对原始报文字节：透传原字节，供 provider 计算 HMAC
        webhook_headers["_stripe_raw_body"] = raw_body

    try:
        result = payment_service.handle_webhook(
            session, channel, payload, headers=webhook_headers
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
    # 逐笔导出同样设行数上限：报表是给人看的，超限即截断并显式告知，
    # 避免大表全量拉取拖垮内存（口径与 exports.py 的 MAX_ROWS 一致）。
    EXPORT_MAX_ROWS = 50000
    now = datetime.utcnow()
    conditions = [Payment.deleted_at.is_(None)]
    payments = session.exec(
        select(Payment)
        .where(*conditions)
        .order_by(Payment.created_at.desc())
        .limit(EXPORT_MAX_ROWS + 1)
    ).all()
    truncated = len(payments) > EXPORT_MAX_ROWS
    payments = payments[:EXPORT_MAX_ROWS]

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
    resp = csv_response(
        header, rows, f"reconciliations_{now.strftime('%Y%m%d')}.csv"
    )
    if truncated:
        resp.headers["X-Export-Truncated"] = "true"
    return resp


@router.get(
    "/{payment_id}",
    response_model=Payment,
    response_model_exclude=_PAYMENT_INTERNAL_FIELDS,
)
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
        "reference_no": payment.receipt_no or payment.idempotency_key,
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
        "invoice_no": payment.receipt_no or payment.idempotency_key,
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
    _assert_payer_action(user, payment)

    # 已终态的支付单不可再发起
    if payment.status in (
        PaymentStatus.succeeded,
        PaymentStatus.refunded,
        PaymentStatus.expired,
    ):
        raise HTTPException(
            status_code=400, detail=f"Payment already in final state: {payment.status.value}"
        )
    # 支付处理中：重复发起会生成第二个渠道订单，用户若两笔都付即重复扣款
    if payment.status == PaymentStatus.processing:
        raise HTTPException(
            status_code=409,
            detail="Payment is being processed, please wait for the result",
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
    _assert_payer_action(user, payment)
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
    _assert_payer_action(user, payment)

    payment.receipt_url = _validate_receipt_url(req.receipt_url)
    if req.channel:
        payment.channel = req.channel
    # expired（已取消）视为终态：不允许上传凭证把已取消的单复活为待审核
    if payment.status not in (
        PaymentStatus.succeeded,
        PaymentStatus.refunded,
        PaymentStatus.expired,
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
    # 行锁读取：两个管理员并发点「确认到账」时，后到的事务必须等前者提交后
    # 重新看到 succeeded，否则会重复触发到账通知/业务事件（PostgreSQL 生效，
    # SQLite 单写者天然串行）。
    payment = session.exec(
        select(Payment).where(Payment.id == payment_id).with_for_update()
    ).first()
    if not payment or payment.deleted_at:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment.status not in (PaymentStatus.pending, PaymentStatus.processing):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot confirm payment in state: {payment.status.value}",
        )

    payment.status = PaymentStatus.succeeded
    payment.paid_at = req.paid_at or datetime.utcnow()
    payment.channel = payment.channel or "bank_transfer"
    if req.note:
        payment.description = (
            (payment.description + " | ") if payment.description else ""
        ) + req.note
    # 写财务核销字段：确认到账即视为已核销
    payment.reconciled_at = datetime.utcnow()
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

    payment.reconciled_at = datetime.utcnow()
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
    # 行锁：串行化同一支付单的并发退款，保证「累计已退 + 本次 ≤ 原单金额」
    # 的校验与退款落库原子（PostgreSQL 生效；SQLite 无行锁但仅开发环境）。
    locked = session.exec(
        select(Payment).where(Payment.id == payment_id).with_for_update()
    ).first()
    if locked is not None:
        payment = locked
    try:
        result = payment_service.refund(session, payment, amount=req.amount, reason=req.reason)
    except ValueError as e:
        # 退款金额超限等参数错误 → 400（对齐 webhook 端点对 ValueError 的映射）
        raise HTTPException(status_code=400, detail=str(e))
    if not result.get("ok"):
        # 业务拒绝（非 succeeded 单等）→ 400：让前端走错误分支，避免
        # 「200 + ok:false」被前端当成功提示（假成功退款）。
        raise HTTPException(
            status_code=400, detail=result.get("error", "Refund failed")
        )
    return result


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
