from __future__ import annotations

from collections import Counter, defaultdict
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.db.prisma import db
from app.services.company_settings import get_company_settings_snapshot


async def build_dashboard_overview(restaurant_id: str) -> dict:
    settings = await get_company_settings_snapshot(restaurant_id)
    restaurant = settings["restaurant"]
    now = _restaurant_now(restaurant)
    today = now.date()
    month_start = date(today.year, today.month, 1)
    prev_month_start = _shift_month(month_start, -1)
    next_week = today + timedelta(days=7)

    invoices = await db.supplierinvoice.find_many(
        where={"restaurantId": restaurant_id},
        include={"supplier": True, "lines": {"include": {"inventoryItem": True}}},
        order={"createdAt": "desc"},
    )
    inventory_items = await db.inventoryitem.find_many(where={"restaurantId": restaurant_id})
    production_batches = await db.productionbatch.find_many(where={"restaurantId": restaurant_id}, include={"recipe": True})
    haccp_tasks = await db.haccptask.find_many(where={"restaurantId": restaurant_id, "isArchived": False})
    temperature_logs = await db.temperaturelog.find_many(where={"restaurantId": restaurant_id, "isArchived": False}, order={"recordedAt": "desc"}, take=200)
    purchase_orders = await db.purchaseorder.find_many(where={"restaurantId": restaurant_id}, include={"supplier": True, "lines": True})
    time_entries = await db.timeclocklog.find_many(where={"restaurantId": restaurant_id, "isArchived": False}, include={"user": True})
    planning = await db.planningschedule.find_many(where={"restaurantId": restaurant_id, "isArchived": False}, include={"user": {"include": {"employeeProfile": True}}, "days": True})
    labels = await db.foodlabel.find_many(where={"restaurantId": restaurant_id, "isArchived": False})
    audit_logs = await db.auditlog.find_many(where={"restaurantId": restaurant_id}, include={"user": True}, order={"createdAt": "desc"}, take=25)
    price_alerts = await db.pricealert.find_many(where={"restaurantId": restaurant_id}, include={"supplier": True, "inventoryItem": True, "invoice": True}, order={"createdAt": "desc"}, take=20)

    invoice_status_counts = Counter(invoice.status for invoice in invoices)
    pending_ocr = invoice_status_counts.get("UPLOADED", 0) + invoice_status_counts.get("OCR_PROCESSING", 0)
    to_validate = invoice_status_counts.get("OCR_REVIEW", 0)

    approved_invoices = [invoice for invoice in invoices if invoice.approvedAt or invoice.status == "APPROVED"]
    purchases_current = _sum_invoice_amount(approved_invoices, month_start, next_week)
    purchases_previous = _sum_invoice_amount(approved_invoices, prev_month_start, month_start)
    purchase_variation = _variation_ratio(purchases_previous, purchases_current)

    stock_value = sum((item.quantityOnHand or Decimal("0")) * (item.averageCost or Decimal("0")) for item in inventory_items)
    low_stock = [item for item in inventory_items if item.isActive and item.quantityOnHand <= item.reorderPoint]
    ruptures = [item for item in inventory_items if item.isActive and item.quantityOnHand <= 0]
    labels_expiring = [label for label in labels if label.expiresAt <= now + timedelta(days=3)]

    production_today = [batch for batch in production_batches if _same_day(batch.preparedAt, today)]
    current_tasks = [task for task in haccp_tasks if _task_matches_today(task, today)]
    haccp_todo = len([task for task in current_tasks if task.status == "TODO"])
    haccp_late = len([task for task in current_tasks if task.status == "TODO" and task.dueAt and task.dueAt < now])
    temp_non_compliant = len([log for log in temperature_logs if not log.isCompliant])
    orders_to_pass = len([order for order in purchase_orders if order.status == "DRAFT"])
    orders_pending = len([order for order in purchase_orders if order.status == "SENT"])
    active_time_entries = [entry for entry in time_entries if entry.clockIn.date() == today]
    present_employees = len([entry for entry in active_time_entries if entry.clockIn and (not entry.clockOut or entry.clockOut.date() == today)])
    todays_shifts = []
    for schedule in planning:
        if any(day for day in schedule.days if day.weekday == today.weekday() and not day.isDayOff):
            todays_shifts.append(schedule)

    monthly_chart = _monthly_invoice_chart(approved_invoices, months=6)
    top_suppliers = _top_suppliers(approved_invoices)
    top_price_increases = _top_price_alerts(price_alerts)
    recent_activity = [
        {
            "label": f"{log.action} · {log.entity}",
            "detail": f"{log.user.firstName} {log.user.lastName}".strip() if getattr(log, "user", None) else "Système",
            "date": log.createdAt,
        }
        for log in audit_logs
    ]

    return {
        "restaurant": restaurant,
        "kpis": {
            "pending_ocr": pending_ocr,
            "to_validate": to_validate,
            "purchase_amount_month": purchases_current,
            "purchase_variation_percent": purchase_variation,
            "low_stock": len(low_stock),
            "ruptures": len(ruptures),
            "stock_value": stock_value,
            "production_today": len(production_today),
            "haccp_todo": haccp_todo,
            "haccp_late": haccp_late,
            "temperature_non_compliant": temp_non_compliant,
            "orders_to_pass": orders_to_pass,
            "orders_pending": orders_pending,
            "present_employees": present_employees,
            "planning_today": len(todays_shifts),
            "labels_expiring": len(labels_expiring),
            "price_alerts": len([alert for alert in price_alerts if alert.status == "NEW"]),
        },
        "alerts": {
            "priority": [
                {"label": f"{len(ruptures)} rupture(s) stock", "href": "/stock", "severity": "critical"},
                {"label": f"{len(price_alerts)} alerte(s) prix", "href": "/analytics", "severity": "warning"},
                {"label": f"{temp_non_compliant} température(s) non conforme(s)", "href": "/haccp", "severity": "warning"},
                {"label": f"{haccp_late} tâche(s) HACCP en retard", "href": "/haccp", "severity": "warning"},
            ],
            "stock": [
                {"name": item.name, "qty": item.quantityOnHand, "unit": item.unit, "reorder": item.reorderPoint}
                for item in low_stock[:8]
            ],
            "price": _top_price_alerts(price_alerts)[:8],
            "labels": [
                {"name": label.title, "expires_at": label.expiresAt}
                for label in labels_expiring[:8]
            ],
        },
        "quick_actions": [
            {"label": "Importer une facture", "href": "/invoices"},
            {"label": "Créer une commande", "href": "/orders"},
            {"label": "Saisir une température", "href": "/temperatures"},
            {"label": "Créer une fiche technique", "href": "/recipes"},
        ],
        "chart": monthly_chart,
        "top_suppliers": top_suppliers,
        "top_price_increases": top_price_increases,
        "tasks_today": [
            {"title": task.title, "category": task.category, "status": task.status, "due_at": task.dueAt}
            for task in current_tasks[:10]
        ],
        "recent_activity": recent_activity,
        "generated_at": datetime.now(UTC),
    }


