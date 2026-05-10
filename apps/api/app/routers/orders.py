from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.db.prisma import db
from app.models.schemas import (
    PurchaseOrderCreate,
    PurchaseOrderLineCreate,
    PurchaseOrderLineUpdate,
    PurchaseOrderReceive,
    PurchaseOrderUpdate,
)
from app.routers.deps import get_restaurant_context, require_roles
from app.services.audit import write_audit_log
from app.services.stock import create_stock_movement

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("/suggestions")
async def replenishment_suggestions(ctx=Depends(get_restaurant_context)):
    items = await db.inventoryitem.find_many(
        where={"restaurantId": ctx["restaurant_id"], "isActive": True, "supplierId": {"not": None}},
        include={"supplier": True},
        order={"name": "asc"},
    )
    grouped: dict[str, dict] = {}
    for item in items:
        if item.quantityOnHand > item.reorderPoint:
            continue
        if not item.supplier:
            continue
        recommended = item.reorderPoint - item.quantityOnHand
        if recommended <= 0:
            recommended = Decimal("1")
        supplier_group = grouped.setdefault(
            item.supplier.id,
            {"supplier_id": item.supplier.id, "supplier_name": item.supplier.name, "lines": []},
        )
        supplier_group["lines"].append(
            {
                "inventory_item_id": item.id,
                "item_name": item.name,
                "unit": item.unit,
                "quantity_on_hand": item.quantityOnHand,
                "reorder_point": item.reorderPoint,
                "recommended_quantity": recommended,
                "average_cost": item.averageCost,
            }
        )
    return list(grouped.values())


@router.get("")
async def list_orders(include_archived: bool = Query(False), ctx=Depends(get_restaurant_context)):
    where = {"restaurantId": ctx["restaurant_id"]}
    if not include_archived:
        where["isArchived"] = False
    orders = await db.purchaseorder.find_many(
        where=where,
        include={"supplier": True, "lines": {"include": {"inventoryItem": True}}},
        order={"updatedAt": "desc"},
    )
    return [_serialize_order(order) for order in orders]


@router.post("")
async def create_order(payload: PurchaseOrderCreate, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF"))):
    supplier = await db.supplier.find_first(where={"id": payload.supplier_id, "restaurantId": ctx["restaurant_id"], "isActive": True})
    if not supplier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fournisseur introuvable")
    if not payload.lines:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Ajoutez au moins une ligne de commande")
    lines_data, total = await _build_order_lines(payload.lines, ctx["restaurant_id"], supplier.id)
    order = await db.purchaseorder.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "supplierId": supplier.id,
            "number": await _next_order_number(ctx["restaurant_id"]),
            "notes": payload.notes,
            "totalAmount": total,
            "lines": {"create": lines_data},
        },
        include={"supplier": True, "lines": {"include": {"inventoryItem": True}}},
    )
    await _audit(ctx, "orders.created", "PurchaseOrder", order.id)
    return _serialize_order(order)


