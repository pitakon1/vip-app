"""PDPA 审计日志记录器"""
from typing import Optional
from sqlmodel import Session
import structlog

logger = structlog.get_logger()

def log_audit(
    session: Session,
    actor_user_id: str,
    action: str,
    resource_type: str,
    resource_id: str,
    pii_fields_accessed: Optional[list] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    request_id: Optional[str] = None,
):
    """记录数据访问审计日志（PDPA §27 合规）"""
    from ..models.pdpa import AuditLog
    import uuid
    
    log_entry = AuditLog(
        id=uuid.uuid4(),
        actor_user_id=actor_user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        pii_fields_accessed=pii_fields_accessed or [],
        ip_address=ip_address,
        user_agent=user_agent,
        request_id=request_id,
    )
    session.add(log_entry)
    session.commit()
    logger.info("audit_log", action=action, resource_type=resource_type, 
                resource_id=resource_id, actor=actor_user_id)
