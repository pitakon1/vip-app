"""数据备份 / 每日同步模型。"""
from datetime import date as date_type, datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field

from .base import TimestampMixin


class BackupStatus(str, Enum):
    pending = "pending"
    running = "running"
    success = "success"
    failed = "failed"


class BackupType(str, Enum):
    daily = "daily"  # 每日定时同步
    manual = "manual"  # 手动触发


class BackupJob(TimestampMixin, table=True):
    """备份任务表。"""

    __tablename__ = "backup_jobs"

    backup_type: BackupType = Field(default=BackupType.manual, index=True)
    status: BackupStatus = Field(default=BackupStatus.pending, index=True)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    backup_date: Optional[date_type] = None
    size_bytes: Optional[int] = None
    file_path: Optional[str] = None
    error: Optional[str] = None