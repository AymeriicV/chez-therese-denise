from decimal import Decimal

from app.core.config import Settings
from app.core.security import hash_password
from app.db.prisma import db
from app.routers.quality import ensure_restaurant_quality_defaults
from app.services.allergens import detect_allergens, merge_allergens


async def seed_local_admin(settings: Settings) -> None:
    if settings.app_env != "local" or not settings.seed_local_admin:
        return
    restaurant = await db.restaurant.find_first(where={"name": "Chez Therese et Denise"})
    if not restaurant:
        restaurant = await db.restaurant.create(
            data={
                "name": "Chez Therese et Denise",
                "companySettings": {"create": {"brandName": "Chez Therese et Denise"}},
            }
        )

    email = settings.seed_admin_email.lower()
    password_hash = hash_password(settings.seed_admin_password)
    user = await db.user.find_unique(where={"email": email})
    if user:
        user = await db.user.update(
            where={"id": user.id},
            data={"passwordHash": password_hash, "firstName": "Aymeric", "lastName": "Admin", "isActive": True},
        )
    else:
        user = await db.user.create(
            data={
                "email": email,
                "passwordHash": password_hash,
                "firstName": "Aymeric",
                "lastName": "Admin",
            }
        )

    membership = await db.restaurantmember.find_unique(
        where={"userId_restaurantId": {"userId": user.id, "restaurantId": restaurant.id}}
    )
    if membership:
        await db.restaurantmember.update(where={"id": membership.id}, data={"role": "OWNER"})
    else:
        await db.restaurantmember.create(
            data={"userId": user.id, "restaurantId": restaurant.id, "role": "OWNER"}
        )

    user_with_memberships = await db.user.find_unique(where={"id": user.id}, include={"memberships": True})
    restaurant_ids = {restaurant.id}
    if user_with_memberships:
        restaurant_ids.update(membership.restaurantId for membership in user_with_memberships.memberships)
    for restaurant_id in restaurant_ids:
        await _seed_lieu_noir(restaurant_id)
        await ensure_restaurant_quality_defaults(restaurant_id)


async def _seed_lieu_noir(restaurant_id: str) -> None:
    existing_item = await db.inventoryitem.find_first(
        where={"restaurantId": restaurant_id, "name": "Lieu noir"}
    )
    if existing_item:
        return
    auto_allergens = detect_allergens("Lieu noir", "Poisson")
    item_data = {
        "sku": "1",
        "name": "Lieu noir",
        "category": "Poisson",
        "unit": "kg",
        "storageArea": "Chambre froide",
        "quantityOnHand": Decimal("11"),
        "reorderPoint": Decimal("0"),
        "averageCost": Decimal("0"),
        "allergens": merge_allergens(["Poisson"], auto_allergens),
        "autoAllergens": auto_allergens,
        "isActive": True,
        "archivedAt": None,
    }
    await db.inventoryitem.create(data={"restaurantId": restaurant_id, **item_data})
