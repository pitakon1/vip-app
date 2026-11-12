"""合同审批规则匹配与审批单流转（纯业务逻辑，不含 HTTP）。

设计要点：

- **规则配置化**：阈值全部落在 `contract_approval_rules`，运行时读取，
  改阈值只改数据、不改代码；新增对象类型只需给规则表加 `object_type` 行。
- **事实口径统一**：合同的可比数值统一由 `build_contract_facts()` 从
  `contract.counters`、关联租约、房源推导，规则只引用字段名（如 `rent_ratio`），
  避免每条规则各自写一套取数逻辑。
- **命中快照**：审批单保存提交时的规则命中记录与文档哈希，规则后续改阈值、
  合同正文后续被改动，都不会让旧审批「看起来仍然有效」。
- **单级/两级**：命中规则里最高 `approval_level` 即所需层级；
  第 1 级主管通过后进入第 2 级财务/总监，最多两级，不做自由流。
"""
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlmodel import Session, select

from app.core.rbac import (
    CONTRACT_APPROVE_L1,
    CONTRACT_APPROVE_L2,
    get_user_permissions,
)
from app.models import (
    ApprovalObjectType,
    ApprovalRuleOperator,
    Contract,
    ContractApprovalRequest,
    ContractApprovalRule,
    ContractApprovalStatus,
    ContractStatus,
    Lease,
    Property,
    User,
    UserRole,
)

logger = logging.getLogger(__name__)

# 逻辑审批角色 → 独立权限位。
# 平台没有独立的「主管/财务/总监」账号角色，分级改用互不重叠的权限位承载：
#   - L1（主管）= contract.approve.l1
#   - L2（财务/总监）= contract.approve.l2
# 默认只把 L1 授予 employee、L2 授予 admin，因此同一账号默认不可能连批两级。
# 若某角色被显式同时授予两项，则该角色下的账号可以连批两级——这是管理员
# 主动配置的例外，不属于默认行为。
APPROVAL_ROLE_PERMISSIONS: Dict[str, str] = {
    "supervisor": CONTRACT_APPROVE_L1,
    "finance": CONTRACT_APPROVE_L2,
    "director": CONTRACT_APPROVE_L2,
}

# 拒绝审批时给用户看的层级说明（权限位之外的人话标签）
APPROVAL_ROLE_LABELS: Dict[str, str] = {
    "supervisor": "主管（L1）",
    "finance": "财务（L2）",
    "director": "总监（L2）",
}

# 24 小时未处理提醒阈值
APPROVAL_REMIND_HOURS = 24


class ApprovalError(Exception):
    """带业务码的审批错误，由路由层转成 HTTPException。"""

    def __init__(self, code: str, message: str = "", status_code: int = 400):
        super().__init__(message or code)
        self.code = code
        self.message = message or code
        self.status_code = status_code


def _num(value) -> Optional[float]:
    """把 counters 里的数字/数字字符串转 float；空值或非法值返回 None。"""
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _months_between(start: Optional[datetime], end: Optional[datetime]) -> Optional[float]:
    """按 30 天/月估算租期月数；用于规则比较，不参与结算口径。"""
    if not start or not end or end <= start:
        return None
    return round((end - start).days / 30.0, 2)


