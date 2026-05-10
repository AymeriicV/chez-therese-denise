from datetime import UTC, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from unicodedata import normalize

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.db.prisma import db
from app.models.schemas import ProductionCreate, ProductionUpdate
from app.routers.deps import get_restaurant_context, require_roles
from app.services.audit import write_audit_log
from app.services.stock import create_stock_movement

router = APIRouter(prefix="/production", tags=["production"])


@router.get("")
async def list_production_batches(include_archived: bool = Query(False), ctx=Depends(get_restaurant_context)):
    where = {"restaurantId": ctx["restaurant_id"]}
    if not include_archived:
        where["isArchived"] = False
    batches = await db.productionbatch.find_many(
        where=where,
        include={"recipe": True, "consumptions": {"include": {"inventoryItem": True}}, "labels": True},
        order={"preparedAt": "desc"},
        take=120,
    )
    return [_serialize_batch(batch) for batch in batches]


@router.post("")
async def create_production_batch(
    payload: ProductionCreate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF")),
):
    recipe = await db.recipe.find_first(
        where={"id": payload.recipe_id, "restaurantId": ctx["restaurant_id"], "isActive": True},
        include={"ingredients": {"include": {"inventoryItem": True}}},
    )
    if not recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fiche technique introuvable")
    if not recipe.ingredients:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="La fiche technique doit contenir des ingrédients pour lancer une production")

    unsupported = [ingredient.name for ingredient in recipe.ingredients if ingredient.inventoryItemId is None]
    if unsupported:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Tous les ingrédients de production doivent être liés au stock. Lignes à corriger: {', '.join(unsupported)}",
        )

    produced_at = payload.produced_at or datetime.now(UTC)
    if payload.waste_quantity > payload.quantity_produced:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="La perte ne peut pas dépasser la quantité produite")
    if payload.waste_quantity > 0 and not payload.waste_reason:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Le motif de perte est obligatoire si une perte est déclarée")

    lot_number = payload.lot_number or _default_lot(recipe.name, produced_at)
    existing = await db.productionbatch.find_first(where={"restaurantId": ctx["restaurant_id"], "lotNumber": lot_number})
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ce lot de production existe déjà")

    consumption_rows = []
    total_cost = Decimal("0")
    multiplier = payload.quantity_produced / (recipe.portionYield if recipe.portionYield > 0 else Decimal("1"))
    for ingredient in recipe.ingredients:
        item = ingredient.inventoryItem
        if not item or not item.isActive:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Article stock indisponible pour {ingredient.name}")
        quantity_consumed = _round3(ingredient.quantity * multiplier * (Decimal("1") + ingredient.wasteRate))
        total_line_cost = _round2(quantity_consumed * item.averageCost)
        consumption_rows.append(
            {
                "inventory_item": item,
                "ingredient_name": ingredient.name,
                "quantity_consumed": quantity_consumed,
                "unit": ingredient.unit,
                "unit_cost_snapshot": item.averageCost,
                "total_cost": total_line_cost,
            }
        )
        total_cost += total_line_cost

    expires_at = produced_at + _hours(payload.shelf_life_hours)
    storage_area = payload.storage_area or _default_storage_area(recipe)
    conservation_temperature = payload.conservation_temperature or "0°C à 4°C"
    batch = await db.productionbatch.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "recipeId": recipe.id,
            "lotNumber": lot_number,
            "recipeName": recipe.name,
            "quantityProduced": payload.quantity_produced,
            "unit": "portion",
            "preparedAt": produced_at,
            "expiresAt": expires_at,
            "shelfLifeHours": payload.shelf_life_hours,
            "storageArea": storage_area,
            "conservationTemperature": conservation_temperature,
            "allergens": recipe.allergens,
            "totalIngredientCost": _round2(total_cost),
            "wasteQuantity": payload.waste_quantity,
            "wasteReason": payload.waste_reason,
            "notes": payload.notes,
        }
    )

    for row in consumption_rows:
        await db.productionconsumption.create(
            data={
                "productionBatchId": batch.id,
                "inventoryItemId": row["inventory_item"].id,
                "ingredientName": row["ingredient_name"],
                "quantityConsumed": row["quantity_consumed"],
                "unit": row["unit"],
                "unitCostSnapshot": row["unit_cost_snapshot"],
                "totalCost": row["total_cost"],
            }
        )
        await create_stock_movement(
            item=row["inventory_item"],
            movement_type="PRODUCTION",
            quantity=-row["quantity_consumed"],
            unit_cost=row["unit_cost_snapshot"],
            note=f"Production {recipe.name} lot {lot_number}",
        )

    label_quantity = _round3(payload.quantity_produced / Decimal(str(payload.label_count)))
    for index in range(payload.label_count):
        await db.foodlabel.create(
            data={
                "restaurantId": ctx["restaurant_id"],
                "productionBatchId": batch.id,
                "title": recipe.name if payload.label_count == 1 else f"{recipe.name} #{index + 1}",
                "itemName": recipe.name,
                "batchNumber": lot_number,
                "quantity": label_quantity,
                "unit": "portion",
                "preparedAt": produced_at,
                "expiresAt": expires_at,
                "storageArea": storage_area,
                "allergens": recipe.allergens,
                "notes": payload.notes,
                "sourceType": "PRODUCTION",
                "sourceId": batch.id,
                "expiryKind": "DLC",
                "conservationTemperature": conservation_temperature,
            }
        )

    haccp_task = await db.haccptask.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "title": f"Production {recipe.name} lot {lot_number}",
            "category": "Production labo",
            "frequency": "ON_DEMAND",
            "status": "DONE",
            "scheduledForDate": datetime.combine(produced_at.date(), time.min, UTC),
            "completedAt": produced_at,
            "completedBy": f"{ctx['user'].firstName} {ctx['user'].lastName}",
            "completedByUserId": ctx["user"].id,
            "notes": f"Production {payload.quantity_produced} portions, DLC {expires_at.strftime('%d/%m/%Y %H:%M')}",
        }
    )
    await db.haccptaskvalidation.create(
        data={
            "taskId": haccp_task.id,
            "userId": ctx["user"].id,
            "responsible": f"{ctx['user'].firstName} {ctx['user'].lastName}",
            "completedAt": produced_at,
            "comment": f"Lot {lot_number} produit",
            "status": "DONE",
        }
    )

    await _audit(
        ctx,
        "production.batch_created",
        "ProductionBatch",
        batch.id,
        {"recipeId": recipe.id, "lotNumber": lot_number, "labels": payload.label_count},
    )
    created = await _get_batch(batch.id, ctx["restaurant_id"])
    return _serialize_batch(created)


