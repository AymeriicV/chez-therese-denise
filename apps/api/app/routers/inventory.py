from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.db.prisma import db
from app.models.schemas import InventoryCountUpdate, InventoryItemCreate, InventorySessionCreate, StockMovementCreate
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


@router.get("/sessions")
async def list_inventory_sessions(ctx=Depends(get_restaurant_context)):
    sessions = await db.inventorycountsession.find_many(
        where={"restaurantId": ctx["restaurant_id"]},
        include={"lines": {"include": {"item": True}}},
        order={"updatedAt": "desc"},
    )
    return [_serialize_session(session) for session in sessions]


@router.post("/sessions")
async def create_inventory_session(
    payload: InventorySessionCreate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF")),
):
    item_filter = {"restaurantId": ctx["restaurant_id"]}
    if payload.item_ids:
        item_filter["id"] = {"in": payload.item_ids}
    if payload.storage_area:
        item_filter["storageArea"] = payload.storage_area
    items = await db.inventoryitem.find_many(where=item_filter)
    session = await db.inventorycountsession.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "name": payload.name,
            "status": "COUNTING",
            "storageArea": payload.storage_area,
            "startedAt": datetime.now(UTC),
            "lines": {
                "create": [
                    {
                        "inventoryItemId": item.id,
                        "expectedQty": item.quantityOnHand,
                        "varianceQty": 0,
                    }
                    for item in items
                ]
            },
        },
        include={"lines": {"include": {"item": True}}},
    )
    await db.auditlog.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "userId": ctx["user"].id,
            "action": "inventory.session_created",
            "entity": "InventoryCountSession",
            "entityId": session.id,
        }
    )
    return _serialize_session(session)


@router.patch("/sessions/{session_id}/lines/{line_id}")
async def update_inventory_count(
    session_id: str,
    line_id: str,
    payload: InventoryCountUpdate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF")),
):
    session = await _get_session(session_id, ctx["restaurant_id"])
    line = next((entry for entry in session.lines if entry.id == line_id), None)
    if not line:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory count line not found")
    updated_line = await db.inventorycountline.update(
        where={"id": line.id},
        data={
            "countedQty": payload.counted_qty,
            "varianceQty": payload.counted_qty - line.expectedQty,
            "note": payload.note,
        },
        include={"item": True},
    )
    await db.inventorycountsession.update(where={"id": session.id}, data={"status": "REVIEW"})
    return _serialize_count_line(updated_line)


@router.post("/sessions/{session_id}/validate")
async def validate_inventory_session(session_id: str, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER"))):
    session = await _get_session(session_id, ctx["restaurant_id"])
    for line in session.lines:
        if line.countedQty is None:
            continue
        await db.inventoryitem.update(
            where={"id": line.inventoryItemId},
            data={"quantityOnHand": line.countedQty, "lastCountedAt": datetime.now(UTC)},
        )
        if line.varianceQty != 0:
            await db.stockmovement.create(
                data={
                    "inventoryItemId": line.inventoryItemId,
                    "type": "INVENTORY_ADJUSTMENT",
                    "quantity": line.varianceQty,
                    "note": f"Inventory session {session.name}",
                }
            )
    updated = await db.inventorycountsession.update(
        where={"id": session.id},
        data={"status": "VALIDATED", "validatedAt": datetime.now(UTC)},
        include={"lines": {"include": {"item": True}}},
    )
    await db.auditlog.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "userId": ctx["user"].id,
            "action": "inventory.session_validated",
            "entity": "InventoryCountSession",
            "entityId": session.id,
        }
    )
    return _serialize_session(updated)


async def _get_session(session_id: str, restaurant_id: str):
    session = await db.inventorycountsession.find_first(
        where={"id": session_id, "restaurantId": restaurant_id},
        include={"lines": {"include": {"item": True}}},
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory session not found")
    return session


def _serialize_session(session):
    counted = [line for line in session.lines if line.countedQty is not None]
    variance_value = sum((line.varianceQty * line.item.averageCost for line in session.lines), 0)
    return {
        "id": session.id,
        "name": session.name,
        "status": session.status,
        "storage_area": session.storageArea,
        "started_at": session.startedAt,
        "validated_at": session.validatedAt,
        "line_count": len(session.lines),
        "counted_line_count": len(counted),
        "variance_value": variance_value,
        "lines": [
            _serialize_count_line(line)
            for line in session.lines
        ],
    }


def _serialize_count_line(line):
    return {
        "id": line.id,
        "item_id": line.inventoryItemId,
        "item_name": line.item.name,
        "unit": line.item.unit,
        "expected_qty": line.expectedQty,
        "counted_qty": line.countedQty,
        "variance_qty": line.varianceQty,
        "note": line.note,
    }
