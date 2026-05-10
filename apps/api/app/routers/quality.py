from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.db.prisma import db
from app.models.schemas import (
    FoodLabelCreate,
    FoodLabelUpdate,
    HaccpTaskValidationCreate,
    HaccpTaskCreate,
    HaccpTaskUpdate,
    TemperatureCreate,
    TemperatureUpdate,
)
from app.routers.deps import get_restaurant_context, require_roles
from app.services.audit import write_audit_log

router = APIRouter(prefix="/quality", tags=["haccp"])

TEMPERATURE_SLOTS = [
    (2, "MIDI"),
    (2, "SOIR"),
    (3, "MIDI"),
    (3, "SOIR"),
    (4, "MIDI"),
    (4, "SOIR"),
    (5, "MIDI"),
    (5, "SOIR"),
    (6, "MIDI"),
]


@router.get("/summary")
async def quality_summary(ctx=Depends(get_restaurant_context)):
    await ensure_restaurant_quality_defaults(ctx["restaurant_id"])
    today = (await _restaurant_now(ctx["restaurant_id"])).date()
    await ensure_haccp_daily_tasks(ctx["restaurant_id"], today)
    temperatures = await db.temperaturelog.find_many(
        where={"restaurantId": ctx["restaurant_id"], "isArchived": False},
        order={"recordedAt": "desc"},
        take=200,
    )
    tasks = await db.haccptask.find_many(where={"restaurantId": ctx["restaurant_id"], "isArchived": False, "scheduledForDate": _utc_day_start(today)})
    labels = await db.foodlabel.find_many(where={"restaurantId": ctx["restaurant_id"], "isArchived": False})
    now = datetime.now(UTC)
    return {
        "temperature_count": len(temperatures),
        "temperature_non_compliant": len([entry for entry in temperatures if not entry.isCompliant]),
        "haccp_todo": len([task for task in tasks if task.status == "TODO"]),
        "haccp_non_compliant": len([task for task in tasks if task.status == "NON_COMPLIANT"]),
        "labels_active": len([label for label in labels if label.status == "ACTIVE" and label.expiresAt >= now]),
        "labels_expired": len([label for label in labels if label.expiresAt < now or label.status == "EXPIRED"]),
    }


@router.get("/temperature-equipment")
async def list_temperature_equipment(ctx=Depends(get_restaurant_context)):
    await ensure_restaurant_quality_defaults(ctx["restaurant_id"])
    equipment = await db.temperatureequipment.find_many(
        where={"restaurantId": ctx["restaurant_id"], "isActive": True},
        order={"name": "asc"},
    )
    return [_serialize_equipment(item) for item in equipment]


@router.get("/temperature-schedule")
async def temperature_schedule(
    day: str | None = Query(None),
    service: str | None = Query(None),
    target_date: date | None = Query(None),
    ctx=Depends(get_restaurant_context),
):
    await ensure_restaurant_quality_defaults(ctx["restaurant_id"])
    restaurant_now = await _restaurant_now(ctx["restaurant_id"])
    equipment = await db.temperatureequipment.find_many(where={"restaurantId": ctx["restaurant_id"], "isActive": True})
    monday = (restaurant_now - timedelta(days=restaurant_now.weekday())).date()
    start = datetime.combine(monday, time.min, UTC)
    end = start + timedelta(days=7)
    logs = await db.temperaturelog.find_many(
        where={
            "restaurantId": ctx["restaurant_id"],
            "isArchived": False,
            "checkDate": {"gte": start, "lt": end},
        }
    )
    rows = []
    for weekday, slot_service in TEMPERATURE_SLOTS:
        slot_date = monday + timedelta(days=weekday)
        if target_date and slot_date != target_date:
            continue
        if day and day.upper() != _day_label(weekday).upper():
            continue
        if service and service.upper() != slot_service:
            continue
        deadline = datetime.combine(slot_date, time(14, 0) if slot_service == "MIDI" else time(23, 0), UTC)
        for item in equipment:
            done_log = next(
                (
                    log
                    for log in logs
                    if log.equipmentId == item.id
                    and log.service == slot_service
                    and log.checkDate
                    and log.checkDate.date() == slot_date
                ),
                None,
            )
            rows.append(
                {
                    "id": f"{item.id}-{slot_date.isoformat()}-{slot_service}",
                    "equipment_id": item.id,
                    "equipment": item.name,
                    "equipment_type": item.type,
                    "day": _day_label(weekday),
                    "date": slot_date.isoformat(),
                    "service": slot_service,
                    "target": _target_label(item.minCelsius, item.maxCelsius),
                    "status": "FAIT" if done_log else "EN_RETARD" if restaurant_now.astimezone(UTC) > deadline else "A_FAIRE",
                    "is_compliant": done_log.isCompliant if done_log else None,
                    "temperature_log_id": done_log.id if done_log else None,
                }
            )
    return rows


