from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from prisma import Json

from app.core.config import get_settings
from app.db.prisma import db
from app.models.schemas import InvoiceRejectRequest, InvoiceUpdateRequest
from app.routers.deps import get_restaurant_context, require_roles
from app.services.audit import write_audit_log
from app.services.ocr import InvoiceOcrService
from app.services.pricing import record_invoice_price_history_and_alerts
from app.services.stock import apply_invoice_lines_to_stock

router = APIRouter(prefix="/invoices", tags=["invoices"])
ocr_service = InvoiceOcrService()
MAX_UPLOAD_SIZE = 20 * 1024 * 1024
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "application/pdf"}


@router.get("")
async def list_invoices(
    supplier_id: str | None = Query(None),
    number: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    invoice_date_from: date | None = Query(None),
    invoice_date_to: date | None = Query(None),
    uploaded_from: date | None = Query(None),
    uploaded_to: date | None = Query(None),
    min_total: Decimal | None = Query(None),
    max_total: Decimal | None = Query(None),
    sort_by: str = Query("created_at"),
    sort_dir: str = Query("desc"),
    ctx=Depends(get_restaurant_context),
):
    invoices = await db.supplierinvoice.find_many(
        where={"restaurantId": ctx["restaurant_id"]},
        include={
            "supplier": True,
            "uploadedBy": True,
            "template": True,
            "lines": {"include": {"inventoryItem": True}},
        },
        order={"createdAt": "desc"},
    )
    filtered = [
        invoice
        for invoice in invoices
        if _matches_filters(
            invoice,
            supplier_id=supplier_id,
            number=number,
            status_filter=status_filter,
            invoice_date_from=invoice_date_from,
            invoice_date_to=invoice_date_to,
            uploaded_from=uploaded_from,
            uploaded_to=uploaded_to,
            min_total=min_total,
            max_total=max_total,
        )
    ]
    reverse = sort_dir.lower() != "asc"
    filtered.sort(key=lambda invoice: _sort_key(invoice, sort_by), reverse=reverse)
    return [_serialize_invoice(invoice, ctx["restaurant_id"]) for invoice in filtered]


@router.get("/{invoice_id}")
async def get_invoice(invoice_id: str, ctx=Depends(get_restaurant_context)):
    invoice = await _get_invoice(invoice_id, ctx["restaurant_id"])
    return _serialize_invoice(invoice, ctx["restaurant_id"])


@router.get("/{invoice_id}/document")
async def get_invoice_document(invoice_id: str, ctx=Depends(get_restaurant_context)):
    invoice = await _get_invoice(invoice_id, ctx["restaurant_id"])
    path = Path(invoice.storagePath)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document introuvable")
    media_type = invoice.mimeType or "application/octet-stream"
    return FileResponse(path, media_type=media_type, filename=invoice.originalName)


@router.post("/upload")
async def upload_invoice(
    supplier_id: str = Form(...),
    file: UploadFile = File(...),
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF", "ACCOUNTANT")),
):
    await _ensure_supplier(supplier_id, ctx["restaurant_id"])
    validated_upload = await _store_upload(file, ctx["restaurant_id"])
    invoice = await db.supplierinvoice.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "supplierId": supplier_id,
            "uploadedByUserId": ctx["user"].id,
            "originalName": validated_upload["original_name"],
            "storedName": validated_upload["stored_name"],
            "storagePath": validated_upload["storage_path"],
            "mimeType": validated_upload["mime_type"],
            "fileSize": validated_upload["file_size"],
            "status": "UPLOADED",
        },
        include={
            "supplier": True,
            "uploadedBy": True,
            "template": True,
            "lines": {"include": {"inventoryItem": True}},
        },
    )
    await _audit(
        ctx,
        "invoice.uploaded",
        invoice.id,
        {"filename": validated_upload["original_name"], "size": validated_upload["file_size"], "supplierId": supplier_id},
    )
    return _serialize_invoice(invoice, ctx["restaurant_id"])


