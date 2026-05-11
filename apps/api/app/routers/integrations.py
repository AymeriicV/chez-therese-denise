from fastapi import APIRouter, Depends

from app.models.schemas import CompanySettingsOut
from app.routers.deps import require_roles
from app.services.integrations import disable_addition_integration, sync_addition_sales, test_addition_connection

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.post("/addition/test", response_model=CompanySettingsOut)
async def test_addition(ctx=Depends(require_roles("OWNER", "ADMIN"))):
    return await test_addition_connection(ctx["restaurant_id"], ctx["user"].id)


@router.post("/addition/sync", response_model=CompanySettingsOut)
async def sync_addition(ctx=Depends(require_roles("OWNER", "ADMIN"))):
    return await sync_addition_sales(ctx["restaurant_id"], ctx["user"].id)


@router.post("/addition/disable", response_model=CompanySettingsOut)
async def disable_addition(ctx=Depends(require_roles("OWNER", "ADMIN"))):
    return await disable_addition_integration(ctx["restaurant_id"], ctx["user"].id)
