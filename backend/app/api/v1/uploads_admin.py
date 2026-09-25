"""上传文件孤儿清理（GC）：扫描 uploads 目录，找出数据库中已无引用的文件。

孤儿文件来源：上传后事务回滚、记录被软删、用户更换头像 / 凭证 / 房产图时
旧文件不会自动删除，长期积累占用磁盘。本接口默认只报告（dry_run），
管理员确认后传 dry_run=false 才真实删除。

安全设计（宁可多留，不可误删）：
- 仅 admin 可调用（require_admin）
- 只处理「符合服务端随机命名模式」（{prefix}_{32位hex}.{ext}，见 core/uploads
  save_upload）的文件；人工手动放入 uploads 目录的文件永不清理
- 引用面覆盖所有已知 /uploads/ 前缀字段（含 JSON 数组与软删记录），
  未被任何记录引用才视为孤儿
- 真实删除必须显式传 dry_run=false，仍会返回已删除清单
"""
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from app.core.auth import require_admin
from app.db import get_session
from app.models import (
    CompanyProfile,
    Developer,
    Document,
    Lease,
    Payment,
    Property,
    User,
)

router = APIRouter(prefix="/uploads", tags=["uploads-admin"])

# uploads 根目录（backend/uploads），与 main.py 的 UPLOAD_DIR 同一目录。
# 不从 main 导入以避免循环依赖（main -> api_router -> 本模块）。
UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads"

# 服务端随机文件名的模式（core/uploads.save_upload 生成 {name_prefix}_{32hex}{ext}）。
# 不匹配该模式的文件视为「人工放置」，永不清理。
_SERVER_NAME_RE = re.compile(r"^[A-Za-z0-9]+_[0-9a-f]{32}\.[A-Za-z0-9]{1,10}$")

# 子目录 -> 引用来源（模型, 字段)。含软删记录（deleted_at 非空）：软删仅表示
# 业务上不可见，历史单据可能被恢复，其附件一律视为仍被引用。
_REFERENCE_FIELDS: Dict[str, List[Tuple[Any, Any]]] = {
    "avatars": [(User, User.avatar_url)],
    "company": [
        (CompanyProfile, CompanyProfile.logo_url),
        (Developer, Developer.logo_url),
    ],
    "documents": [(Document, Document.file_url), (Lease, Lease.contract_url)],
    "receipts": [(Payment, Payment.receipt_url)],
    "properties": [(Property, Property.photos), (Property, Property.video_url)],
}


class UploadsGcResult(BaseModel):
    """清理结果：候选 / 已删除清单按目录分组。"""

    model_config = ConfigDict(extra="allow")

    dry_run: bool
    by_dir: Optional[Dict[str, Dict[str, Any]]] = None
    total_files: Optional[int] = None
    total_size_bytes: Optional[int] = None


def _collect_referenced_names(session: Session) -> Dict[str, set]:
    """收集每个子目录下所有被数据库引用的文件名（含 JSON 数组字段）。"""
    refs: Dict[str, set] = {d: set() for d in _REFERENCE_FIELDS}
    for subdir, fields in _REFERENCE_FIELDS.items():
        for model, column in fields:
            rows = session.exec(
                select(column).where(column.is_not(None))
            ).all()
            for value in rows:
                values = value if isinstance(value, list) else [value]
                for url in values:
                    if (
                        not isinstance(url, str)
                        or not url.startswith(f"/uploads/{subdir}/")
                    ):
                        continue
                    name = url.split("/")[-1]
                    if name:
                        refs[subdir].add(name)
    return refs


def _orphans_in(subdir: str, refs: Dict[str, set]) -> Tuple[List[str], int]:
    """扫描单目录，返回「服务端命名 + 未被引用」的孤儿文件名与字节数。"""
    d = UPLOAD_DIR / subdir
    if not d.is_dir():
        return [], 0
    orphans: List[str] = []
    total = 0
    for f in d.iterdir():
        if not f.is_file() or not _SERVER_NAME_RE.match(f.name):
            continue
        if f.name in refs.get(subdir, set()):
            continue
        total += f.stat().st_size
        orphans.append(f.name)
    return orphans, total


@router.post("/gc", response_model=UploadsGcResult)
def uploads_gc(
    dry_run: bool = True,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    """列出 / 清理上传目录中的孤儿文件。

    - dry_run=true（默认）：只返回候选清单与占用字节，不删除任何文件
    - dry_run=false：真实删除，返回已删除清单

    建议先 dry_run 查看候选，确认无误后再真实删除。
    """
    refs = _collect_referenced_names(session)
    by_dir: Dict[str, Dict[str, Any]] = {}
    total_files = 0
    total_size = 0
    for subdir in sorted(_REFERENCE_FIELDS):
        orphans, size = _orphans_in(subdir, refs)
        removed: List[str] = []
        if not dry_run:
            for name in orphans:
                try:
                    (UPLOAD_DIR / subdir / name).unlink(missing_ok=True)
                    removed.append(name)
                except OSError:
                    removed.append(f"{name} (删除失败)")
        by_dir[subdir] = {
            "candidates": orphans,
            "deleted": removed,
            "size_bytes": size,
        }
        total_files += len(orphans)
        total_size += size
    return {
        "dry_run": dry_run,
        "by_dir": by_dir,
        "total_files": total_files,
        "total_size_bytes": total_size,
    }
