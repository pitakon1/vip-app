"""合同相关个人信息的脱敏与发起方最小联系信息。

站内合同详情（`api/v1/contracts.py`）与免登录签署页
（`api/v1/contract_sign_public.py`）共用这一份口径，避免两处各写一套
脱敏规则导致对外暴露不一致。

口径（见 docs/e-sign-change-proposal.md C-03B）：
- 姓名：保留首尾字符，中间以 `*` 代替；两字姓名保留首字；单字原样。
- 手机号：11 位保留前 3 后 4（`13812341234` → `138****1234`）；
  非 11 位（国际号/座机）只保留后 4 位并前置 `****`；空值返回 None。
- 发起方只取 `full_name` / `phone`，**不返回完整号码、邮箱或其它账号字段**。
"""
import re
from typing import Optional

from sqlmodel import Session

from app.models import Contract, User


def mask_person_name(name: Optional[str]) -> str:
    """姓名脱敏：保留首尾字符，中间以 * 代替。"""
    value = (name or "").strip()
    if len(value) <= 1:
        return value or "*"
    if len(value) == 2:
        return value[0] + "*"
    return value[0] + "*" * (len(value) - 2) + value[-1]


def mask_phone(phone: Optional[str]) -> Optional[str]:
    """手机号脱敏：11 位保留前 3 后 4，其它长度只留后 4 位；空值 None。"""
    digits = re.sub(r"\D", "", phone or "")
    if not digits:
        return None
    if len(digits) == 11:
        return f"{digits[:3]}****{digits[-4:]}"
    return "****" + digits[-4:]


def initiator_contact(session: Session, contract: Contract) -> dict:
    """该合同发起方的最小联系信息（姓名脱敏 + 手机号脱敏）。

    缺发起人或对应字段为空时返回 None，**不用邮箱/角色名兜底**。
    """
    user = session.get(User, contract.created_by) if contract.created_by else None
    if user is None:
        return {"initiator_name": None, "initiator_phone_masked": None}
    name = (user.full_name or "").strip()
    return {
        "initiator_name": mask_person_name(name) if name else None,
        "initiator_phone_masked": mask_phone(user.phone),
    }
