"""管理端审计日志路由：操作留痕查询。

对应设计文档安全与合规（PDPA）章节，管理端可审计谁在何时对何资源
做了何种操作，用于权责追溯与符合性核查。
"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import require_admin
from app.core.pagination import PaginationParams, paginate
from app.models import AuditLog, User

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get("")
def list_audit_logs(
    pagination: PaginationParams = Depends(),
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    actor_user_id: Optional[uuid.UUID] = None,
    start_at: Optional[datetime] = None,
    end_at: Optional[datetime] = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """审计日志列表（仅管理员）。支持按动作/资源类型/操作人/时间窗过滤。"""
    conditions = []
    if action:
        conditions.append(AuditLog.action == action)
    if resource_type:
        conditions.append(AuditLog.resource_type == resource_type)
    if actor_user_id:
        conditions.append(AuditLog.actor_user_id == actor_user_id)
    # occurred_at 为 PII 访问发生时间；时间窗过滤更贴切。
    if start_at:
        conditions.append(AuditLog.occurred_at >= start_at)
    if end_at:
        conditions.append(AuditLog.occurred_at <= end_at)

    stmt = (
        select(AuditLog)
        .where(*conditions)
        .order_by(AuditLog.occurred_at.desc())
    )
    count_stmt = select(func.count(AuditLog.id)).where(*conditions)
    total = session.exec(count_stmt).one()
    items = session.exec(
        stmt.offset(pagination.offset).limit(pagination.limit)
    ).all()

    users = {u.id: u for u in session.exec(select(User)).all()}
    enriched = []
    for log in items:
        actor = users.get(log.actor_user_id)
        enriched.append(
            {
                "id": str(log.id),
                "action": log.action,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "actor_user_id": str(log.actor_user_id) if log.actor_user_id else None,
                "actor_name": actor.full_name if actor else None,
                "actor_email": actor.email if actor else None,
                "pii_fields_accessed": log.pii_fields_accessed,
                "ip_address": log.ip_address,
                "user_agent": log.user_agent,
                "request_id": log.request_id,
                "occurred_at": log.occurred_at.isoformat() if log.occurred_at else None,
            }
        )
    return paginate(enriched, total, pagination)


@router.get("/summary")
def audit_log_summary(
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """审计汇总：按动作与资源类型聚合数量。"""
    by_action = session.exec(
        select(AuditLog.action, func.count(AuditLog.id)).group_by(AuditLog.action)
    ).all()
    by_resource = session.exec(
        select(AuditLog.resource_type, func.count(AuditLog.id)).group_by(
            AuditLog.resource_type
        )
    ).all()
    return {
        "by_action": [{"action": a, "count": c} for a, c in by_action],
        "by_resource": [
            {"resource_type": r, "count": c} for r, c in by_resource
        ],
    }