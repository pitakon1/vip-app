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
    social_media: Optional[dict] = Field(default=None, sa_type=JSON)
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
            "social_media",
        }:
            setattr(row, field, value)
    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row