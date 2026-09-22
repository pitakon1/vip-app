"""公司信息配置（单行存储）。

公司名称/地址/电话/社媒等展示信息此前只有 `GET /company/info` 静态占位，
设置页的「保存」从前端调用 `PUT /company/info` 会 404。本模型提供持久化，
`GET` 读库（未配置时回落占位），`PUT` 由管理员 upsert 单行记录。
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, text
from sqlmodel import Field, Session, SQLModel, select

# 唯一行的主键：固定值，保证「单行配置」
COMPANY_PROFILE_KEY = "default"


class CompanyProfile(SQLModel, table=True):
    id: Optional[int] = Field(
        default=1,
        primary_key=True,
        sa_column_kwargs={"server_default": text("1")},
        description="固定主键=1，保证单行",
    )
    name: Optional[str] = Field(default=None, max_length=200)
    address: Optional[str] = Field(default=None, max_length=500)
    phone: Optional[str] = Field(default=None, max_length=50)
    email: Optional[str] = Field(default=None, max_length=200)
    website: Optional[str] = Field(default=None, max_length=500)
    # 公司 Logo（站内 /uploads/company 路径）：设置页的「移除 / 上传」需要有落库位置，
    # 否则前端移除后刷新即「复活」，等于假操作。
    logo_url: Optional[str] = Field(default=None, max_length=500)
    social_media: Optional[dict] = Field(default=None, sa_type=JSON)
    # 设置页「公司信息」的注册号 / 结算币种 / 时区：此前只在前端源码里写死示例值，
    # 输入后保存不上、刷新即回退，故一并落库。
    reg_no: Optional[str] = Field(default=None, max_length=100)
    currency: Optional[str] = Field(default=None, max_length=20)
    timezone: Optional[str] = Field(default=None, max_length=50)
    # 通知规则 / 支付渠道 / 业务提醒参数：JSON 列集中存放，避免为配置项反复加宽表。
    settings: Optional[dict] = Field(default=None, sa_type=JSON)
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column_kwargs={"onupdate": datetime.utcnow},
    )


def get_company_profile(session: Session) -> "CompanyProfile":
    """取公司配置；不存在则返回空白占位对象（不落库）。"""
    row = session.exec(
        select(CompanyProfile).where(CompanyProfile.id == 1)
    ).first()
    if row is None:
        return CompanyProfile(name=None)
    return row


def upsert_company_profile(session: Session, data: dict) -> "CompanyProfile":
    """按单行 upsert 公司配置，返回最新记录。"""
    row = session.get(CompanyProfile, 1)
    if row is None:
        row = CompanyProfile(id=1)
    for field, value in data.items():
        if field in {
            "name",
            "address",
            "phone",
            "email",
            "website",
            "logo_url",
            "social_media",
            "reg_no",
            "currency",
            "timezone",
            "settings",
        }:
            setattr(row, field, value)
    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row