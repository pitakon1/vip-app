"""数据导出：房源 / 收付款 / 佣金 / 考勤 / 员工通讯录 CSV。

三端列表页都放了「导出」入口，但后端此前没有任何导出能力，按钮要么是死按钮、
要么只弹一句「开发中」。这里集中提供 5 张常用报表，零新依赖（标准库 csv），
统一返回带 UTF-8 BOM 的 CSV，Excel 双击不乱码。

可见范围与对应列表接口保持一致，避免「导出」成为越权取数的后门：
- 房源：员工（admin / agent / employee）
- 收付款：员工导出全部；租客 / 业主只能导出与自己相关的收付款
- 佣金：admin 导出全部（可按员工过滤）；其他员工只能导出自己的
- 考勤：admin 导出全部（按日期区间，可筛部门）；其他员工只能导出自己的
- 员工通讯录：全体员工可见，但只含协作联系方式，不含佣金/薪资
"""
import uuid
from datetime import date as date_type, datetime
from typing import Optional, Sequence

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlmodel import Session, select

from app.core.auth import STAFF_ROLES, get_current_user, require_employee
from app.core.csv_export import csv_response
from app.db import get_session
from app.models import (
    Attendance,
    CommissionSettlement,
    DealType,
    Employee,
    Owner,
    Payment,
    PaymentStatus,
    PaymentType,
    Project,
    Property,
    PropertyStatus,
    SettlementStatus,
    User,
    UserRole,
)

router = APIRouter(prefix="/exports", tags=["exports"])

# 单次导出行数上限：报表是给人看的，不是数据同步，超过这个量前端也打不开。
MAX_ROWS = 50000

# 员工类角色（可看全量数据）；其余角色一律只看自己：统一走 core.auth.STAFF_ROLES


def _stamp() -> str:
    """文件名里的日期后缀，避免多次导出互相覆盖。"""
    return datetime.now().strftime("%Y%m%d")


def _dt(value: Optional[datetime]) -> str:
    return value.strftime("%Y-%m-%d %H:%M:%S") if value else ""


def _get_employee_or_404(session: Session, user: User) -> Employee:
    """取当前用户的员工档案（无档案则 404，与 /performance/me 口径一致）。"""
    employee = session.exec(
        select(Employee).where(
            Employee.user_id == user.id,
            Employee.deleted_at.is_(None),
        )
    ).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee profile not found")
    return employee


def _user_names(session: Session, ids: Sequence[uuid.UUID]) -> dict:
    """批量取用户姓名，避免逐行查询造成 N+1。"""
    unique = {i for i in ids if i}
    if not unique:
        return {}
    users = session.exec(select(User).where(User.id.in_(unique))).all()
    return {u.id: (u.full_name or u.email) for u in users}


