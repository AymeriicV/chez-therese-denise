from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.db.prisma import db
from app.models.schemas import (
    FoodLabelCreate,
    FoodLabelUpdate,
    HaccpTaskCreate,
    HaccpTaskUpdate,
    TemperatureCreate,
    TemperatureUpdate,
)
from app.routers.deps import get_restaurant_context, require_roles
from app.services.audit import write_audit_log

router = APIRouter(prefix="/quality", tags=["haccp"])


@router.get("/summary")
async def quality_summary(ctx=Depends(get_restaurant_context)):
    temperatures = await db.temperaturelog.find_many(
        where={"restaurantId": ctx["restaurant_id"], "isArchived": False},
        order={"recordedAt": "desc"},
        take=200,
    )
    tasks = await db.haccptask.find_many(where={"restaurantId": ctx["restaurant_id"], "isArchived": False})
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


@router.get("/temperatures")
async def list_temperatures(
    include_archived: bool = Query(False),
    ctx=Depends(get_restaurant_context),
):
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
    _validate_temperature_range(payload.min_celsius, payload.max_celsius)
    is_compliant = _temperature_compliance(
        payload.value_celsius,
        payload.min_celsius,
        payload.max_celsius,
        payload.is_compliant,
    )
    log = await db.temperaturelog.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "equipment": payload.equipment,
            "valueCelsius": payload.value_celsius,
            "minCelsius": payload.min_celsius,
            "maxCelsius": payload.max_celsius,
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
    min_celsius = payload.min_celsius if "min_celsius" in payload.model_fields_set else log.minCelsius
    max_celsius = payload.max_celsius if "max_celsius" in payload.model_fields_set else log.maxCelsius
    value_celsius = payload.value_celsius if payload.value_celsius is not None else log.valueCelsius
    _validate_temperature_range(min_celsius, max_celsius)
    fields_set = set(payload.model_fields_set)
    if {"value_celsius", "min_celsius", "max_celsius"} & fields_set:
        fields_set.add("is_compliant")
    data = _drop_unset(
        {
            "equipment": payload.equipment,
            "valueCelsius": payload.value_celsius,
            "minCelsius": payload.min_celsius,
            "maxCelsius": payload.max_celsius,
            "recordedAt": payload.recorded_at,
            "isCompliant": _temperature_compliance(value_celsius, min_celsius, max_celsius, payload.is_compliant),
            "correctiveAction": payload.corrective_action,
            "note": payload.note,
        },
        fields_set,
        {
            "equipment": "equipment",
            "value_celsius": "valueCelsius",
            "min_celsius": "minCelsius",
            "max_celsius": "maxCelsius",
            "recorded_at": "recordedAt",
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
async def list_haccp_tasks(include_archived: bool = Query(False), ctx=Depends(get_restaurant_context)):
    where = {"restaurantId": ctx["restaurant_id"]}
    if not include_archived:
        where["isArchived"] = False
    tasks = await db.haccptask.find_many(where=where, order={"updatedAt": "desc"})
    return [_serialize_haccp_task(task) for task in tasks]


@router.post("/haccp/tasks")
async def create_haccp_task(
    payload: HaccpTaskCreate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF")),
):
    task = await db.haccptask.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "title": payload.title,
            "category": payload.category,
            "frequency": payload.frequency,
            "dueAt": payload.due_at,
            "notes": payload.notes,
        }
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
    updated = await db.haccptask.update(where={"id": task.id}, data=data)
    await _audit(ctx, "quality.haccp_task_updated", "HaccpTask", task.id, {"status": updated.status})
    return _serialize_haccp_task(updated)


@router.delete("/haccp/tasks/{task_id}")
async def archive_haccp_task(task_id: str, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER"))):
    task = await _get_haccp_task(task_id, ctx["restaurant_id"])
    updated = await db.haccptask.update(
        where={"id": task.id},
        data={"isArchived": True, "archivedAt": datetime.now(UTC)},
    )
    await _audit(ctx, "quality.haccp_task_archived", "HaccpTask", task.id)
    return _serialize_haccp_task(updated)


@router.get("/labels")
async def list_labels(include_archived: bool = Query(False), ctx=Depends(get_restaurant_context)):
    where = {"restaurantId": ctx["restaurant_id"]}
    if not include_archived:
        where["isArchived"] = False
    labels = await db.foodlabel.find_many(where=where, order={"expiresAt": "asc"})
    return [_serialize_label(label) for label in labels]


@router.post("/labels")
async def create_label(
    payload: FoodLabelCreate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF", "EMPLOYEE")),
):
    _validate_label_dates(payload.prepared_at, payload.expires_at)
    label = await db.foodlabel.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "title": payload.title,
            "itemName": payload.item_name,
            "batchNumber": payload.batch_number,
            "quantity": payload.quantity,
            "unit": payload.unit,
            "preparedAt": payload.prepared_at,
            "expiresAt": payload.expires_at,
            "storageArea": payload.storage_area,
            "allergens": payload.allergens,
            "notes": payload.notes,
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
            "batchNumber": payload.batch_number,
            "quantity": payload.quantity,
            "unit": payload.unit,
            "preparedAt": payload.prepared_at,
            "expiresAt": payload.expires_at,
            "storageArea": payload.storage_area,
            "allergens": payload.allergens,
            "notes": payload.notes,
            "status": payload.status,
        },
        payload.model_fields_set,
        {
            "title": "title",
            "item_name": "itemName",
            "batch_number": "batchNumber",
            "quantity": "quantity",
            "unit": "unit",
            "prepared_at": "preparedAt",
            "expires_at": "expiresAt",
            "storage_area": "storageArea",
            "allergens": "allergens",
            "notes": "notes",
            "status": "status",
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
        "value_celsius": log.valueCelsius,
        "min_celsius": log.minCelsius,
        "max_celsius": log.maxCelsius,
        "recorded_at": log.recordedAt,
        "is_compliant": log.isCompliant,
        "corrective_action": log.correctiveAction,
        "note": log.note,
        "is_archived": log.isArchived,
        "archived_at": log.archivedAt,
    }


def _serialize_haccp_task(task):
    return {
        "id": task.id,
        "title": task.title,
        "category": task.category,
        "frequency": task.frequency,
        "status": task.status,
        "due_at": task.dueAt,
        "completed_at": task.completedAt,
        "completed_by": task.completedBy,
        "corrective_action": task.correctiveAction,
        "notes": task.notes,
        "is_archived": task.isArchived,
        "archived_at": task.archivedAt,
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
        "is_archived": label.isArchived,
        "archived_at": label.archivedAt,
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
