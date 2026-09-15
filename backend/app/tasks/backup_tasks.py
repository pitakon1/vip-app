"""每日数据备份 / 同步任务。

每天定时复用 `backup_service.run_backup` 执行一次全量备份，
避免与 API 手动备份各维护一套逻辑（此前两处实现已出现行为不一致）。
"""
from sqlmodel import Session

from app.celery_app import celery_app
from app.core.logging import get_logger
from app.db import engine
from app.models import BackupType
from app.services import backup_service

logger = get_logger(__name__)


@celery_app.task(name="daily_backup_sync")
def daily_backup_sync():
    """每天定时全量同步备份（含完整性校验与历史轮转）。"""
    with Session(engine) as session:
        job = backup_service.run_backup(session, BackupType.daily)
        result = {
            "status": job.status.value,
            "file_path": job.file_path,
            "size_bytes": job.size_bytes,
            "error": job.error,
        }
    if result["status"] != "success":
        logger.error("backup.daily_failed", **result)
    return result