# ------------------------------------------------------------ 房源
@router.get("/properties")
def export_properties(
    status: Optional[PropertyStatus] = None,
    property_type: Optional[str] = Query(
        None, max_length=50, description="房源类型：apartment/villa/shop/office…"
    ),
    q: Optional[str] = Query(None, max_length=100, description="房号 / 地址 / 楼栋"),
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """导出租房房源清单（筛选口径与 Web 房源列表一致）。"""
    conditions = [Property.deleted_at.is_(None)]
    if status:
        conditions.append(Property.status == status)
    if property_type:
        conditions.append(Property.property_type == property_type)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        conditions.append(
            or_(
                Property.room_number.ilike(pattern),
                Property.address.ilike(pattern),
                Property.building.ilike(pattern),
            )
        )

    props = session.exec(
        select(Property)
        .where(*conditions)
        .order_by(Property.created_at.desc())
        .limit(MAX_ROWS)
    ).all()

    owners = {
        o.id: o
        for o in session.exec(
            select(Owner).where(Owner.id.in_([p.owner_id for p in props]))
        ).all()
    }
    owner_names = _user_names(session, [o.user_id for o in owners.values()])
    projects = {
        p.id: p
        for p in session.exec(
            select(Project).where(
                Project.id.in_([p.project_id for p in props if p.project_id])
            )
        ).all()
    }

    rows = []
    for p in props:
        project = projects.get(p.project_id)
        owner = owners.get(p.owner_id)
        rows.append(
            [
                p.room_number,
                project.name if project else "",
                owner_names.get(owner.user_id, "") if owner else "",
                p.property_type,
                p.status.value,
                p.monthly_rent,
                p.currency,
                p.size_sqm if p.size_sqm is not None else "",
                p.bedrooms if p.bedrooms is not None else "",
                p.bathrooms if p.bathrooms is not None else "",
                p.floor if p.floor is not None else "",
                p.building or "",
                p.address,
                "是" if p.furnished else "否",
                p.available_from.strftime("%Y-%m-%d") if p.available_from else "",
                p.video_url or "",
                _dt(p.created_at),
            ]
        )
    return csv_response(
        [
            "房号",
            "楼盘",
            "业主",
            "房源类型",
            "状态",
            "月租",
            "币种",
            "面积(㎡)",
            "卧室",
            "卫生间",
            "楼层",
            "楼栋",
            "地址",
            "是否配家具",
            "可入住日期",
            "视频看房",
            "创建时间",
        ],
        rows,
        f"properties_{_stamp()}.csv",
    )


# ------------------------------------------------------------ 收付款
@router.get("/payments")
def export_payments(
    payment_type: Optional[PaymentType] = None,
    status: Optional[PaymentStatus] = None,
    channel: Optional[str] = Query(None, max_length=50, description="支付渠道"),
    date_from: Optional[date_type] = None,
    date_to: Optional[date_type] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """导出收付款流水（员工看全部，其余角色只看与自己相关的）。"""
    conditions = [Payment.deleted_at.is_(None)]
    if user.role not in STAFF_ROLES:
        conditions.append(
            (Payment.payer_id == user.id) | (Payment.payee_id == user.id)
        )
    if payment_type:
        conditions.append(Payment.payment_type == payment_type)
    if status:
        conditions.append(Payment.status == status)
    if channel:
        conditions.append(Payment.channel == channel)
    if date_from:
        conditions.append(Payment.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        conditions.append(
            Payment.created_at
            <= datetime.combine(date_to, datetime.max.time())
        )

    payments = session.exec(
        select(Payment)
        .where(*conditions)
        .order_by(Payment.created_at.desc())
        .limit(MAX_ROWS)
    ).all()
    names = _user_names(
        session,
        [p.payer_id for p in payments] + [p.payee_id for p in payments if p.payee_id],
    )
    rows = [
        [
            _dt(p.created_at),
            str(p.id),
            p.payment_type.value,
            p.status.value,
            p.amount,
            p.currency,
            names.get(p.payer_id, ""),
            names.get(p.payee_id, "") if p.payee_id else "",
            p.channel or "",
            p.due_date.strftime("%Y-%m-%d") if p.due_date else "",
            _dt(p.paid_at),
            str(p.lease_id) if p.lease_id else "",
            p.description or "",
        ]
        for p in payments
    ]
    return csv_response(
        [
            "创建时间",
            "支付单号",
            "类型",
            "状态",
            "金额",
            "币种",
            "付款方",
            "收款方",
            "支付渠道",
            "应付日期",
            "实付时间",
            "关联租约",
            "备注",
        ],
        rows,
        f"payments_{_stamp()}.csv",
    )


# ------------------------------------------------------------ 佣金
@router.get("/commissions")
def export_commissions(
    status: Optional[SettlementStatus] = None,
    deal_type: Optional[DealType] = None,
    employee_id: Optional[uuid.UUID] = Query(
        None, description="仅 admin 可用；其他角色会被忽略并强制只看自己"
    ),
    date_from: Optional[date_type] = None,
    date_to: Optional[date_type] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """导出佣金结算明细（admin 看全部，员工只看自己的）。"""
    conditions = [CommissionSettlement.deleted_at.is_(None)]
    if user.role == UserRole.admin:
        if employee_id:
            conditions.append(CommissionSettlement.employee_id == employee_id)
    else:
        # 非 admin 一律忽略 employee_id 入参，避免越权导出他人佣金
        conditions.append(
            CommissionSettlement.employee_id == _get_employee_or_404(session, user).id
        )
    if status:
        conditions.append(CommissionSettlement.status == status)
    if deal_type:
        conditions.append(CommissionSettlement.deal_type == deal_type)
    if date_from:
        conditions.append(
            CommissionSettlement.created_at
            >= datetime.combine(date_from, datetime.min.time())
        )
    if date_to:
        conditions.append(
            CommissionSettlement.created_at
            <= datetime.combine(date_to, datetime.max.time())
        )

    items = session.exec(
        select(CommissionSettlement)
        .where(*conditions)
        .order_by(CommissionSettlement.created_at.desc())
        .limit(MAX_ROWS)
    ).all()
    employees = {
        e.id: e
        for e in session.exec(
            select(Employee).where(
                Employee.id.in_([i.employee_id for i in items])
            )
        ).all()
    }
    names = _user_names(session, [e.user_id for e in employees.values()])
    rows = []
    for i in items:
        emp = employees.get(i.employee_id)
        rows.append(
            [
                _dt(i.created_at),
                names.get(emp.user_id, "") if emp else "",
                emp.employee_code if emp else "",
                i.deal_type.value,
                i.status.value,
                i.commission_base,
                i.commission_rate,
                i.commission_amount,
                i.currency,
                str(i.lease_id) if i.lease_id else "",
                _dt(i.settled_at),
                _dt(i.paid_at),
            ]
        )
    return csv_response(
        [
            "创建时间",
            "员工",
            "工号",
            "成交类型",
            "结算状态",
            "佣金基数",
            "佣金比例",
            "佣金金额",
            "币种",
            "关联租约",
            "结算时间",
            "发放时间",
        ],
        rows,
        f"commissions_{_stamp()}.csv",
    )


# ------------------------------------------------------------ 考勤
@router.get("/attendance")
def export_attendance(
    start_date: Optional[date_type] = None,
    end_date: Optional[date_type] = None,
    department: Optional[str] = Query(None, description="仅 admin 可用"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """导出考勤明细（admin 可按日期区间/部门导出全员，其余员工只看自己）。"""
    today = date_type.today()
    start = start_date or today
    end = end_date or today
    if start > end:
        start, end = end, start

    conditions = [
        Attendance.deleted_at.is_(None),
        Attendance.date >= start,
        Attendance.date <= end,
    ]
    employee_filter = None
    if user.role == UserRole.admin:
        if department:
            employee_filter = Employee.department == department
    else:
        # 非 admin 强制只看自己，忽略 department 入参
        employee_filter = Employee.id == _get_employee_or_404(session, user).id

    stmt = select(Attendance)
    emp_conditions = [Employee.deleted_at.is_(None)]
    if employee_filter is not None:
        emp_conditions.append(employee_filter)
    stmt = stmt.join(Employee, Attendance.employee_id == Employee.id).where(
        *emp_conditions
    )
    records = session.exec(
        stmt.where(*conditions)
        .order_by(Attendance.date.desc(), Employee.employee_code)
        .limit(MAX_ROWS)
    ).all()

    employees = {
        e.id: e
        for e in session.exec(
            select(Employee).where(
                Employee.id.in_([r.employee_id for r in records])
            )
        ).all()
    }
    names = _user_names(session, [e.user_id for e in employees.values()])
    rows = []
    for r in records:
        emp = employees.get(r.employee_id)
        rows.append(
            [
                r.date.isoformat(),
                names.get(emp.user_id, "") if emp else "",
                emp.employee_code if emp else "",
                emp.department if emp else "",
                r.status.value,
                _dt(r.check_in_time),
                _dt(r.check_out_time),
                r.notes or "",
            ]
        )
    return csv_response(
        ["日期", "员工", "工号", "部门", "考勤状态", "上班打卡", "下班打卡", "备注"],
        rows,
        f"attendance_{start.isoformat()}_{end.isoformat()}.csv",
    )


# ------------------------------------------------------------ 员工通讯录
@router.get("/employees")
def export_employees(
    department: Optional[str] = Query(None, description="按部门筛选"),
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """导出同事通讯录（全体员工可见，字段与 /employees/directory 一致）。

    只含协作联系方式，不含佣金、薪资等敏感数据。
    """
    conditions = [Employee.deleted_at.is_(None), Employee.is_active.is_(True)]
    if department:
        conditions.append(Employee.department == department)

    employees = session.exec(
        select(Employee).where(*conditions).order_by(Employee.employee_code)
    ).all()
    users = (
        {
            u.id: u
            for u in session.exec(
                select(User).where(User.id.in_([e.user_id for e in employees]))
            ).all()
        }
        if employees
        else {}
    )
    rows = []
    for e in employees:
        owner = users.get(e.user_id)
        if not owner:
            continue
        rows.append(
            [
                e.employee_code,
                owner.full_name or "",
                e.department or "",
                e.position or "",
                e.phone or "",
                owner.email or "",
                e.wechat_id or "",
                e.line_id or "",
                e.hire_date.isoformat() if e.hire_date else "",
            ]
        )
    return csv_response(
        ["工号", "姓名", "部门", "职位", "手机", "邮箱", "微信", "Line", "入职日期"],
        rows,
        f"employees_{_stamp()}.csv",
    )