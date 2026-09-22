"""Feature Flag 检查器。

判定顺序（任一不满足即关闭）：
1. 开关记录存在且 `enabled`
2. 角色命中 `target_roles`（若配置了）
3. 按 `rollout_percentage` 稳定分桶命中

关于分桶：必须**稳定**。同一个用户在同一开关上每次调用都要得到同样结果，
否则用户会经历「刷新一下功能开了、再刷新又没了」。这里用
`sha256("{key}:{user_id}")` 取前 8 位十六进制对 100 取模——纯函数、不依赖随机数、
不依赖进程状态，多 worker 部署下结果一致。
"""
import hashlib
from typing import Optional, Union

from sqlmodel import Session, select

from ..models.feature_flag import FeatureFlag


def _bucket(key: str, user_id: Union[str, int]) -> int:
    """把 (开关 key, 用户 id) 稳定映射到 [0, 100) 区间。"""
    digest = hashlib.sha256(f"{key}:{user_id}".encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 100


def is_enabled(
    session: Session,
    key: str,
    user_role: Optional[str] = None,
    user_id: Optional[Union[str, int]] = None,
) -> bool:
    """检查 feature flag 是否启用。

    参数：
        session: 数据库会话。
        key: 开关标识。
        user_role: 当前用户角色，用于 `target_roles` 判定。
        user_id: 当前用户标识，用于灰度分桶；未提供时只要配了
                 `rollout_percentage < 100` 就一律返回 False（见下方说明）。
    """
    flag = session.exec(select(FeatureFlag).where(FeatureFlag.key == key)).first()
    if not flag or not flag.enabled:
        return False

    # 角色白名单：配了白名单就必须**明确命中**。
    # 此前写的是 `if flag.target_roles and user_role:`——调用方没传 user_role
    # （匿名/定时任务/后台脚本）时这个判断整个被跳过，本该只给指定角色开的开关
    # 会对所有人打开。缺角色时要按「不命中」处理。
    if flag.target_roles:
        if not user_role or user_role not in flag.target_roles:
            return False

    # 灰度比例
    pct = flag.rollout_percentage
    if pct is None or pct >= 100:
        return True
    if pct <= 0:
        return False
    if user_id is None:
        # 没有用户标识就无法稳定分桶。这里选择**不放量**而不是随机放量：
        # 随机会让同一用户在一次会话里反复开关功能，比不开更容易触发故障工单。
        return False
    return _bucket(key, user_id) < pct
