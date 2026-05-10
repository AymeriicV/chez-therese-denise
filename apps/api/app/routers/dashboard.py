from datetime import UTC, datetime

from fastapi import APIRouter, Depends

from app.db.prisma import db
from app.models.schemas import DashboardResponse, ModuleSummary
from app.routers.deps import get_restaurant_context

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


MODULES = [
    ("ocr", "OCR factures", "/invoices", "review"),
    ("suppliers", "Fournisseurs", "/suppliers", "active"),
    ("stock", "Stocks intelligents", "/stock", "live"),
    ("haccp", "HACCP / PMS", "/haccp", "compliance"),
    ("planning", "Planning equipe", "/planning", "live"),
    ("time_clock", "Badgeuse", "/time-clock", "live"),
    ("analytics", "Analytics", "/analytics", "live"),
    ("ai", "IA predictive", "/ai", "soon"),
    ("settings", "Parametres entreprise", "/settings", "active"),
]


@router.get("", response_model=DashboardResponse)
async def dashboard(ctx=Depends(get_restaurant_context)):
    restaurant_id = ctx["restaurant_id"]
    restaurant = await db.restaurant.find_unique(where={"id": restaurant_id})
    supplier_count = await db.supplier.count(where={"restaurantId": restaurant_id})
    invoice_count = await db.supplierinvoice.count(where={"restaurantId": restaurant_id})
    item_count = await db.inventoryitem.count(where={"restaurantId": restaurant_id})
    notification_count = await db.notification.count(where={"restaurantId": restaurant_id, "readAt": None})

    return DashboardResponse(
        restaurant={"id": restaurant.id, "name": restaurant.name, "timezone": restaurant.timezone},
        kpis={
            "suppliers": supplier_count,
            "invoices": invoice_count,
            "inventory_items": item_count,
            "unread_notifications": notification_count,
            "estimated_margin_rate": 0.714,
        },
        modules=[ModuleSummary(key=k, label=l, href=h, status=s) for k, l, h, s in MODULES],
        generated_at=datetime.now(UTC),
    )
