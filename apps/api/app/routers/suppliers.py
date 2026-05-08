from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status

from app.db.prisma import db
from app.models.schemas import SupplierCreate, SupplierUpdate
from app.routers.deps import get_restaurant_context, require_roles

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


@router.get("")
async def list_suppliers(ctx=Depends(get_restaurant_context)):
    suppliers = await db.supplier.find_many(
        where={"restaurantId": ctx["restaurant_id"]},
        include={"invoices": True},
        order={"name": "asc"},
    )
    return [_serialize_supplier(supplier) for supplier in suppliers]


@router.get("/{supplier_id}")
async def get_supplier(supplier_id: str, ctx=Depends(get_restaurant_context)):
    supplier = await _get_supplier(supplier_id, ctx["restaurant_id"])
    return _serialize_supplier(supplier)


@router.post("")
async def create_supplier(payload: SupplierCreate, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER"))):
    supplier = await db.supplier.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "name": payload.name,
            "contactName": payload.contact_name,
            "email": payload.email,
            "phone": payload.phone,
            "address": payload.address,
            "categories": payload.categories,
            "paymentTerms": payload.payment_terms,
            "minimumOrder": payload.minimum_order,
            "rating": payload.rating,
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
    return _serialize_supplier(await _get_supplier(supplier.id, ctx["restaurant_id"]))


@router.patch("/{supplier_id}")
async def update_supplier(
    supplier_id: str,
    payload: SupplierUpdate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER")),
):
    supplier = await _get_supplier(supplier_id, ctx["restaurant_id"])
    data = {
        "name": payload.name,
        "contactName": payload.contact_name,
        "email": payload.email,
        "phone": payload.phone,
        "address": payload.address,
        "categories": payload.categories,
        "paymentTerms": payload.payment_terms,
        "minimumOrder": payload.minimum_order,
        "rating": payload.rating,
        "leadTimeDays": payload.lead_time_days,
        "isActive": payload.is_active,
    }
    updated = await db.supplier.update(
        where={"id": supplier.id},
        data={key: value for key, value in data.items() if value is not None},
        include={"invoices": True},
    )
    await db.auditlog.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "userId": ctx["user"].id,
            "action": "supplier.updated",
            "entity": "Supplier",
            "entityId": supplier.id,
        }
    )
    return _serialize_supplier(updated)


@router.post("/{supplier_id}/archive")
async def archive_supplier(supplier_id: str, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER"))):
    supplier = await _get_supplier(supplier_id, ctx["restaurant_id"])
    updated = await db.supplier.update(
        where={"id": supplier.id},
        data={"isActive": False},
        include={"invoices": True},
    )
    await db.auditlog.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "userId": ctx["user"].id,
            "action": "supplier.archived",
            "entity": "Supplier",
            "entityId": supplier.id,
        }
    )
    return _serialize_supplier(updated)


async def _get_supplier(supplier_id: str, restaurant_id: str):
    supplier = await db.supplier.find_first(
        where={"id": supplier_id, "restaurantId": restaurant_id},
        include={"invoices": True},
    )
    if not supplier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return supplier


def _serialize_supplier(supplier):
    invoice_total = sum((invoice.totalExcludingTax or Decimal("0") for invoice in supplier.invoices), Decimal("0"))
    approved_count = len([invoice for invoice in supplier.invoices if invoice.status == "APPROVED"])
    review_count = len([invoice for invoice in supplier.invoices if invoice.status == "OCR_REVIEW"])
    return {
        "id": supplier.id,
        "name": supplier.name,
        "contact_name": supplier.contactName,
        "email": supplier.email,
        "phone": supplier.phone,
        "address": supplier.address,
        "categories": supplier.categories,
        "payment_terms": supplier.paymentTerms,
        "minimum_order": supplier.minimumOrder,
        "rating": supplier.rating,
        "lead_time_days": supplier.leadTimeDays,
        "is_active": supplier.isActive,
        "created_at": supplier.createdAt,
        "updated_at": supplier.updatedAt,
        "stats": {
            "invoice_count": len(supplier.invoices),
            "approved_invoice_count": approved_count,
            "review_invoice_count": review_count,
            "purchase_total_excluding_tax": invoice_total,
        },
    }
