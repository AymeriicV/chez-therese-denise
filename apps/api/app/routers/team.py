from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import hash_password
from app.db.prisma import db
from app.models.schemas import EmployeeCreate, EmployeeUpdate
from app.routers.deps import require_roles
from app.services.audit import write_audit_log

router = APIRouter(prefix="/team", tags=["team"])


@router.get("/employees")
async def list_employees(include_archived: bool = Query(False), ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER"))):
    memberships = await db.restaurantmember.find_many(
        where={"restaurantId": ctx["restaurant_id"]},
        include={"user": {"include": {"employeeProfile": True, "timeClockLogs": True, "shifts": True}}},
        order={"createdAt": "asc"},
    )
    employees = []
    for membership in memberships:
        employee = _serialize_employee(membership)
        if not include_archived and not employee["is_active"]:
            continue
        employees.append(employee)
    return employees


@router.post("/employees")
async def create_employee(payload: EmployeeCreate, ctx=Depends(require_roles("OWNER", "ADMIN"))):
    email = payload.email.lower()
    existing = await db.user.find_unique(where={"email": email})
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cet email est déjà utilisé")
    user = await db.user.create(
        data={
            "email": email,
            "passwordHash": hash_password(payload.password),
            "firstName": payload.first_name,
            "lastName": payload.last_name,
            "isActive": True,
            "memberships": {
                "create": {
                    "role": payload.role,
                    "restaurant": {"connect": {"id": ctx["restaurant_id"]}},
                }
            },
            "employeeProfile": {
                "create": {
                    "position": payload.position,
                    "phone": payload.phone,
                    "isActive": True,
                    "restaurant": {"connect": {"id": ctx["restaurant_id"]}},
                }
            },
        },
        include={"memberships": True, "employeeProfile": True, "timeClockLogs": True, "shifts": True},
    )
    membership = user.memberships[0]
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="team.employee_created",
        entity="User",
        entity_id=user.id,
        metadata={"role": membership.role, "position": payload.position},
    )
    return _serialize_employee_with_user(user, membership.role)


@router.patch("/employees/{employee_id}")
async def update_employee(employee_id: str, payload: EmployeeUpdate, ctx=Depends(require_roles("OWNER", "ADMIN"))):
    membership = await _get_membership(employee_id, ctx["restaurant_id"])
    user = membership.user
    user_data = _drop_unset(
        {
            "email": payload.email.lower() if payload.email else None,
            "passwordHash": hash_password(payload.password) if payload.password else None,
            "firstName": payload.first_name,
            "lastName": payload.last_name,
            "isActive": payload.is_active,
        },
        payload.model_fields_set,
        {
            "email": "email",
            "password": "passwordHash",
            "first_name": "firstName",
            "last_name": "lastName",
            "is_active": "isActive",
        },
    )
    if "email" in payload.model_fields_set and payload.email:
        duplicate = await db.user.find_unique(where={"email": payload.email.lower()})
        if duplicate and duplicate.id != user.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    if user_data:
        await db.user.update(where={"id": user.id}, data=user_data)
    if "role" in payload.model_fields_set and payload.role:
        await db.restaurantmember.update(where={"id": membership.id}, data={"role": payload.role})
    profile = await db.employeeprofile.find_unique(where={"userId": user.id})
    profile_data = _drop_unset(
        {
            "position": payload.position,
            "phone": payload.phone,
            "isActive": payload.is_active,
            "archivedAt": None if payload.is_active else datetime.now(UTC),
        },
        payload.model_fields_set,
        {
            "position": "position",
            "phone": "phone",
            "is_active": "isActive",
        },
    )
    if "is_active" in payload.model_fields_set and payload.is_active is True:
        profile_data["archivedAt"] = None
    if profile and profile_data:
        await db.employeeprofile.update(where={"id": profile.id}, data=profile_data)
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="team.employee_updated",
        entity="User",
        entity_id=user.id,
        metadata={"role": payload.role, "position": payload.position, "is_active": payload.is_active},
    )
    updated = await _get_membership(employee_id, ctx["restaurant_id"])
    return _serialize_employee(updated)


@router.delete("/employees/{employee_id}")
async def archive_employee(employee_id: str, ctx=Depends(require_roles("OWNER", "ADMIN"))):
    membership = await _get_membership(employee_id, ctx["restaurant_id"])
    user = membership.user
    await db.user.update(where={"id": user.id}, data={"isActive": False})
    profile = await db.employeeprofile.find_unique(where={"userId": user.id})
    if profile:
        await db.employeeprofile.update(
            where={"id": profile.id},
            data={"isActive": False, "archivedAt": datetime.now(UTC)},
        )
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="team.employee_archived",
        entity="User",
        entity_id=user.id,
    )
    updated = await _get_membership(employee_id, ctx["restaurant_id"])
    return _serialize_employee(updated)


async def _get_membership(user_id: str, restaurant_id: str):
    membership = await db.restaurantmember.find_unique(
        where={"userId_restaurantId": {"userId": user_id, "restaurantId": restaurant_id}},
        include={"user": {"include": {"employeeProfile": True, "timeClockLogs": True, "shifts": True}}},
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employé introuvable")
    return membership


def _serialize_employee_with_user(user, role: str):
    membership = user.memberships[0] if getattr(user, "memberships", None) else None
    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.firstName,
        "last_name": user.lastName,
        "role": role or (membership.role if membership else None),
        "position": user.employeeProfile.position if getattr(user, "employeeProfile", None) else "",
        "phone": user.employeeProfile.phone if getattr(user, "employeeProfile", None) else None,
        "is_active": user.isActive and (user.employeeProfile.isActive if getattr(user, "employeeProfile", None) else True),
        "archived_at": user.employeeProfile.archivedAt if getattr(user, "employeeProfile", None) else None,
        "last_login_at": user.lastLoginAt,
        "created_at": user.createdAt,
        "updated_at": user.updatedAt,
    }


def _serialize_employee(membership):
    user = membership.user
    profile = getattr(user, "employeeProfile", None)
    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.firstName,
        "last_name": user.lastName,
        "role": membership.role,
        "position": profile.position if profile else "",
        "phone": profile.phone if profile else None,
        "is_active": user.isActive and (profile.isActive if profile else True),
        "archived_at": profile.archivedAt if profile else None,
        "last_login_at": user.lastLoginAt,
        "created_at": user.createdAt,
        "updated_at": user.updatedAt,
    }


def _drop_unset(data: dict, fields_set: set[str], field_map: dict[str, str]):
    return {field_map[key]: value for key, value in data.items() if key in fields_set and value is not None}
