from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app.core.config import get_settings
from app.db.prisma import connect_db, disconnect_db
from app.routers import auth, dashboard, inventory, invoices, quality, realtime, recipes, suppliers


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.app_env == "test":
        yield
        return
    await connect_db()
    yield
    await disconnect_db()


settings = get_settings()

app = FastAPI(
    title=f"{settings.app_name} API",
    version="0.1.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(suppliers.router, prefix="/api/v1")
app.include_router(inventory.router, prefix="/api/v1")
app.include_router(recipes.router, prefix="/api/v1")
app.include_router(invoices.router, prefix="/api/v1")
app.include_router(quality.router, prefix="/api/v1")
app.include_router(realtime.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.app_name}
