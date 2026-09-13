"""数据备份服务。

daily sync：将全库关键表序列化到 BACKUP_DIR，按日期归档。
生产环境可将 BACKUP_DIR 指向挂载盘或对接 MinIO 后同步远端。
"""
import gzip
import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from sqlalchemy import text
from sqlmodel import SQLModel, Session

from app.config import settings
from app.models import BackupJob, BackupStatus, BackupType


def _serialize_row(row: Any) -> Dict[str, Any]:
    data = {}
    for col in row._mapping.keys():
        val = row[col]
        if hasattr(val, "isoformat"):
            val = val.isoformat()
        elif hasattr(val, "value"):
            val = val.value
        data[col] = val
    return data


def snapshot_to_file(session: Session, path: Path) -> Path:
    """将全库表序列化为.gz JSON 文件。"""
    snapshot: Dict[str, list] = {}
    for table in SQLModel.metadata.sorted_tables:
        model = table.name
        try:
            rows = session.execute(text(f"SELECT * FROM {model}")).all()
        except Exception as exc:  # 表不存在时跳过
            print("backup skip", model, exc)
            continue
        snapshot[model] = [_serialize_row(r) for r in rows]
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        json.dump(snapshot, fh, ensure_ascii=False, default=str)
    return path


def run_backup(session: Session, backup_type: BackupType) -> BackupJob:
    """执行一次备份并落记录。"""
    job = BackupJob(backup_type=backup_type, status=BackupStatus.running)
    job.started_at = datetime.utcnow()
    session.add(job)
    session.commit()
    session.refresh(job)
    try:
        base = Path(settings.BACKUP_DIR)
        base.mkdir(parents=True, exist_ok=True)
        stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        file = base / f"backup_{stamp}.json.gz"
        snapshot_to_file(session, file)

        # 若为 SQLite 开发库，顺带复制一份 .db 文件（更利于数据还原）
        if settings.DATABASE_URL.startswith("sqlite"):
            db_path = settings.DATABASE_URL.replace("sqlite:///", "")
            if db_path and Path(db_path).exists():
                shutil.copy2(db_path, base / f"backup_{stamp}.db")

        job.file_path = str(file)
        job.size_bytes = file.stat().st_size
        job.backup_date = datetime.utcnow().date()
        job.status = BackupStatus.success
        job.finished_at = datetime.utcnow()
    except Exception as exc:
        job.status = BackupStatus.failed
        job.error = str(exc)
        job.finished_at = datetime.utcnow()
    session.add(job)
    session.commit()
    session.refresh(job)
    return job