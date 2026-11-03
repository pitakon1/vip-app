"""CRM 线索路由：客户线索管理与转化漏斗跟踪。"""
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import STAFF_ROLES, get_current_user, require_agent, require_employee
from app.core.events import publish_event
from app.core.pagination import Page, PaginationParams, paginate_query
from app.models import Employee, Lead, LeadStage, User, UserRole

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
    requirement: Optional[str] = None


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
    requirement: Optional[str] = None


class LeadListOut(Page[Lead]):
    """线索列表响应：在标准分页结构上新增 `stage_counts`（不改既有字段/分页结构）。

    `stage_counts` 按「当前筛选维度」统计各阶段线索数，**不含 stage 自身过滤**，
    也不受分页影响，供前端一次请求渲染漏斗徽标，替代逐阶段探测请求。
    """

    stage_counts: Dict[str, int] = Field(default_factory=dict)


@router.get("", response_model=LeadListOut)
def list_leads(
    pagination: PaginationParams = Depends(),
    stage: Optional[LeadStage] = None,
    assigned_to: Optional[uuid.UUID] = None,
    keyword: Optional[str] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """线索列表（分页，可按 stage 筛选、按关键词搜索姓名/电话/邮箱/社交账号）。"""
    # 线索含 phone/email/wechat/line 等客户联系方式，仅内部员工/经纪可见
    if user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Access denied. Staff only")
    conditions = [Lead.deleted_at.is_(None)]
    # stage 过滤单独保存：分页查询用它，stage_counts 需要「不含 stage 维度」的
    # 全阶段分布（否则切到某个阶段时，其他阶段的计数会变成 0）。
    stage_condition = Lead.stage == stage if stage else None
    if assigned_to:
        conditions.append(Lead.assigned_to == assigned_to)
    if keyword and keyword.strip():
        kw = f"%{keyword.strip()}%"
        conditions.append(
            or_(
                Lead.name.ilike(kw),
                Lead.phone.ilike(kw),
                Lead.email.ilike(kw),
                Lead.line_id.ilike(kw),
                Lead.wechat_id.ilike(kw),
            )
        )

    base_stmt = select(Lead).where(*conditions)
    stage_counts = {
        (s.value if isinstance(s, LeadStage) else str(s)): int(count or 0)
        # 多列聚合必须走 session.execute（SQLModel 的 exec 会把结果当标量只取首列）
        for s, count in session.execute(
            base_stmt.with_only_columns(Lead.stage, func.count(Lead.id))
            .order_by(None)
            .group_by(Lead.stage)
        ).all()
        if s is not None
    }
    stmt = base_stmt.order_by(Lead.created_at.desc())
    if stage_condition is not None:
        stmt = stmt.where(stage_condition)
    page = paginate_query(session, stmt, pagination)
    return LeadListOut(
        items=page.items,
        total=page.total,
        page=page.page,
        page_size=page.page_size,
        total_pages=page.total_pages,
        stage_counts=stage_counts,
    )


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


@router.get("/{lead_id}", response_model=Lead)
def get_lead(
    lead_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """获取线索详情。"""
    # 线索含客户联系方式，仅内部员工/经纪可见
    if user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Access denied. Staff only")
    lead = session.get(Lead, lead_id)
    if not lead or lead.deleted_at:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.patch("/{lead_id}")
def update_lead(
    lead_id: uuid.UUID,
    req: LeadUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """更新线索（含阶段变更），如果 stage 变了发布 lead.stage_changed 事件。"""
    lead = session.get(Lead, lead_id)
    if not lead or lead.deleted_at:
        raise HTTPException(status_code=404, detail="Lead not found")

    # 归属校验：非 admin 只能改派给自己员工档案的线索（防抢单/转单/置 closed）
    if user.role != UserRole.admin:
        emp = session.exec(
            select(Employee).where(
                Employee.user_id == user.id, Employee.deleted_at.is_(None)
            )
        ).first()
        if not emp or lead.assigned_to != emp.id:
            raise HTTPException(
                status_code=403,
                detail="Only the assigned employee or an admin can update this lead",
            )

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


@router.delete("/{lead_id}")
def delete_lead(
    lead_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_agent),
):
    """删除线索（软删除，脱敏归档而非硬删）。"""
    lead = session.get(Lead, lead_id)
    if not lead or lead.deleted_at:
        raise HTTPException(status_code=404, detail="Lead not found")

    # 归属校验：非 admin 只能软删派给自己员工档案的线索
    if user.role != UserRole.admin:
        emp = session.exec(
            select(Employee).where(
                Employee.user_id == user.id, Employee.deleted_at.is_(None)
            )
        ).first()
        if not emp or lead.assigned_to != emp.id:
            raise HTTPException(
                status_code=403,
                detail="Only the assigned employee or an admin can delete this lead",
            )

    lead.deleted_at = datetime.utcnow()
    session.add(lead)
    publish_event(
        session,
        "lead.deleted",
        "lead",
        lead.id,
        {"name": lead.name, "deleted_by": str(user.id)},
    )
    session.commit()
    return {"id": str(lead.id), "ok": True, "deleted": True}
