from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.db.prisma import db
from app.models.schemas import InvoiceRejectRequest
from app.routers.deps import get_restaurant_context, require_roles
from app.services.audit import write_audit_log
from app.services.ocr import InvoiceOcrService
from app.services.stock import apply_invoice_lines_to_stock

router = APIRouter(prefix="/invoices", tags=["invoices"])
UPLOAD_ROOT = Path("/app/uploads/invoices")
ocr_service = InvoiceOcrService()


@router.get("")
async def list_invoices(ctx=Depends(get_restaurant_context)):
    invoices = await db.supplierinvoice.find_many(
        where={"restaurantId": ctx["restaurant_id"]},
        include={"supplier": True, "lines": True},
        order={"createdAt": "desc"},
    )
    return [_serialize_invoice(invoice) for invoice in invoices]


@router.post("/upload")
async def upload_invoice(file: UploadFile = File(...), ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF", "ACCOUNTANT"))):
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "invoice.pdf").suffix
    storage_name = f"{uuid4()}{suffix}"
    storage_path = UPLOAD_ROOT / storage_name
    content = await file.read()
    storage_path.write_bytes(content)
    invoice = await db.supplierinvoice.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "originalName": file.filename or storage_name,
            "storagePath": str(storage_path),
            "mimeType": file.content_type,
            "fileSize": len(content),
            "status": "OCR_PROCESSING",
        }
    )
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action="invoice.uploaded",
        entity="SupplierInvoice",
        entity_id=invoice.id,
        metadata={"filename": file.filename, "size": len(content)},
    )
    return await _process_invoice(invoice.id, ctx)


@router.post("/{invoice_id}/process")
async def process_invoice(invoice_id: str, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF", "ACCOUNTANT"))):
    invoice = await _get_invoice(invoice_id, ctx["restaurant_id"])
    if invoice.status == "APPROVED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Approved invoice cannot be reprocessed")
    return await _process_invoice(invoice_id, ctx)


@router.post("/{invoice_id}/approve")
async def approve_invoice(invoice_id: str, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"))):
    invoice = await _get_invoice(invoice_id, ctx["restaurant_id"])
    if invoice.status == "APPROVED":
        return _serialize_invoice(invoice)
    applied_lines = await apply_invoice_lines_to_stock(invoice, ctx["restaurant_id"])
    updated = await db.supplierinvoice.update(
        where={"id": invoice.id},
        data={"status": "APPROVED", "approvedAt": datetime.now(UTC), "rejectedReason": None},
        include={"supplier": True, "lines": True},
    )
    await _audit(ctx, "invoice.approved", invoice.id, {"stockLinesApplied": applied_lines})
    return _serialize_invoice(updated)


@router.post("/{invoice_id}/reject")
async def reject_invoice(
    invoice_id: str,
    payload: InvoiceRejectRequest,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "ACCOUNTANT")),
):
    invoice = await _get_invoice(invoice_id, ctx["restaurant_id"])
    if invoice.status == "APPROVED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Approved invoice cannot be rejected")
    updated = await db.supplierinvoice.update(
        where={"id": invoice.id},
        data={"status": "REJECTED", "rejectedReason": payload.reason},
        include={"supplier": True, "lines": True},
    )
    await _audit(ctx, "invoice.rejected", invoice.id, {"reason": payload.reason})
    return _serialize_invoice(updated)


async def _process_invoice(invoice_id: str, ctx: dict):
    invoice = await _get_invoice(invoice_id, ctx["restaurant_id"])
    extracted = await ocr_service.extract(Path(invoice.storagePath), invoice.originalName)
    supplier = await _find_or_create_supplier(ctx["restaurant_id"], extracted.supplier_name)

    await db.supplierinvoiceline.delete_many(where={"invoiceId": invoice.id})
    updated = await db.supplierinvoice.update(
        where={"id": invoice.id},
        data={
            "supplierId": supplier.id,
            "number": extracted.number,
            "status": "OCR_REVIEW",
            "totalExcludingTax": extracted.total_excluding_tax,
            "totalIncludingTax": extracted.total_including_tax,
            "invoiceDate": extracted.invoice_date,
            "ocrConfidence": extracted.confidence,
            "ocrPayload": extracted.raw_payload,
            "processedAt": datetime.now(UTC),
            "rejectedReason": None,
            "lines": {
                "create": [
                    {
                        "label": line.label,
                        "quantity": line.quantity,
                        "unit": line.unit,
                        "unitPrice": line.unit_price,
                        "total": line.total,
                        "taxRate": line.tax_rate,
                        "confidence": line.confidence,
                    }
                    for line in extracted.lines
                ]
            },
        },
        include={"supplier": True, "lines": True},
    )
    await _audit(ctx, "invoice.ocr_processed", invoice.id, {"confidence": str(extracted.confidence)})
    return _serialize_invoice(updated)


async def _get_invoice(invoice_id: str, restaurant_id: str):
    invoice = await db.supplierinvoice.find_first(
        where={"id": invoice_id, "restaurantId": restaurant_id},
        include={"supplier": True, "lines": True},
    )
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    return invoice


async def _find_or_create_supplier(restaurant_id: str, name: str):
    supplier_name = name.strip() or "Fournisseur inconnu"
    supplier = await db.supplier.find_first(where={"restaurantId": restaurant_id, "name": supplier_name})
    if supplier:
        return supplier
    return await db.supplier.create(data={"restaurantId": restaurant_id, "name": supplier_name})


async def _audit(ctx: dict, action: str, invoice_id: str, metadata: dict | None = None) -> None:
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action=action,
        entity="SupplierInvoice",
        entity_id=invoice_id,
        metadata=metadata,
    )


def _serialize_invoice(invoice):
    return {
        "id": invoice.id,
        "original_name": invoice.originalName,
        "status": invoice.status,
        "supplier_name": invoice.supplier.name if invoice.supplier else None,
        "number": invoice.number,
        "total_excluding_tax": invoice.totalExcludingTax,
        "total_including_tax": invoice.totalIncludingTax,
        "invoice_date": invoice.invoiceDate,
        "ocr_confidence": invoice.ocrConfidence,
        "processed_at": invoice.processedAt,
        "approved_at": invoice.approvedAt,
        "rejected_reason": invoice.rejectedReason,
        "lines": [
            {
                "id": line.id,
                "label": line.label,
                "quantity": line.quantity,
                "unit": line.unit,
                "unit_price": line.unitPrice,
                "total": line.total,
                "tax_rate": line.taxRate,
                "confidence": line.confidence,
            }
            for line in invoice.lines
        ],
    }
