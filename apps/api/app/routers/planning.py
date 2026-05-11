from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.db.prisma import db
from app.models.schemas import PlanningCellUpsert, PlanningCopyRequest, PlanningDuplicateDayRequest
from app.routers.deps import get_restaurant_context, require_roles
from app.services.audit import write_audit_log
from app.services.timezone import restaurant_now

router = APIRouter(prefix="/planning", tags=["planning"])

DAYS = [
    (0, "Lundi"),
    (1, "Mardi"),
    (2, "Mercredi"),
    (3, "Jeudi"),
    (4, "Vendredi"),
    (5, "Samedi"),
    (6, "Dimanche"),
]


@router.get("")
async def get_planning(
    target_date: date | None = Query(None),
    include_archived: bool = Query(False),
    ctx=Depends(get_restaurant_context),
):
    reference_date = target_date or (await restaurant_now(ctx["restaurant_id"])).date()
    week_start = _week_start(reference_date)
    week_end = week_start + timedelta(days=7)
    employees = await _list_employees(ctx["restaurant_id"], ctx["role"], ctx["user"].id)
    schedules = await db.planningschedule.find_many(
        where={
            "restaurantId": ctx["restaurant_id"],
            "weekStart": week_start,
            **({} if include_archived else {"isArchived": False}),
        },
        include={"days": True, "user": {"include": {"employeeProfile": True, "memberships": True}}},
        order={"updatedAt": "desc"},
    )
    schedule_map = {schedule.userId: schedule for schedule in schedules}
    rows = [_serialize_schedule(schedule_map.get(employee["id"]), employee, week_start) for employee in employees]
    return {
        "week_start": week_start.date().isoformat(),
        "week_end": week_end.date().isoformat(),
        "days": [_serialize_day_meta(weekday, week_start.date() + timedelta(days=weekday)) for weekday, _ in DAYS],
        "rows": rows,
    }


@router.post("/cells")
async def upsert_cell(payload: PlanningCellUpsert, ctx=Depends(require_roles("OWNER"))):
    week_start = _week_start(payload.week_start)
    await _ensure_employee(payload.user_id, ctx["restaurant_id"])
    schedule = await _get_or_create_schedule(
        restaurant_id=ctx["restaurant_id"],
        user_id=payload.user_id,
        week_start=week_start,
        weekly_target_minutes=payload.weekly_target_minutes,
        position=payload.position,
        comment=payload.comment,
        is_day_off=payload.is_day_off,
    )
    day = await _upsert_day(schedule.id, payload.weekday, payload)
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="planning.cell_upserted",
        entity="PlanningScheduleDay",
        entity_id=day.id,
        metadata={"userId": payload.user_id, "weekStart": week_start.date().isoformat(), "weekday": payload.weekday},
    )
    refreshed = await _get_schedule(schedule.id, ctx["restaurant_id"])
    employee = await _serialize_employee_for_row(refreshed.user, ctx["restaurant_id"])
    return _serialize_schedule(refreshed, employee, week_start)


@router.patch("/cells/{cell_id}")
async def update_cell(cell_id: str, payload: PlanningCellUpsert, ctx=Depends(require_roles("OWNER"))):
    cell = await _get_cell(cell_id, ctx["restaurant_id"])
    schedule = cell.schedule
    if payload.user_id and payload.user_id != schedule.userId:
        await _ensure_employee(payload.user_id, ctx["restaurant_id"])
        schedule = await _get_or_create_schedule(
            restaurant_id=ctx["restaurant_id"],
            user_id=payload.user_id,
            week_start=_week_start(payload.week_start),
            weekly_target_minutes=payload.weekly_target_minutes,
            position=payload.position,
            comment=payload.comment,
            is_day_off=payload.is_day_off,
        )
    else:
        await db.planningschedule.update(
            where={"id": schedule.id},
            data={
                "weeklyTargetMinutes": payload.weekly_target_minutes,
                "position": payload.position,
                "comment": payload.comment,
                "isDayOff": payload.is_day_off,
            },
        )
    day = await _upsert_day(schedule.id, payload.weekday, payload, cell_id=cell.id)
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="planning.cell_updated",
        entity="PlanningScheduleDay",
        entity_id=day.id,
    )
    refreshed = await _get_schedule(schedule.id, ctx["restaurant_id"])
    employee = await _serialize_employee_for_row(refreshed.user, ctx["restaurant_id"])
    return _serialize_schedule(refreshed, employee, refreshed.weekStart)


