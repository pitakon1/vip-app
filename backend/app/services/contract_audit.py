"""合同操作审计日志写入（旁路，不阻断主流程）。

设计约束：

- **不阻断业务**：审计写入失败时只回滚当前 session（避免脏事务影响后续响应）
  并打 `contract.audit_write_failed` 告警日志，业务结果不受影响；
- **与请求共用 session**：不另开全局 engine 会话，保证测试库（内存 SQLite /
  StaticPool）与部署多库一致；调用点必须放在业务 commit 之后，避免提前提交
  未完成的状态变更；
- **只存摘要**：`detail` 只放关键参数（原因、签署方式、字段数、续期次数等），
  禁止写入签名图、合同正文、证件号等敏感/大体积内容，序列化后截断 2000 字符。

存量不追溯：审计表只记录上线后的操作，历史合同不做回填。
"""
import json
import logging
import uuid
from typing import Any, Dict, Optional

from sqlmodel import Session

from app.models import ContractAuditLog, User

logger = logging.getLogger(__name__)

# 动作标识（与文档中的审计动作清单一一对应）
ACTION_CREATE = "contract.create"
ACTION_SEND = "contract.send"
ACTION_RENEW = "contract.renew"
ACTION_SIGN = "contract.sign"
ACTION_DECLINE = "contract.decline"
ACTION_VOID = "contract.void"
ACTION_REVOKE = "contract.revoke"
ACTION_LINK_ROTATE = "contract.link_rotate"
ACTION_REMIND = "contract.remind"
ACTION_PROXY_SIGN = "contract.proxy_sign"
ACTION_AUTHORIZATION_GRANT = "contract.authorization_grant"
ACTION_AUTHORIZATION_REVOKE = "contract.authorization_revoke"
ACTION_DOWNLOAD_SIGNED = "contract.download_signed"
ACTION_DOWNLOAD_EVIDENCE = "contract.download_evidence"
ACTION_PERMISSION_DENIED = "contract.permission_denied"

# 审计详情上限：防止把大对象（签章图 base64 / 正文）写进审计表
_MAX_DETAIL_CHARS = 2000
_MAX_ERROR_CHARS = 500


def client_ip(request) -> Optional[str]:
    """取真实请求来源 IP：优先反代头，其次直连地址。"""
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for") if request.headers else None
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first[:64]
    client = getattr(request, "client", None)
    host = getattr(client, "host", None)
    return host[:64] if host else None


def _actor_role(actor: Optional[User]) -> Optional[str]:
    role = getattr(actor, "role", None) if actor is not None else None
    if role is None:
        return None
    return role.value if hasattr(role, "value") else str(role)


def _persist(session: Session, entry: ContractAuditLog) -> None:
    """落库审计记录。独立成函数，便于测试注入失败以验证「不阻断主流程」。"""
    session.add(entry)
    session.commit()


def record_contract_audit(
    session: Session,
    *,
    action: str,
    contract_id: Optional[uuid.UUID] = None,
    result: str = "success",
    actor: Optional[User] = None,
    actor_user_id: Optional[uuid.UUID] = None,
    actor_name: Optional[str] = None,
    actor_role: Optional[str] = None,
    request=None,
    ip: Optional[str] = None,
    detail: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
) -> None:
    """记录一条合同审计日志；任何异常都只告警、不向上抛。"""
    try:
        if actor is not None:
            actor_user_id = actor_user_id or actor.id
            actor_name = (
                actor_name
                or getattr(actor, "full_name", None)
                or getattr(actor, "email", None)
            )
            actor_role = actor_role or _actor_role(actor)

        payload = None
        if detail:
            payload = json.loads(
                json.dumps(detail, ensure_ascii=False, default=str)
            )
            raw = json.dumps(payload, ensure_ascii=False)
            if len(raw) > _MAX_DETAIL_CHARS:
                # 超限时降级为截断字符串，保证仍能看出关键参数
                payload = {"_truncated": raw[:_MAX_DETAIL_CHARS]}

        entry = ContractAuditLog(
            contract_id=contract_id,
            action=action,
            result=result if result in ("success", "failure") else "success",
            actor_user_id=actor_user_id,
            actor_name=(actor_name or None) and str(actor_name)[:128],
            actor_role=(actor_role or None) and str(actor_role)[:32],
            target_type="contract",
            target_id=str(contract_id) if contract_id else None,
            ip=(ip or client_ip(request)),
            detail=payload,
            error=(error or None) and str(error)[:_MAX_ERROR_CHARS],
        )
        _persist(session, entry)
    except Exception as exc:  # noqa: BLE001  审计失败不得阻断主流程
        try:
            session.rollback()
        except Exception:  # noqa: BLE001  session 已不可用时忽略
            pass
        logger.error(
            "contract.audit_write_failed",
            extra={
                "action": action,
                "contract_id": str(contract_id) if contract_id else None,
                "error": str(exc),
            },
            exc_info=True,
        )
