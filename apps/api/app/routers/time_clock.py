from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.db.prisma import db
from app.models.schemas import TimeClockCorrectionCreate
from app.routers.deps import get_restaurant_context, require_roles
from app.services.audit import write_audit_log
from app.services.timezone import restaurant_now

router = APIRouter(prefix="/time-clock", tags=["time-clock"])


@router.get("")
async def list_time_clock_entries(
    employee_id: str | None = Query(None),
    include_archived: bool = Query(False),
    ctx=Depends(get_restaurant_context),
):
    where = {"restaurantId": ctx["restaurant_id"]}
    if not include_archived:
        where["isArchived"] = False
    if ctx["role"] == "EMPLOYEE":
        where["userId"] = ctx["user"].id
    elif employee_id:
        where["userId"] = employee_id
    entries = await db.timeclocklog.find_many(
        where=where,
        include={
            "user": {
                "include": {
                    "employeeProfile": True,
                    "memberships": True,
                }
            },
            "corrections": True,
        },
        order={"clockIn": "desc"},
        take=200,
    )
    return [_serialize_entry(entry, ctx["restaurant_id"]) for entry in entries]


@router.post("/punch-in")
async def punch_in(ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF", "EMPLOYEE"))):
    now = await restaurant_now(ctx["restaurant_id"])
    open_entry = await db.timeclocklog.find_first(
        where={
            "restaurantId": ctx["restaurant_id"],
            "userId": ctx["user"].id,
            "clockOut": None,
            "isArchived": False,
        }
    )
    if open_entry:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Un pointage d'arrivée est déjà ouvert")
    entry = await db.timeclocklog.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "userId": ctx["user"].id,
            "clockIn": now.astimezone(UTC),
            "source": "employee",
        },
        include={
            "user": {"include": {"employeeProfile": True, "memberships": True}},
            "corrections": True,
        },
    )
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="time_clock.punch_in",
        entity="TimeClockLog",
        entity_id=entry.id,
    )
    await _sync_planning_from_time_clock(ctx["restaurant_id"], ctx["user"].id, entry.clockIn)
    return _serialize_entry(entry, ctx["restaurant_id"])


@router.post("/punch-out")
async def punch_out(ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF", "EMPLOYEE"))):
    now = await restaurant_now(ctx["restaurant_id"])
    open_entry = await db.timeclocklog.find_first(
        where={
            "restaurantId": ctx["restaurant_id"],
            "userId": ctx["user"].id,
            "clockOut": None,
            "isArchived": False,
        },
        include={"user": {"include": {"employeeProfile": True, "memberships": True}}, "corrections": True},
    )
    if not open_entry:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Aucun pointage d'arrivée en cours")
    updated = await db.timeclocklog.update(
        where={"id": open_entry.id},
        data={"clockOut": now.astimezone(UTC), "source": "employee"},
        include={"user": {"include": {"employeeProfile": True, "memberships": True}}, "corrections": True},
    )
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="time_clock.punch_out",
        entity="TimeClockLog",
        entity_id=updated.id,
    )
    await _sync_planning_from_time_clock(ctx["restaurant_id"], ctx["user"].id, updated.clockIn, updated.clockOut)
    return _serialize_entry(updated, ctx["restaurant_id"])


@router.post("/corrections")
async def create_correction(payload: TimeClockCorrectionCreate, ctx=Depends(require_roles("OWNER"))):
    if not payload.reason.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="La justification est obligatoire")
    employee = await _ensure_employee(payload.employee_id, ctx["restaurant_id"])
    entry = None
    original_clock_in = None
    original_clock_out = None
    if payload.entry_id:
        entry = await _get_entry(payload.entry_id, ctx["restaurant_id"])
        if entry.userId != employee.user.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le pointage ne correspond pas à l'employé")
        original_clock_in = entry.clockIn
        original_clock_out = entry.clockOut
        entry = await db.timeclocklog.update(
            where={"id": entry.id},
            data={
                "clockIn": payload.clock_in or entry.clockIn,
                "clockOut": payload.clock_out if payload.clock_out is not None else entry.clockOut,
                "source": "owner-correction",
            },
            include={"user": {"include": {"employeeProfile": True, "memberships": True}}, "corrections": True},
        )
    else:
        if not payload.clock_in:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="L'heure d'arrivée est obligatoire")
        entry = await db.timeclocklog.create(
            data={
                "restaurantId": ctx["restaurant_id"],
                "userId": employee.user.id,
                "clockIn": payload.clock_in,
                "clockOut": payload.clock_out,
                "source": "owner-correction",
            },
            include={"user": {"include": {"employeeProfile": True, "memberships": True}}, "corrections": True},
        )
    correction = await db.timeclockcorrectionlog.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "timeClockLogId": entry.id,
            "employeeUserId": employee.user.id,
            "correctedByUserId": ctx["user"].id,
            "reason": payload.reason,
            "note": payload.note,
            "originalClockIn": original_clock_in,
            "originalClockOut": original_clock_out,
            "correctedClockIn": payload.clock_in or entry.clockIn,
            "correctedClockOut": payload.clock_out if payload.clock_out is not None else entry.clockOut,
        }
    )
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="time_clock.corrected",
        entity="TimeClockLog",
        entity_id=entry.id,
        metadata={"reason": payload.reason, "correctionId": correction.id},
    )
    await _sync_planning_from_time_clock(
        ctx["restaurant_id"],
        employee.user.id,
        entry.clockIn,
        entry.clockOut,
    )
    refreshed = await _get_entry(entry.id, ctx["restaurant_id"])
    return _serialize_entry(refreshed, ctx["restaurant_id"])


