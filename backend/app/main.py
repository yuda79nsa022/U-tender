from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.router import router as auth_router
from app.config import get_settings
from app.routers.admin import router as admin_router
from app.routers.billing import router as billing_router
from app.routers.contractor import router as contractor_router
from app.routers.cron import router as cron_router
from app.routers.files import router as files_router
from app.routers.offers import router as offers_router
from app.routers.owner import router as owner_router
from app.routers.projects import router as projects_router

settings = get_settings()

app = FastAPI(title="U-Tender API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(offers_router)
app.include_router(owner_router)
app.include_router(contractor_router)
app.include_router(admin_router)
app.include_router(billing_router)
app.include_router(cron_router)
app.include_router(files_router)


@app.get("/health")
def health():
    return {"ok": True}