async def build_analytics_overview(restaurant_id: str) -> dict:
    settings = await get_company_settings_snapshot(restaurant_id)
    restaurant = settings["restaurant"]
    now = _restaurant_now(restaurant)
    month_start = date(now.year, now.month, 1)
    prev_month_start = _shift_month(month_start, -1)
    invoices = await db.supplierinvoice.find_many(
        where={"restaurantId": restaurant_id, "status": {"in": ["APPROVED", "OCR_REVIEW"]}},
        include={"supplier": True, "lines": {"include": {"inventoryItem": True}}},
        order={"createdAt": "desc"},
    )
    recipes = await db.recipe.find_many(where={"restaurantId": restaurant_id}, include={"ingredients": {"include": {"inventoryItem": True, "subRecipe": True}}})
    productions = await db.productionbatch.find_many(where={"restaurantId": restaurant_id}, include={"recipe": True, "consumptions": True})
    price_histories = await db.pricehistory.find_many(
        where={"restaurantId": restaurant_id},
        include={"supplier": True, "inventoryItem": True},
        order={"createdAt": "desc"},
        take=300,
    )
    price_alerts = await db.pricealert.find_many(
        where={"restaurantId": restaurant_id},
        include={"supplier": True, "inventoryItem": True, "invoice": True},
        order={"createdAt": "desc"},
        take=100,
    )
    stock_movements = await db.stockmovement.find_many(where={"restaurantId": restaurant_id}, include={"item": True})
    time_entries = await db.timeclocklog.find_many(where={"restaurantId": restaurant_id, "isArchived": False}, include={"user": True})
    planning = await db.planningschedule.find_many(where={"restaurantId": restaurant_id, "isArchived": False}, include={"days": True, "user": True})
    haccp_tasks = await db.haccptask.find_many(where={"restaurantId": restaurant_id, "isArchived": False})

    purchases_by_month = _monthly_invoice_chart(invoices, months=6)
    supplier_spend = _supplier_spend(invoices)
    price_variations = _price_variations(price_histories)
    recipe_profitability = [
        {
            "id": recipe.id,
            "name": recipe.name,
            "category": recipe.category,
            "food_cost": recipe.foodCost,
            "cost_per_portion": recipe.costPerPortion,
            "selling_price": recipe.sellingPrice,
            "margin_rate": recipe.marginRate,
            "allergens": recipe.allergens,
        }
        for recipe in recipes
    ]
    production_by_period = _production_by_month(productions)
    stock_consumption_by_period = _stock_consumption_by_month(stock_movements, restaurant_id)
    team_time = _team_time(time_entries, planning, now.date())
    haccp = _haccp_metrics(haccp_tasks, restaurant_id, now.date())
    invoices_by_supplier = _invoices_by_supplier(invoices)

    return {
        "restaurant": restaurant,
        "purchases_by_month": purchases_by_month,
        "supplier_spend": supplier_spend,
        "price_variations": price_variations,
        "price_alerts": _top_price_alerts(price_alerts),
        "recipe_profitability": recipe_profitability,
        "production_by_period": production_by_period,
        "stock_consumption_by_period": stock_consumption_by_period,
        "team_time": team_time,
        "haccp": haccp,
        "invoices_by_supplier": invoices_by_supplier,
        "generated_at": datetime.now(UTC),
    }


