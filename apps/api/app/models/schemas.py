from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, EmailStr, Field


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterRequest(BaseModel):
    restaurant_name: str = Field(min_length=2)
    email: EmailStr
    password: str = Field(min_length=12)
    first_name: str
    last_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    first_name: str
    last_name: str
    role: str | None = None
    restaurant_id: str | None = None


class SupplierCreate(BaseModel):
    name: str
    contact_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    lead_time_days: int = 2


class InventoryItemCreate(BaseModel):
    name: str
    category: str
    unit: str
    quantity_on_hand: Decimal = Decimal("0")
    reorder_point: Decimal = Decimal("0")
    average_cost: Decimal = Decimal("0")
    allergens: list[str] = []


class TemperatureCreate(BaseModel):
    equipment: str
    value_celsius: Decimal
    is_compliant: bool
    corrective_action: str | None = None


class InvoiceLineOut(BaseModel):
    id: str
    label: str
    quantity: Decimal
    unit: str
    unit_price: Decimal
    total: Decimal
    tax_rate: Decimal | None = None
    confidence: Decimal | None = None


class InvoiceOut(BaseModel):
    id: str
    original_name: str
    status: str
    supplier_name: str | None = None
    number: str | None = None
    total_excluding_tax: Decimal | None = None
    total_including_tax: Decimal | None = None
    invoice_date: datetime | None = None
    ocr_confidence: Decimal | None = None
    processed_at: datetime | None = None
    approved_at: datetime | None = None
    rejected_reason: str | None = None
    lines: list[InvoiceLineOut] = []


class InvoiceRejectRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class ModuleSummary(BaseModel):
    key: str
    label: str
    status: str
    href: str
    metric: str | None = None


class DashboardResponse(BaseModel):
    restaurant: dict[str, Any]
    kpis: dict[str, Any]
    modules: list[ModuleSummary]
    generated_at: datetime