@router.get("/temperatures")
async def list_temperatures(
    include_archived: bool = Query(False),
    ctx=Depends(get_restaurant_context),
):
    await ensure_restaurant_quality_defaults(ctx["restaurant_id"])
    where = {"restaurantId": ctx["restaurant_id"]}
    if not include_archived:
        where["isArchived"] = False
    logs = await db.temperaturelog.find_many(where=where, order={"recordedAt": "desc"}, take=200)
    return [_serialize_temperature(log) for log in logs]


@router.post("/temperatures")
async def create_temperature(
    payload: TemperatureCreate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF", "EMPLOYEE")),
):
    equipment = await _resolve_equipment(payload.equipment_id, ctx["restaurant_id"]) if payload.equipment_id else None
    equipment_name = equipment.name if equipment else payload.equipment
    min_celsius = payload.min_celsius if payload.min_celsius is not None else equipment.minCelsius if equipment else None
    max_celsius = payload.max_celsius if payload.max_celsius is not None else equipment.maxCelsius if equipment else None
    _validate_temperature_range(min_celsius, max_celsius)
    is_compliant = _temperature_compliance(
        payload.value_celsius,
        min_celsius,
        max_celsius,
        payload.is_compliant,
    )
    if not is_compliant and not payload.corrective_action:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Action corrective obligatoire si le relevé est non conforme")
    log = await db.temperaturelog.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "equipmentId": equipment.id if equipment else None,
            "equipment": equipment_name,
            "equipmentType": equipment.type if equipment else None,
            "valueCelsius": payload.value_celsius,
            "minCelsius": min_celsius,
            "maxCelsius": max_celsius,
            "service": payload.service,
            "checkDate": payload.check_date,
            "recordedAt": payload.recorded_at or datetime.now(UTC),
            "isCompliant": is_compliant,
            "correctiveAction": payload.corrective_action,
            "note": payload.note,
        }
    )
    await _audit(ctx, "quality.temperature_created", "TemperatureLog", log.id)
    return _serialize_temperature(log)