@router.patch("/{order_id}")
async def update_order(order_id: str, payload: PurchaseOrderUpdate, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF"))):
    order = await _get_order(order_id, ctx["restaurant_id"])
    if order.status == "RECEIVED" and payload.status and payload.status != "RECEIVED":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Une commande reçue ne peut plus revenir en arrière")
    updated = await db.purchaseorder.update(
        where={"id": order.id},
        data={
            **({"notes": payload.notes} if payload.notes is not None else {}),
            **({"status": payload.status} if payload.status is not None else {}),
            **({"sentAt": datetime.now(UTC)} if payload.status == "SENT" and order.sentAt is None else {}),
            **({"archivedAt": datetime.now(UTC), "isArchived": True} if payload.status == "ARCHIVED" else {}),
        },
        include={"supplier": True, "lines": {"include": {"inventoryItem": True}}},
    )
    await _audit(ctx, "orders.updated", "PurchaseOrder", order.id, {"status": updated.status})
    return _serialize_order(updated)


@router.patch("/{order_id}/lines/{line_id}")
async def update_order_line(
    order_id: str,
    line_id: str,
    payload: PurchaseOrderLineUpdate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF")),
):
    order = await _get_order(order_id, ctx["restaurant_id"])
    if order.status != "DRAFT":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Seules les commandes brouillon sont modifiables")
    line = await db.purchaseorderline.find_first(where={"id": line_id, "purchaseOrderId": order.id})
    if not line:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ligne de commande introuvable")
    quantity_ordered = payload.quantity_ordered if payload.quantity_ordered is not None else line.quantityOrdered
    unit_cost = payload.unit_cost if payload.unit_cost is not None else line.unitCost
    line_total = quantity_ordered * unit_cost if unit_cost is not None else Decimal("0")
    await db.purchaseorderline.update(
        where={"id": line.id},
        data={
            **({"quantityOrdered": quantity_ordered} if payload.quantity_ordered is not None else {}),
            **({"quantityReceived": payload.quantity_received} if payload.quantity_received is not None else {}),
            **({"unitCost": unit_cost} if payload.unit_cost is not None else {}),
            "lineTotal": line_total,
        },
    )
    updated = await _refresh_order_totals(order.id)
    await _audit(ctx, "orders.line_updated", "PurchaseOrderLine", line.id, {"orderId": order.id})
    return _serialize_order(updated)


@router.post("/{order_id}/lines")
async def add_order_line(
    order_id: str,
    payload: PurchaseOrderLineCreate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF")),
):
    order = await _get_order(order_id, ctx["restaurant_id"])
    if order.status != "DRAFT":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Seules les commandes brouillon sont modifiables")
    item = await db.inventoryitem.find_first(where={"id": payload.inventory_item_id, "restaurantId": ctx["restaurant_id"], "isActive": True})
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article stock introuvable")
    if item.supplierId != order.supplierId:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="L'article ajouté doit appartenir au même fournisseur")
    unit_cost = payload.unit_cost if payload.unit_cost is not None else item.averageCost
    line = await db.purchaseorderline.create(
        data={
            "purchaseOrderId": order.id,
            "inventoryItemId": item.id,
            "itemName": item.name,
            "unit": item.unit,
            "quantityOrdered": payload.quantity_ordered,
            "unitCost": unit_cost,
            "lineTotal": payload.quantity_ordered * unit_cost if unit_cost is not None else Decimal("0"),
        }
    )
    updated = await _refresh_order_totals(order.id)
    await _audit(ctx, "orders.line_added", "PurchaseOrderLine", line.id, {"orderId": order.id})
    return _serialize_order(updated)


