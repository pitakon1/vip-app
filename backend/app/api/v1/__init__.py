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

__all__ = ["api_router"]
