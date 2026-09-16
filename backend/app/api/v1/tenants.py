"""租客路由：租客个人信息管理。"""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import require_tenant
from app.models import Tenant, User

router = APIRouter(prefix="/tenants", tags=["tenants"])


class TenantUpdate(BaseModel):
    nationality: Optional[str] = None
    employer_info: Optional[Dict[str, Any]] = None
    monthly_income: Optional[float] = None


@router.get("/me", response_model=Tenant)
def get_my_tenant_info(
    session: Session = Depends(get_session),
    user: User = Depends(require_tenant),
):
    """租客个人信息。"""
    tenant = session.exec(
        select(Tenant).where(
            Tenant.user_id == user.id,
            Tenant.deleted_at.is_(None),
        )
    ).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant profile not found")
    return tenant


@router.patch("/me")
def update_my_tenant_info(
    req: TenantUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_tenant),
):
    """更新租客个人信息。"""
    tenant = session.exec(
        select(Tenant).where(
            Tenant.user_id == user.id,
            Tenant.deleted_at.is_(None),
        )
    ).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant profile not found")

    update_data = req.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(tenant, key, value)
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    return tenant