@router.patch("/temperatures/{temperature_id}")
async def update_temperature(
    temperature_id: str,
    payload: TemperatureUpdate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF")),
):
    log = await _get_temperature(temperature_id, ctx["restaurant_id"])
    equipment = await _resolve_equipment(payload.equipment_id, ctx["restaurant_id"]) if payload.equipment_id else None
    min_celsius = equipment.minCelsius if equipment else payload.min_celsius if "min_celsius" in payload.model_fields_set else log.minCelsius
    max_celsius = equipment.maxCelsius if equipment else payload.max_celsius if "max_celsius" in payload.model_fields_set else log.maxCelsius
    value_celsius = payload.value_celsius if payload.value_celsius is not None else log.valueCelsius
    _validate_temperature_range(min_celsius, max_celsius)
    fields_set = set(payload.model_fields_set)
    if {"value_celsius", "min_celsius", "max_celsius", "equipment_id"} & fields_set:
        fields_set.add("is_compliant")
    compliant = _temperature_compliance(value_celsius, min_celsius, max_celsius, payload.is_compliant)
    if not compliant and not (payload.corrective_action or log.correctiveAction):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Action corrective obligatoire si le relevé est non conforme")
    data = _drop_unset(
        {
            "equipment": payload.equipment,
            "equipmentId": equipment.id if equipment else payload.equipment_id,
            "equipmentType": equipment.type if equipment else None,
            "valueCelsius": payload.value_celsius,
            "minCelsius": payload.min_celsius,
            "maxCelsius": payload.max_celsius,
            "recordedAt": payload.recorded_at,
            "service": payload.service,
            "checkDate": payload.check_date,
            "isCompliant": compliant,
            "correctiveAction": payload.corrective_action,
            "note": payload.note,
        },
        fields_set,
        {
            "equipment": "equipment",
            "equipment_id": "equipmentId",
            "value_celsius": "valueCelsius",
            "min_celsius": "minCelsius",
            "max_celsius": "maxCelsius",
            "recorded_at": "recordedAt",
            "service": "service",
            "check_date": "checkDate",
            "is_compliant": "isCompliant",
            "corrective_action": "correctiveAction",
            "note": "note",
        },
    )
    updated = await db.temperaturelog.update(where={"id": log.id}, data=data)
    await _audit(ctx, "quality.temperature_updated", "TemperatureLog", log.id)
    return _serialize_temperature(updated)


@router.delete("/temperatures/{temperature_id}")
async def archive_temperature(
    temperature_id: str,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF")),
):
    log = await _get_temperature(temperature_id, ctx["restaurant_id"])
    updated = await db.temperaturelog.update(
        where={"id": log.id},
        data={"isArchived": True, "archivedAt": datetime.now(UTC)},
    )
    await _audit(ctx, "quality.temperature_archived", "TemperatureLog", log.id)
    return _serialize_temperature(updated)


@router.get("/haccp/tasks")
async def list_haccp_tasks(
    include_archived: bool = Query(False),
    target_date: date | None = Query(None),
    scope: str = Query("today"),
    ctx=Depends(get_restaurant_context),
):
    await ensure_restaurant_quality_defaults(ctx["restaurant_id"])
    reference_date = target_date or (await _restaurant_now(ctx["restaurant_id"])).date()
    await ensure_haccp_daily_tasks(ctx["restaurant_id"], reference_date)
    where = {"restaurantId": ctx["restaurant_id"]}
    if not include_archived:
        where["isArchived"] = False
    if scope == "today":
        where["scheduledForDate"] = _utc_day_start(reference_date)
    elif scope == "history":
        where["scheduledForDate"] = {"lt": _utc_day_start(reference_date)}
    elif scope == "upcoming":
        where["scheduledForDate"] = {"gt": _utc_day_start(reference_date)}
    tasks = await db.haccptask.find_many(where=where, include={"validations": True}, order=[{"scheduledForDate": "desc"}, {"title": "asc"}], take=120)
    return [_serialize_haccp_task(task) for task in tasks]


@router.post("/haccp/tasks")
async def create_haccp_task(
    payload: HaccpTaskCreate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF")),
):
    reference_date = payload.due_at.date() if payload.due_at else (await _restaurant_now(ctx["restaurant_id"])).date()
    task = await db.haccptask.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "title": payload.title,
            "category": payload.category,
            "frequency": payload.frequency,
            "scheduledForDate": _utc_day_start(reference_date),
            "isRecurring": False,
            "dueAt": payload.due_at,
            "notes": payload.notes,
            "completedBy": payload.responsible,
        },
        include={"validations": True},
    )
    await _audit(ctx, "quality.haccp_task_created", "HaccpTask", task.id)
    return _serialize_haccp_task(task)


