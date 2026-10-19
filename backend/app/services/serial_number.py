"""单据编号生成服务。

统一格式：`{prefix}{period}{seq:0{width}d}`，例如 `FY202610000001`。

**并发安全**：
- PostgreSQL：对 (prefix, period) 序列行 `SELECT … FOR UPDATE` 行锁，串行取号；
- SQLite（开发）：无行锁，靠 (prefix, period) 唯一约束 + `IntegrityError` 重试兜底。

**事务语义**：在同一 session 内「取号 + 建单」一起提交，主单据创建失败会连同
游标一起回滚（不产生空号）；因此调用方应先取号、再构造实体，避免取号时的
重试回滚把已挂起的写入一起冲掉。
"""
from datetime import datetime
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.models import SerialNumber

_MAX_RETRIES = 5


def current_period(now: Optional[datetime] = None) -> str:
    """当前编号周期 `YYYYMM`（UTC）。"""
    now = now or datetime.utcnow()
    return f"{now.year:04d}{now.month:02d}"


def period_of(dt: Optional[datetime]) -> str:
    """由时间戳推导编号周期（回填历史时用行自身的 created_at）。"""
    return current_period(dt or datetime.utcnow())


def format_no(prefix: str, period: str, seq: int, width: int = 6) -> str:
    return f"{prefix}{period}{seq:0{width}d}"


def next_no(
    session: Session, prefix: str, period: Optional[str] = None, width: int = 6
) -> str:
    """取下一个编号并推进游标（同 session 内 flush，随主单据一起提交）。"""
    period = period or current_period()
    dialect = session.get_bind().dialect.name
    for _ in range(_MAX_RETRIES):
        stmt = select(SerialNumber).where(
            SerialNumber.prefix == prefix, SerialNumber.period == period
        )
        if dialect == "postgresql":
            stmt = stmt.with_for_update()
        row = session.exec(stmt).first()
        if row is None:
            row = SerialNumber(prefix=prefix, period=period, last_value=0)
            session.add(row)
            try:
                # 首个并发插入会撞唯一约束：回滚后重试即可
                session.flush()
            except IntegrityError:
                session.rollback()
                continue
        row.last_value = (row.last_value or 0) + 1
        session.add(row)
        session.flush()
        return format_no(prefix, period, row.last_value, width)
    raise RuntimeError(f"生成单据编号失败：{prefix}/{period} 并发冲突重试次数用尽")
