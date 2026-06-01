from fastapi import APIRouter

from app.api.v1.endpoints import (
    admin_audit,
    admin_dashboard,
    admin_knowledge,
    admin_rules,
    admin_templates,
    auth,
    clusters,
    compliance,
    expert_reviews,
    feedback,
    health_data,
    not_implemented,
    prescriptions,
    research_export,
    reports,
    risk,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(admin_audit.router)
api_router.include_router(admin_dashboard.router)
api_router.include_router(admin_knowledge.router)
api_router.include_router(admin_rules.router)
api_router.include_router(admin_templates.router)
api_router.include_router(clusters.router)
api_router.include_router(compliance.router)
api_router.include_router(expert_reviews.router)
api_router.include_router(feedback.router)
api_router.include_router(health_data.router)
api_router.include_router(prescriptions.router)
api_router.include_router(research_export.router)
api_router.include_router(reports.router)
api_router.include_router(risk.router)
api_router.include_router(users.router)
api_router.include_router(not_implemented.router)
