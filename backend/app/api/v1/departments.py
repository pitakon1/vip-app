"""部门（组织架构）API。权限点：department:manage

对标参考项目（房少 ERP）的部门树维护：管理员维护部门层级、负责人、排序，并把
员工（users）归入部门，供行级数据范围（data-scope）推导可见集合。
"""
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, select

from app.core.rbac import require_permission
from app.db import get_session
from app.models import Department, Employee, User

router = APIRouter(prefix="/admin/departments", tags=["admin-departments"])


class DepartmentNodeOut(BaseModel):
    """部门树节点。"""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    name: Optional[str] = None
    code: Optional[str] = None
    parent_id: Optional[str] = None
    leader_id: Optional[str] = None
    leader_name: Optional[str] = None
    sort: Optional[int] = None
    is_active: Optional[bool] = None
    member_count: Optional[int] = None
    children: List["DepartmentNodeOut"] = Field(default_factory=list)


DepartmentNodeOut.model_rebuild()


class DepartmentCreate(BaseModel):
    name: str
    code: str
    parent_id: Optional[uuid.UUID] = None
    leader_id: Optional[uuid.UUID] = None
    sort: Optional[int] = None


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    leader_id: Optional[uuid.UUID] = None
    sort: Optional[int] = None
    is_active: Optional[bool] = None


class AssignMemberIn(BaseModel):
    user_id: uuid.UUID
    department_id: Optional[uuid.UUID] = None


def _department_of_user(session: Session, user_id: uuid.UUID) -> Optional[uuid.UUID]:
    emp = session.exec(
        select(Employee).where(
            Employee.user_id == user_id, Employee.deleted_at.is_(None)
        )
    ).first()
    return emp.department_id if emp else None


@router.get("/tree", response_model=List[DepartmentNodeOut])
def department_tree(
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("department:manage")),
):
    """部门树（根节点数组，含成员数）。"""
    deps = session.exec(
        select(Department)
        .where(Department.deleted_at.is_(None))
        .order_by(Department.sort, Department.created_at)
    ).all()

    # 部门 -> 成员数（一次分组统计，避免 N+1）
    emps = session.exec(
        select(Employee).where(
            Employee.deleted_at.is_(None), Employee.department_id.is_not(None)
        )
    ).all()
    counts: dict[uuid.UUID, int] = {}
    for e in emps:
        counts[e.department_id] = counts.get(e.department_id, 0) + 1

    leader_ids = {d.leader_id for d in deps if d.leader_id}
    leaders = {}
    if leader_ids:
        leaders = {
            u.id: u
            for u in session.exec(select(User).where(User.id.in_(leader_ids))).all()
        }

    def _node(d: Department) -> dict:
        leader = leaders.get(d.leader_id) if d.leader_id else None
        return {
            "id": str(d.id),
            "name": d.name,
            "code": d.code,
            "parent_id": str(d.parent_id) if d.parent_id else None,
            "leader_id": str(d.leader_id) if d.leader_id else None,
            "leader_name": leader.full_name if leader else None,
            "sort": d.sort,
            "is_active": d.is_active,
            "member_count": counts.get(d.id, 0),
            "children": [],
        }

    nodes = {d.id: _node(d) for d in deps}
    roots: list[dict] = []
    for d in deps:
        node = nodes[d.id]
        parent = nodes.get(d.parent_id) if d.parent_id else None
        if parent is not None:
            parent["children"].append(node)
        else:
            # 父节点不存在（被删或根）也按根处理，避免节点丢失
            roots.append(node)
    return roots


@router.get("", response_model=List[DepartmentNodeOut])
def list_departments(
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("department:manage")),
):
    """扁平部门列表（供下拉选择，不组装树）。"""
    deps = session.exec(
        select(Department)
        .where(Department.deleted_at.is_(None))
        .order_by(Department.sort, Department.created_at)
    ).all()
    return [
        {
            "id": str(d.id),
            "name": d.name,
            "code": d.code,
            "parent_id": str(d.parent_id) if d.parent_id else None,
            "leader_id": str(d.leader_id) if d.leader_id else None,
            "sort": d.sort,
            "is_active": d.is_active,
        }
        for d in deps
    ]


def _validate_parent(
    session: Session, dep_id: Optional[uuid.UUID], parent_id: Optional[uuid.UUID]
) -> None:
    """校验上级部门存在且不构成环（不能把上级设成自己或自己的后代）。"""
    if parent_id is None:
        return
    if dep_id is not None and parent_id == dep_id:
        raise HTTPException(status_code=400, detail="部门不能以自身为上级")
    parent = session.get(Department, parent_id)
    if not parent or parent.deleted_at:
        raise HTTPException(status_code=404, detail="上级部门不存在")
    if dep_id is None:
        return
    # 沿 parent 链向上追溯，命中 dep_id 即为环
    seen: set[uuid.UUID] = set()
    cur: Optional[uuid.UUID] = parent_id
    while cur is not None:
        if cur in seen:
            break
        if cur == dep_id:
            raise HTTPException(status_code=400, detail="部门层级不能成环")
        seen.add(cur)
        node = session.get(Department, cur)
        cur = node.parent_id if node else None


