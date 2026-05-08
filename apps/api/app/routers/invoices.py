from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, UploadFile

from app.db.prisma import db
from app.routers.deps import get_restaurant_context

router = APIRouter(prefix="/invoices", tags=["invoices"])
UPLOAD_ROOT = Path("/app/uploads/invoices")


@router.get("")
async def list_invoices(ctx=Depends(get_restaurant_context)):
    return await db.supplierinvoice.find_many(
        where={"restaurantId": ctx["restaurant_id"]},
        order={"createdAt": "desc"},
    )


@router.post("/upload")
async def upload_invoice(file: UploadFile = File(...), ctx=Depends(get_restaurant_context)):
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "invoice.pdf").suffix
    storage_name = f"{uuid4()}{suffix}"
    storage_path = UPLOAD_ROOT / storage_name
    storage_path.write_bytes(await file.read())
    return await db.supplierinvoice.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "originalName": file.filename or storage_name,
            "storagePath": str(storage_path),
            "status": "UPLOADED",
        }
    )
