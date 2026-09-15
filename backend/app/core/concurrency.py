"""乐观锁支持。

`TimestampMixin` 提供 `version` 字段，但此前没有任何地方维护它：新建时为 1，
之后永远为 1，等于形同虚设。这里做两件事：

1. `install_version_bumper()`：注册全局 `before_update` 事件，
   任何 UPDATE 都把 `version` 自增 1（只有整数型 `version` 列参与，
   例如 ComplianceDoc / PrivacyPolicyVersion 的字符串版本号不会被误改）。
2. `ensure_version()`：客户端可选的并发校验。请求体带上自己读到的
   `version` 时，服务端比对不一致即返回 409，避免"后写覆盖先写"。

两者都是非破坏性的：客户端不传 `version` 时行为与之前完全一致。
"""
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import Integer
from sqlalchemy.event import listen
from sqlalchemy.orm import Mapper


def _int_version_column(target: Any):
    """取出目标对象映射的 `version` 列，且仅当它是整数型（乐观锁列）。"""
    mapper = getattr(target, "__mapper__", None)
    if mapper is None or "version" not in mapper.columns:
        return None
    column = mapper.columns["version"]
    return column if isinstance(column.type, Integer) else None


def _bump_version(mapper: Mapper, connection: Any, target: Any) -> None:
    """UPDATE 前自增版本号。"""
    if _int_version_column(target) is None:
        return
    target.version = (target.version or 0) + 1


def install_version_bumper() -> None:
    """注册全局版本号自增事件（重复调用无副作用）。"""
    listen(Mapper, "before_update", _bump_version)


def ensure_version(obj: Any, expected: Optional[int], name: str = "record") -> None:
    """客户端传入 `version` 时做并发校验，不传则跳过。

    不一致说明该记录在客户端读取之后已被他人修改，返回 409 而不是静默覆盖。
    """
    if expected is None or _int_version_column(obj) is None:
        return
    if int(obj.version or 0) != int(expected):
        raise HTTPException(
            status_code=409,
            detail=(
                f"{name} 已被其他操作修改（当前版本 {obj.version}，"
                f"提交版本 {expected}），请刷新后重试"
            ),
        )