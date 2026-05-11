from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.db.prisma import db
from app.models.schemas import (
    InventoryCountUpdate,
    InventoryItemCreate,
    InventoryItemUpdate,
    InventorySessionCreate,
    StockMovementCreate,
)
from app.routers.deps import get_restaurant_context, require_roles
from app.services.audit import write_audit_log
from app.services.allergens import detect_allergens, merge_allergens
from app.services.produce_weights import suggest_inventory_weight_fields
from app.services.stock import create_stock_movement, ensure_supplier_belongs_to_restaurant

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("")
async def list_items(include_archived: bool = Query(False), ctx=Depends(get_restaurant_context)):
    where = {"restaurantId": ctx["restaurant_id"]}
    if not include_archived:
        where["isActive"] = True
    items = await db.inventoryitem.find_many(
        where=where,
        include={"supplier": True, "movements": True},
        order={"updatedAt": "desc"},
    )
    return [_serialize_item(item) for item in items]


@router.get("/alerts")
async def stock_alerts(ctx=Depends(get_restaurant_context)):
    items = await db.inventoryitem.find_many(
        where={"restaurantId": ctx["restaurant_id"], "isActive": True},
        include={"supplier": True, "movements": True},
        order={"updatedAt": "desc"},
    )
    return [_serialize_item(item) for item in items if item.quantityOnHand <= item.reorderPoint]


@router.get("/summary")
async def stock_summary(ctx=Depends(get_restaurant_context)):
    items = await db.inventoryitem.find_many(where={"restaurantId": ctx["restaurant_id"], "isActive": True})
    total_value = sum((item.quantityOnHand * item.averageCost for item in items), Decimal("0"))
    alert_count = len([item for item in items if item.quantityOnHand <= item.reorderPoint])
    return {
        "item_count": len(items),
        "alert_count": alert_count,
        "stock_value": total_value,
        "healthy_count": len(items) - alert_count,
    }


@router.post("")
async def create_item(payload: InventoryItemCreate, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF"))):
    await ensure_supplier_belongs_to_restaurant(payload.supplier_id, ctx["restaurant_id"])
    auto_allergens = detect_allergens(payload.name, payload.category)
    weight_fields = suggest_inventory_weight_fields(
        name=payload.name,
        category=payload.category,
        average_weight_grams=payload.average_weight_grams,
        edible_yield_rate=payload.edible_yield_rate,
        weight_source=payload.weight_source,
    )
    item = await db.inventoryitem.create(
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
            "averageWeightGrams": weight_fields["average_weight_grams"],
            "edibleYieldRate": weight_fields["edible_yield_rate"],
            "weightSource": weight_fields["weight_source"],
            "allergens": merge_allergens(payload.allergens, auto_allergens),
            "autoAllergens": auto_allergens,
        },
        include={"supplier": True, "movements": True},
    )
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="stock.item_created",
        entity="InventoryItem",
        entity_id=item.id,
    )
    return _serialize_item(item)