@router.post("/copy-previous-week")
async def copy_previous_week(payload: PlanningCopyRequest, ctx=Depends(require_roles("OWNER"))):
    target_week_start = _week_start(payload.target_date)
    source_week_start = target_week_start - timedelta(days=7)
    copied = await _copy_week(ctx["restaurant_id"], source_week_start, target_week_start)
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="planning.week_copied",
        entity="PlanningSchedule",
        metadata={"sourceWeek": source_week_start.date().isoformat(), "targetWeek": target_week_start.date().isoformat(), "count": copied},
    )
    return {"copied": copied, "target_week_start": target_week_start.date().isoformat()}


@router.post("/duplicate-day")
async def duplicate_day(payload: PlanningDuplicateDayRequest, ctx=Depends(require_roles("OWNER"))):
    source_date = payload.source_date
    target_date = payload.target_date
    source_week_start = _week_start(source_date)
    target_week_start = _week_start(target_date)
    source_weekday = source_date.weekday()
    target_weekday = target_date.weekday()
    source_schedules = await db.planningschedule.find_many(
        where={"restaurantId": ctx["restaurant_id"], "weekStart": source_week_start, "isArchived": False},
        include={"days": True, "user": True},
    )
    duplicated = 0
    for schedule in source_schedules:
        source_day = next((day for day in schedule.days if day.weekday == source_weekday), None)
        if not source_day:
            continue
        target_schedule = await _get_or_create_schedule(
            restaurant_id=ctx["restaurant_id"],
            user_id=schedule.userId,
            week_start=target_week_start,
            weekly_target_minutes=schedule.weeklyTargetMinutes,
            position=schedule.position,
            comment=schedule.comment,
            is_day_off=schedule.isDayOff,
        )
        await _upsert_day(
            target_schedule.id,
            target_weekday,
            PlanningCellUpsert(
                user_id=schedule.userId,
                week_start=target_week_start.date(),
                weekday=target_weekday,
                morning_start=source_day.morningStart,
                morning_end=source_day.morningEnd,
                break_minutes=source_day.breakMinutes,
                evening_start=source_day.eveningStart,
                evening_end=source_day.eveningEnd,
                is_day_off=source_day.isDayOff,
                weekly_target_minutes=schedule.weeklyTargetMinutes,
                position=schedule.position,
                comment=source_day.comment or schedule.comment,
            ),
        )
        duplicated += 1
    return {"duplicated": duplicated}


async def _copy_week(restaurant_id: str, source_week_start: datetime, target_week_start: datetime) -> int:
    source_schedules = await db.planningschedule.find_many(
        where={"restaurantId": restaurant_id, "weekStart": source_week_start, "isArchived": False},
        include={"days": True},
    )
    copied = 0
    for schedule in source_schedules:
        target_schedule = await _get_or_create_schedule(
            restaurant_id=restaurant_id,
            user_id=schedule.userId,
            week_start=target_week_start,
            weekly_target_minutes=schedule.weeklyTargetMinutes,
            position=schedule.position,
            comment=schedule.comment,
            is_day_off=schedule.isDayOff,
        )
        for day in schedule.days:
            await _upsert_day(
                target_schedule.id,
                day.weekday,
                PlanningCellUpsert(
                    user_id=schedule.userId,
                    week_start=target_week_start.date(),
                    weekday=day.weekday,
                    morning_start=day.morningStart,
                    morning_end=day.morningEnd,
                    break_minutes=day.breakMinutes,
                    evening_start=day.eveningStart,
                    evening_end=day.eveningEnd,
                    is_day_off=day.isDayOff,
                    weekly_target_minutes=schedule.weeklyTargetMinutes,
                    position=schedule.position,
                    comment=day.comment or schedule.comment,
                ),
            )
        copied += 1
    return copied