@router.patch("/{batch_id}")
async def update_production_batch(
    batch_id: str,
    payload: ProductionUpdate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF")),
):
    batch = await _get_batch(batch_id, ctx["restaurant_id"])
    waste_quantity = payload.waste_quantity if payload.waste_quantity is not None else batch.wasteQuantity
    if waste_quantity > batch.quantityProduced:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="La perte ne peut pas dépasser la quantité produite")
    if waste_quantity > 0 and not (payload.waste_reason or batch.wasteReason):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Le motif de perte est obligatoire si une perte est déclarée")
    data = {
        "wasteQuantity": payload.waste_quantity,
        "wasteReason": payload.waste_reason,
        "notes": payload.notes,
        "status": payload.status,
    }
    updated = await db.productionbatch.update(
        where={"id": batch.id},
        data={key: value for key, value in data.items() if value is not None},
        include={"recipe": True, "consumptions": {"include": {"inventoryItem": True}}, "labels": True},
    )
    await _audit(ctx, "production.batch_updated", "ProductionBatch", batch.id)
    return _serialize_batch(updated)


@router.delete("/{batch_id}")
async def archive_production_batch(batch_id: str, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER"))):
    batch = await _get_batch(batch_id, ctx["restaurant_id"])
    updated = await db.productionbatch.update(
        where={"id": batch.id},
        data={"isArchived": True, "archivedAt": datetime.now(UTC), "status": "ARCHIVED"},
        include={"recipe": True, "consumptions": {"include": {"inventoryItem": True}}, "labels": True},
    )
    await db.foodlabel.update_many(where={"productionBatchId": batch.id}, data={"isArchived": True, "archivedAt": datetime.now(UTC)})
    await _audit(ctx, "production.batch_archived", "ProductionBatch", batch.id)
    return _serialize_batch(updated)


async def _get_batch(batch_id: str, restaurant_id: str):
    batch = await db.productionbatch.find_first(
        where={"id": batch_id, "restaurantId": restaurant_id},
        include={"recipe": True, "consumptions": {"include": {"inventoryItem": True}}, "labels": True},
    )
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lot de production introuvable")
    return batch


def _serialize_batch(batch):
    produced_cost = Decimal(batch.totalIngredientCost)
    cost_per_unit = produced_cost / batch.quantityProduced if batch.quantityProduced > 0 else Decimal("0")
    return {
        "id": batch.id,
        "recipe_id": batch.recipeId,
        "recipe_name": batch.recipeName,
        "lot_number": batch.lotNumber,
        "quantity_produced": batch.quantityProduced,
        "unit": batch.unit,
        "prepared_at": batch.preparedAt,
        "expires_at": batch.expiresAt,
        "shelf_life_hours": batch.shelfLifeHours,
        "storage_area": batch.storageArea,
        "conservation_temperature": batch.conservationTemperature,
        "allergens": batch.allergens,
        "total_ingredient_cost": batch.totalIngredientCost,
        "cost_per_unit": _round2(cost_per_unit),
        "waste_quantity": batch.wasteQuantity,
        "waste_reason": batch.wasteReason,
        "notes": batch.notes,
        "status": batch.status,
        "is_archived": batch.isArchived,
        "labels": [
            {
                "id": label.id,
                "title": label.title,
                "status": label.status,
                "expires_at": label.expiresAt,
                "batch_number": label.batchNumber,
            }
            for label in batch.labels
            if not label.isArchived
        ],
        "consumptions": [
            {
                "id": consumption.id,
                "inventory_item_id": consumption.inventoryItemId,
                "ingredient_name": consumption.ingredientName,
                "quantity_consumed": consumption.quantityConsumed,
                "unit": consumption.unit,
                "unit_cost_snapshot": consumption.unitCostSnapshot,
                "total_cost": consumption.totalCost,
                "inventory_item_name": consumption.inventoryItem.name,
            }
            for consumption in batch.consumptions
        ],
    }


def _default_lot(recipe_name: str, produced_at: datetime):
    ascii_name = normalize("NFKD", recipe_name).encode("ascii", "ignore").decode("ascii")
    slug = "".join(char for char in ascii_name.upper() if char.isalnum())[:6] or "PROD"
    return f"{slug}-{produced_at.strftime('%Y%m%d-%H%M')}"


def _default_storage_area(recipe):
    for ingredient in recipe.ingredients:
        if ingredient.inventoryItem and ingredient.inventoryItem.storageArea:
            return ingredient.inventoryItem.storageArea
    return "Chambre froide"


def _hours(hours: int):
    return timedelta(hours=hours)


def _round2(value: Decimal):
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _round3(value: Decimal):
    return value.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


async def _audit(ctx, action: str, entity: str, entity_id: str, metadata: dict | None = None):
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        metadata=metadata,
    )
