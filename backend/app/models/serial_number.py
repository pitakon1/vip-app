"""单据编号序列模型。

每 (prefix, period) 维护一个自增游标，编号服务据此生成对外可引用的稳定编号，
如 `FY202610000001`（房源）/ `HT…`（合同）/ `ZL…`（租约）/ `SK…`（收款单）。
"""
from sqlmodel import Field, UniqueConstraint

from .base import TimestampMixin


class SerialNumber(TimestampMixin, table=True):
    """编号序列：按前缀 + 周期分段自增。"""

    __tablename__ = "serial_numbers"
    __table_args__ = (
        UniqueConstraint("prefix", "period", name="uq_serial_prefix_period"),
    )

    prefix: str = Field(max_length=8, index=True, description="单据前缀 FY/HT/ZL/SK")
    period: str = Field(max_length=8, description="编号周期，如 YYYYMM")
    last_value: int = Field(default=0, description="当前周期已用到的最大序号")


__all__ = ["SerialNumber"]
