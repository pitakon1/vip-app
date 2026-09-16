"""数据备份服务。

daily sync：将全库关键表序列化到 BACKUP_DIR，按日期归档。
- 逐表流式写入（不再把整库载入内存），避免库增大后 OOM；
- 备份完成后做一次完整性校验，并按保留期清理历史文件。

生产环境可将 BACKUP_DIR 指向挂载盘或对象存储挂载目录。
"""
import gzip
import json
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List

from sqlmodel import SQLModel, Session, select

from app.config import settings
from app.core.logging import get_logger
from app.models import BackupJob, BackupStatus, BackupType

logger = get_logger(__name__)

# 单表流式读取批次大小
CHUNK_SIZE = 1000
# 历史备份保留天数
DEFAULT_RETENTION_DAYS = 14
# 备份文件校验时读取的字节数
VERIFY_BYTES = 1024
# 超过该时长仍处于 running 的任务视为上次进程中断，标记为 failed
STALE_JOB_MINUTES = 180


def _serialize_row(row: Any) -> Dict[str, Any]:
    # 经 RowMapping 按列名取值：select(Table) 得到的是「无键」Row，
    # 直接 row["列名"] 会退化成 tuple 下标并抛 TypeError。
    mapping = row._mapping
    data = {}
    for col in mapping.keys():
        val = mapping[col]
        if hasattr(val, "isoformat"):
            val = val.isoformat()
        elif hasattr(val, "value"):
            val = val.value
        data[col] = val
    return data


def snapshot_to_file(session: Session, path: Path) -> Path:
    """将全库表流式序列化为 .gz JSON 文件。

    逐表、逐批写入，内存占用与单表批次大小相关，不随库体量增长。
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    written: List[str] = []
    try:
        with gzip.open(path, "wt", encoding="utf-8") as fh:
            fh.write("{")
            first_table = True
            for table in SQLModel.metadata.sorted_tables:
                name = table.name
                if not first_table:
                    fh.write(",")
                first_table = False
                fh.write(json.dumps(name, ensure_ascii=False) + ": [")
                try:
                    # 用 Table 对象而不是 f-string 拼表名：标识符引用（保留字、
                    # 大小写、特殊字符）交给 SQLAlchemy 按方言处理。
                    result = session.execute(select(table))
                except Exception as exc:  # 表不存在时跳过（迁移与模型不同步）
                    logger.warning("backup.skip_table", table=name, error=str(exc))
                    fh.write("]")
                    continue
                first_row = True
                for row in result.yield_per(CHUNK_SIZE):
                    if not first_row:
                        fh.write(",")
                    first_row = False
                    fh.write(
                        json.dumps(_serialize_row(row), ensure_ascii=False, default=str)
                    )
                fh.write("]")
                written.append(name)
            fh.write("}")
    except Exception:
        # 落盘失败时删除半成品，避免留下无法恢复的文件
        path.unlink(missing_ok=True)
        raise
    logger.info("backup.snapshot_written", file=str(path), tables=len(written))
    return path


def verify_backup(path: Path) -> bool:
    """轻量校验：文件可被 gzip 解开且内容是一个 JSON 对象开头。"""
    try:
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            head = fh.read(VERIFY_BYTES)
        return head.lstrip().startswith("{")
    except Exception as exc:  # noqa: BLE001
        logger.error("backup.verify_failed", file=str(path), error=str(exc))
        return False


def prune_old_backups(base: Path, retention_days: int = DEFAULT_RETENTION_DAYS) -> int:
    """清理超过保留期的备份文件，返回删除数量。"""
    if retention_days <= 0:
        return 0
    cutoff = datetime.utcnow() - timedelta(days=retention_days)
    removed = 0
    for pattern in ("backup_*.json.gz", "daily_*.json.gz", "backup_*.db", "daily_*.db"):
        for file in base.glob(pattern):
            try:
                if datetime.fromtimestamp(file.stat().st_mtime) < cutoff:
                    file.unlink()
                    removed += 1
            except OSError as exc:
                logger.warning("backup.prune_failed", file=str(file), error=str(exc))
    if removed:
        logger.info("backup.pruned", removed=removed, retention_days=retention_days)
    return removed


def mark_stale_jobs_failed(session: Session) -> int:
    """把上次进程中断遗留的 running 任务标记为 failed（避免长期假运行状态）。"""
    cutoff = datetime.utcnow() - timedelta(minutes=STALE_JOB_MINUTES)
    stale = session.exec(
        select(BackupJob).where(
            BackupJob.status == BackupStatus.running, BackupJob.started_at < cutoff
        )
    ).all()
    for job in stale:
        job.status = BackupStatus.failed
        job.error = "Interrupted before completion (marked failed on next run)"
        job.finished_at = datetime.utcnow()
        session.add(job)
    if stale:
        session.commit()
        logger.warning("backup.stale_jobs_marked", count=len(stale))
    return len(stale)


def run_backup(
    session: Session,
    backup_type: BackupType,
    retention_days: int | None = None,
) -> BackupJob:
    """执行一次备份并落记录（含完整性校验与历史清理）。"""
    if retention_days is None:
        retention_days = settings.BACKUP_RETENTION_DAYS
    mark_stale_jobs_failed(session)

    job = BackupJob(backup_type=backup_type, status=BackupStatus.running)
    job.started_at = datetime.utcnow()
    session.add(job)
    session.commit()
    session.refresh(job)

    base = Path(settings.BACKUP_DIR)
    try:
        base.mkdir(parents=True, exist_ok=True)
        stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        file = base / f"backup_{stamp}.json.gz"
        snapshot_to_file(session, file)

        if not verify_backup(file):
            raise RuntimeError(f"backup verification failed: {file}")

        # 若为 SQLite 开发库，顺带复制一份 .db 文件（更利于数据还原）
        if settings.DATABASE_URL.startswith("sqlite"):
            db_path = settings.DATABASE_URL.replace("sqlite:///", "")
            if db_path and Path(db_path).exists():
                shutil.copy2(db_path, base / f"backup_{stamp}.db")

        prune_old_backups(base, retention_days)

        job.file_path = str(file)
        job.size_bytes = file.stat().st_size
        job.backup_date = datetime.utcnow().date()
        job.status = BackupStatus.success
        job.finished_at = datetime.utcnow()
        logger.info("backup.completed", file=str(file), size_bytes=job.size_bytes)
    except Exception as exc:
        job.status = BackupStatus.failed
        job.error = str(exc)
        job.finished_at = datetime.utcnow()
        logger.error("backup.failed", error=str(exc))
    session.add(job)
    session.commit()
    session.refresh(job)
    return job