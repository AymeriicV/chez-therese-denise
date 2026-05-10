from prisma import Json

from app.db.prisma import db


async def write_audit_log(
    *,
    restaurant_id: str | None,
    user_id: str | None,
    action: str,
    entity: str,
    entity_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    data = {
        "action": action,
        "entity": entity,
        "entityId": entity_id,
        "metadata": Json(metadata or {}),
    }
    if restaurant_id:
        data["restaurant"] = {"connect": {"id": restaurant_id}}
    if user_id:
        data["user"] = {"connect": {"id": user_id}}
    await db.auditlog.create(data=data)
