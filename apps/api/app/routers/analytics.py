from fastapi import APIRouter, Depends, Query

from app.models.schemas import AnalyticsOverviewOut, PriceAlertOut
from app.routers.deps import get_restaurant_context, require_roles
from app.services.insights import build_analytics_overview
from app.services.pricing import list_price_alerts, mark_price_alert_viewed
from app.services.audit import write_audit_log

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview", response_model=AnalyticsOverviewOut)
async def analytics_overview(ctx=Depends(get_restaurant_context)):
    return await build_analytics_overview(ctx["restaurant_id"])


@router.get("/price-alerts", response_model=list[PriceAlertOut])
async def price_alerts(
    include_viewed: bool = Query(True),
    ctx=Depends(get_restaurant_context),
):
    return await list_price_alerts(ctx["restaurant_id"], include_viewed=include_viewed)


@router.patch("/price-alerts/{alert_id}", response_model=PriceAlertOut)
async def update_price_alert(
    alert_id: str,
    payload: dict | None = None,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "ACCOUNTANT")),
):
    status_value = (payload or {}).get("status", "VIEWED")
    updated = await mark_price_alert_viewed(alert_id, ctx["restaurant_id"], status=status_value)
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="analytics.price_alert_updated",
        entity="PriceAlert",
        entity_id=alert_id,
        metadata={"status": status_value},
    )
    return updated
