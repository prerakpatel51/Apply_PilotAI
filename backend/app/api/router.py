from fastapi import APIRouter

from app.api.routes_auth import router as auth_router
from app.api.routes_profile import router as profile_router
from app.api.routes_providers import router as providers_router
from app.api.routes_resume_alignment import router as resume_alignment_router
from app.api.routes_search import router as search_router
from app.api.routes_usage import router as usage_router
from app.api.routes_admin import router as admin_router


api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(profile_router)
api_router.include_router(providers_router)
api_router.include_router(resume_alignment_router)
api_router.include_router(search_router)
api_router.include_router(usage_router)
api_router.include_router(admin_router)