@router.post("/{invoice_id}/process")
async def process_invoice(invoice_id: str, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF", "ACCOUNTANT"))):
    invoice = await _get_invoice(invoice_id, ctx["restaurant_id"])
    if invoice.status == "APPROVED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Une facture validée ne peut pas être relancée")
    if invoice.status == "REJECTED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Une facture rejetée doit être réimportée")
    if not invoice.supplierId:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sélectionnez d'abord un fournisseur")
    supplier = await _ensure_supplier(invoice.supplierId, ctx["restaurant_id"])
    template = await _get_or_create_template(ctx["restaurant_id"], supplier.id, supplier.name)
    extracted = await ocr_service.extract(
        Path(invoice.storagePath),
        invoice.originalName,
        supplier_name=supplier.name,
        template=_template_payload(template),
    )
    linked_lines = await _match_invoice_lines(ctx["restaurant_id"], extracted.lines)
    await db.supplierinvoiceline.delete_many(where={"invoiceId": invoice.id})
    updated = await db.supplierinvoice.update(
        where={"id": invoice.id},
        data={
            "template": {"connect": {"id": template.id}},
            "number": extracted.number,
            "status": "OCR_REVIEW",
            "totalExcludingTax": extracted.total_excluding_tax,
            "totalIncludingTax": extracted.total_including_tax,
            "invoiceDate": extracted.invoice_date,
            "ocrConfidence": extracted.confidence,
            "ocrPayload": Json(extracted.raw_payload),
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
                        "inventoryItemId": linked_lines.get(line.label.lower()),
                    }
                    for line in extracted.lines
                ]
            },
        },
        include={
            "supplier": True,
            "uploadedBy": True,
            "template": True,
            "lines": {"include": {"inventoryItem": True}},
        },
    )
    await _update_template_learning(template.id, extracted)
    await _audit(ctx, "invoice.ocr_processed", invoice.id, {"confidence": str(extracted.confidence), "templateId": template.id})
    return _serialize_invoice(updated, ctx["restaurant_id"])


@router.patch("/{invoice_id}")
async def update_invoice(invoice_id: str, payload: InvoiceUpdateRequest, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"))):
    invoice = await _get_invoice(invoice_id, ctx["restaurant_id"])
    if invoice.status == "APPROVED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Une facture validée ne peut pas être modifiée")
    data = {}
    if "supplier_id" in payload.model_fields_set:
        if payload.supplier_id:
            await _ensure_supplier(payload.supplier_id, ctx["restaurant_id"])
            data["supplierId"] = payload.supplier_id
        else:
            data["supplierId"] = None
    if "number" in payload.model_fields_set:
        data["number"] = payload.number
    if "invoice_date" in payload.model_fields_set:
        data["invoiceDate"] = payload.invoice_date
    if "total_excluding_tax" in payload.model_fields_set:
        data["totalExcludingTax"] = payload.total_excluding_tax
    if "total_including_tax" in payload.model_fields_set:
        data["totalIncludingTax"] = payload.total_including_tax
    if "status" in payload.model_fields_set and payload.status:
        data["status"] = payload.status
    if data:
        await db.supplierinvoice.update(where={"id": invoice.id}, data=data)
    if "lines" in payload.model_fields_set and payload.lines is not None:
        await db.supplierinvoiceline.delete_many(where={"invoiceId": invoice.id})
        for line in payload.lines:
            await db.supplierinvoiceline.create(
                data={
                    "invoiceId": invoice.id,
                    "inventoryItemId": line.inventory_item_id,
                    "label": line.label,
                    "quantity": line.quantity,
                    "unit": line.unit,
                    "unitPrice": line.unit_price,
                    "total": line.total,
                },
            )
    refreshed = await _get_invoice(invoice_id, ctx["restaurant_id"])
    if refreshed.template:
        await _learn_template_from_corrections(refreshed.template.id, invoice, refreshed)
    await _audit(ctx, "invoice.updated", invoice.id, {"fields": list(payload.model_fields_set)})
    return _serialize_invoice(refreshed, ctx["restaurant_id"])


@router.post("/{invoice_id}/approve")
async def approve_invoice(invoice_id: str, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"))):
    invoice = await _get_invoice(invoice_id, ctx["restaurant_id"])
    if invoice.status == "APPROVED":
        return _serialize_invoice(invoice, ctx["restaurant_id"])
    if invoice.status != "OCR_REVIEW":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La facture doit être analysée avant validation")
    applied_lines = await apply_invoice_lines_to_stock(invoice, ctx["restaurant_id"])
    alert_ids = await record_invoice_price_history_and_alerts(invoice, ctx["restaurant_id"])
    updated = await db.supplierinvoice.update(
        where={"id": invoice.id},
        data={"status": "APPROVED", "approvedAt": datetime.now(UTC), "rejectedReason": None},
        include={
            "supplier": True,
            "uploadedBy": True,
            "template": True,
            "lines": {"include": {"inventoryItem": True}},
        },
    )
    if updated.template:
        await _learn_template_from_corrections(updated.template.id, invoice, updated)
    await _audit(ctx, "invoice.approved", invoice.id, {"stockLinesApplied": applied_lines, "priceAlertIds": alert_ids})
    return _serialize_invoice(updated, ctx["restaurant_id"])


@router.post("/{invoice_id}/reject")
async def reject_invoice(
    invoice_id: str,
    payload: InvoiceRejectRequest,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "ACCOUNTANT")),
):
    invoice = await _get_invoice(invoice_id, ctx["restaurant_id"])
    if invoice.status == "APPROVED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Une facture validée ne peut pas être rejetée")
    updated = await db.supplierinvoice.update(
        where={"id": invoice.id},
        data={"status": "REJECTED", "rejectedReason": payload.reason},
        include={
            "supplier": True,
            "uploadedBy": True,
            "template": True,
            "lines": {"include": {"inventoryItem": True}},
        },
    )
    await _audit(ctx, "invoice.rejected", invoice.id, {"reason": payload.reason})
    return _serialize_invoice(updated, ctx["restaurant_id"])


