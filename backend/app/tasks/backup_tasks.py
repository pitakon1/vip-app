"""每日数据备份 / 同步任务。

每天定时将全库序列化为 .gz JSON（并对 SQLite 开发库额外复制一份 .db），
落盘到 BACKUP_DIR 后记录 BackupJob。生产可挂载盘或对接 MinIO 做远端同步。
"""
from datetime import date

from sqlmodel import Session

from app.celery_app import celery_app
from app.db import engine
from app.models import BackupJob, BackupStatus, BackupType
from app.services.backup_service import snapshot_to_file
from app.config import settings



@celery_app.task(name="daily_backup_sync")
def daily_backup_sync():
    """每天定时全量同步备份。"""
    with Session(engine) as session:
        job = BackupJob(backup_type=BackupType.daily, status=BackupStatus.running)
        session.add(job)
        session.commit()
        session.refresh(job)
        try:
            import datetime as _dt
            from pathlib import Path

            base = Path(settings.BACKUP_DIR)
            base.mkdir(parents=True, exist_ok=True)
            stamp = _dt.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            file = base / f"daily_{stamp}.json.gz"
            snapshot_to_file(session, file)

            # SQLite 开发库额外复制一份 .db
            if settings.DATABASE_URL.startswith("sqlite"):
                db_path = settings.DATABASE_URL.replace("sqlite:///", "")
                import shutil
                if db_path and Path(db_path).exists():
                    shutil.copy2(db_path, base / f"daily_{stamp}.db")

            job.status = BackupStatus.success
            job.file_path = str(file)
            job.size_bytes = file.stat().st_size
            job.backup_date = date.today()
            job.finished_at = _dt.datetime.utcnow()
        except Exception as exc:  # noqa: BLE001
            job.status = BackupStatus.failed
            job.error = str(exc)
            job.finished_at = _dt.datetime.utcnow()
        session.add(job)
        session.commit()
        return {"status": job.status.value, "file_path": job.file_path, "error": job.error}