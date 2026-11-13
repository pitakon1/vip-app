"""租约合同编号生成。

编号规则集中在 `CONTRACT_NO_*` 常量与 `format_contract_no()` 里：
`HT-YYYYMMDD-NNNN`（前缀 + 日期 + 当日流水，流水按日递增）。
后续要改格式（前缀/分隔符/流水位数）只改本文件即可，调用方不感知。

并发与事务语义复用 `serial_number` 服务：同一 session 内「取号 + 建单」
一起提交，取号行冲突时自动重试，SQLite 靠 (prefix, period) 唯一约束兜底。
"""
from datetime import datetime
from typing import Optional

from sqlmodel import Session

from app.services.serial_number import next_seq

# 合同编号前缀与当日流水位数
CONTRACT_NO_PREFIX = "HT"
CONTRACT_NO_SEQ_WIDTH = 4


def format_contract_no(day: str, seq: int) -> str:
    """按「前缀-日期-流水」拼出合同编号。"""
    return f"{CONTRACT_NO_PREFIX}-{day}-{seq:0{CONTRACT_NO_SEQ_WIDTH}d}"


def generate_contract_no(
    session: Session, when: Optional[datetime] = None
) -> str:
    """生成下一个合同编号（取号会推进当日游标，随主单据一起提交）。"""
    when = when or datetime.utcnow()
    day = when.strftime("%Y%m%d")
    return format_contract_no(day, next_seq(session, CONTRACT_NO_PREFIX, day))