@router.patch("/haccp/tasks/{task_id}")
async def update_haccp_task(
    task_id: str,
    payload: HaccpTaskUpdate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF")),
):
    task = await _get_haccp_task(task_id, ctx["restaurant_id"])
    status_value = payload.status
    completed_at = payload.completed_at
    completed_by = payload.completed_by
    if status_value == "DONE":
        completed_at = completed_at or datetime.now(UTC)
        completed_by = completed_by or f"{ctx['user'].firstName} {ctx['user'].lastName}"
    if status_value == "TODO":
        completed_at = None
        completed_by = None
    data = _drop_unset(
        {
            "title": payload.title,
            "category": payload.category,
            "frequency": payload.frequency,
            "status": status_value,
            "dueAt": payload.due_at,
            "completedAt": completed_at,
            "completedBy": completed_by,
            "correctiveAction": payload.corrective_action,
            "notes": payload.notes,
        },
        payload.model_fields_set | ({"completed_at", "completed_by"} if status_value in {"DONE", "TODO"} else set()),
        {
            "title": "title",
            "category": "category",
            "frequency": "frequency",
            "status": "status",
            "due_at": "dueAt",
            "completed_at": "completedAt",
            "completed_by": "completedBy",
            "corrective_action": "correctiveAction",
            "notes": "notes",
        },
    )
    updated = await db.haccptask.update(where={"id": task.id}, data=data, include={"validations": True})
    if updated.status in {"DONE", "NON_COMPLIANT"}:
        await db.haccptaskvalidation.create(
            data={
                "taskId": updated.id,
                "userId": ctx["user"].id,
                "responsible": updated.completedBy or f"{ctx['user'].firstName} {ctx['user'].lastName}",
                "completedAt": updated.completedAt or datetime.now(UTC),
                "comment": updated.notes,
                "correctiveAction": updated.correctiveAction,
                "status": updated.status,
            }
        )
        updated = await db.haccptask.find_unique(where={"id": updated.id}, include={"validations": True})
    await _audit(ctx, "quality.haccp_task_updated", "HaccpTask", task.id, {"status": updated.status})
    return _serialize_haccp_task(updated)


@router.delete("/haccp/tasks/{task_id}")
async def archive_haccp_task(task_id: str, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER"))):
    task = await _get_haccp_task(task_id, ctx["restaurant_id"])
    updated = await db.haccptask.update(
        where={"id": task.id},
        data={"isArchived": True, "archivedAt": datetime.now(UTC)},
        include={"validations": True},
    )
    await _audit(ctx, "quality.haccp_task_archived", "HaccpTask", task.id)
    return _serialize_haccp_task(updated)


@router.post("/haccp/tasks/{task_id}/validations")
async def validate_haccp_task(
    task_id: str,
    payload: HaccpTaskValidationCreate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF", "EMPLOYEE")),
):
    task = await _get_haccp_task(task_id, ctx["restaurant_id"])
    validation = await db.haccptaskvalidation.create(
        data={
            "taskId": task.id,
            "userId": ctx["user"].id,
            "responsible": payload.responsible,
            "completedAt": payload.completed_at or datetime.now(UTC),
            "comment": payload.comment,
            "correctiveAction": payload.corrective_action,
            "status": payload.status,
        }
    )
    updated = await db.haccptask.update(
        where={"id": task.id},
        data={
            "status": payload.status,
            "completedAt": validation.completedAt,
            "completedBy": payload.responsible,
            "completedByUserId": ctx["user"].id,
            "correctiveAction": payload.corrective_action,
            "notes": payload.comment,
        },
        include={"validations": True},
    )
    await _audit(ctx, "quality.haccp_task_validated", "HaccpTask", task.id, {"status": payload.status})
    return _serialize_haccp_task(updated)


@router.get("/labels")
async def list_labels(include_archived: bool = Query(False), ctx=Depends(get_restaurant_context)):
    where = {"restaurantId": ctx["restaurant_id"]}
    if not include_archived:
        where["isArchived"] = False
    labels = await db.foodlabel.find_many(where=where, order={"expiresAt": "asc"})
    return [_serialize_label(label) for label in labels]


@router.get("/labels/sources")
async def label_sources(ctx=Depends(get_restaurant_context)):
    stock_items = await db.inventoryitem.find_many(
        where={"restaurantId": ctx["restaurant_id"], "isActive": True},
        order={"name": "asc"},
    )
    recipes = await db.recipe.find_many(
        where={"restaurantId": ctx["restaurant_id"], "isActive": True},
        order={"name": "asc"},
    )
    return {
        "stock": [
            {"id": item.id, "name": item.name, "unit": item.unit, "allergens": item.allergens, "storage_area": item.storageArea}
            for item in stock_items
        ],
        "recipes": [
            {"id": recipe.id, "name": recipe.name, "allergens": recipe.allergens}
            for recipe in recipes
        ],
    }


@router.post("/labels")
async def create_label(
    payload: FoodLabelCreate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF", "EMPLOYEE")),
):
    _validate_label_dates(payload.prepared_at, payload.expires_at)
    source_defaults = await _label_source_defaults(payload.source_type, payload.source_id, ctx["restaurant_id"])
    label = await db.foodlabel.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "title": payload.title,
            "itemName": payload.item_name or source_defaults.get("item_name"),
            "batchNumber": payload.batch_number,
            "quantity": payload.quantity,
            "unit": payload.unit,
            "preparedAt": payload.prepared_at,
            "expiresAt": payload.expires_at,
            "storageArea": payload.storage_area or source_defaults.get("storage_area"),
            "allergens": payload.allergens or source_defaults.get("allergens", []),
            "notes": payload.notes,
            "sourceType": payload.source_type,
            "sourceId": payload.source_id,
            "expiryKind": payload.expiry_kind,
            "conservationTemperature": payload.conservation_temperature,
        }
    )
    await _audit(ctx, "quality.label_created", "FoodLabel", label.id)
    return _serialize_label(label)