def _restaurant_now(restaurant: dict) -> datetime:
    try:
        return datetime.now(ZoneInfo(restaurant.get("timezone") or "UTC"))
    except Exception:
        return datetime.now(UTC)


def _same_day(value: datetime | None, target: date) -> bool:
    return bool(value and value.date() == target)


def _sum_invoice_amount(invoices, start: date, end: date) -> Decimal:
    total = Decimal("0")
    for invoice in invoices:
        ref = (invoice.approvedAt or invoice.createdAt).date()
        if start <= ref < end:
            total += invoice.totalIncludingTax or invoice.totalExcludingTax or Decimal("0")
    return total


def _variation_ratio(previous: Decimal, current: Decimal) -> Decimal:
    if previous <= 0:
        return Decimal("0")
    return (current - previous) / previous


def _monthly_invoice_chart(invoices, months: int = 6) -> list[dict]:
    buckets: dict[str, Decimal] = {}
    today = date.today()
    month_start = date(today.year, today.month, 1)
    for offset in range(months - 1, -1, -1):
        month = _shift_month(month_start, -offset)
        key = month.strftime("%Y-%m")
        buckets[key] = Decimal("0")
    for invoice in invoices:
        ref = invoice.approvedAt or invoice.createdAt
        if not ref:
            continue
        key = ref.strftime("%Y-%m")
        if key in buckets:
            buckets[key] += invoice.totalIncludingTax or invoice.totalExcludingTax or Decimal("0")
    return [{"label": key, "value": value} for key, value in buckets.items()]


def _top_suppliers(invoices) -> list[dict]:
    totals: dict[str, dict] = {}
    for invoice in invoices:
        supplier = invoice.supplier
        if not supplier:
            continue
        key = supplier.id
        entry = totals.setdefault(
            key,
            {"id": supplier.id, "name": supplier.name, "amount": Decimal("0"), "count": 0},
        )
        entry["amount"] += invoice.totalIncludingTax or invoice.totalExcludingTax or Decimal("0")
        entry["count"] += 1
    return sorted(totals.values(), key=lambda item: item["amount"], reverse=True)[:8]


def _top_price_alerts(alerts) -> list[dict]:
    rows = []
    for alert in alerts:
        rows.append(
            {
                "id": alert.id,
                "supplier_id": alert.supplierId,
                "supplier_name": alert.supplier.name if alert.supplier else None,
                "inventory_item_id": alert.inventoryItemId,
                "inventory_item_name": alert.inventoryItem.name if alert.inventoryItem else None,
                "invoice_number": alert.invoice.number if alert.invoice else None,
                "variation_percent": alert.variationPercent,
                "previous_unit_price": alert.previousUnitPrice,
                "new_unit_price": alert.newUnitPrice,
                "status": alert.status,
                "message": alert.message,
                "created_at": alert.createdAt,
            }
        )
    return rows


def _shift_month(reference: date, offset: int) -> date:
    month = reference.month - 1 + offset
    year = reference.year + month // 12
    month = month % 12 + 1
    return date(year, month, 1)


def _supplier_spend(invoices) -> list[dict]:
    totals: dict[str, dict] = {}
    for invoice in invoices:
        supplier = invoice.supplier
        if not supplier:
            continue
        entry = totals.setdefault(
            supplier.id,
            {"id": supplier.id, "name": supplier.name, "amount": Decimal("0"), "count": 0},
        )
        entry["amount"] += invoice.totalIncludingTax or invoice.totalExcludingTax or Decimal("0")
        entry["count"] += 1
    return sorted(totals.values(), key=lambda item: item["amount"], reverse=True)[:10]


