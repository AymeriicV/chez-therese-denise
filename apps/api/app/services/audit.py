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
    await db.auditlog.create(
        data={
            "restaurantId": restaurant_id,
            "userId": user_id,
            "action": action,
            "entity": entity,
            "entityId": entity_id,
            "metadata": metadata,
        }
    )