async def _get_invoice(invoice_id: str, restaurant_id: str):
    invoice = await db.supplierinvoice.find_first(
        where={"id": invoice_id, "restaurantId": restaurant_id},
        include={
            "supplier": True,
            "uploadedBy": True,
            "template": True,
            "lines": {"include": {"inventoryItem": True}},
        },
    )
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Facture introuvable")
    return invoice


async def _ensure_supplier(supplier_id: str, restaurant_id: str):
    supplier = await db.supplier.find_first(where={"id": supplier_id, "restaurantId": restaurant_id})
    if not supplier:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fournisseur introuvable")
    return supplier


async def _get_or_create_template(restaurant_id: str, supplier_id: str, supplier_name: str):
    template = await db.supplierinvoicetemplate.find_first(
        where={"restaurantId": restaurant_id, "supplierId": supplier_id, "isActive": True},
    )
    if template:
        return template
    return await db.supplierinvoicetemplate.create(
        data={
            "restaurant": {"connect": {"id": restaurant_id}},
            "supplier": {"connect": {"id": supplier_id}},
            "name": f"Template OCR {supplier_name}",
            "keywordHints": Json([supplier_name]),
            "lineHints": Json([]),
            "exampleRows": Json([]),
            "notes": "Template initial cree automatiquement depuis une facture importee.",
        }
    )


async def _update_template_learning(template_id: str, extracted) -> None:
    template = await db.supplierinvoicetemplate.find_first(where={"id": template_id})
    if not template:
        return
    existing = _normalize_keywords(template.keywordHints)
    learned = existing[:]
    for line in extracted.lines:
        for token in _normalize_keywords([line.label]):
            if token not in learned:
                learned.append(token)
    raw_rows = []
    if getattr(extracted, "raw_payload", None):
        raw_rows = extracted.raw_payload.get("structured_rows") or []
    example_rows = _merge_template_examples(template.exampleRows, raw_rows)
    await db.supplierinvoicetemplate.update(
        where={"id": template.id},
        data={
            "keywordHints": Json(learned[:50]),
            "lineHints": Json(_merge_template_line_hints(template.lineHints, extracted.lines)),
            "exampleRows": Json(example_rows),
        },
    )


async def _learn_template_from_corrections(template_id: str, original_invoice, corrected_invoice) -> None:
    template = await db.supplierinvoicetemplate.find_first(where={"id": template_id})
    if not template:
        return
    existing_keywords = _normalize_keywords(template.keywordHints)
    learned_keywords = existing_keywords[:]
    corrected_lines = list(getattr(corrected_invoice, "lines", []) or [])
    original_payload = getattr(original_invoice, "ocrPayload", None) or {}
    original_rows = []
    if isinstance(original_payload, dict):
        original_rows = original_payload.get("structured_rows") or []
    correction_rows = _build_correction_rows(original_rows, corrected_lines)
    for row in correction_rows:
        for token in _normalize_keywords([row.get("designation") or row.get("label") or ""]):
            if token not in learned_keywords:
                learned_keywords.append(token)
        if row.get("code_article"):
            code = str(row["code_article"]).strip()
            if code and code not in learned_keywords:
                learned_keywords.append(code)
    example_rows = _merge_template_examples(template.exampleRows, correction_rows)
    await db.supplierinvoicetemplate.update(
        where={"id": template.id},
        data={
            "keywordHints": Json(learned_keywords[:60]),
            "lineHints": Json(_merge_template_line_hints(template.lineHints, corrected_lines)),
            "exampleRows": Json(example_rows),
        },
    )