def _price_variations(price_histories) -> list[dict]:
    by_item_supplier: dict[tuple[str | None, str | None], list] = defaultdict(list)
    for history in reversed(price_histories):
        by_item_supplier[(history.inventoryItemId, history.supplierId)].append(history)
    rows: list[dict] = []
    for histories in by_item_supplier.values():
        if len(histories) < 2:
            continue
        current = histories[-1]
        previous = histories[-2]
        if previous.unitPrice <= 0:
            continue
        variation = (current.unitPrice - previous.unitPrice) / previous.unitPrice
        rows.append(
            {
                "inventory_item_id": current.inventoryItemId,
                "inventory_item_name": current.inventoryItem.name if current.inventoryItem else current.sourceLabel,
                "supplier_id": current.supplierId,
                "supplier_name": current.supplier.name if current.supplier else None,
                "previous_unit_price": previous.unitPrice,
                "current_unit_price": current.unitPrice,
                "variation_percent": variation,
                "created_at": current.createdAt,
            }
        )
    rows.sort(key=lambda row: row["variation_percent"], reverse=True)
    return rows[:20]


def _production_by_month(productions) -> list[dict]:
    buckets: dict[str, dict] = {}
    for production in productions:
        key = production.preparedAt.strftime("%Y-%m")
        bucket = buckets.setdefault(key, {"label": key, "productions": 0, "quantity": Decimal("0"), "cost": Decimal("0")})
        bucket["productions"] += 1
        bucket["quantity"] += production.quantityProduced
        bucket["cost"] += production.totalIngredientCost
    return sorted(buckets.values(), key=lambda row: row["label"])


def _stock_consumption_by_month(stock_movements, restaurant_id: str) -> list[dict]:
    buckets: dict[str, dict] = {}
    for movement in stock_movements:
        if not movement.item or movement.item.restaurantId != restaurant_id:
            continue
        key = movement.createdAt.strftime("%Y-%m")
        bucket = buckets.setdefault(key, {"label": key, "purchase": Decimal("0"), "production": Decimal("0"), "waste": Decimal("0"), "adjustment": Decimal("0")})
        if movement.type == "PURCHASE":
            bucket["purchase"] += movement.quantity
        elif movement.type == "PRODUCTION":
            bucket["production"] += movement.quantity
        elif movement.type == "WASTE":
            bucket["waste"] += movement.quantity
        else:
            bucket["adjustment"] += movement.quantity
    return sorted(buckets.values(), key=lambda row: row["label"])


def _team_time(time_entries, planning, target_day: date) -> dict:
    planned_minutes = 0
    for schedule in planning:
        for day in schedule.days:
            if day.isDayOff:
                continue
            planned_minutes += _day_minutes(day.morningStart, day.morningEnd, day.breakMinutes)
            planned_minutes += _day_minutes(day.eveningStart, day.eveningEnd, 0)
    actual_minutes = 0
    for entry in time_entries:
        if entry.clockIn.date() != target_day:
            continue
        end = entry.clockOut or datetime.now(UTC)
        actual_minutes += max(int((end - entry.clockIn).total_seconds() // 60), 0)
    return {"planned_minutes": planned_minutes, "actual_minutes": actual_minutes, "difference_minutes": actual_minutes - planned_minutes}


def _day_minutes(start: str | None, end: str | None, break_minutes: int) -> int:
    if not start or not end:
        return 0
    sh, sm = [int(part) for part in start.split(":")]
    eh, em = [int(part) for part in end.split(":")]
    total = (eh * 60 + em) - (sh * 60 + sm)
    return max(total - break_minutes, 0)


def _haccp_metrics(tasks, restaurant_id: str, target_day: date) -> dict:
    todo = len([task for task in tasks if task.status == "TODO" and (task.scheduledForDate is None or task.scheduledForDate.date() == target_day)])
    non_compliant = len([task for task in tasks if task.status == "NON_COMPLIANT"])
    done = len([task for task in tasks if task.status == "DONE"])
    total = len(tasks)
    compliance = float(done / total) if total else 1.0
    return {"todo": todo, "non_compliant": non_compliant, "done": done, "compliance_rate": compliance}


def _invoices_by_supplier(invoices) -> list[dict]:
    rows = _supplier_spend(invoices)
    return [{"supplier_id": row["id"], "supplier_name": row["name"], "amount": row["amount"], "count": row["count"]} for row in rows]
