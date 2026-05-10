from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.db.prisma import db
from app.models.schemas import ShiftCreate, ShiftUpdate
from app.routers.deps import get_restaurant_context, require_roles
from app.services.audit import write_audit_log
from app.services.timezone import restaurant_now

router = APIRouter(prefix="/planning", tags=["planning"])


@router.get("")
async def list_shifts(
    view: str = Query("week"),
    target_date: date | None = Query(None),
    employee_id: str | None = Query(None),
    include_archived: bool = Query(False),
    ctx=Depends(get_restaurant_context),
):
    reference_date = target_date or (await restaurant_now(ctx["restaurant_id"])).date()
    start, end = _range_for_view(view, reference_date)
    where = {
        "restaurantId": ctx["restaurant_id"],
        "startAt": {"gte": start, "lt": end},
    }
    if not include_archived:
        where["isArchived"] = False
    if ctx["role"] == "EMPLOYEE":
        where["userId"] = ctx["user"].id
    elif employee_id:
        where["userId"] = employee_id
    shifts = await db.shift.find_many(
        where=where,
        include={"user": {"include": {"employeeProfile": True, "memberships": True}}},
        order={"startAt": "asc"},
    )
    return {
        "view": view,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "shifts": [_serialize_shift(shift, ctx["restaurant_id"]) for shift in shifts],
    }


@router.post("")
async def create_shift(payload: ShiftCreate, ctx=Depends(require_roles("OWNER"))):
    await _ensure_employee(payload.user_id, ctx["restaurant_id"])
    _validate_shift_range(payload.start_at, payload.end_at)
    await _ensure_no_overlap(ctx["restaurant_id"], payload.user_id, payload.start_at, payload.end_at)
    shift = await db.shift.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "userId": payload.user_id,
            "startAt": payload.start_at,
            "endAt": payload.end_at,
            "breakMinutes": payload.break_minutes,
            "position": payload.position,
            "comment": payload.comment,
        },
        include={"user": {"include": {"employeeProfile": True, "memberships": True}}},
    )
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="planning.shift_created",
        entity="Shift",
        entity_id=shift.id,
        metadata={"userId": payload.user_id, "startAt": payload.start_at.isoformat(), "endAt": payload.end_at.isoformat()},
    )
    return _serialize_shift(shift, ctx["restaurant_id"])


@router.patch("/{shift_id}")
async def update_shift(shift_id: str, payload: ShiftUpdate, ctx=Depends(require_roles("OWNER"))):
    shift = await _get_shift(shift_id, ctx["restaurant_id"])
    user_id = payload.user_id if payload.user_id is not None else shift.userId
    start_at = payload.start_at if payload.start_at is not None else shift.startAt
    end_at = payload.end_at if payload.end_at is not None else shift.endAt
    _validate_shift_range(start_at, end_at)
    if user_id != shift.userId or start_at != shift.startAt or end_at != shift.endAt:
        await _ensure_employee(user_id, ctx["restaurant_id"])
        await _ensure_no_overlap(ctx["restaurant_id"], user_id, start_at, end_at, exclude_shift_id=shift.id)
    data = {
        "userId": payload.user_id,
        "startAt": payload.start_at,
        "endAt": payload.end_at,
        "breakMinutes": payload.break_minutes,
        "position": payload.position,
        "comment": payload.comment,
        "isArchived": payload.is_archived,
        "archivedAt": datetime.now(UTC) if payload.is_archived else None,
    }
    updated = await db.shift.update(
        where={"id": shift.id},
        data={key: value for key, value in data.items() if value is not None},
        include={"user": {"include": {"employeeProfile": True, "memberships": True}}},
    )
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="planning.shift_updated",
        entity="Shift",
        entity_id=shift.id,
    )
    return _serialize_shift(updated, ctx["restaurant_id"])


@router.delete("/{shift_id}")
async def archive_shift(shift_id: str, ctx=Depends(require_roles("OWNER"))):
    shift = await _get_shift(shift_id, ctx["restaurant_id"])
    updated = await db.shift.update(
        where={"id": shift.id},
        data={"isArchived": True, "archivedAt": datetime.now(UTC)},
        include={"user": {"include": {"employeeProfile": True, "memberships": True}}},
    )
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="planning.shift_archived",
        entity="Shift",
        entity_id=shift.id,
    )
    return _serialize_shift(updated, ctx["restaurant_id"])


async def _get_shift(shift_id: str, restaurant_id: str):
    shift = await db.shift.find_first(
        where={"id": shift_id, "restaurantId": restaurant_id},
        include={"user": {"include": {"employeeProfile": True, "memberships": True}}},
    )
    if not shift:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found")
    return shift


async def _ensure_employee(user_id: str, restaurant_id: str):
    membership = await db.restaurantmember.find_unique(
        where={"userId_restaurantId": {"userId": user_id, "restaurantId": restaurant_id}},
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")


async def _ensure_no_overlap(restaurant_id: str, user_id: str, start_at: datetime, end_at: datetime, exclude_shift_id: str | None = None):
    where = {
        "restaurantId": restaurant_id,
        "userId": user_id,
        "isArchived": False,
        "startAt": {"lt": end_at},
        "endAt": {"gt": start_at},
    }
    overlaps = await db.shift.find_many(where=where, take=5)
    if exclude_shift_id:
        overlaps = [shift for shift in overlaps if shift.id != exclude_shift_id]
    if overlaps:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Le shift chevauche un autre créneau")


def _validate_shift_range(start_at: datetime, end_at: datetime) -> None:
    if end_at <= start_at:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="L'heure de fin doit être après le début")


def _range_for_view(view: str, reference_date: date):
    if view == "day":
        start = datetime.combine(reference_date, datetime.min.time(), UTC)
        return start, start + timedelta(days=1)
    monday = reference_date - timedelta(days=reference_date.weekday())
    start = datetime.combine(monday, datetime.min.time(), UTC)
    return start, start + timedelta(days=7)


def _serialize_shift(shift, restaurant_id: str):
    membership = None
    if getattr(shift.user, "memberships", None):
        membership = next((item for item in shift.user.memberships if item.restaurantId == restaurant_id), None)
    profile = getattr(shift.user, "employeeProfile", None)
    return {
        "id": shift.id,
        "user_id": shift.userId,
        "employee_name": f"{shift.user.firstName} {shift.user.lastName}",
        "employee_email": shift.user.email,
        "role": membership.role if membership else None,
        "position": profile.position if profile else shift.position,
        "phone": profile.phone if profile else None,
        "start_at": shift.startAt,
        "end_at": shift.endAt,
        "break_minutes": shift.breakMinutes,
        "comment": shift.comment,
        "duration_minutes": max(int((shift.endAt - shift.startAt).total_seconds() // 60) - int(shift.breakMinutes), 0),
        "is_archived": shift.isArchived,
        "archived_at": shift.archivedAt,
        "created_at": shift.createdAt,
        "updated_at": shift.updatedAt,
    }