async def _list_employees(restaurant_id: str, role: str, current_user_id: str):
    if role == "EMPLOYEE":
        user = await db.user.find_unique(where={"id": current_user_id}, include={"memberships": True, "employeeProfile": True})
        return [await _serialize_employee_for_row(user, restaurant_id)] if user else []
    memberships = await db.restaurantmember.find_many(
        where={"restaurantId": restaurant_id},
        include={"user": {"include": {"employeeProfile": True, "memberships": True}}},
        order={"createdAt": "asc"},
    )
    return [await _serialize_employee_for_row(membership.user, restaurant_id) for membership in memberships if membership.user.isActive]


async def _serialize_employee_for_row(user, restaurant_id: str):
    membership = None
    if getattr(user, "memberships", None):
        membership = next((item for item in user.memberships if item.restaurantId == restaurant_id), None)
    profile = getattr(user, "employeeProfile", None)
    return {
        "id": user.id,
        "email": user.email,
        "name": f"{user.firstName} {user.lastName}",
        "position": profile.position if profile else "",
        "role": membership.role if membership else None,
        "weekly_target_minutes": 0,
        "is_active": user.isActive and (profile.isActive if profile else True),
    }


def _serialize_schedule(schedule, employee, week_start: datetime):
    cells = {day.weekday: _serialize_day(day) for day in getattr(schedule, "days", [])}
    day_rows = []
    planned_week = 0
    actual_week = 0
    display_week = 0
    for weekday, label in DAYS:
        day = cells.get(weekday)
        planned = day["planned_minutes"] if day else 0
        actual = day["actual_minutes"] if day else 0
        total = day["total_minutes"] if day else 0
        planned_week += planned
        actual_week += actual
        display_week += total
        day_rows.append(
            {
                "weekday": weekday,
                "label": label,
                "date": (week_start + timedelta(days=weekday)).date().isoformat(),
                "cell": day,
                "total_minutes": total,
            }
        )
    target = schedule.weeklyTargetMinutes if schedule else employee["weekly_target_minutes"]
    return {
        "schedule_id": schedule.id if schedule else None,
        "user_id": employee["id"],
        "employee_name": employee["name"],
        "email": employee["email"],
        "position": schedule.position if schedule else employee["position"],
        "role": employee["role"],
        "weekly_target_minutes": target,
        "comment": schedule.comment if schedule else "",
        "is_day_off": schedule.isDayOff if schedule else False,
        "planned_week_minutes": planned_week,
        "actual_week_minutes": actual_week,
        "total_week_minutes": display_week,
        "exceeds_objective": bool(target and display_week > target),
        "days": day_rows,
    }


def _serialize_day(day):
    morning_start = _day_value(day, "morningStart", "morning_start")
    morning_end = _day_value(day, "morningEnd", "morning_end")
    actual_start = _day_value(day, "actualStart", "actual_start")
    actual_end = _day_value(day, "actualEnd", "actual_end")
    break_minutes = _day_value(day, "breakMinutes", "break_minutes") or 0
    evening_start = _day_value(day, "eveningStart", "evening_start")
    evening_end = _day_value(day, "eveningEnd", "evening_end")
    is_day_off = _day_value(day, "isDayOff", "is_day_off")
    planned_minutes = _compute_day_total(morning_start, morning_end, break_minutes, evening_start, evening_end, is_day_off)
    actual_minutes = _compute_day_total(actual_start, actual_end, break_minutes, None, None, is_day_off)
    display_minutes = actual_minutes if actual_start and actual_end else planned_minutes
    return {
        "id": day.id,
        "weekday": day.weekday,
        "morning_start": morning_start,
        "morning_end": morning_end,
        "actual_start": actual_start,
        "actual_end": actual_end,
        "break_minutes": break_minutes,
        "evening_start": evening_start,
        "evening_end": evening_end,
        "is_day_off": is_day_off,
        "comment": day.comment,
        "planned_minutes": planned_minutes,
        "actual_minutes": actual_minutes,
        "difference_minutes": actual_minutes - planned_minutes if actual_start and actual_end else 0,
        "total_minutes": display_minutes,
    }


def _serialize_day_meta(weekday: int, current_date: date):
    return {
        "weekday": weekday,
        "label": DAYS[weekday][1],
        "date": current_date.isoformat(),
    }