async def _get_entry(entry_id: str, restaurant_id: str):
    entry = await db.timeclocklog.find_first(
        where={"id": entry_id, "restaurantId": restaurant_id},
        include={
            "user": {"include": {"employeeProfile": True, "memberships": True}},
            "corrections": True,
        },
    )
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pointage introuvable")
    return entry


async def _ensure_employee(user_id: str, restaurant_id: str):
    membership = await db.restaurantmember.find_unique(
        where={"userId_restaurantId": {"userId": user_id, "restaurantId": restaurant_id}},
        include={"user": {"include": {"employeeProfile": True, "memberships": True}}},
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employé introuvable")
    return membership


def _serialize_entry(entry, restaurant_id: str):
    membership = None
    if getattr(entry.user, "memberships", None):
        membership = next((item for item in entry.user.memberships if item.restaurantId == restaurant_id), None)
    profile = getattr(entry.user, "employeeProfile", None)
    return {
        "id": entry.id,
        "restaurant_id": entry.restaurantId,
        "employee_id": entry.userId,
        "employee_name": f"{entry.user.firstName} {entry.user.lastName}",
        "employee_email": entry.user.email,
        "role": membership.role if membership else None,
        "position": profile.position if profile else None,
        "clock_in": entry.clockIn,
        "clock_out": entry.clockOut,
        "source": entry.source,
        "is_open": entry.clockOut is None,
        "worked_minutes": _worked_minutes(entry.clockIn, entry.clockOut),
        "corrections": [
            {
                "id": correction.id,
                "reason": correction.reason,
                "note": correction.note,
                "corrected_by_user_id": correction.correctedByUserId,
                "corrected_clock_in": correction.correctedClockIn,
                "corrected_clock_out": correction.correctedClockOut,
                "created_at": correction.createdAt,
            }
            for correction in getattr(entry, "corrections", [])
        ],
        "created_at": entry.createdAt,
        "updated_at": entry.updatedAt,
        "is_archived": entry.isArchived,
        "archived_at": entry.archivedAt,
    }


def _worked_minutes(clock_in: datetime, clock_out: datetime | None) -> int:
    if not clock_out:
        return 0
    return max(int((clock_out - clock_in).total_seconds() // 60), 0)


async def _sync_planning_from_time_clock(restaurant_id: str, user_id: str, clock_in: datetime, clock_out: datetime | None = None):
    restaurant = await db.restaurant.find_unique(where={"id": restaurant_id})
    tz_name = restaurant.timezone if restaurant and restaurant.timezone else "UTC"
    try:
        zone = ZoneInfo(tz_name)
    except Exception:
        zone = ZoneInfo("UTC")

    local_clock_in = clock_in.astimezone(zone)
    local_clock_out = clock_out.astimezone(zone) if clock_out else None
    week_start = _week_start(local_clock_in.date())
    schedule = await db.planningschedule.find_unique(
        where={"restaurantId_userId_weekStart": {"restaurantId": restaurant_id, "userId": user_id, "weekStart": week_start}},
        include={"days": True, "user": {"include": {"employeeProfile": True, "memberships": True}}},
    )
    if not schedule:
        user = await db.user.find_unique(where={"id": user_id}, include={"employeeProfile": True, "memberships": True})
        profile = getattr(user, "employeeProfile", None)
        schedule = await db.planningschedule.create(
            data={
                "restaurantId": restaurant_id,
                "userId": user_id,
                "weekStart": week_start,
                "weeklyTargetMinutes": 0,
                "position": profile.position if profile and profile.position else "Badgeuse",
                "comment": "Créé depuis la badgeuse",
                "isDayOff": False,
            },
            include={"days": True, "user": {"include": {"employeeProfile": True, "memberships": True}}},
        )

    day = next((item for item in getattr(schedule, "days", []) if item.weekday == local_clock_in.weekday()), None)
    clock_in_label = local_clock_in.strftime("%H:%M")
    clock_out_label = local_clock_out.strftime("%H:%M") if local_clock_out else None
    should_create_or_update = day is None or day.isDayOff or (not day.morningStart and not day.eveningStart)
    should_update_actual = bool(day and (clock_in_label or clock_out_label))
    if not should_create_or_update and not should_update_actual:
        return

    if day is None or day.isDayOff or (not day.morningStart and not day.eveningStart):
        day_data = {
            "morningStart": clock_in_label,
            "morningEnd": clock_out_label,
            "actualStart": clock_in_label,
            "actualEnd": clock_out_label,
            "breakMinutes": 0,
            "eveningStart": None,
            "eveningEnd": None,
            "isDayOff": False,
            "comment": day.comment if day else "Créé depuis la badgeuse",
        }
    else:
        day_data = {
            "actualStart": clock_in_label if not day.actualStart else day.actualStart,
            "actualEnd": clock_out_label if clock_out_label else day.actualEnd,
            "isDayOff": False,
        }

    existing = None
    if day:
        existing = await db.planningscheduleday.find_first(where={"id": day.id, "planningScheduleId": schedule.id})
    if existing:
        await db.planningscheduleday.update(where={"id": existing.id}, data=day_data)
    else:
        await db.planningscheduleday.create(data={"planningScheduleId": schedule.id, "weekday": local_clock_in.weekday(), **day_data})


def _week_start(reference_date):
    monday = reference_date - timedelta(days=reference_date.weekday())
    return datetime.combine(monday, datetime.min.time(), UTC)
