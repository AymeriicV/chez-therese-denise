from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

from app.db.prisma import db
from app.services.company_settings import get_company_settings_snapshot


async def record_invoice_price_history_and_alerts(invoice, restaurant_id: str) -> list[str]:
    settings = await get_company_settings_snapshot(restaurant_id)
    threshold_percent = Decimal(str(settings["settings"]["price_alerts"].get("threshold_percent", "0.05") or "0.05"))
    threshold_percent = threshold_percent if threshold_percent > 0 else Decimal("0.05")
    created_alert_ids: list[str] = []
    invoice_date = getattr(invoice, "invoiceDate", None) or getattr(invoice, "createdAt", None) or datetime.now(UTC)
    for line in invoice.lines:
        if not getattr(line, "inventoryItemId", None):
            continue
        previous = await _latest_price_history(restaurant_id, line.inventoryItemId, invoice.supplierId)
        current_price = line.unitPrice or Decimal("0")
        await db.execute_raw(
            """
            INSERT INTO "PriceHistory" (
                "id",
                "restaurantId",
                "supplierId",
                "inventoryItemId",
                "invoiceId",
                "invoiceLineId",
                "codeArticle",
                "sourceLabel",
                "unitPrice",
                "quantity",
                "variationPercent",
                "createdAt"
            ) VALUES (
                $12,
                $1, $2, $3, $4, $5, $6, $7,
                $8::numeric(12,4),
                $9::numeric(12,3),
                $10::numeric(8,4),
                $11::timestamp
            )
            """,
            restaurant_id,
            invoice.supplierId,
            line.inventoryItemId,
            invoice.id,
            line.id,
            line.codeArticle,
            line.label,
            current_price,
            line.quantity,
            _variation_percent(previous.unitPrice if previous else None, current_price),
            invoice_date,
            str(uuid4()),
        )
        if previous and previous.unitPrice > 0:
            variation = (current_price - previous.unitPrice) / previous.unitPrice
            if variation >= threshold_percent:
                rows = await db.query_raw(
                    """
                    INSERT INTO "PriceAlert" (
                        "id",
                        "restaurantId",
                        "supplierId",
                        "inventoryItemId",
                        "invoiceId",
                        "invoiceLineId",
                        "previousUnitPrice",
                        "newUnitPrice",
                        "variationPercent",
                        "thresholdPercent",
                        "status",
                        "message",
                        "createdAt"
                    ) VALUES (
                        $13,
                        $1, $2, $3, $4, $5,
                        $6::numeric(12,4),
                        $7::numeric(12,4),
                        $8::numeric(8,4),
                        $9::numeric(8,4),
                        $10,
                        $11,
                        $12::timestamp
                    )
                    RETURNING "id"
                    """,
                    restaurant_id,
                    invoice.supplierId,
                    line.inventoryItemId,
                    invoice.id,
                    line.id,
                    previous.unitPrice,
                    current_price,
                    variation,
                    threshold_percent,
                    "NEW",
                    f"Hausse prix fournisseur: {line.label}",
                    datetime.now(UTC),
                    str(uuid4()),
                )
                if rows:
                    created_alert_ids.append(rows[0]["id"])
    return created_alert_ids


async def list_price_alerts(restaurant_id: str, include_viewed: bool = True) -> list[dict]:
    where = {"restaurantId": restaurant_id}
    if not include_viewed:
        where["status"] = "NEW"
    alerts = await db.pricealert.find_many(
        where=where,
        include={"supplier": True, "inventoryItem": True, "invoice": True},
        order={"createdAt": "desc"},
        take=100,
    )
    return [
        {
            "id": alert.id,
            "supplier_id": alert.supplierId,
            "supplier_name": alert.supplier.name if alert.supplier else None,
            "inventory_item_id": alert.inventoryItemId,
            "inventory_item_name": alert.inventoryItem.name if alert.inventoryItem else None,
            "invoice_id": alert.invoiceId,
            "invoice_number": alert.invoice.number if alert.invoice else None,
            "previous_unit_price": alert.previousUnitPrice,
            "new_unit_price": alert.newUnitPrice,
            "variation_percent": alert.variationPercent,
            "threshold_percent": alert.thresholdPercent,
            "status": alert.status,
            "message": alert.message,
            "created_at": alert.createdAt,
            "viewed_at": alert.viewedAt,
            "resolved_at": alert.resolvedAt,
        }
        for alert in alerts
    ]


async def mark_price_alert_viewed(alert_id: str, restaurant_id: str, status: str = "VIEWED") -> dict:
    alert = await db.pricealert.find_first(where={"id": alert_id, "restaurantId": restaurant_id})
    if not alert:
        raise ValueError("Alerte prix introuvable")
    updated = await db.pricealert.update(
        where={"id": alert.id},
        data={"status": status, "viewedAt": datetime.now(UTC) if status in {"VIEWED", "IGNORED", "TREATED"} else None},
        include={"supplier": True, "inventoryItem": True, "invoice": True},
    )
    return {
        "id": updated.id,
        "supplier_id": updated.supplierId,
        "supplier_name": updated.supplier.name if updated.supplier else None,
        "inventory_item_id": updated.inventoryItemId,
        "inventory_item_name": updated.inventoryItem.name if updated.inventoryItem else None,
        "invoice_id": updated.invoiceId,
        "invoice_number": updated.invoice.number if updated.invoice else None,
        "previous_unit_price": updated.previousUnitPrice,
        "new_unit_price": updated.newUnitPrice,
        "variation_percent": updated.variationPercent,
        "threshold_percent": updated.thresholdPercent,
        "status": updated.status,
        "message": updated.message,
        "created_at": updated.createdAt,
        "viewed_at": updated.viewedAt,
        "resolved_at": updated.resolvedAt,
    }


async def _latest_price_history(restaurant_id: str, inventory_item_id: str, supplier_id: str | None):
    if supplier_id:
        history = await db.pricehistory.find_first(
            where={"restaurantId": restaurant_id, "inventoryItemId": inventory_item_id, "supplierId": supplier_id},
            order={"createdAt": "desc"},
        )
        if history:
            return history
    return await db.pricehistory.find_first(
        where={"restaurantId": restaurant_id, "inventoryItemId": inventory_item_id},
        order={"createdAt": "desc"},
    )


def _variation_percent(previous: Decimal | None, current: Decimal) -> Decimal:
    if not previous or previous <= 0:
        return Decimal("0")
    return (current - previous) / previous
