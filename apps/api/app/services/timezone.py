from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from app.db.prisma import db


async def restaurant_zone(restaurant_id: str) -> ZoneInfo:
    restaurant = await db.restaurant.find_unique(where={"id": restaurant_id})
    tz_name = restaurant.timezone if restaurant and restaurant.timezone else "UTC"
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return ZoneInfo("UTC")


async def restaurant_now(restaurant_id: str) -> datetime:
    return datetime.now(UTC).astimezone(await restaurant_zone(restaurant_id))