async def _get_or_create_schedule(
    *,
    restaurant_id: str,
    user_id: str,
    week_start: datetime,
    weekly_target_minutes: int,
    position: str,
    comment: str | None,
    is_day_off: bool,
):
    schedule = await db.planningschedule.find_unique(
        where={"restaurantId_userId_weekStart": {"restaurantId": restaurant_id, "userId": user_id, "weekStart": week_start}},
        include={"days": True, "user": {"include": {"employeeProfile": True, "memberships": True}}},
    )
    if schedule:
        data = {
            "weeklyTargetMinutes": weekly_target_minutes,
            "position": position,
            "comment": comment,
            "isDayOff": is_day_off,
        }
        if weekly_target_minutes or position or comment is not None or is_day_off:
            schedule = await db.planningschedule.update(where={"id": schedule.id}, data={k: v for k, v in data.items() if v is not None}, include={"days": True, "user": {"include": {"employeeProfile": True, "memberships": True}}})
        return schedule
    return await db.planningschedule.create(
        data={
            "restaurantId": restaurant_id,
            "userId": user_id,
            "weekStart": week_start,
            "weeklyTargetMinutes": weekly_target_minutes,
            "position": position,
            "comment": comment,
            "isDayOff": is_day_off,
        },
        include={"days": True, "user": {"include": {"employeeProfile": True, "memberships": True}}},
    )


async def _upsert_day(schedule_id: str, weekday: int, payload: PlanningCellUpsert, cell_id: str | None = None):
    data = {
        "morningStart": payload.morning_start,
        "morningEnd": payload.morning_end,
        "breakMinutes": payload.break_minutes,
        "eveningStart": payload.evening_start,
        "eveningEnd": payload.evening_end,
        "isDayOff": payload.is_day_off,
        "comment": payload.comment,
    }
    existing = None
    if cell_id:
        existing = await db.planningscheduleday.find_first(where={"id": cell_id, "planningScheduleId": schedule_id})
    if existing:
        return await db.planningscheduleday.update(where={"id": existing.id}, data=data)
    existing = await db.planningscheduleday.find_unique(where={"planningScheduleId_weekday": {"planningScheduleId": schedule_id, "weekday": weekday}})
    if existing:
        return await db.planningscheduleday.update(where={"id": existing.id}, data=data)
    return await db.planningscheduleday.create(data={"planningScheduleId": schedule_id, "weekday": weekday, **data})


async def _get_schedule(schedule_id: str, restaurant_id: str):
    schedule = await db.planningschedule.find_unique(
        where={"id": schedule_id},
        include={"days": True, "user": {"include": {"employeeProfile": True, "memberships": True}}},
    )
    if not schedule or schedule.restaurantId != restaurant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Planning introuvable")
    return schedule


async def _get_cell(cell_id: str, restaurant_id: str):
    cell = await db.planningscheduleday.find_unique(
        where={"id": cell_id},
        include={"schedule": {"include": {"user": {"include": {"employeeProfile": True, "memberships": True}}, "days": True}}},
    )
    if not cell or cell.schedule.restaurantId != restaurant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cellule introuvable")
    return cell


async def _ensure_employee(user_id: str, restaurant_id: str):
    membership = await db.restaurantmember.find_unique(
        where={"userId_restaurantId": {"userId": user_id, "restaurantId": restaurant_id}},
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employé introuvable")


def _week_start(reference_date: date) -> datetime:
    monday = reference_date - timedelta(days=reference_date.weekday())
    return datetime.combine(monday, datetime.min.time(), UTC)


def _compute_day_total(morning_start: str | None, morning_end: str | None, break_minutes: int, evening_start: str | None, evening_end: str | None, is_day_off: bool) -> int:
    if is_day_off:
        return 0
    total = 0
    total += _range_minutes(morning_start, morning_end)
    total += _range_minutes(evening_start, evening_end)
    total -= break_minutes or 0
    return max(total, 0)


def _range_minutes(start: str | None, end: str | None) -> int:
    if not start or not end:
        return 0
    try:
        start_hour, start_minute = [int(part) for part in start.split(":")[:2]]
        end_hour, end_minute = [int(part) for part in end.split(":")[:2]]
        start_total = start_hour * 60 + start_minute
        end_total = end_hour * 60 + end_minute
        return max(end_total - start_total, 0)
    except Exception:
        return 0


def _day_value(day, camel: str, snake: str):
    if hasattr(day, camel):
        return getattr(day, camel)
    return getattr(day, snake, None)