@router.patch("/labels/{label_id}")
async def update_label(
    label_id: str,
    payload: FoodLabelUpdate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF", "EMPLOYEE")),
):
    label = await _get_label(label_id, ctx["restaurant_id"])
    prepared_at = payload.prepared_at if payload.prepared_at is not None else label.preparedAt
    expires_at = payload.expires_at if payload.expires_at is not None else label.expiresAt
    _validate_label_dates(prepared_at, expires_at)
    data = _drop_unset(
        {
            "title": payload.title,
            "itemName": payload.item_name,
            "sourceType": payload.source_type,
            "sourceId": payload.source_id,
            "batchNumber": payload.batch_number,
            "quantity": payload.quantity,
            "unit": payload.unit,
            "preparedAt": payload.prepared_at,
            "expiresAt": payload.expires_at,
            "storageArea": payload.storage_area,
            "conservationTemperature": payload.conservation_temperature,
            "allergens": payload.allergens,
            "notes": payload.notes,
            "status": payload.status,
            "expiryKind": payload.expiry_kind,
        },
        payload.model_fields_set,
        {
            "title": "title",
            "item_name": "itemName",
            "source_type": "sourceType",
            "source_id": "sourceId",
            "batch_number": "batchNumber",
            "quantity": "quantity",
            "unit": "unit",
            "prepared_at": "preparedAt",
            "expires_at": "expiresAt",
            "storage_area": "storageArea",
            "conservation_temperature": "conservationTemperature",
            "allergens": "allergens",
            "notes": "notes",
            "status": "status",
            "expiry_kind": "expiryKind",
        },
    )
    updated = await db.foodlabel.update(where={"id": label.id}, data=data)
    await _audit(ctx, "quality.label_updated", "FoodLabel", label.id, {"status": updated.status})
    return _serialize_label(updated)


