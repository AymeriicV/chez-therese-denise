from fastapi import APIRouter, Depends

from app.db.prisma import db
from app.models.schemas import InventoryItemCreate
from app.routers.deps import get_restaurant_context, require_roles

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("")
async def list_items(ctx=Depends(get_restaurant_context)):
    return await db.inventoryitem.find_many(
        where={"restaurantId": ctx["restaurant_id"]},
        order={"updatedAt": "desc"},
    )


@router.post("")
async def create_item(payload: InventoryItemCreate, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF"))):
    return await db.inventoryitem.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "name": payload.name,
            "category": payload.category,
            "unit": payload.unit,
            "quantityOnHand": payload.quantity_on_hand,
            "reorderPoint": payload.reorder_point,
            "averageCost": payload.average_cost,
            "allergens": payload.allergens,
        }
    )
