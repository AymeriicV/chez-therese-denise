from fastapi import APIRouter, Depends

from app.models.schemas import CompanySettingsOut, CompanySettingsUpdate
from app.routers.deps import get_restaurant_context, require_roles
from app.services.company_settings import get_company_settings_snapshot, upsert_company_settings_snapshot
from app.services.audit import write_audit_log

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/company", response_model=CompanySettingsOut)
async def get_company_settings(ctx=Depends(get_restaurant_context)):
    return await get_company_settings_snapshot(ctx["restaurant_id"])


@router.patch("/company", response_model=CompanySettingsOut)
async def patch_company_settings(
    payload: CompanySettingsUpdate,
    ctx=Depends(require_roles("OWNER", "ADMIN")),
):
    result = await upsert_company_settings_snapshot(
        ctx["restaurant_id"],
        restaurant_update=payload.restaurant.model_dump(exclude_unset=True) if payload.restaurant else None,
        company_update={
            "brand_name": payload.brand_name,
            "invoice_email": payload.invoice_email,
            "haccp_manager": payload.haccp_manager,
        },
        settings_update=payload.settings,
    )
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="settings.company_updated",
        entity="CompanySettings",
        entity_id=ctx["restaurant_id"],
        metadata={"sections": list(payload.model_fields_set)},
    )
    return result
