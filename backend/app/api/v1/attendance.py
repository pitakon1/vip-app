"""考勤路由：打卡上下班与考勤记录查询。"""
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.core.auth import require_employee
from app.models import Attendance, AttendanceStatus, Employee, User

router = APIRouter(prefix="/attendance", tags=["attendance"])


def _get_employee(session: Session, user: User) -> Employee:
    """根据当前用户获取员工记录。"""
    employee = session.exec(
        select(Employee).where(
            Employee.user_id == user.id,
            Employee.deleted_at.is_(None),
        )
    ).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee profile not found")
    return employee


@router.post("/check-in")
def check_in(
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """打卡上班。"""
    employee = _get_employee(session, user)
    today = date.today()

    existing = session.exec(
        select(Attendance).where(
            Attendance.employee_id == employee.id,
            Attendance.date == today,
            Attendance.deleted_at.is_(None),
        )
    ).first()

    now = datetime.utcnow()
    if existing:
        if existing.check_in_time:
            raise HTTPException(status_code=400, detail="Already checked in today")
        existing.check_in_time = now
        existing.status = AttendanceStatus.present
        attendance = existing
    else:
        attendance = Attendance(
            employee_id=employee.id,
            date=today,
            check_in_time=now,
            status=AttendanceStatus.present,
        )

    session.add(attendance)
    session.commit()
    session.refresh(attendance)
    return attendance


@router.post("/check-out")
def check_out(
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """打卡下班。"""
    employee = _get_employee(session, user)
    today = date.today()

    attendance = session.exec(
        select(Attendance).where(
            Attendance.employee_id == employee.id,
            Attendance.date == today,
            Attendance.deleted_at.is_(None),
        )
    ).first()

    if not attendance or not attendance.check_in_time:
        raise HTTPException(status_code=400, detail="No check-in record for today")
    if attendance.check_out_time:
        raise HTTPException(status_code=400, detail="Already checked out today")

    attendance.check_out_time = datetime.utcnow()
    session.add(attendance)
    session.commit()
    session.refresh(attendance)
    return attendance


@router.get("/me")
def my_attendance(
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """我的考勤记录。"""
    employee = _get_employee(session, user)
    records = session.exec(
        select(Attendance)
        .where(
            Attendance.employee_id == employee.id,
            Attendance.deleted_at.is_(None),
        )
        .order_by(Attendance.date.desc())
    ).all()
    return records


@router.get("/today")
def today_attendance(
    session: Session = Depends(get_session),
    user: User = Depends(require_employee),
):
    """今日考勤状态。"""
    employee = _get_employee(session, user)
    today = date.today()

    attendance = session.exec(
        select(Attendance).where(
            Attendance.employee_id == employee.id,
            Attendance.date == today,
            Attendance.deleted_at.is_(None),
        )
    ).first()

    if not attendance:
        return {"checked_in": False, "checked_out": False}

    return {
        "checked_in": attendance.check_in_time is not None,
        "checked_out": attendance.check_out_time is not None,
        "check_in_time": attendance.check_in_time,
        "check_out_time": attendance.check_out_time,
        "status": attendance.status.value if attendance.status else None,
    }
