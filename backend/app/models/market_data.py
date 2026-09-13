"""数据与决策壁垒：市场指数、房源匹配评分、流失预警。"""
from datetime import datetime
from typing import Optional
import uuid

from sqlmodel import Field

from .base import TimestampMixin


class MarketIndex(TimestampMixin, table=True):
    """市场指数（房价/租金指数，面向 C 端）。"""

    __tablename__ = "market_indices"

    market_code: str = Field(index=True, max_length=12)
    index_type: str = Field(index=True)   # sale / rent
    period: str = Field(index=True, max_length=7)  # 2026-08
    value: float = Field(default=0)
    delta_pct: Optional[float] = None
    sample_count: int = Field(default=0)
    avg_price_sqm: Optional[float] = None   # 每平米均价
    avg_rent: Optional[float] = None
    currency: str = Field(default="THB", max_length=3)
    published: bool = Field(default=False)


class MarketReport(TimestampMixin, table=True):
    """市场报告（分段报告：城市/区域/物业类型）。"""

    __tablename__ = "market_reports"

    market_code: str = Field(index=True, max_length=12)
    report_type: str = Field(default="district")  # district/type/city
    area: Optional[str] = None
    property_type: Optional[str] = None
    period: str = Field(index=True, max_length=7)
    summary: Optional[str] = None
    metrics_json: Optional[str] = None   # JSON 指标明细
    published: bool = Field(default=False)
    published_at: Optional[datetime] = None


class PropertyMatch(TimestampMixin, table=True):
    """房源-线索匹配评分（撮合推荐）。"""

    __tablename__ = "property_matches"

    lead_id: Optional[uuid.UUID] = Field(default=None, foreign_key="leads.id", index=True)
    user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id", index=True)
    property_id: uuid.UUID = Field(foreign_key="properties.id", index=True)
    score: int = Field(default=0)   # 0-100 匹配度
    reason: Optional[str] = None
    seen: bool = Field(default=False)
    expired_at: Optional[datetime] = None


class ChurnSignal(TimestampMixin, table=True):
    """租客/客户流失预警信号。"""

    __tablename__ = "churn_signals"

    tenant_id: Optional[uuid.UUID] = Field(default=None, foreign_key="tenants.id", index=True)
    user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id", index=True)
    lease_id: Optional[uuid.UUID] = Field(default=None, foreign_key="leases.id", index=True)
    signal_type: str = Field(default="lease_expiring")  # lease_expiring/payment_delay/low_engagement
    level: str = Field(default="info")  # info/warning/high
    detail: Optional[str] = None
    triggered_at: datetime = Field(default_factory=datetime.utcnow)
    is_resolved: bool = Field(default=False)
    resolved_at: Optional[datetime] = None
    suggested_action: Optional[str] = None   # 续约提醒/复购推送/经理跟进