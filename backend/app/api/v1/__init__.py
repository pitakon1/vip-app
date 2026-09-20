"""API v1 路由聚合模块。

将所有 v1 路由挂载到统一的 api_router 上，前缀为 /api/v1。
"""
from fastapi import APIRouter

from .auth import router as auth_router
from .dashboard import router as dashboard_router
from .properties import router as properties_router
from .projects import router as projects_router
from .leases import router as leases_router
from .leads import router as leads_router
from .payments import router as payments_router
from .documents import router as documents_router
from .service_orders import router as service_orders_router
from .service_packages import router as service_packages_router
from .maintenance import router as maintenance_router
from .notifications import router as notifications_router
from .performance import router as performance_router
from .employees import router as employees_router
from .attendance import router as attendance_router
from .commissions import router as commissions_router
from .tenants import router as tenants_router
from .owners import router as owners_router
from .company import router as company_router
from .billing import router as billing_router
from .chat import router as chat_router
from .contracts import router as contracts_router
from .ai import router as ai_router
from .backup import router as backup_router
from .geo import router as geo_router
from .translate import router as translate_router
from .viewings import router as viewings_router
from .audit import router as audit_router
from .commission_rules import router as commission_rules_router
from .favorites import router as favorites_router
from .sale_listings import router as sale_listings_router
from .property_deals import router as property_deals_router
from .brokers import router as brokers_router
from .markets import router as markets_router
from .market_data import router as market_data_router
from .users_admin import router as users_admin_router
from .user_groups import router as user_groups_router
from .permissions_admin import router as permissions_admin_router
from .review_center import router as review_center_router
from .operations import router as operations_router
from .exports import router as exports_router
from .listings import router as listings_router
from .dedupe_reviews import router as dedupe_reviews_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth_router)
api_router.include_router(dashboard_router)
api_router.include_router(properties_router)
api_router.include_router(projects_router)
api_router.include_router(leases_router)
api_router.include_router(leads_router)
api_router.include_router(payments_router)
api_router.include_router(documents_router)
api_router.include_router(service_orders_router)
api_router.include_router(service_packages_router)
api_router.include_router(maintenance_router)
api_router.include_router(notifications_router)
api_router.include_router(performance_router)
api_router.include_router(employees_router)
api_router.include_router(attendance_router)
api_router.include_router(commissions_router)
api_router.include_router(tenants_router)
api_router.include_router(owners_router)
api_router.include_router(company_router)
api_router.include_router(billing_router)
api_router.include_router(chat_router)
api_router.include_router(contracts_router)
api_router.include_router(ai_router)
api_router.include_router(backup_router)
api_router.include_router(geo_router)
api_router.include_router(translate_router)
api_router.include_router(viewings_router)
api_router.include_router(audit_router)
api_router.include_router(commission_rules_router)
api_router.include_router(favorites_router)
api_router.include_router(sale_listings_router)
api_router.include_router(property_deals_router)
api_router.include_router(brokers_router)
api_router.include_router(markets_router)
api_router.include_router(market_data_router)
api_router.include_router(users_admin_router)
api_router.include_router(user_groups_router)
api_router.include_router(permissions_admin_router)
api_router.include_router(review_center_router)
api_router.include_router(operations_router)
api_router.include_router(exports_router)
api_router.include_router(listings_router)
api_router.include_router(dedupe_reviews_router)

__all__ = ["api_router"]
