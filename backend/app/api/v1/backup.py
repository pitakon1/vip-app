"""数据备份路由。

- POST /backup/run    手动触发一次备份（每日由 Celery 定时任务触发 backup_type=daily）
- GET  /backup/jobs   备份任务记录
"""
from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import require_admin
from app.models import User, BackupJob, BackupType
from app.services import backup_service

router = APIRouter(prefix="/backup", tags=["backup"])


@router.post("/run")
def run_backup(
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    job = backup_service.run_backup(session, BackupType.manual)
    return {
        "id": str(job.id),
        "status": job.status.value,
        "file_path": job.file_path,
        "size_bytes": job.size_bytes,
        "error": job.error,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }


@router.get("/jobs")
def list_jobs(
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    jobs = session.exec(
        select(BackupJob).order_by(BackupJob.created_at.desc()).limit(100)
    ).all()
    return [
        {
            "id": str(j.id),
            "type": j.backup_type.value,
            "status": j.status.value,
            "file_path": j.file_path,
            "size_bytes": j.size_bytes,
            "error": j.error,
            "created_at": j.created_at.isoformat(),
        }
        for j in jobs
    ]