def _build_correction_rows(original_rows, corrected_lines) -> list[dict]:
    rows: list[dict] = []
    original_by_label = {}
    original_by_code = {}
    for row in original_rows or []:
        if not isinstance(row, dict):
            continue
        key = str(row.get("designation") or row.get("label") or "").strip().lower()
        if key:
            original_by_label[key] = row
        code_key = str(row.get("code_article") or "").strip().lower()
        if code_key:
            original_by_code[code_key] = row
    for line in corrected_lines or []:
        if not line:
            continue
        label = str(getattr(line, "label", "") or "").strip()
        if not label:
            continue
        line_code = str(getattr(line, "codeArticle", None) or getattr(line, "code_article", None) or "").strip().lower()
        original = original_by_code.get(line_code) or original_by_label.get(label.lower(), {})
        rows.append(
            {
                "code_article": getattr(line, "codeArticle", None) or getattr(line, "code_article", None) or original.get("code_article"),
                "designation": label,
                "brand": original.get("brand"),
                "gtin": original.get("gtin"),
                "unit": getattr(line, "unit", None),
                "quantity": str(getattr(line, "quantity", "") or ""),
                "unit_price": str(getattr(line, "unitPrice", None) or getattr(line, "unit_price", None) or ""),
                "amount_ht": str(getattr(line, "total", None) or original.get("amount_ht") or original.get("total_ht") or ""),
                "tax_rate": original.get("tax_rate"),
                "confidence": original.get("confidence"),
                "source": "correction",
                "original_designation": original.get("designation"),
                "original_code_article": original.get("code_article"),
            }
        )
    return rows


async def _match_invoice_lines(restaurant_id: str, lines) -> dict[str, str]:
    items = await db.inventoryitem.find_many(where={"restaurantId": restaurant_id, "isActive": True})
    normalized = {item.name.lower(): item.id for item in items}
    sku_index = {str(item.sku).lower(): item.id for item in items if item.sku}
    result: dict[str, str] = {}
    for line in lines:
        line_key = line.label.lower()
        code_key = (getattr(line, "code_article", None) or "").strip().lower()
        if code_key and code_key in sku_index:
            result[line_key] = sku_index[code_key]
            continue
        if line_key in normalized:
            result[line_key] = normalized[line_key]
            continue
        for item in items:
            if item.name.lower() in line_key or line_key in item.name.lower() or (code_key and code_key == str(item.sku or "").lower()):
                result[line_key] = item.id
                break
    return result


async def _store_upload(file: UploadFile, restaurant_id: str):
    settings = get_settings()
    original_name = file.filename or "facture.pdf"
    suffix = Path(original_name).suffix.lower()
    mime_type = (file.content_type or "").lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Format non supporte. Utilisez jpg, jpeg, png ou pdf.")
    if mime_type and mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Type de fichier non supporte.")
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le fichier est vide.")
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Le fichier depasse la limite autorisee de 20 Mo.")
    root = Path(settings.invoice_upload_dir)
    target_dir = root / restaurant_id / datetime.now(UTC).strftime("%Y/%m")
    target_dir.mkdir(parents=True, exist_ok=True)
    storage_name = f"{uuid4()}{suffix}"
    storage_path = target_dir / storage_name
    storage_path.write_bytes(content)
    return {
        "original_name": original_name,
        "stored_name": storage_name,
        "storage_path": str(storage_path),
        "mime_type": mime_type or _mime_from_suffix(suffix),
        "file_size": len(content),
    }


def _mime_from_suffix(suffix: str) -> str:
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".pdf": "application/pdf",
    }.get(suffix, "application/octet-stream")


def _serialize_invoice(invoice, restaurant_id: str):
    uploaded_by_name = None
    if getattr(invoice, "uploadedBy", None):
        uploaded_by_name = f"{invoice.uploadedBy.firstName} {invoice.uploadedBy.lastName}".strip()
    return {
        "id": invoice.id,
        "original_name": invoice.originalName,
        "stored_name": invoice.storedName,
        "status": invoice.status,
        "supplier_id": invoice.supplierId,
        "supplier_name": invoice.supplier.name if invoice.supplier else None,
        "uploaded_by_name": uploaded_by_name,
        "number": invoice.number,
        "total_excluding_tax": invoice.totalExcludingTax,
        "total_including_tax": invoice.totalIncludingTax,
        "invoice_date": invoice.invoiceDate,
        "ocr_confidence": invoice.ocrConfidence,
        "processed_at": invoice.processedAt,
        "approved_at": invoice.approvedAt,
        "rejected_reason": invoice.rejectedReason,
        "mime_type": invoice.mimeType,
        "file_size": invoice.fileSize,
        "storage_path": invoice.storagePath,
        "uploaded_at": invoice.createdAt,
        "document_url": f"/api/v1/invoices/{invoice.id}/document",
        "can_reprocess": invoice.status != "APPROVED",
        "can_approve": invoice.status == "OCR_REVIEW",
        "template": _template_payload(invoice.template) if getattr(invoice, "template", None) else None,
        "lines": [
            {
                "id": line.id,
                "code_article": line.codeArticle,
                "label": line.label,
                "quantity": line.quantity,
                "unit": line.unit,
                "unit_price": line.unitPrice,
                "total": line.total,
                "tax_rate": line.taxRate,
                "confidence": line.confidence,
                "inventory_item_id": line.inventoryItemId,
                "inventory_item_name": line.inventoryItem.name if getattr(line, "inventoryItem", None) else None,
            }
            for line in invoice.lines
        ],
    }


