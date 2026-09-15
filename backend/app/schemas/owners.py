"""业主端响应模型。

为业主高频只读接口补 `response_model`：让 OpenAPI 文档与实际返回一致，并把结构
固定在 schema 内。

注意：`response_model` 会**过滤**未声明的字段，因此这里必须把接口返回 dict 的全部
键都声明出来，否则前端依赖的字段会被静默截断（口径与 dashboard 一致）。
"""
from typing import List, Optional

from pydantic import BaseModel, Field


class OwnerPropertyIncomeOut(BaseModel):
    """`GET /owners/me/income` 中按房源聚合的一行。"""

    property_id: str
    income: float
    receivable: float
    monthly_rent: float


class OwnerIncomeRecordOut(BaseModel):
    """逐笔租金记录（`status` 为 received/pending/overdue）。"""

    id: str
    property: Optional[str] = None
    month: str
    amount: float
    status: str


class OwnerIncomeOut(BaseModel):
    """`GET /owners/me/income`。"""

    total_income: float
    receivable_total: float
    overdue_total: float
    currency: str
    property_count: int
    rented_count: int
    vacant_count: int
    by_property: List[OwnerPropertyIncomeOut] = Field(default_factory=list)
    records: List[OwnerIncomeRecordOut] = Field(default_factory=list)


class AnnualMonthOut(BaseModel):
    """年度汇总中的单个月份桶。"""

    month: str
    received: float
    pending: float
    overdue: float
    count: int


class AnnualTotalsOut(BaseModel):
    received: float
    pending: float
    overdue: float
    count: int


class AnnualFinancialSummaryOut(BaseModel):
    """`GET /owners/me/annual-financial-summary`。"""

    year: Optional[int] = None
    by_month: List[AnnualMonthOut] = Field(default_factory=list)
    totals: AnnualTotalsOut