@router.delete("/labels/{label_id}")
async def archive_label(label_id: str, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF"))):
    label = await _get_label(label_id, ctx["restaurant_id"])
    updated = await db.foodlabel.update(
        where={"id": label.id},
        data={"isArchived": True, "archivedAt": datetime.now(UTC)},
    )
    await _audit(ctx, "quality.label_archived", "FoodLabel", label.id)
    return _serialize_label(updated)


async def _get_temperature(temperature_id: str, restaurant_id: str):
    log = await db.temperaturelog.find_first(where={"id": temperature_id, "restaurantId": restaurant_id})
    if not log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Relevé température introuvable")
    return log


async def _get_haccp_task(task_id: str, restaurant_id: str):
    task = await db.haccptask.find_first(where={"id": task_id, "restaurantId": restaurant_id})
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tâche HACCP introuvable")
    return task


async def _get_label(label_id: str, restaurant_id: str):
    label = await db.foodlabel.find_first(where={"id": label_id, "restaurantId": restaurant_id})
    if not label:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Étiquette introuvable")
    return label


async def _resolve_equipment(equipment_id: str | None, restaurant_id: str):
    if not equipment_id:
        return None
    equipment = await db.temperatureequipment.find_first(where={"id": equipment_id, "restaurantId": restaurant_id, "isActive": True})
    if not equipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Équipement introuvable")
    return equipment


async def _label_source_defaults(source_type: str, source_id: str | None, restaurant_id: str):
    if source_type == "STOCK" and source_id:
        item = await db.inventoryitem.find_first(where={"id": source_id, "restaurantId": restaurant_id, "isActive": True})
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article stock introuvable")
        return {"item_name": item.name, "allergens": item.allergens, "storage_area": item.storageArea}
    if source_type == "RECIPE" and source_id:
        recipe = await db.recipe.find_first(where={"id": source_id, "restaurantId": restaurant_id, "isActive": True})
        if not recipe:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fiche technique introuvable")
        return {"item_name": recipe.name, "allergens": recipe.allergens, "storage_area": None}
    return {}


def _temperature_compliance(
    value: Decimal,
    min_celsius: Decimal | None,
    max_celsius: Decimal | None,
    explicit: bool | None,
):
    if min_celsius is not None and value < min_celsius:
        return False
    if max_celsius is not None and value > max_celsius:
        return False
    if explicit is not None:
        return explicit
    return True


def _validate_temperature_range(min_celsius: Decimal | None, max_celsius: Decimal | None):
    if min_celsius is not None and max_celsius is not None and min_celsius > max_celsius:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="La température minimale doit être inférieure au maximum")


def _validate_label_dates(prepared_at: datetime, expires_at: datetime):
    if expires_at <= prepared_at:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="La DLC doit être postérieure à la préparation")


def _drop_unset(data: dict, fields_set: set[str], field_map: dict[str, str]):
    allowed = {field_map[field] for field in fields_set if field in field_map}
    return {key: value for key, value in data.items() if key in allowed}


def _serialize_temperature(log):
    return {
        "id": log.id,
        "equipment": log.equipment,
        "equipment_id": log.equipmentId,
        "equipment_type": log.equipmentType,
        "value_celsius": log.valueCelsius,
        "min_celsius": log.minCelsius,
        "max_celsius": log.maxCelsius,
        "recorded_at": log.recordedAt,
        "service": log.service,
        "check_date": log.checkDate,
        "is_compliant": log.isCompliant,
        "corrective_action": log.correctiveAction,
        "note": log.note,
        "is_archived": log.isArchived,
        "archived_at": log.archivedAt,
    }


def _serialize_haccp_task(task):
    display_status = "EN_RETARD" if task.status == "TODO" and task.dueAt and datetime.now(UTC) > task.dueAt else task.status
    return {
        "id": task.id,
        "title": task.title,
        "category": task.category,
        "frequency": task.frequency,
        "status": task.status,
        "display_status": display_status,
        "template_key": task.templateKey,
        "scheduled_for_date": task.scheduledForDate,
        "scheduled_service": task.scheduledService,
        "is_recurring": task.isRecurring,
        "due_at": task.dueAt,
        "completed_at": task.completedAt,
        "completed_by": task.completedBy,
        "completed_by_user_id": task.completedByUserId,
        "corrective_action": task.correctiveAction,
        "notes": task.notes,
        "is_archived": task.isArchived,
        "archived_at": task.archivedAt,
        "validations": [_serialize_validation(validation) for validation in getattr(task, "validations", [])],
    }