def build_contract_facts(session: Session, contract: Contract) -> Dict[str, float]:
    """从合同 counters / 租约 / 房源推导规则可用的数值事实。

    显式 counters 优先（合同起草时填写的条款值），缺失时回落到关联租约与房源：
    - `monthly_rent`：月租金
    - `listing_price`：挂牌价（房源月租，Property.monthly_rent）
    - `term_months`：租期月数
    - `deposit`：押金金额
    - `rent_free_days`：免租期天数
    - `rent_ratio`：月租 / 挂牌价 × 100
    - `deposit_months`：押金 / 月租
    - `total_discount_rate`：综合折扣率（含免租期摊薄），百分比
    - `contract_total`：合同总租金（月租 × 租期），用于大额升级判断
    """
    counters = contract.counters or {}
    lease = session.get(Lease, contract.lease_id) if contract.lease_id else None
    property_id = contract.property_id or (lease.property_id if lease else None)
    prop = session.get(Property, property_id) if property_id else None

    monthly_rent = _num(counters.get("monthly_rent"))
    if monthly_rent is None and lease is not None:
        monthly_rent = _num(lease.monthly_rent)

    listing_price = _num(counters.get("listing_price"))
    if listing_price is None and prop is not None:
        listing_price = _num(prop.monthly_rent)

    term_months = _num(counters.get("term_months"))
    if term_months is None and lease is not None:
        term_months = _months_between(lease.start_date, lease.end_date)

    deposit = _num(counters.get("deposit"))
    if deposit is None and lease is not None:
        deposit = _num(lease.deposit_amount)

    rent_free_days = _num(counters.get("rent_free_days")) or 0.0

    facts: Dict[str, float] = {}
    if monthly_rent is not None:
        facts["monthly_rent"] = monthly_rent
    if listing_price is not None:
        facts["listing_price"] = listing_price
    if term_months is not None:
        facts["term_months"] = term_months
    if deposit is not None:
        facts["deposit"] = deposit
    facts["rent_free_days"] = rent_free_days

    if monthly_rent is not None and listing_price:
        facts["rent_ratio"] = monthly_rent / listing_price * 100
    if monthly_rent and deposit is not None:
        facts["deposit_months"] = deposit / monthly_rent
    if monthly_rent is not None and term_months is not None:
        facts["contract_total"] = monthly_rent * term_months

    explicit_discount = _num(counters.get("total_discount_rate"))
    if explicit_discount is None:
        explicit_discount = _num(counters.get("total_discount"))
    if explicit_discount is not None:
        facts["total_discount_rate"] = explicit_discount
    elif monthly_rent is not None and listing_price and term_months:
        # 综合折扣：免租期按 30 天/月摊薄后，与挂牌价比较
        effective_months = term_months + rent_free_days / 30.0
        if effective_months > 0:
            effective_rent = monthly_rent * term_months / effective_months
            facts["total_discount_rate"] = (1 - effective_rent / listing_price) * 100

    return facts


def _compare(value: float, operator: ApprovalRuleOperator, threshold: float, threshold_max: Optional[float]) -> bool:
    """单条规则的数值比较；区间规则缺少上限时不命中（配置不完整不误伤）。"""
    if operator == ApprovalRuleOperator.lt:
        return value < threshold
    if operator == ApprovalRuleOperator.lte:
        return value <= threshold
    if operator == ApprovalRuleOperator.gt:
        return value > threshold
    if operator == ApprovalRuleOperator.gte:
        return value >= threshold
    if operator == ApprovalRuleOperator.eq:
        return value == threshold
    if operator == ApprovalRuleOperator.neq:
        return value != threshold
    if operator == ApprovalRuleOperator.between:
        return threshold_max is not None and threshold <= value <= threshold_max
    if operator == ApprovalRuleOperator.outside:
        return threshold_max is not None and (value < threshold or value > threshold_max)
    return False


def list_rules(
    session: Session,
    *,
    object_type: ApprovalObjectType = ApprovalObjectType.contract,
    enabled_only: bool = True,
) -> List[ContractApprovalRule]:
    query = select(ContractApprovalRule).where(
        ContractApprovalRule.object_type == object_type
    )
    if enabled_only:
        query = query.where(ContractApprovalRule.enabled.is_(True))
    return session.exec(
        query.order_by(ContractApprovalRule.priority, ContractApprovalRule.created_at)
    ).all()


