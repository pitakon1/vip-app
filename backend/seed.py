"""数据库种子数据脚本
用法: python -m app.seed
"""
import uuid
from datetime import datetime, timedelta, timezone

from sqlmodel import Session

from app.db import engine, init_db
from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.models.project import Project
from app.models.owner import Owner
from app.models.property import Property, PropertyStatus
from app.models.tenant import Tenant
from app.models.lease import Lease, LeaseStatus
from app.models.lead import Lead, LeadStage
from app.models.employee import Employee
from app.models.payment import Payment, PaymentType, PaymentStatus
from app.models.commission_settlement import (
    CommissionSettlement,
    DealType,
    SettlementStatus,
)
from app.models.notification import Notification, NotificationChannel, NotificationStatus
from app.models.feature_flag import FeatureFlag
from app.models.pdpa import PrivacyPolicyVersion

def seed_all():
    """创建所有种子数据"""
    init_db()  # 确保表存在

    with Session(engine) as session:
        # 1. 创建用户
        admin = User(
            id=uuid.uuid4(),
            email="admin@viprental.com",
            hashed_password=get_password_hash("admin123"),
            full_name="系统管理员",
            role=UserRole.admin,
            is_active=True,
            is_verified=True,
            preferred_language="zh",
        )

        agent = User(
            id=uuid.uuid4(),
            email="agent@viprental.com",
            hashed_password=get_password_hash("agent123"),
            full_name="经纪小明",
            role=UserRole.agent,
            is_active=True,
            is_verified=True,
            preferred_language="zh",
        )

        owner_user = User(
            id=uuid.uuid4(),
            email="owner@viprental.com",
            hashed_password=get_password_hash("owner123"),
            full_name="业主张先生",
            role=UserRole.owner,
            is_active=True,
            is_verified=True,
            preferred_language="zh",
        )

        tenant_user = User(
            id=uuid.uuid4(),
            email="tenant@viprental.com",
            hashed_password=get_password_hash("tenant123"),
            full_name="租客李小姐",
            role=UserRole.tenant,
            is_active=True,
            is_verified=True,
            preferred_language="zh",
        )

        employee_user = User(
            id=uuid.uuid4(),
            email="employee@viprental.com",
            hashed_password=get_password_hash("emp123"),
            full_name="员工王五",
            role=UserRole.employee,
            is_active=True,
            is_verified=True,
            preferred_language="zh",
        )

        session.add_all([admin, agent, owner_user, tenant_user, employee_user])
        session.commit()
        for u in [admin, agent, owner_user, tenant_user, employee_user]:
            session.refresh(u)

        # 2. 创建项目
        project = Project(
            id=uuid.uuid4(),
            name="The River condos",
            address="123 Charoenkrung Rd, Bang Rak",
            district="Bang Rak",
            city="Bangkok",
            country="Thailand",
            developer="Raimon Land",
            property_management_company="CBRE",
            total_units=200,
            completion_year=2020,
        )
        session.add(project)
        session.commit()
        session.refresh(project)

        # 3. 创建业主
        owner = Owner(
            id=uuid.uuid4(),
            user_id=owner_user.id,
            nationality="Chinese",
            tax_id="1234567890123",
            address="123 Sukhumvit Rd, Bangkok",
            contact_preference="wechat",
        )
        session.add(owner)
        session.commit()
        session.refresh(owner)

        # 4. 创建房源（5 套）
        properties = []
        statuses = [PropertyStatus.vacant, PropertyStatus.rented, PropertyStatus.rented, PropertyStatus.vacant, PropertyStatus.maintenance]
        for i in range(5):
            p = Property(
                id=uuid.uuid4(),
                project_id=project.id,
                owner_id=owner.id,
                room_number=f"A-{1001+i}",
                floor=10 + i,
                building="Tower A",
                address=f"123 Charoenkrung Rd, Unit A-{1001+i}, Bangkok",
                property_type="condo",
                monthly_rent=25000 + i * 5000,
                currency="THB",
                deposit_amount=50000 + i * 10000,
                deposit_months=2,
                size_sqm=45.0 + i * 5,
                bedrooms=1 + i % 3,
                bathrooms=1 + i % 2,
                status=statuses[i],
                furnished=True,
                available_from=datetime.now(timezone.utc) if statuses[i] == PropertyStatus.vacant else None,
            )
            properties.append(p)
            session.add(p)
        session.commit()

        # 5. 创建租客
        tenant = Tenant(
            id=uuid.uuid4(),
            user_id=tenant_user.id,
            nationality="Chinese",
            monthly_income=80000,
        )
        session.add(tenant)
        session.commit()
        session.refresh(tenant)

        # 6. 创建租约（2 个 active）
        leases = []
        for i, prop in enumerate(properties[:2]):
            lease = Lease(
                id=uuid.uuid4(),
                property_id=prop.id,
                tenant_id=tenant.id,
                owner_id=owner.id,
                start_date=datetime.now(timezone.utc) - timedelta(days=180 - i * 30),
                end_date=datetime.now(timezone.utc) + timedelta(days=185 + i * 30),
                monthly_rent=prop.monthly_rent,
                currency="THB",
                deposit_amount=prop.deposit_amount,
                status=LeaseStatus.active,
            )
            leases.append(lease)
            session.add(lease)
        session.commit()

        # 7. 创建员工
        employee = Employee(
            id=uuid.uuid4(),
            user_id=employee_user.id,
            employee_code="EMP001",
            department="Sales",
            position="Property Agent",
            hire_date=(datetime.now(timezone.utc) - timedelta(days=365)).date(),
            phone="+66812345678",
            wechat_id="agent_wang",
            is_active=True,
        )
        session.add(employee)
        session.commit()
        session.refresh(employee)

        # 7.5 系统自动核算业绩：为租约关联成交员工并生成佣金结算
        for i, lease in enumerate(leases):
            lease.agent_id = employee.id
            session.add(lease)
            session.add(
                CommissionSettlement(
                    id=uuid.uuid4(),
                    employee_id=employee.id,
                    lease_id=lease.id,
                    deal_type=DealType.new_rental,
                    commission_base=lease.monthly_rent,
                    commission_rate=1.0,
                    commission_amount=lease.monthly_rent,
                    currency="THB",
                    status=SettlementStatus.paid if i == 0 else SettlementStatus.approved,
                    settled_at=datetime.now(timezone.utc) - timedelta(days=30 * (2 - i)),
                    paid_at=datetime.now(timezone.utc) - timedelta(days=30 * (2 - i)) if i == 0 else None,
                )
            )
        session.commit()

        # 8. 创建客户线索
        leads_data = [
            ("张三", LeadStage.inquiring, "WeChat", 30000, 50000),
            ("John Smith", LeadStage.viewing_scheduled, "Line", 25000, 40000),
            ("Somchai", LeadStage.negotiating, "Phone", 20000, 35000),
            ("Lisa Wang", LeadStage.pending_contract, "WeChat", 35000, 60000),
        ]
        for name, stage, source, budget_min, budget_max in leads_data:
            lead = Lead(
                id=uuid.uuid4(),
                name=name,
                nationality="Thai" if "Somchai" in name else "Chinese",
                stage=stage,
                source=source,
                budget_min=budget_min,
                budget_max=budget_max,
                budget_currency="THB",
                assigned_to=employee.id,
                interested_projects=[project.name],
            )
            session.add(lead)
        session.commit()

        # 9. 创建付款记录
        for i in range(3):
            payment = Payment(
                id=uuid.uuid4(),
                lease_id=leases[i].id if i < len(leases) else None,
                property_id=properties[i].id,
                payer_id=tenant_user.id,
                payee_id=owner_user.id,
                amount=properties[i].monthly_rent,
                currency="THB",
                payment_type=PaymentType.rent,
                status=PaymentStatus.succeeded if i < 2 else PaymentStatus.pending,
                channel="promptpay" if i == 0 else ("wechat" if i == 1 else "bank_transfer"),
                idempotency_key=f"seed-pay-{i}",
                paid_at=datetime.now(timezone.utc) - timedelta(days=30 * (2 - i)) if i < 2 else None,
                due_date=datetime.now(timezone.utc) + timedelta(days=7) if i == 2 else None,
            )
            session.add(payment)
        session.commit()

        # 10. 创建 Feature Flags
        flags = [
            FeatureFlag(id=uuid.uuid4(), key="enable_ai_scoring", description="AI 客户评分", enabled=False, rollout_percentage=0),
            FeatureFlag(id=uuid.uuid4(), key="enable_bi_dashboard", description="BI 数据看板", enabled=False, rollout_percentage=0),
            FeatureFlag(id=uuid.uuid4(), key="enable_multilang", description="多语言支持", enabled=True, rollout_percentage=100),
            FeatureFlag(id=uuid.uuid4(), key="enable_wechat_pay", description="微信支付", enabled=True, rollout_percentage=100),
            FeatureFlag(id=uuid.uuid4(), key="enable_promptpay", description="PromptPay 支付", enabled=True, rollout_percentage=100),
        ]
        session.add_all(flags)

        # 11. 创建隐私政策版本
        policy = PrivacyPolicyVersion(
            id=uuid.uuid4(),
            version="1.0.0",
            content="We collect and process your personal data in accordance with PDPA...",
            effective_at=datetime.now(timezone.utc),
            language="zh",
        )
        session.add(policy)

        session.commit()

        print("✅ 种子数据创建完成!")
        print(f"   用户: 5 个 (admin/agent/owner/tenant/employee)")
        print(f"   项目: 1 个")
        print(f"   业主: 1 个")
        print(f"   房源: 5 套")
        print(f"   租客: 1 个")
        print(f"   租约: 2 个")
        print(f"   员工: 1 个")
        print(f"   线索: 4 个")
        print(f"   付款: 3 笔")
        print(f"   Feature Flags: 5 个")
        print(f"   隐私政策: 1 个版本")
        print()
        print("📋 测试账号:")
        print("   Admin:    admin@viprental.com / admin123")
        print("   Agent:    agent@viprental.com / agent123")
        print("   Owner:    owner@viprental.com / owner123")
        print("   Tenant:   tenant@viprental.com / tenant123")
        print("   Employee: employee@viprental.com / emp123")


if __name__ == "__main__":
    seed_all()