@router.patch("/{item_id}")
async def update_item(
    item_id: str,
    payload: InventoryItemUpdate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF")),
):
    item = await db.inventoryitem.find_first(where={"id": item_id, "restaurantId": ctx["restaurant_id"]})
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    if "supplier_id" in payload.model_fields_set:
        await ensure_supplier_belongs_to_restaurant(payload.supplier_id, ctx["restaurant_id"])
    field_map = {
        "sku": "sku",
        "supplier_id": "supplierId",
        "name": "name",
        "category": "category",
        "storage_area": "storageArea",
        "unit": "unit",
        "quantity_on_hand": "quantityOnHand",
        "reorder_point": "reorderPoint",
        "average_cost": "averageCost",
        "average_weight_grams": "averageWeightGrams",
        "edible_yield_rate": "edibleYieldRate",
        "weight_source": "weightSource",
        "allergens": "allergens",
    }
    nullable_fields = {"sku", "supplierId", "storageArea"}
    data = {
        field_map[key]: value
        for key, value in payload.model_dump(exclude_unset=True).items()
        if value is not None or field_map[key] in nullable_fields
    }
    if {"name", "category", "allergens"} & payload.model_fields_set:
        next_name = payload.name if payload.name is not None else item.name
        next_category = payload.category if payload.category is not None else item.category
        auto_allergens = detect_allergens(next_name, next_category)
        manual_allergens = payload.allergens if "allergens" in payload.model_fields_set else item.allergens
        data["allergens"] = merge_allergens(manual_allergens, auto_allergens)
        data["autoAllergens"] = auto_allergens
    current_weight_source = getattr(item, "weightSource", None)
    provided_weight_fields = {"average_weight_grams", "edible_yield_rate", "weight_source"} & payload.model_fields_set
    if provided_weight_fields or current_weight_source != "MANUAL":
        next_name = payload.name if payload.name is not None else item.name
        next_category = payload.category if payload.category is not None else item.category
        suggested = suggest_inventory_weight_fields(
            name=next_name,
            category=next_category,
            average_weight_grams=payload.average_weight_grams if "average_weight_grams" in payload.model_fields_set else getattr(item, "averageWeightGrams", None),
            edible_yield_rate=payload.edible_yield_rate if "edible_yield_rate" in payload.model_fields_set else getattr(item, "edibleYieldRate", None),
            weight_source=payload.weight_source if "weight_source" in payload.model_fields_set else current_weight_source,
        )
        data["averageWeightGrams"] = suggested["average_weight_grams"]
        data["edibleYieldRate"] = suggested["edible_yield_rate"]
        data["weightSource"] = suggested["weight_source"]
    updated = await db.inventoryitem.update(
        where={"id": item.id},
        data=data,
        include={"supplier": True, "movements": True},
    )
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="stock.item_updated",
        entity="InventoryItem",
        entity_id=item.id,
    )
    return _serialize_item(updated)


@router.delete("/{item_id}")
async def archive_item(item_id: str, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF"))):
    item = await db.inventoryitem.find_first(where={"id": item_id, "restaurantId": ctx["restaurant_id"]})
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    updated = await db.inventoryitem.update(
        where={"id": item.id},
        data={"isActive": False, "archivedAt": datetime.now(UTC)},
        include={"supplier": True, "movements": True},
    )
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="stock.item_archived",
        entity="InventoryItem",
        entity_id=item.id,
    )
    return _serialize_item(updated)


@router.post("/movements")
async def create_movement(payload: StockMovementCreate, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF"))):
    item = await db.inventoryitem.find_first(
        where={"id": payload.inventory_item_id, "restaurantId": ctx["restaurant_id"]},
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    movement = await create_stock_movement(
        item=item,
        movement_type=payload.type,
        quantity=payload.quantity,
        unit_cost=payload.unit_cost,
        note=payload.note,
    )
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="stock.movement_created",
        entity="StockMovement",
        entity_id=movement.id,
        metadata={"itemId": item.id, "quantity": str(payload.quantity), "type": payload.type},
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
        "average_weight_grams": getattr(item, "averageWeightGrams", None),
        "edible_yield_rate": getattr(item, "edibleYieldRate", None),
        "weight_source": getattr(item, "weightSource", None),
        "stock_value": value,
        "allergens": item.allergens,
        "auto_allergens": item.autoAllergens,
        "is_active": item.isActive,
        "archived_at": item.archivedAt,
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
    item_filter = {"restaurantId": ctx["restaurant_id"], "isActive": True}
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
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="inventory.session_created",
        entity="InventoryCountSession",
        entity_id=session.id,
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
    if session.status == "VALIDATED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Validated inventory cannot be edited")
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
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="inventory.line_counted",
        entity="InventoryCountLine",
        entity_id=line.id,
        metadata={"sessionId": session.id, "countedQty": str(payload.counted_qty)},
    )
    return _serialize_count_line(updated_line)


@router.post("/sessions/{session_id}/validate")
async def validate_inventory_session(session_id: str, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER"))):
    session = await _get_session(session_id, ctx["restaurant_id"])
    if session.status == "VALIDATED":
        return _serialize_session(session)
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
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="inventory.session_validated",
        entity="InventoryCountSession",
        entity_id=session.id,
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