def _serialize_validation(validation):
    return {
        "id": validation.id,
        "responsible": validation.responsible,
        "completed_at": validation.completedAt,
        "comment": validation.comment,
        "corrective_action": validation.correctiveAction,
        "status": validation.status,
    }


def _serialize_label(label):
    return {
        "id": label.id,
        "title": label.title,
        "item_name": label.itemName,
        "batch_number": label.batchNumber,
        "quantity": label.quantity,
        "unit": label.unit,
        "prepared_at": label.preparedAt,
        "expires_at": label.expiresAt,
        "storage_area": label.storageArea,
        "allergens": label.allergens,
        "notes": label.notes,
        "status": label.status,
        "source_type": label.sourceType,
        "source_id": label.sourceId,
        "expiry_kind": label.expiryKind,
        "conservation_temperature": label.conservationTemperature,
        "is_archived": label.isArchived,
        "archived_at": label.archivedAt,
    }


def _serialize_equipment(item):
    return {
        "id": item.id,
        "name": item.name,
        "type": item.type,
        "min_celsius": item.minCelsius,
        "max_celsius": item.maxCelsius,
        "target": _target_label(item.minCelsius, item.maxCelsius),
    }


def _target_label(min_celsius: Decimal | None, max_celsius: Decimal | None):
    if min_celsius is not None and max_celsius is not None:
        return f"entre {min_celsius}°C et {max_celsius}°C"
    if max_celsius is not None:
        return f"maximum {max_celsius}°C"
    if min_celsius is not None:
        return f"minimum {min_celsius}°C"
    return "non défini"


def _day_label(weekday: int):
    return ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"][weekday]


async def ensure_restaurant_quality_defaults(restaurant_id: str):
    equipment_defaults = [
        ("Armoire réfrigérée", "froid positif", Decimal("0"), Decimal("4")),
        ("Timbre chaud", "chaud", Decimal("0"), Decimal("4")),
        ("Timbre entrée / dessert", "froid positif", Decimal("0"), Decimal("4")),
        ("Congélateur", "froid négatif", None, Decimal("-18")),
    ]
    for name, equipment_type, min_celsius, max_celsius in equipment_defaults:
        existing = await db.temperatureequipment.find_unique(
            where={"restaurantId_name": {"restaurantId": restaurant_id, "name": name}}
        )
        data = {"type": equipment_type, "minCelsius": min_celsius, "maxCelsius": max_celsius, "isActive": True, "archivedAt": None}
        if existing:
            await db.temperatureequipment.update(where={"id": existing.id}, data=data)
        else:
            await db.temperatureequipment.create(data={"restaurantId": restaurant_id, "name": name, **data})
    await _archive_legacy_cleaning_defaults(restaurant_id)


async def ensure_haccp_daily_tasks(restaurant_id: str, target_date: date):
    for task in _cleaning_occurrences_for_date(target_date):
        exists = await db.haccptask.find_first(
            where={
                "restaurantId": restaurant_id,
                "templateKey": task["template_key"],
                "scheduledForDate": _utc_day_start(target_date),
                "scheduledService": task["scheduled_service"],
            }
        )
        data = {
            "restaurantId": restaurant_id,
            "title": task["title"],
            "category": "Nettoyage",
            "frequency": task["frequency"],
            "templateKey": task["template_key"],
            "scheduledForDate": _utc_day_start(target_date),
            "scheduledService": task["scheduled_service"],
            "isRecurring": True,
            "dueAt": task["due_at"],
        }
        if exists:
            await db.haccptask.update(
                where={"id": exists.id},
                data={
                    "title": task["title"],
                    "frequency": task["frequency"],
                    "dueAt": task["due_at"],
                    "isArchived": False,
                    "archivedAt": None,
                },
            )
        else:
            await db.haccptask.create(data=data)


