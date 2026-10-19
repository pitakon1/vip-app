"""行级数据范围（data-scope）服务。

对标参考项目（房少 ERP）的部门树 + 节点权限：把原来硬编码在
`app.core.auth.property_visibility_conditions` / `lease_visibility_conditions`
里的「agent/employee 只看自己录的」改为**可配置的部门范围推导**。

范围四档：`self`（本人）/ `department`（本部门）/ `department_and_below`
（本部门及下级）/ `all`（全部）。

解析优先级：用户级覆盖 → 角色级配置 → 内置默认（admin=all，其余=self）。
**无部门归属时安全回落 `self`**，避免「配错范围 = 全量泄漏」。
"""
from __future__ import annotations

import uuid
from typing import Optional

from sqlmodel import Session, select

from app.models.data_scope import DataScope, RoleDataScope, UserDataScope
from app.models.department import Department
from app.models.employee import Employee
from app.models.user import User, UserRole


def resolve_scope(session: Session, user: User) -> DataScope:
    """解析当前用户的数据范围：用户级 → 角色级 → 默认。"""
    u_scope = session.exec(
        select(UserDataScope).where(
            UserDataScope.user_id == user.id, UserDataScope.deleted_at.is_(None)
        )
    ).first()
    if u_scope:
        return u_scope.scope

    r_scope = session.exec(
        select(RoleDataScope).where(
            RoleDataScope.role == user.role, RoleDataScope.deleted_at.is_(None)
        )
    ).first()
    if r_scope:
        return r_scope.scope

    # 内置默认：管理员全量，其余仅本人
    if user.role == UserRole.admin:
        return DataScope.all
    return DataScope.self_


def department_subtree_ids(
    session: Session, department_id: Optional[uuid.UUID]
) -> set[uuid.UUID]:
    """收集某部门及其全部下级的 id（含自身）。

    `parent_id` 自引用可能因误配成环，故用 `visited` 去重防止无限递归。
    """
    if not department_id:
        return set()
    rows = session.exec(
        select(Department.id, Department.parent_id).where(
            Department.deleted_at.is_(None)
        )
    ).all()
    children: dict[Optional[uuid.UUID], list[uuid.UUID]] = {}
    for dep_id, parent_id in rows:
        children.setdefault(parent_id, []).append(dep_id)

    out: set[uuid.UUID] = set()
    stack = [department_id]
    while stack:
        cur = stack.pop()
        if cur in out:
            continue
        out.add(cur)
        stack.extend(children.get(cur, []))
    return out


def _employee_of(session: Session, user: User) -> Optional[Employee]:
    """当前账号对应的员工档案（未建档返回 None）。"""
    return session.exec(
        select(Employee).where(
            Employee.user_id == user.id, Employee.deleted_at.is_(None)
        )
    ).first()


def _scoped_department_ids(
    session: Session, user: User, scope: DataScope
) -> Optional[set[uuid.UUID]]:
    """非 all / 非 self 时的可见部门 id 集合；无部门归属返回 None 表示需回落 self。"""
    employee = _employee_of(session, user)
    dep_id = employee.department_id if employee else None
    if not dep_id:
        return None
    if scope == DataScope.department:
        return {dep_id}
    return department_subtree_ids(session, dep_id)


def staff_user_ids_in_scope(
    session: Session, user: User
) -> Optional[set[uuid.UUID]]:
    """员工可见的 `users.id` 集合。

    返回 `None` 表示「全部可见」（scope=all），调用方据此不加条件；
    否则给出精确集合，`self` 场景为 `{user.id}`。
    """
    scope = resolve_scope(session, user)
    if scope == DataScope.all:
        return None
    if scope == DataScope.self_:
        return {user.id}

    dep_ids = _scoped_department_ids(session, user, scope)
    if dep_ids is None:
        # 无部门归属：安全回落本人
        return {user.id}
    emps = session.exec(
        select(Employee).where(
            Employee.department_id.in_(dep_ids), Employee.deleted_at.is_(None)
        )
    ).all()
    ids = {e.user_id for e in emps}
    ids.add(user.id)
    return ids


def staff_employee_ids_in_scope(
    session: Session, user: User
) -> Optional[set[uuid.UUID]]:
    """员工可见的 `employees.id` 集合（供 `Lease.agent_id` 过滤）。

    返回 `None` 表示「全部可见」。
    """
    scope = resolve_scope(session, user)
    if scope == DataScope.all:
        return None

    employee = _employee_of(session, user)
    if scope == DataScope.self_:
        return {employee.id} if employee else set()

    dep_ids = _scoped_department_ids(session, user, scope)
    if dep_ids is None:
        return {employee.id} if employee else set()
    emps = session.exec(
        select(Employee).where(
            Employee.department_id.in_(dep_ids), Employee.deleted_at.is_(None)
        )
    ).all()
    ids = {e.id for e in emps}
    if employee:
        ids.add(employee.id)
    return ids


__all__ = [
    "resolve_scope",
    "department_subtree_ids",
    "staff_user_ids_in_scope",
    "staff_employee_ids_in_scope",
]
