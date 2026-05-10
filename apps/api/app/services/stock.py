from decimal import Decimal

from fastapi import HTTPException, status

from app.db.prisma import db


async def ensure_supplier_belongs_to_restaurant(supplier_id: str | None, restaurant_id: str) -> None:
    if not supplier_id:
        return
    supplier = await db.supplier.find_first(where={"id": supplier_id, "restaurantId": restaurant_id})
    if not supplier:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Supplier does not belong to restaurant")


async def create_stock_movement(
    *,
    item,
    movement_type: str,
    quantity: Decimal,
    unit_cost: Decimal | None,
    note: str | None,
):
    next_quantity = item.quantityOnHand + quantity
    if next_quantity < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Stock quantity cannot become negative")
    movement = await db.stockmovement.create(
        data={
            "inventoryItemId": item.id,
            "type": movement_type,
            "quantity": quantity,
            "unitCost": unit_cost,
            "note": note,
        }
    )
    update_data = {"quantityOnHand": next_quantity}
    if movement_type == "PURCHASE" and quantity > 0 and unit_cost is not None and next_quantity > 0:
        previous_value = item.quantityOnHand * item.averageCost
        purchase_value = quantity * unit_cost
        update_data["averageCost"] = (previous_value + purchase_value) / next_quantity
    await db.inventoryitem.update(where={"id": item.id}, data=update_data)
    return movement


async def apply_invoice_lines_to_stock(invoice, restaurant_id: str) -> int:
    applied = 0
    for line in invoice.lines:
        if line.quantity <= 0:
            continue
        item = None
        if getattr(line, "inventoryItemId", None):
            item = await db.inventoryitem.find_first(
                where={"id": line.inventoryItemId, "restaurantId": restaurant_id}
            )
        if not item:
            item = await db.inventoryitem.find_first(where={"restaurantId": restaurant_id, "name": line.label})
        unit_cost = line.unitPrice
        if not item:
            item = await db.inventoryitem.create(
                data={
                    "restaurantId": restaurant_id,
                    "supplierId": invoice.supplierId,
                    "name": line.label,
                    "category": "Facture fournisseur",
                    "unit": line.unit,
                    "quantityOnHand": Decimal("0"),
                    "reorderPoint": Decimal("0"),
                    "averageCost": unit_cost,
                    "allergens": [],
                }
            )
        await create_stock_movement(
            item=item,
            movement_type="PURCHASE",
            quantity=line.quantity,
            unit_cost=unit_cost,
            note=f"Facture fournisseur {invoice.number or invoice.originalName}",
        )
        applied += 1
    return applied
