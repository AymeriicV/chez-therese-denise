from fastapi import APIRouter, Depends, HTTPException, status

from app.db.prisma import db
from app.models.schemas import InventoryItemCreate, StockMovementCreate
from app.routers.deps import get_restaurant_context, require_roles

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("")
async def list_items(ctx=Depends(get_restaurant_context)):
    items = await db.inventoryitem.find_many(
        where={"restaurantId": ctx["restaurant_id"]},
        include={"supplier": True, "movements": True},
        order={"updatedAt": "desc"},
    )
    return [_serialize_item(item) for item in items]


@router.get("/alerts")
async def stock_alerts(ctx=Depends(get_restaurant_context)):
    items = await db.inventoryitem.find_many(
        where={"restaurantId": ctx["restaurant_id"]},
        include={"supplier": True, "movements": True},
        order={"updatedAt": "desc"},
    )
    return [_serialize_item(item) for item in items if item.quantityOnHand <= item.reorderPoint]


@router.get("/summary")
async def stock_summary(ctx=Depends(get_restaurant_context)):
    items = await db.inventoryitem.find_many(where={"restaurantId": ctx["restaurant_id"]})
    total_value = sum((item.quantityOnHand * item.averageCost for item in items), 0)
    alert_count = len([item for item in items if item.quantityOnHand <= item.reorderPoint])
    return {
        "item_count": len(items),
        "alert_count": alert_count,
        "stock_value": total_value,
        "healthy_count": len(items) - alert_count,
    }


@router.post("")
async def create_item(payload: InventoryItemCreate, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF"))):
    return await db.inventoryitem.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "sku": payload.sku,
            "supplierId": payload.supplier_id,
            "name": payload.name,
            "category": payload.category,
            "storageArea": payload.storage_area,
            "unit": payload.unit,
            "quantityOnHand": payload.quantity_on_hand,
            "reorderPoint": payload.reorder_point,
            "averageCost": payload.average_cost,
            "allergens": payload.allergens,
        }
    )


@router.post("/movements")
async def create_movement(payload: StockMovementCreate, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF"))):
    item = await db.inventoryitem.find_first(
        where={"id": payload.inventory_item_id, "restaurantId": ctx["restaurant_id"]},
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    movement = await db.stockmovement.create(
        data={
            "inventoryItemId": item.id,
            "type": payload.type,
            "quantity": payload.quantity,
            "unitCost": payload.unit_cost,
            "note": payload.note,
        }
    )
    await db.inventoryitem.update(
        where={"id": item.id},
        data={"quantityOnHand": item.quantityOnHand + payload.quantity},
    )
    await db.auditlog.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "userId": ctx["user"].id,
            "action": "stock.movement_created",
            "entity": "StockMovement",
            "entityId": movement.id,
            "metadata": {"itemId": item.id, "quantity": str(payload.quantity), "type": payload.type},
        }
    )
    return movement


def _serialize_item(item):
    value = item.quantityOnHand * item.averageCost
    return {
        "id": item.id,
        "sku": item.sku,
        "name": item.name,
        "category": item.category,
        "storage_area": item.storageArea,
        "unit": item.unit,
        "quantity_on_hand": item.quantityOnHand,
        "reorder_point": item.reorderPoint,
        "average_cost": item.averageCost,
        "stock_value": value,
        "allergens": item.allergens,
        "last_counted_at": item.lastCountedAt,
        "supplier_name": item.supplier.name if item.supplier else None,
        "is_below_reorder_point": item.quantityOnHand <= item.reorderPoint,
        "movement_count": len(item.movements),
    }
