"""数据模型聚合导入。

集中导入所有 SQLModel 表模型与枚举，便于 Alembic 自动发现元数据。
"""
from .base import TimestampMixin
from .user import User, UserRole
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

__all__ = [
    "TimestampMixin",
    "User",
    "UserRole",
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
]
