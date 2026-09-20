"""数据模型聚合导入。

集中导入所有 SQLModel 表模型与枚举，便于 Alembic 自动发现元数据。
"""
from .base import TimestampMixin
from .user import User, UserRole
from .verification_code import VerificationCode
from .project import Project
from .owner import Owner
from .property import Property, PropertyStatus
from .tenant import Tenant
from .lease import Lease, LeaseStatus
from .lead import Lead, LeadStage
from .employee import Employee
from .payment import Payment, PaymentType, PaymentStatus
from .document import Document, DocumentType
from .service_order import ServiceOrder, ServiceType, ServiceOrderStatus
from .maintenance_ticket import MaintenanceTicket, TicketPriority, TicketStatus
from .notification import Notification, NotificationChannel, NotificationStatus
from .service_package import (
    ServicePackage,
    ServicePackageType,
    ServiceBillingModel,
    ServicePackageStatus,
)
from .attendance import Attendance, AttendanceStatus
from .commission_settlement import (
    CommissionSettlement,
    DealType,
    SettlementStatus,
)
from .event import Event, EventStatus
from .pdpa import (
    Consent,
    AuditLog,
    DataSubjectRequest,
    DataSubjectRequestType,
    DataSubjectRequestStatus,
    PrivacyPolicyVersion,
)
from .feature_flag import FeatureFlag
from .chat import Conversation, Message, MessageType, ChatParticipant
from .contract import (
    Contract,
    ContractStatus,
    ContractParty,
    SignerRole,
    SignatureRecord,
)
from .backup import BackupJob, BackupStatus, BackupType
from .external_trip import ExternalTripApplication, TripStatus
from .viewing_appointment import ViewingAppointment, ViewingStatus
from .commission_rule import CommissionRule, CommissionRuleScope
from .favorite import Favorite
from .sale_listing import SaleListing, SaleType, ListingStatus, Valuation, AVMMethod
from .property_deal import (
    PropertyDeal,
    PropertyDealStatus,
    Escrow,
    EscrowStatus,
    MortgageApplication,
    MortgageType,
    MortgageStatus,
)
from .broker import (
    BrokerPartner,
    BrokerLevel,
    BrokerStatus,
    BrokerType,
    Referral,
    SplitDeal,
)
from .market import (
    MarketConfig,
    MarketStatus,
    LocalPaymentChannel,
    PaymentChannelStatus,
    ComplianceDoc,
)
from .market_data import (
    MarketIndex,
    MarketReport,
    PropertyMatch,
    ChurnSignal,
)
from .rbac import Permission, RolePermission, UserGroup, UserGroupMember
from .company_profile import CompanyProfile

# 全局注册乐观锁版本号自增（Web 与 Celery worker 都从本模块导入模型）
from app.core.concurrency import install_version_bumper

install_version_bumper()

__all__ = [
    "TimestampMixin",
    "User",
    "UserRole",
    "VerificationCode",
    "Project",
    "Owner",
    "Property",
    "PropertyStatus",
    "Tenant",
    "Lease",
    "LeaseStatus",
    "Lead",
    "LeadStage",
    "Employee",
    "Payment",
    "PaymentType",
    "PaymentStatus",
    "Document",
    "DocumentType",
    "ServiceOrder",
    "ServiceType",
    "ServiceOrderStatus",
    "MaintenanceTicket",
    "TicketPriority",
    "TicketStatus",
    "Notification",
    "NotificationChannel",
    "NotificationStatus",
    "ServicePackage",
    "ServicePackageType",
    "ServiceBillingModel",
    "ServicePackageStatus",
    "Attendance",
    "AttendanceStatus",
    "CommissionSettlement",
    "DealType",
    "SettlementStatus",
    "Event",
    "EventStatus",
    "Consent",
    "AuditLog",
    "DataSubjectRequest",
    "DataSubjectRequestType",
    "DataSubjectRequestStatus",
    "PrivacyPolicyVersion",
    "FeatureFlag",
    "Conversation",
    "Message",
    "MessageType",
    "ChatParticipant",
    "Contract",
    "ContractStatus",
    "ContractParty",
    "SignerRole",
    "SignatureRecord",
    "BackupJob",
    "BackupStatus",
    "BackupType",
    "ExternalTripApplication",
    "TripStatus",
    "ViewingAppointment",
    "ViewingStatus",
    "CommissionRule",
    "CommissionRuleScope",
    "Favorite",
    "SaleListing",
    "SaleType",
    "ListingStatus",
    "Valuation",
    "AVMMethod",
    "PropertyDeal",
    "PropertyDealStatus",
    "Escrow",
    "EscrowStatus",
    "MortgageApplication",
    "MortgageType",
    "MortgageStatus",
    "BrokerPartner",
    "BrokerLevel",
    "BrokerStatus",
    "BrokerType",
    "Referral",
    "SplitDeal",
    "MarketConfig",
    "MarketStatus",
    "LocalPaymentChannel",
    "PaymentChannelStatus",
    "ComplianceDoc",
    "MarketIndex",
    "MarketReport",
    "PropertyMatch",
    "ChurnSignal",
    "Permission",
    "RolePermission",
    "UserGroup",
    "UserGroupMember",
    "CompanyProfile",
]