def _template_payload(template):
    if not template:
        return None
    return {
        "id": template.id,
        "name": template.name,
        "keywordHints": template.keywordHints or [],
        "lineHints": template.lineHints or [],
        "exampleRows": template.exampleRows or [],
        "notes": template.notes,
        "isActive": template.isActive,
    }


def _merge_template_line_hints(existing, lines) -> list[str]:
    hints = _normalize_keywords(existing)
    for line in lines:
        label = getattr(line, "label", "") or ""
        for token in _normalize_keywords([label]):
            if token not in hints:
                hints.append(token)
    return hints[:50]


def _merge_template_examples(existing, new_rows) -> list[dict]:
    normalized: list[dict] = []
    seen: set[str] = set()

    def add_row(row) -> None:
        if not isinstance(row, dict):
            return
        designation = str(row.get("designation") or row.get("label") or "").strip()
        code_article = str(row.get("code_article") or "").strip()
        if not designation and not code_article:
            return
        key = " | ".join(
            [
                code_article.lower(),
                designation.lower(),
                str(row.get("unit") or "").strip().lower(),
                str(row.get("amount_ht") or row.get("total_ht") or "").strip(),
            ]
        )
        if key in seen:
            return
        seen.add(key)
        normalized.append(
            {
                "code_article": code_article or None,
                "designation": designation or None,
                "brand": row.get("brand"),
                "gtin": row.get("gtin"),
                "unit": row.get("unit"),
                "quantity": row.get("quantity"),
                "unit_price": row.get("unit_price"),
                "amount_ht": row.get("amount_ht") or row.get("total_ht"),
                "tax_rate": row.get("tax_rate"),
                "confidence": row.get("confidence"),
            }
        )

    for row in _normalize_template_example_rows(existing):
        add_row(row)
    for row in new_rows or []:
        add_row(row)
    return normalized[-40:]


def _normalize_template_example_rows(value) -> list[dict]:
    if value is None:
        return []
    if isinstance(value, list):
        return [row for row in value if isinstance(row, dict)]
    return []


def _normalize_keywords(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return [str(value).strip()]


def _sort_key(invoice, sort_by: str):
    if sort_by == "supplier":
        return (invoice.supplier.name if invoice.supplier else "", invoice.createdAt)
    if sort_by == "amount":
        return invoice.totalIncludingTax or invoice.totalExcludingTax or Decimal("0")
    if sort_by == "status":
        return invoice.status
    return invoice.createdAt


def _matches_filters(
    invoice,
    *,
    supplier_id: str | None,
    number: str | None,
    status_filter: str | None,
    invoice_date_from: date | None,
    invoice_date_to: date | None,
    uploaded_from: date | None,
    uploaded_to: date | None,
    min_total: Decimal | None,
    max_total: Decimal | None,
):
    if supplier_id and invoice.supplierId != supplier_id:
        return False
    if number and number.lower() not in (invoice.number or "").lower() and number.lower() not in invoice.originalName.lower():
        return False
    if status_filter and invoice.status != status_filter:
        return False
    if invoice_date_from and (not invoice.invoiceDate or invoice.invoiceDate.date() < invoice_date_from):
        return False
    if invoice_date_to and (not invoice.invoiceDate or invoice.invoiceDate.date() > invoice_date_to):
        return False
    if uploaded_from and invoice.createdAt.date() < uploaded_from:
        return False
    if uploaded_to and invoice.createdAt.date() > uploaded_to:
        return False
    total = invoice.totalIncludingTax or invoice.totalExcludingTax
    if min_total is not None and total is not None and total < min_total:
        return False
    if max_total is not None and total is not None and total > max_total:
        return False
    return True


async def _audit(ctx: dict, action: str, invoice_id: str, metadata: dict | None = None) -> None:
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action=action,
        entity="SupplierInvoice",
        entity_id=invoice_id,
        metadata=metadata,
    )
