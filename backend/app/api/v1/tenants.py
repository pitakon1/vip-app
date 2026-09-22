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
    """租客个人信息。

    三端暂无调用方（见 tests/tools_contract_check.py --orphans）：租客档案由租约/签约
    流程自动建档，三端都没有「我的资料」页；下面 PATCH 同因。
    """
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
    """更新租客个人信息。

    三端暂无调用方（见 tests/tools_contract_check.py --orphans）：同 GET /tenants/me。
    """
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
