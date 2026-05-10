from app.core.config import Settings
from app.core.security import hash_password
from app.db.prisma import db


async def seed_local_admin(settings: Settings) -> None:
    if settings.app_env != "local" or not settings.seed_local_admin:
        return
    existing = await db.user.find_unique(where={"email": settings.seed_admin_email.lower()})
    if existing:
        return
    await db.user.create(
        data={
            "email": settings.seed_admin_email.lower(),
            "passwordHash": hash_password(settings.seed_admin_password),
            "firstName": "Admin",
            "lastName": "Local",
            "memberships": {
                "create": {
                    "role": "OWNER",
                    "restaurant": {
                        "create": {
                            "name": "Chez Therese et Denise",
                            "companySettings": {"create": {"brandName": "Chez Therese et Denise"}},
                        }
                    },
                }
            },
        }
    )
