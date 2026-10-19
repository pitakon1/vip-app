"""通用数据字典 API。

- 读接口 `GET /options`、`GET /options/bundle`：**匿名可读**（字典为非敏感枚举，
  C 端「先浏览后注册」的找房页筛选面板需要它；缺失时前端回落硬编码）
- 写接口 `POST/PATCH/DELETE /admin/options`：权限点 `option:manage`

字典用于「前端优先取接口字典、缺失回落硬编码」，所以读接口要足够轻、可缓存。
"""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from app.core.rbac import require_permission
from app.db import get_session
from app.models import OptionItem, User
from app.services import options as options_service

router = APIRouter(tags=["options"])

_SUPPORTED_LANGS = {"zh", "en", "th"}


class OptionOut(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    type: Optional[str] = None
    value: Optional[str] = None
    label: Optional[str] = None
    label_i18n: Optional[dict] = None
    sort: Optional[int] = None
    is_active: Optional[bool] = None
    is_system: Optional[bool] = None


class OptionCreate(BaseModel):
    type: str
    value: str
    label: str = ""
    label_i18n: Optional[dict] = None
    sort: Optional[int] = None
    is_active: Optional[bool] = None


class OptionUpdate(BaseModel):
    label: Optional[str] = None
    label_i18n: Optional[dict] = None
    sort: Optional[int] = None
    is_active: Optional[bool] = None


def _lang(lang: Optional[str]) -> str:
    return lang if lang in _SUPPORTED_LANGS else "zh"


def _serialize(item: OptionItem) -> dict:
    return {
        "id": str(item.id),
        "type": item.type,
        "value": item.value,
        "label": item.label,
        "label_i18n": item.label_i18n or {},
        "sort": item.sort,
        "is_active": item.is_active,
        "is_system": item.is_system,
    }


@router.get("/options", response_model=List[OptionOut])
def list_options(
    type: Optional[str] = Query(default=None, description="按分组过滤"),
    lang: Optional[str] = Query(default=None, description="zh/en/th"),
    active_only: bool = Query(default=True),
    session: Session = Depends(get_session),
):
    """列出字典项（`type` 为空返回全部）。匿名可读。"""
    return options_service.list_options(session, type_=type, active_only=active_only)


@router.get("/options/bundle", response_model=dict)
def options_bundle(
    lang: Optional[str] = Query(default=None, description="zh/en/th"),
    session: Session = Depends(get_session),
):
    """一次性取全部分组：{type: {value: 本地化文案}}。匿名可读。"""
    return options_service.bundle(session, lang=_lang(lang))


@router.post("/admin/options", status_code=201, response_model=OptionOut)
def create_option(
    req: OptionCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("option:manage")),
):
    """新增字典项（幂等：同 (type,value) 已软删则复活）。"""
    type_ = req.type.strip()
    value = req.value.strip()
    if not type_ or not value:
        raise HTTPException(status_code=400, detail="分组与取值必填")
    row = session.exec(
        select(OptionItem).where(
            OptionItem.type == type_, OptionItem.value == value
        )
    ).first()
    if row is not None and row.deleted_at is None:
        raise HTTPException(status_code=409, detail="该字典项已存在")
    if row is None:
        row = OptionItem(
            type=type_,
            value=value,
            label=(req.label or "").strip(),
            label_i18n=req.label_i18n,
            sort=req.sort or 0,
            is_active=True if req.is_active is None else req.is_active,
        )
    else:
        # 复活软删行，避免撞 (type,value) 唯一约束
        row.deleted_at = None
        row.label = (req.label or "").strip()
        row.label_i18n = req.label_i18n
        row.sort = req.sort or 0
        row.is_active = True if req.is_active is None else req.is_active
    session.add(row)
    session.commit()
    session.refresh(row)
    options_service.invalidate_cache()
    return _serialize(row)


@router.patch("/admin/options/{option_id}", response_model=OptionOut)
def update_option(
    option_id: uuid.UUID,
    req: OptionUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("option:manage")),
):
    """更新字典项文案 / 排序 / 启停。"""
    row = session.get(OptionItem, option_id)
    if not row or row.deleted_at:
        raise HTTPException(status_code=404, detail="字典项不存在")
    data = req.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(row, key, value)
    session.add(row)
    session.commit()
    session.refresh(row)
    options_service.invalidate_cache()
    return _serialize(row)


@router.delete("/admin/options/{option_id}")
def delete_option(
    option_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("option:manage")),
):
    """软删除字典项（系统内置项拒绝删除，只能停用）。"""
    row = session.get(OptionItem, option_id)
    if not row or row.deleted_at:
        raise HTTPException(status_code=404, detail="字典项不存在")
    if row.is_system:
        raise HTTPException(status_code=409, detail="系统内置项不可删除，可改为停用")
    from datetime import datetime

    row.deleted_at = datetime.utcnow()
    session.add(row)
    session.commit()
    options_service.invalidate_cache()
    return {"id": str(option_id), "ok": True}
