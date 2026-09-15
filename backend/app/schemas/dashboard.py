"""Dashboard 响应模型。

为高频只读接口补 `response_model`：一是让 OpenAPI 文档与实际返回一致，
二是把返回结构固定在 schema 内、避免内部字段（如 ORM 对象）被顺带序列化出去。

注意：`response_model` 会**过滤**未声明的字段，因此这里必须把各接口返回 dict 的
全部键都声明出来，否则前端依赖的字段会被静默截断。
"""
from typing import List, Optional

from pydantic import BaseModel, Field


class DashboardSummaryOut(BaseModel):
    """`GET /dashboard/summary`。"""

    total_properties: int
    vacant: int
    rented: int
    maintenance: int
    expiring_leases: int
    upcoming_payments: int
    monthly_revenue: float
    active_lease_revenue: float
    occupancy_rate: float
    active_leads: int
    closed_leads: int
    conversion_rate: float


class RecentPaymentOut(BaseModel):
    """`GET /dashboard/recent-payments` 的单条付款记录。"""

    id: str
    amount: float
    currency: Optional[str] = None
    payment_type: Optional[str] = None
    status: Optional[str] = None
    channel: Optional[str] = None
    due_date: Optional[str] = None
    paid_at: Optional[str] = None
    created_at: Optional[str] = None
    description: Optional[str] = None
    payer_name: Optional[str] = None


class RecentPaymentsOut(BaseModel):
    items: List[RecentPaymentOut] = Field(default_factory=list)


class ExpiringLeaseOut(BaseModel):
    """`GET /dashboard/expiring-leases` 的单条即将到期租约。"""

    id: str
    property_id: str
    property_name: Optional[str] = None
    tenant_id: str
    tenant_name: Optional[str] = None
    monthly_rent: float
    currency: Optional[str] = None
    end_date: str
    days_left: int


class ExpiringLeasesOut(BaseModel):
    items: List[ExpiringLeaseOut] = Field(default_factory=list)


class PropertyStatusCountOut(BaseModel):
    """`GET /dashboard/property-status-distribution` 的单条状态分布。"""

    status: str
    count: int


class PropertyStatusDistributionOut(BaseModel):
    items: List[PropertyStatusCountOut] = Field(default_factory=list)


class ReconciliationTotalsOut(BaseModel):
    received: float
    receivable: float
    overdue: float
    count: int


class ReconciliationPropertyOut(BaseModel):
    """按房源聚合的对账行。"""

    property_id: str
    property: Optional[str] = None
    received: float
    receivable: float
    overdue: float
    count: int


class ReconciliationRecordOut(BaseModel):
    """逐笔对账记录（`bucket` 为 received/pending/overdue）。"""

    id: str
    property_id: Optional[str] = None
    property: Optional[str] = None
    amount: float
    currency: Optional[str] = None
    payment_type: Optional[str] = None
    status: Optional[str] = None
    bucket: str
    channel: Optional[str] = None
    due_date: Optional[str] = None
    paid_at: Optional[str] = None
    created_at: Optional[str] = None


class FinancialReconciliationOut(BaseModel):
    """`GET /dashboard/financial-reconciliation`。"""

    totals: ReconciliationTotalsOut
    by_property: List[ReconciliationPropertyOut] = Field(default_factory=list)
    records: List[ReconciliationRecordOut] = Field(default_factory=list)
    # records 为分页结果，逐笔明细的真实总笔数由此字段给出
    records_total: int = 0


class TrendPointOut(BaseModel):
    """`GET /dashboard/trend` 的单个自然月数据点。"""

    month: str
    revenue: float
    leases_new: int
    leads_new: int
    viewings_new: int
    maintenance_new: int


class OperationalTrendOut(BaseModel):
    months: int
    series: List[TrendPointOut] = Field(default_factory=list)