def evaluate(
    session: Session,
    facts: Dict[str, float],
    *,
    object_type: ApprovalObjectType = ApprovalObjectType.contract,
) -> List[Dict[str, Any]]:
    """按优先级匹配规则，返回命中快照（含规则值与实际值）。"""
    hits: List[Dict[str, Any]] = []
    for rule in list_rules(session, object_type=object_type):
        if rule.field not in facts:
            continue
        value = facts[rule.field]
        if not _compare(value, rule.operator, rule.threshold, rule.threshold_max):
            continue
        hits.append(
            {
                "rule_id": str(rule.id),
                "field": rule.field,
                "operator": rule.operator.value,
                "threshold": rule.threshold,
                "threshold_max": rule.threshold_max,
                "value": round(value, 4),
                "approval_role": rule.approval_role,
                "approval_level": rule.approval_level,
                "priority": rule.priority,
                "note": rule.note,
            }
        )
    return hits


def evaluate_contract(session: Session, contract: Contract) -> List[Dict[str, Any]]:
    """匹配合同审批规则；业主本人发起的合同直接返回空（不进入审批流）。"""
    if is_owner_initiated(session, contract):
        return []
    return evaluate(session, build_contract_facts(session, contract))


def is_owner_initiated(session: Session, contract: Contract) -> bool:
    """合同是否由业主本人发起：只看创建人角色，经纪人/员工代拟不算。"""
    if not contract.created_by:
        return False
    creator = session.get(User, contract.created_by)
    return creator is not None and creator.role == UserRole.owner