@router.delete("/{order_id}/lines/{line_id}")
async def delete_order_line(order_id: str, line_id: str, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF"))):
    order = await _get_order(order_id, ctx["restaurant_id"])
    if order.status != "DRAFT":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Seules les commandes brouillon sont modifiables")
    line = await db.purchaseorderline.find_first(where={"id": line_id, "purchaseOrderId": order.id})
    if not line:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ligne de commande introuvable")
    await db.purchaseorderline.delete(where={"id": line.id})
    updated = await _refresh_order_totals(order.id)
    await _audit(ctx, "orders.line_deleted", "PurchaseOrderLine", line.id, {"orderId": order.id})
    return _serialize_order(updated)


@router.post("/{order_id}/receive")
async def receive_order(order_id: str, payload: PurchaseOrderReceive, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF"))):
    order = await _get_order(order_id, ctx["restaurant_id"])
    if order.status == "RECEIVED":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Cette commande a déjà été reçue")
    line_updates = {line.line_id: line for line in payload.lines if line.line_id}
    for line in order.lines:
        line_payload = line_updates.get(line.id)
        quantity_received = line_payload.quantity_received if line_payload and line_payload.quantity_received is not None else line.quantityOrdered
        if quantity_received < 0:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="La quantité reçue doit être positive")
        item = line.inventoryItem
        movement = await create_stock_movement(
            item=item,
            movement_type="PURCHASE",
            quantity=quantity_received,
            unit_cost=line.unitCost,
            note=f"Réception commande {order.number}",
        )
        await db.purchaseorderline.update(where={"id": line.id}, data={"quantityReceived": quantity_received})
        await _audit(
            ctx,
            "orders.received_line",
            "StockMovement",
            movement.id,
            {"orderId": order.id, "itemId": item.id, "quantity": str(quantity_received)},
        )
    updated = await db.purchaseorder.update(
        where={"id": order.id},
        data={"status": "RECEIVED", "receivedAt": datetime.now(UTC)},
        include={"supplier": True, "lines": {"include": {"inventoryItem": True}}},
    )
    await _audit(ctx, "orders.received", "PurchaseOrder", order.id)
    return _serialize_order(updated)


@router.delete("/{order_id}")
async def archive_order(order_id: str, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER"))):
    order = await _get_order(order_id, ctx["restaurant_id"])
    updated = await db.purchaseorder.update(
        where={"id": order.id},
        data={"status": "ARCHIVED", "isArchived": True, "archivedAt": datetime.now(UTC)},
        include={"supplier": True, "lines": {"include": {"inventoryItem": True}}},
    )
    await _audit(ctx, "orders.archived", "PurchaseOrder", order.id)
    return _serialize_order(updated)


async def _build_order_lines(lines: list[PurchaseOrderLineCreate], restaurant_id: str, supplier_id: str):
    result = []
    total = Decimal("0")
    for line in lines:
        item = await db.inventoryitem.find_first(where={"id": line.inventory_item_id, "restaurantId": restaurant_id, "isActive": True})
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article stock introuvable")
        if item.supplierId != supplier_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Tous les articles doivent appartenir au fournisseur de la commande")
        unit_cost = line.unit_cost if line.unit_cost is not None else item.averageCost
        line_total = line.quantity_ordered * unit_cost if unit_cost is not None else Decimal("0")
        result.append(
            {
                "inventoryItemId": item.id,
                "itemName": item.name,
                "unit": item.unit,
                "quantityOrdered": line.quantity_ordered,
                "unitCost": unit_cost,
                "lineTotal": line_total,
            }
        )
        total += line_total
    return result, total


async def _refresh_order_totals(order_id: str):
    lines = await db.purchaseorderline.find_many(where={"purchaseOrderId": order_id})
    total = sum((line.lineTotal for line in lines), Decimal("0"))
    return await db.purchaseorder.update(
        where={"id": order_id},
        data={"totalAmount": total},
        include={"supplier": True, "lines": {"include": {"inventoryItem": True}}},
    )


async def _get_order(order_id: str, restaurant_id: str):
    order = await db.purchaseorder.find_first(
        where={"id": order_id, "restaurantId": restaurant_id},
        include={"supplier": True, "lines": {"include": {"inventoryItem": True}}},
    )
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Commande fournisseur introuvable")
    return order


async def _next_order_number(restaurant_id: str):
    count = await db.purchaseorder.count(where={"restaurantId": restaurant_id})
    return f"BC-{datetime.now(UTC).strftime('%Y%m%d')}-{count + 1:03d}"


def _serialize_order(order):
    return {
        "id": order.id,
        "supplier_id": order.supplierId,
        "supplier_name": order.supplier.name,
        "number": order.number,
        "status": order.status,
        "ordered_at": order.orderedAt,
        "sent_at": order.sentAt,
        "received_at": order.receivedAt,
        "notes": order.notes,
        "total_amount": order.totalAmount,
        "is_archived": order.isArchived,
        "lines": [
            {
                "id": line.id,
                "inventory_item_id": line.inventoryItemId,
                "item_name": line.itemName,
                "unit": line.unit,
                "quantity_ordered": line.quantityOrdered,
                "quantity_received": line.quantityReceived,
                "unit_cost": line.unitCost,
                "line_total": line.lineTotal,
                "current_stock": line.inventoryItem.quantityOnHand,
                "reorder_point": line.inventoryItem.reorderPoint,
            }
            for line in order.lines
        ],
    }


async def _audit(ctx, action: str, entity: str, entity_id: str, metadata: dict | None = None):
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        metadata=metadata,
    )
