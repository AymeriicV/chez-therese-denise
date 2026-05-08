from fastapi import APIRouter, Depends

from app.db.prisma import db
from app.models.schemas import SupplierCreate
from app.routers.deps import get_restaurant_context, require_roles

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


@router.get("")
async def list_suppliers(ctx=Depends(get_restaurant_context)):
    return await db.supplier.find_many(
        where={"restaurantId": ctx["restaurant_id"]},
        order={"name": "asc"},
    )


@router.post("")
async def create_supplier(payload: SupplierCreate, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER"))):
    supplier = await db.supplier.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "name": payload.name,
            "contactName": payload.contact_name,
            "email": payload.email,
            "phone": payload.phone,
            "leadTimeDays": payload.lead_time_days,
        }
    )
    await db.auditlog.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "userId": ctx["user"].id,
            "action": "supplier.created",
            "entity": "Supplier",
            "entityId": supplier.id,
        }
    )
    return supplier
