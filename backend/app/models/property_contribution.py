"""ACN 经纪人合作网络：房源贡献度角色模型。

## 为什么需要这张表（对标贝壳）

贝壳的核心资产之一是 **ACN（Agent Cooperation Network）**：一套房从录入到成交
被拆成多个角色，每个角色按贡献度分佣，于是「人人都愿意把房源和客源拿到平台上
合作」，而不是各自捂盘。

泰国市场的现实让这件事**比在国内更刚需**：
- 房东付佣，12 个月租约付 1 个月租金；
- **无独家盘概念，天然多家联卖**——同一套房同时挂在不同中介手里是常态；
- 主流平台（DDproperty / Hipflat / FazWaz / PropertyScout）只有聚合房源，
  没有协作与分佣机制，所以「谁能把多个中介的贡献算清楚」就是差异化。

本平台此前只有 `Property.created_by` 一个「录入人」，`CommissionSettlement`
只有单一 `employee_id`，`SplitDeal` 虽能记录分成但在业务上没有任何角色来源——
即**无法回答「这套房是谁录的、谁维护的、谁实勘的、谁带客成交的」**。

本模型把「谁在哪个角色上贡献了」变成一等实体，作为分佣计算的唯一事实来源：
- 一户档案（Property）下的角色绑定不写回 `Property`，避免与 `created_by` 双写不一致；
- 一个人在同一房源可以有多个角色（现实中常见：既录入又维护）；
- 支持一个角色多个主体（如两名经纪人共同带看），按权重分；
- 保留 `revoked_at`，角色退出留痕而不是删行（分佣争议时可回溯）。
"""
import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import Column, JSON, UniqueConstraint
from sqlmodel import Field

from .base import TimestampMixin


class ACNRole(str, Enum):
    """ACN 贡献角色。

    贝壳 10 角色在本平台落到 7 个（去掉只有直营大团队才有的「房源方区域经理」
    「客源方区域经理」等管理岗，保留直接产生交易价值的一线角色）。
    """

    lister = "lister"              # 录入人：把房源录进系统、建档（楼盘字典入档）
    maintainer = "maintainer"      # 维护人：房东关系与房源信息维护、价格跟新
    surveyor = "surveyor"          # 实勘人：到场拍照核实房源真实性与现状
    photographer = "photographer"  # 图像/视频处理：房源照片与视频看房制作
    key_holder = "key_holder"      # 钥匙人：保管钥匙、安排开门看房
    customer_agent = "customer_agent"  # 客源方：带看、撮合客源（泰国佣金的主要来源侧）
    closer = "closer"              # 成交人：谈价、签约、推动过户/起租


# 角色默认权重（%）。百分数之和为 100，实际计算时按「有效角色的权重归一化」，
# 因此某角色缺失时不会把差额丢掉，而是按比例摊给其余角色。
DEFAULT_ROLE_WEIGHTS: dict[str, float] = {
    ACNRole.lister.value: 15.0,
    ACNRole.maintainer.value: 20.0,
    ACNRole.surveyor.value: 10.0,
    ACNRole.photographer.value: 5.0,
    ACNRole.key_holder.value: 5.0,
    ACNRole.customer_agent.value: 30.0,
    ACNRole.closer.value: 15.0,
}

# 角色中文名（前端展示 / 通知文案共用；三语由前端 i18n 补）
ACN_ROLE_LABELS: dict[str, str] = {
    ACNRole.lister.value: "录入人",
    ACNRole.maintainer.value: "维护人",
    ACNRole.surveyor.value: "实勘人",
    ACNRole.photographer.value: "图像处理",
    ACNRole.key_holder.value: "钥匙人",
    ACNRole.customer_agent.value: "客源方",
    ACNRole.closer.value: "成交人",
}


def actor_key_of(
    user_id: Optional[uuid.UUID] = None,
    partner_id: Optional[uuid.UUID] = None,
) -> str:
    """把「贡献主体」压成非空单键，供唯一约束使用。

    数据库唯一约束里 NULL 之间互不冲突（SQLite/PG 皆然），若直接用
    (property_id, role, user_id, partner_id) 做约束，同一人可被重复插入
    ——去重就失效了。所以引入非空 `actor_key`，把 user 与 partner 两种主体
    压成一个字符串参与唯一约束。

    员工（users.id）优先：平台内自营经纪人有账号，外部渠道商是 broker_partners。
    两者互斥，调用方需保证至少给一个。
    """
    if user_id:
        return f"user:{user_id}"
    if partner_id:
        return f"partner:{partner_id}"
    raise ValueError("贡献主体不能为空：必须提供 user_id 或 partner_id")


class PropertyContribution(TimestampMixin, table=True):
    """房源贡献（ACN 角色绑定），分佣计算的唯一事实来源。"""

    __tablename__ = "property_contributions"
    __table_args__ = (
        UniqueConstraint(
            "property_id", "role", "actor_key", name="uq_property_contribution"
        ),
    )

    property_id: uuid.UUID = Field(foreign_key="properties.id", index=True)
    listing_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="listings.id", index=True,
        description="可选的来源上架单：区分「同一档案下由哪一单带来的贡献」",
    )
    role: ACNRole = Field(index=True)
    user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id", index=True)
    partner_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="broker_partners.id", index=True
    )
    actor_key: str = Field(
        max_length=80, index=True,
        description="主体归一化键（user:<id> / partner:<id>），参与唯一约束",
    )
    weight: float = Field(
        default=0.0,
        description="本角色的贡献权重(%)。0 表示按 DEFAULT_ROLE_WEIGHTS 取默认值",
    )
    share_rate: Optional[float] = Field(
        default=None,
        description="显式分成比例(%)，覆盖权重计算；空表示按权重归一化分配",
    )
    status: str = Field(default="active", index=True)  # active / revoked
    granted_at: datetime = Field(default_factory=datetime.utcnow)
    revoked_at: Optional[datetime] = None
    note: Optional[str] = Field(default=None, max_length=500)

    @property
    def effective_weight(self) -> float:
        """有效权重：显式权重优先，否则取角色默认。"""
        if self.weight and self.weight > 0:
            return float(self.weight)
        return float(DEFAULT_ROLE_WEIGHTS.get(self.role.value, 0.0))


class CommissionSplitPlan(TimestampMixin, table=True):
    """一次分佣计算的落库结果（可复算、可追溯、可对账）。

    为什么单独落表而不只写 `SplitDeal`：`SplitDeal` 是「应付款项」，
    需要人工审批；而分佣方案是**计算结果**，会随角色变更反复重算。
    两者生命周期不同，混在一张表里会让「重算」变成「改账」。
    """

    __tablename__ = "commission_split_plans"

    property_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="properties.id", index=True
    )
    deal_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="property_deals.id", index=True
    )
    lease_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="leases.id", index=True
    )
    commission_total: float = Field(gt=0)
    currency: str = Field(default="THB", max_length=3)
    # 明细快照：[{role, user_id, partner_id, weight, share_rate, amount}]
    entries: Optional[list] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True, comment="分佣明细快照（JSON 数组）"),
    )
    participant_count: int = Field(default=0)
    status: str = Field(default="draft", index=True)  # draft / applied / void
    computed_at: datetime = Field(default_factory=datetime.utcnow)
    note: Optional[str] = Field(default=None, max_length=500)
