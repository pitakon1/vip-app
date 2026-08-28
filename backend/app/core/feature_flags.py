"""Feature Flag 检查器"""
from typing import Optional
from sqlmodel import Session, select
from ..models.feature_flag import FeatureFlag

def is_enabled(session: Session, key: str, user_role: Optional[str] = None) -> bool:
    """检查 feature flag 是否启用"""
    flag = session.exec(
        select(FeatureFlag).where(FeatureFlag.key == key)
    ).first()
    if not flag or not flag.enabled:
        return False
    # 检查目标角色
    if flag.target_roles and user_role:
        if user_role not in flag.target_roles:
            return False
    # TODO: rollout_percentage 检查
    return True