@router.post("", status_code=201, response_model=DepartmentNodeOut)
def create_department(
    req: DepartmentCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("department:manage")),
):
    """创建部门。"""
    name = req.name.strip()
    code = req.code.strip()
    if not name or not code:
        raise HTTPException(status_code=400, detail="名称与编码必填")
    dup = session.exec(
        select(Department).where(Department.code == code, Department.deleted_at.is_(None))
    ).first()
    if dup:
        raise HTTPException(status_code=409, detail="部门编码已存在")
    _validate_parent(session, None, req.parent_id)
    d = Department(
        name=name,
        code=code,
        parent_id=req.parent_id,
        leader_id=req.leader_id,
        sort=req.sort or 0,
    )
    session.add(d)
    session.commit()
    session.refresh(d)
    return {
        "id": str(d.id),
        "name": d.name,
        "code": d.code,
        "parent_id": str(d.parent_id) if d.parent_id else None,
        "leader_id": str(d.leader_id) if d.leader_id else None,
        "sort": d.sort,
        "is_active": d.is_active,
        "member_count": 0,
        "children": [],
    }


@router.patch("/{dep_id}", response_model=DepartmentNodeOut)
def update_department(
    dep_id: uuid.UUID,
    req: DepartmentUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("department:manage")),
):
    """更新部门（名称/编码/上级/负责人/排序/启用）。"""
    d = session.get(Department, dep_id)
    if not d or d.deleted_at:
        raise HTTPException(status_code=404, detail="部门不存在")
    data = req.model_dump(exclude_unset=True)
    if "code" in data and data["code"] is not None:
        code = data["code"].strip()
        if not code:
            raise HTTPException(status_code=400, detail="编码不能为空")
        dup = session.exec(
            select(Department).where(
                Department.code == code,
                Department.id != d.id,
                Department.deleted_at.is_(None),
            )
        ).first()
        if dup:
            raise HTTPException(status_code=409, detail="部门编码已存在")
        data["code"] = code
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    if "parent_id" in data:
        _validate_parent(session, d.id, data["parent_id"])
    for key, value in data.items():
        setattr(d, key, value)
    session.add(d)
    session.commit()
    session.refresh(d)
    return {
        "id": str(d.id),
        "name": d.name,
        "code": d.code,
        "parent_id": str(d.parent_id) if d.parent_id else None,
        "leader_id": str(d.leader_id) if d.leader_id else None,
        "sort": d.sort,
        "is_active": d.is_active,
    }


@router.delete("/{dep_id}")
def delete_department(
    dep_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("department:manage")),
):
    """软删除部门（存在下级或成员时拒绝，避免产生孤儿数据）。"""
    d = session.get(Department, dep_id)
    if not d or d.deleted_at:
        raise HTTPException(status_code=404, detail="部门不存在")
    child = session.exec(
        select(Department).where(
            Department.parent_id == dep_id, Department.deleted_at.is_(None)
        )
    ).first()
    if child:
        raise HTTPException(status_code=409, detail="请先移除下级部门")
    member = session.exec(
        select(Employee).where(
            Employee.department_id == dep_id, Employee.deleted_at.is_(None)
        )
    ).first()
    if member:
        raise HTTPException(status_code=409, detail="请先移出该部门下的员工")
    d.deleted_at = datetime.utcnow()
    session.add(d)
    session.commit()
    return {"id": str(dep_id), "ok": True}


@router.put("/assign")
def assign_member(
    req: AssignMemberIn,
    session: Session = Depends(get_session),
    user: User = Depends(require_permission("department:manage")),
):
    """把用户归入某部门（department_id 传空表示移出部门）。

    员工档案不存在时自动建档，避免「账号存在但没有员工档案」导致无法归部门。
    """
    target = session.get(User, req.user_id)
    if not target or target.deleted_at:
        raise HTTPException(status_code=404, detail="用户不存在")
    if req.department_id is not None:
        dep = session.get(Department, req.department_id)
        if not dep or dep.deleted_at:
            raise HTTPException(status_code=404, detail="部门不存在")
    emp = session.exec(
        select(Employee).where(
            Employee.user_id == req.user_id, Employee.deleted_at.is_(None)
        )
    ).first()
    if emp is None:
        emp = Employee(user_id=req.user_id, employee_code=f"EMP{str(req.user_id)[:8]}")
    emp.department_id = req.department_id
    session.add(emp)
    session.commit()
    return {"id": str(req.department_id) if req.department_id else "", "ok": True}