def levels_from_hits(hits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """把命中规则折叠成层级计划；同级取优先级最高（priority 最小）的审批角色。

    层级始终从 1 连续到最高命中层级：只有第 2 级规则命中时，仍先走第 1 级
    主管，再到第 2 级财务/总监，避免「越级审批」。
    """
    by_level: Dict[int, Dict[str, Any]] = {}
    for hit in sorted(
        hits,
        key=lambda h: (
            h["priority"] if h.get("priority") is not None else 100,
            h.get("rule_id") or "",
        ),
    ):
        level = int(hit.get("approval_level") or 1)
        item = by_level.setdefault(
            level,
            {"level": level, "role": hit.get("approval_role") or "supervisor", "rule_ids": []},
        )
        item["rule_ids"].append(hit.get("rule_id"))
    if not by_level:
        return []
    default_roles = {1: "supervisor", 2: "finance"}
    max_level = max(by_level)
    return [
        by_level.get(level)
        or {
            "level": level,
            "role": default_roles.get(level, "director"),
            "rule_ids": [],
        }
        for level in range(1, max_level + 1)
    ]


def current_role(request: ContractApprovalRequest) -> str:
    """取当前待审层级的审批角色；数据异常时回退到 supervisor。"""
    levels = levels_from_hits(request.rule_hits or [])
    idx = max(1, int(request.current_level or 1)) - 1
    if idx < len(levels):
        return levels[idx]["role"]
    return "supervisor"


def role_permission(role: str) -> Optional[str]:
    """逻辑审批角色对应的权限位；非分层角色返回 None。"""
    return APPROVAL_ROLE_PERMISSIONS.get(role)


def role_user_roles(session: Session, role: str) -> set:
    """把规则里的逻辑角色解析成平台用户角色集合。

    - supervisor / finance / director 走独立权限位：查出当前被授予该权限位的角色；
    - 也兼容规则里直接写 UserRole 值（admin/employee/agent）。
    """
    code = role_permission(role)
    if code is not None:
        from app.models.rbac import RolePermission

        rows = session.exec(
            select(RolePermission).where(RolePermission.permission_code == code)
        ).all()
        return {row.role for row in rows}
    try:
        return {UserRole(role)}
    except ValueError:
        return set()


def eligible_approvers(session: Session, role: str) -> List[User]:
    roles = role_user_roles(session, role)
    if not roles:
        return []
    return session.exec(
        select(User).where(User.role.in_(list(roles)), User.is_active.is_(True))
    ).all()


def is_eligible(session: Session, user: User, role: str) -> bool:
    """当前用户是否具备该层级的审批权限（按权限位判定，不按角色粗放放行）。"""
    code = role_permission(role)
    if code is not None:
        return code in get_user_permissions(session, user)
    return user.role in role_user_roles(session, role)


def not_approver_message(role: str) -> str:
    """层级不符时的明确原因：说清需要哪一级、哪个权限位。"""
    code = role_permission(role)
    label = APPROVAL_ROLE_LABELS.get(role, role)
    if code is not None:
        return f"当前审批层级需要「{label}」权限（{code}），当前账号不具备，无法审批。"
    return f"当前审批层级需要「{role}」角色，当前账号不具备，无法审批。"


def latest_request(session: Session, contract_id: uuid.UUID) -> Optional[ContractApprovalRequest]:
    return session.exec(
        select(ContractApprovalRequest)
        .where(
            ContractApprovalRequest.object_type == ApprovalObjectType.contract,
            ContractApprovalRequest.object_id == contract_id,
        )
        .order_by(ContractApprovalRequest.created_at.desc())
    ).first()


def latest_approved_request(
    session: Session, contract_id: uuid.UUID
) -> Optional[ContractApprovalRequest]:
    return session.exec(
        select(ContractApprovalRequest)
        .where(
            ContractApprovalRequest.object_type == ApprovalObjectType.contract,
            ContractApprovalRequest.object_id == contract_id,
            ContractApprovalRequest.status == ContractApprovalStatus.approved,
        )
        .order_by(ContractApprovalRequest.processed_at.desc())
    ).first()


def submit_contract_for_approval(
    session: Session, contract: Contract, user: User
) -> Dict[str, Any]:
    """提交合同审批：命中规则则建单并进入 pending_approval，否则直接返回无需审批。"""
    if contract.status not in (ContractStatus.draft, ContractStatus.pending_approval):
        raise ApprovalError("CONTRACT_NOT_SUBMITTABLE", "仅草稿合同可提交审批", 409)

    existing = session.exec(
        select(ContractApprovalRequest).where(
            ContractApprovalRequest.object_type == ApprovalObjectType.contract,
            ContractApprovalRequest.object_id == contract.id,
            ContractApprovalRequest.status == ContractApprovalStatus.pending,
        )
    ).all()
    if existing and contract.status == ContractStatus.pending_approval:
        # 幂等：已经在审批中，直接返回当前单，避免重复提交生成多张待审单
        return {
            "requires_approval": True,
            "already_pending": True,
            "approval": serialize_request(session, existing[0], contract=contract),
        }

    hits = evaluate_contract(session, contract)
    if not hits:
        # 未命中：若之前有遗留待审单（例如规则被关闭），一并取消
        _cancel_pending(session, contract.id, user)
        contract.status = ContractStatus.draft
        session.add(contract)
        session.commit()
        return {"requires_approval": False, "approval": None}

    # 重新提交：旧待审单保留历史但标记取消，新提交生成新单
    _cancel_pending(session, contract.id, user)

    levels = levels_from_hits(hits)
    required_level = max(level["level"] for level in levels)
    now = datetime.utcnow()
    request = ContractApprovalRequest(
        object_type=ApprovalObjectType.contract,
        object_id=contract.id,
        status=ContractApprovalStatus.pending,
        submitter_id=user.id,
        submitted_at=now,
        level_started_at=now,
        current_level=1,
        required_level=required_level,
        document_hash=contract.document_hash,
        rule_hits=hits,
        steps=[],
    )
    contract.status = ContractStatus.pending_approval
    session.add(request)
    session.add(contract)
    session.commit()
    session.refresh(request)
    return {
        "requires_approval": True,
        "already_pending": False,
        "approval": serialize_request(session, request, contract=contract),
    }


def _cancel_pending(session: Session, contract_id: uuid.UUID, user: Optional[User]) -> None:
    pending = session.exec(
        select(ContractApprovalRequest).where(
            ContractApprovalRequest.object_type == ApprovalObjectType.contract,
            ContractApprovalRequest.object_id == contract_id,
            ContractApprovalRequest.status == ContractApprovalStatus.pending,
        )
    ).all()
    now = datetime.utcnow()
    for row in pending:
        row.status = ContractApprovalStatus.cancelled
        row.cancelled_at = now
        row.processed_at = now
        session.add(row)


def approve_request(
    session: Session,
    request: ContractApprovalRequest,
    user: User,
    comment: Optional[str] = None,
) -> Dict[str, Any]:
    """审批通过一级；未到最高层级时停在本单等待下一级，否则整单通过。"""
    contract = _require_pending(session, request, user)
    role = current_role(request)
    if not is_eligible(session, user, role):
        raise ApprovalError("NOT_APPROVER", not_approver_message(role), 403)

    now = datetime.utcnow()
    level = int(request.current_level or 1)
    steps = list(request.steps or [])
    steps.append(
        {
            "level": level,
            "role": role,
            "approver_id": str(user.id),
            "approver_name": user.full_name,
            "decision": "approved",
            "comment": (comment or "").strip() or None,
            "at": now.isoformat(),
        }
    )
    request.steps = steps
    request.approver_id = user.id
    request.approver_name = user.full_name
    request.comment = (comment or "").strip() or None
    request.reminded_at = None  # 新层级重新计 24 小时

    if level < int(request.required_level or 1):
        request.current_level = level + 1
        request.level_started_at = now
        session.add(request)
        session.commit()
        return {
            "status": request.status.value,
            "current_level": request.current_level,
            "required_level": request.required_level,
            "contract_status": contract.status.value,
            "approval": serialize_request(session, request, contract=contract),
        }

    request.status = ContractApprovalStatus.approved
    request.processed_at = now
    contract.status = ContractStatus.draft
    session.add(request)
    session.add(contract)
    session.commit()
    return {
        "status": request.status.value,
        "current_level": request.current_level,
        "required_level": request.required_level,
        "contract_status": contract.status.value,
        "approval": serialize_request(session, request, contract=contract),
    }


def reject_request(
    session: Session,
    request: ContractApprovalRequest,
    user: User,
    comment: str,
) -> Dict[str, Any]:
    """驳回：整单退回草稿，意见保留；重新提交会生成新审批单。"""
    contract = _require_pending(session, request, user)
    role = current_role(request)
    if not is_eligible(session, user, role):
        raise ApprovalError("NOT_APPROVER", not_approver_message(role), 403)

    reason = (comment or "").strip()
    if not reason:
        raise ApprovalError("COMMENT_REQUIRED", "驳回必须填写意见")

    now = datetime.utcnow()
    level = int(request.current_level or 1)
    steps = list(request.steps or [])
    steps.append(
        {
            "level": level,
            "role": role,
            "approver_id": str(user.id),
            "approver_name": user.full_name,
            "decision": "rejected",
            "comment": reason,
            "at": now.isoformat(),
        }
    )
    request.steps = steps
    request.status = ContractApprovalStatus.rejected
    request.approver_id = user.id
    request.approver_name = user.full_name
    request.comment = reason
    request.processed_at = now
    contract.status = ContractStatus.draft
    session.add(request)
    session.add(contract)
    session.commit()
    return {
        "status": request.status.value,
        "contract_status": contract.status.value,
        "approval": serialize_request(session, request, contract=contract),
    }


def _require_pending(
    session: Session, request: ContractApprovalRequest, user: User
) -> Contract:
    """审批前置校验：单未处理、非自审、合同存在。"""
    if request.status != ContractApprovalStatus.pending:
        raise ApprovalError("APPROVAL_NOT_PENDING", "审批单已处理", 409)
    if request.submitter_id == user.id:
        # 自审直接拒绝并留痕（由路由层写 failure 审计）
        raise ApprovalError("SELF_APPROVAL_FORBIDDEN", "审批人不得是提交人", 403)
    contract = session.get(Contract, request.object_id)
    if contract is None or contract.deleted_at:
        raise ApprovalError("CONTRACT_NOT_FOUND", "合同不存在", 404)
    return contract


def serialize_request(
    session: Session,
    request: ContractApprovalRequest,
    *,
    contract: Optional[Contract] = None,
    submitter: Optional[User] = None,
) -> Dict[str, Any]:
    """审批单序列化：列表与详情共用，合同摘要可选传入以避免 N+1。"""
    contract = contract or session.get(Contract, request.object_id)
    if submitter is None and request.submitter_id:
        submitter = session.get(User, request.submitter_id)
    return {
        "id": str(request.id),
        "object_type": request.object_type.value,
        "object_id": str(request.object_id),
        "contract_id": str(request.object_id),
        "contract_title": contract.title if contract else None,
        "contract_no": contract.contract_no if contract else None,
        "contract_status": contract.status.value if contract else None,
        "status": request.status.value,
        "submitter_id": str(request.submitter_id),
        "submitter_name": submitter.full_name if submitter else None,
        "submitted_at": request.submitted_at.isoformat() if request.submitted_at else None,
        "current_level": request.current_level,
        "required_level": request.required_level,
        "current_role": current_role(request) if request.status == ContractApprovalStatus.pending else None,
        "levels": levels_from_hits(request.rule_hits or []),
        "rule_hits": request.rule_hits or [],
        "steps": request.steps or [],
        "approver_id": str(request.approver_id) if request.approver_id else None,
        "approver_name": request.approver_name,
        "comment": request.comment,
        "processed_at": request.processed_at.isoformat() if request.processed_at else None,
        "cancelled_at": request.cancelled_at.isoformat() if request.cancelled_at else None,
        "reminded_at": request.reminded_at.isoformat() if request.reminded_at else None,
        "remind_count": request.remind_count or 0,
        "document_hash": request.document_hash,
    }


def approval_required_for_send(
    session: Session, contract: Contract, submitter: Optional[User] = None
) -> Optional[Dict[str, Any]]:
    """发送签署前的审批闸门。

    返回非空表示必须走审批（路由层据此返回 409 APPROVAL_REQUIRED）：
    - 合同处于 pending_approval：直接拦；
    - 命中规则但最新审批未通过：自动补建审批单再拦（前端漏掉「提交审批」也拦得住）；
    - 最新审批已通过但文档哈希已变：视为对新正文未审批，需要重新提交。
    """
    latest = latest_request(session, contract.id)
    hits = evaluate_contract(session, contract)

    if contract.status == ContractStatus.pending_approval:
        if latest is not None and latest.status == ContractApprovalStatus.pending:
            return {**serialize_request(session, latest, contract=contract), "block_reason": "pending"}
        return {"block_reason": "pending", "requirement": hits}

    if not hits:
        return None

    approved = latest_approved_request(session, contract.id)
    if approved is not None and approved.document_hash == contract.document_hash:
        # 规则可能在上次审批后被新增/收紧：当前命中项必须都包含在审批快照里，
        # 否则视为对新规则未审批，需要重新提交。
        approved_hit_ids = {h.get("rule_id") for h in (approved.rule_hits or [])}
        current_hit_ids = {h.get("rule_id") for h in hits}
        if current_hit_ids.issubset(approved_hit_ids):
            return None

    # 需要审批但尚无有效审批：自动建单，保证「命中即不能发送」
    if latest is not None and latest.status == ContractApprovalStatus.pending:
        return {**serialize_request(session, latest, contract=contract), "block_reason": "pending"}
    submitter_id = submitter.id if submitter is not None else contract.created_by
    if submitter_id is None:
        # 无提交人可归（历史/异常数据）：仍拦住发送，由员工手动提交审批
        return {"block_reason": "approval_required", "requirement": hits}
    auto = ContractApprovalRequest(
        object_type=ApprovalObjectType.contract,
        object_id=contract.id,
        status=ContractApprovalStatus.pending,
        submitter_id=submitter_id,
        submitted_at=datetime.utcnow(),
        level_started_at=datetime.utcnow(),
        current_level=1,
        required_level=max(int(h.get("approval_level") or 1) for h in hits),
        document_hash=contract.document_hash,
        rule_hits=hits,
        steps=[],
    )
    contract.status = ContractStatus.pending_approval
    session.add(auto)
    session.add(contract)
    session.commit()
    session.refresh(auto)
    return {**serialize_request(session, auto, contract=contract), "block_reason": "auto_submitted"}
