"""CRM 线索路由：客户线索管理与转化漏斗跟踪。"""
import uuid
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import get_current_user, require_agent
from app.core.events import publish_event
from app.core.pagination import PaginationParams, paginate_query
from app.models import Lead, LeadStage, User

router = APIRouter(prefix="/leads", tags=["leads"])


class LeadCreate(BaseModel):
    name: str
    nationality: Optional[str] = None
    line_id: Optional[str] = None
    wechat_id: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    budget_currency: str = "THB"
    interested_projects: Optional[List[Any]] = None
    recommended_properties: Optional[List[Any]] = None
    stage: LeadStage = LeadStage.inquiring
    assigned_to: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    source: Optional[str] = None


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    nationality: Optional[str] = None
    line_id: Optional[str] = None
    wechat_id: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    budget_currency: Optional[str] = None
    interested_projects: Optional[List[Any]] = None
    recommended_properties: Optional[List[Any]] = None
    stage: Optional[LeadStage] = None
    assigned_to: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    source: Optional[str] = None


@router.get("")
def list_leads(
    pagination: PaginationParams = Depends(),
    stage: Optional[LeadStage] = None,
    assigned_to: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """线索列表（分页，可按 stage 筛选）。"""
    conditions = [Lead.deleted_at.is_(None)]
    if stage:
        conditions.append(Lead.stage == stage)
    if assigned_to:
        conditions.append(Lead.assigned_to == assigned_to)

    stmt = select(Lead).where(*conditions).order_by(Lead.created_at.desc())
    return paginate_query(session, stmt, pagination)


@router.post("")
def create_lead(
    req: LeadCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """创建线索，发布 lead.created 事件。"""
    lead = Lead(**req.model_dump())
    session.add(lead)
    publish_event(
        session,
        "lead.created",
        "lead",
        lead.id,
        {"name": lead.name, "stage": lead.stage.value, "created_by": str(user.id)},
    )
    session.commit()
    session.refresh(lead)
    return lead


@router.get("/{lead_id}")
def get_lead(
    lead_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """获取线索详情。"""
    lead = session.get(Lead, lead_id)
    if not lead or lead.deleted_at:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.patch("/{lead_id}")
def update_lead(
    lead_id: uuid.UUID,
    req: LeadUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """更新线索（含阶段变更），如果 stage 变了发布 lead.stage_changed 事件。"""
    lead = session.get(Lead, lead_id)
    if not lead or lead.deleted_at:
        raise HTTPException(status_code=404, detail="Lead not found")

    old_stage = lead.stage
    update_data = req.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(lead, key, value)

    # 如果阶段变更且与原阶段不同，发布事件
    if "stage" in update_data and update_data["stage"] != old_stage:
        # 如果阶段变为 closed，记录关闭时间
        if update_data["stage"] == LeadStage.closed and not lead.closed_at:
            lead.closed_at = datetime.utcnow()
        publish_event(
            session,
            "lead.stage_changed",
            "lead",
            lead.id,
            {
                "old_stage": old_stage.value if old_stage else None,
                "new_stage": update_data["stage"].value,
                "changed_by": str(user.id),
            },
        )

    session.add(lead)
    session.commit()
    session.refresh(lead)
    return lead