async def _archive_legacy_cleaning_defaults(restaurant_id: str):
    legacy_tasks = await db.haccptask.find_many(
        where={
            "restaurantId": restaurant_id,
            "category": "Nettoyage",
            "scheduledForDate": None,
            "templateKey": None,
            "isArchived": False,
            "title": {"in": [task["title"] for task in _cleaning_catalog()]},
        }
    )
    for task in legacy_tasks:
        await db.haccptask.update(
            where={"id": task.id},
            data={"isArchived": True, "archivedAt": datetime.now(UTC), "notes": "Archivé automatiquement après migration vers les tâches récurrentes"},
        )


def _cleaning_catalog():
    return [
        {"title": "Sol", "frequency": "DAILY", "due_hour": 18, "service": None, "weekday": None},
        {"title": "Plans de travail", "frequency": "DAILY", "due_hour": 18, "service": None, "weekday": None},
        {"title": "Frigos", "frequency": "DAILY", "due_hour": 18, "service": None, "weekday": None},
        {"title": "Lave-main", "frequency": "DAILY", "due_hour": 18, "service": None, "weekday": None},
        {"title": "Plonge", "frequency": "DAILY", "due_hour": 18, "service": None, "weekday": None},
        {"title": "Machine à plonge", "frequency": "DAILY", "due_hour": 18, "service": None, "weekday": None},
        {"title": "Friteuse", "frequency": "AFTER_SERVICE", "due_hour": 14, "service": "MIDI", "weekday": None},
        {"title": "Friteuse", "frequency": "AFTER_SERVICE", "due_hour": 23, "service": "SOIR", "weekday": None},
        {"title": "Piano de cuisson", "frequency": "AFTER_SERVICE", "due_hour": 14, "service": "MIDI", "weekday": None},
        {"title": "Piano de cuisson", "frequency": "AFTER_SERVICE", "due_hour": 23, "service": "SOIR", "weekday": None},
        {"title": "Four", "frequency": "AFTER_SERVICE", "due_hour": 14, "service": "MIDI", "weekday": None},
        {"title": "Four", "frequency": "AFTER_SERVICE", "due_hour": 23, "service": "SOIR", "weekday": None},
        {"title": "Hotte", "frequency": "WEEKLY", "due_hour": 18, "service": None, "weekday": 6},
    ]


def _cleaning_occurrences_for_date(target_date: date):
    occurrences = []
    for rule in _cleaning_catalog():
        if rule["frequency"] == "WEEKLY" and target_date.weekday() != rule["weekday"]:
            continue
        due_at = datetime.combine(target_date, time(rule["due_hour"], 0), UTC)
        service_suffix = f" - service {rule['service'].lower()}" if rule["service"] else ""
        template_service = rule["service"] or "DAY"
        occurrences.append(
            {
                "title": f"{rule['title']}{service_suffix}",
                "frequency": rule["frequency"],
                "template_key": f"cleaning:{rule['title']}:{template_service}",
                "scheduled_service": rule["service"],
                "due_at": due_at,
            }
        )
    return occurrences


def _utc_day_start(target_date: date):
    return datetime.combine(target_date, time.min, UTC)


async def _restaurant_now(restaurant_id: str):
    restaurant = await db.restaurant.find_unique(where={"id": restaurant_id})
    tz_name = restaurant.timezone if restaurant and restaurant.timezone else "UTC"
    try:
        zone = ZoneInfo(tz_name)
    except Exception:
        zone = ZoneInfo("UTC")
    return datetime.now(zone)


async def _audit(ctx, action: str, entity: str, entity_id: str, metadata: dict | None = None):
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        metadata=metadata,
    )
