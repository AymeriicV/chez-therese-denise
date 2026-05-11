from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

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


class EmployeeCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    first_name: str = Field(min_length=2)
    last_name: str = Field(min_length=2)
    role: Literal["OWNER", "ADMIN", "MANAGER", "CHEF", "EMPLOYEE"] = "EMPLOYEE"
    position: str = Field(min_length=2, max_length=120)
    phone: str | None = None


class EmployeeUpdate(BaseModel):
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8)
    first_name: str | None = Field(default=None, min_length=2)
    last_name: str | None = Field(default=None, min_length=2)
    role: Literal["OWNER", "ADMIN", "MANAGER", "CHEF", "EMPLOYEE"] | None = None
    position: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = None
    is_active: bool | None = None


class ShiftCreate(BaseModel):
    user_id: str
    start_at: datetime
    end_at: datetime
    break_minutes: int = Field(default=0, ge=0, le=720)
    position: str = Field(min_length=2, max_length=120)
    comment: str | None = None


class ShiftUpdate(BaseModel):
    user_id: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    break_minutes: int | None = Field(default=None, ge=0, le=720)
    position: str | None = Field(default=None, min_length=2, max_length=120)
    comment: str | None = None
    is_archived: bool | None = None


class TimeClockCorrectionCreate(BaseModel):
    entry_id: str | None = None
    employee_id: str
    clock_in: datetime | None = None
    clock_out: datetime | None = None
    reason: str = Field(min_length=3, max_length=500)
    note: str | None = None


class PlanningCellUpsert(BaseModel):
    user_id: str
    week_start: datetime
    weekday: int = Field(ge=0, le=6)
    morning_start: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    morning_end: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    break_minutes: int = Field(default=0, ge=0, le=720)
    evening_start: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    evening_end: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    is_day_off: bool = False
    weekly_target_minutes: int = Field(default=0, ge=0, le=6000)
    position: str = Field(min_length=2, max_length=120)
    comment: str | None = None


class PlanningCopyRequest(BaseModel):
    target_date: date


class PlanningDuplicateDayRequest(BaseModel):
    source_date: date
    target_date: date


class SupplierCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    contact_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    address: str | None = None
    categories: list[str] = Field(default_factory=list)
    payment_terms: str | None = None
    minimum_order: Decimal | None = Field(default=None, ge=0)
    rating: Decimal | None = Field(default=None, ge=0, le=5)
    lead_time_days: int = Field(default=2, ge=0, le=90)


class SupplierUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    contact_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    address: str | None = None
    categories: list[str] | None = None
    payment_terms: str | None = None
    minimum_order: Decimal | None = Field(default=None, ge=0)
    rating: Decimal | None = Field(default=None, ge=0, le=5)
    lead_time_days: int | None = Field(default=None, ge=0, le=90)
    is_active: bool | None = None


class InventoryItemCreate(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    category: str = Field(min_length=2, max_length=120)
    unit: str = Field(min_length=1, max_length=32)
    sku: str | None = None
    supplier_id: str | None = None
    storage_area: str | None = None
    quantity_on_hand: Decimal = Field(default=Decimal("0"), ge=0)
    reorder_point: Decimal = Field(default=Decimal("0"), ge=0)
    average_cost: Decimal = Field(default=Decimal("0"), ge=0)
    allergens: list[str] = Field(default_factory=list)


class InventoryItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=180)
    category: str | None = Field(default=None, min_length=2, max_length=120)
    unit: str | None = Field(default=None, min_length=1, max_length=32)
    sku: str | None = None
    supplier_id: str | None = None
    storage_area: str | None = None
    quantity_on_hand: Decimal | None = Field(default=None, ge=0)
    reorder_point: Decimal | None = Field(default=None, ge=0)
    average_cost: Decimal | None = Field(default=None, ge=0)
    allergens: list[str] | None = None


class StockMovementCreate(BaseModel):
    inventory_item_id: str
    type: Literal["PURCHASE", "PRODUCTION", "WASTE", "INVENTORY_ADJUSTMENT", "SALE", "TRANSFER"]
    quantity: Decimal
    unit_cost: Decimal | None = Field(default=None, ge=0)
    note: str | None = None


class InventorySessionCreate(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    storage_area: str | None = None
    item_ids: list[str] = Field(default_factory=list)


class InventoryCountUpdate(BaseModel):
    counted_qty: Decimal = Field(ge=0)
    note: str | None = None


class RecipeCreate(BaseModel):
    name: str
    category: str | None = None
    portion_yield: Decimal = Decimal("1")
    selling_price: Decimal = Decimal("0")
    instructions: str | None = None


class RecipeUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    portion_yield: Decimal | None = None
    selling_price: Decimal | None = None
    instructions: str | None = None
    is_active: bool | None = None


class RecipeIngredientCreate(BaseModel):
    inventory_item_id: str | None = None
    sub_recipe_id: str | None = None
    name: str | None = None
    quantity: Decimal
    unit: str | None = None
    unit_cost: Decimal | None = None
    waste_rate: Decimal = Decimal("0")
    sort_order: int | None = None


class RecipeIngredientUpdate(BaseModel):
    inventory_item_id: str | None = None
    sub_recipe_id: str | None = None
    name: str | None = None
    quantity: Decimal | None = None
    unit: str | None = None
    unit_cost: Decimal | None = None
    waste_rate: Decimal | None = None
    sort_order: int | None = None


class RecipeIngredientsReorderRequest(BaseModel):
    ingredient_ids: list[str] = Field(default_factory=list)


class SubRecipeCreate(BaseModel):
    name: str
    category: str | None = None
    batch_unit: str
    batch_yield: Decimal
    instructions: str | None = None


class SubRecipeUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    batch_unit: str | None = None
    batch_yield: Decimal | None = None
    instructions: str | None = None
    is_active: bool | None = None


class TemperatureCreate(BaseModel):
    equipment: str = Field(min_length=2, max_length=160)
    equipment_id: str | None = None
    service: Literal["MIDI", "SOIR"] | None = None
    check_date: datetime | None = None
    value_celsius: Decimal = Field(ge=-80, le=300)
    min_celsius: Decimal | None = Field(default=None, ge=-80, le=300)
    max_celsius: Decimal | None = Field(default=None, ge=-80, le=300)
    recorded_at: datetime | None = None
    is_compliant: bool | None = None
    corrective_action: str | None = None
    note: str | None = None


class TemperatureUpdate(BaseModel):
    equipment: str | None = Field(default=None, min_length=2, max_length=160)
    equipment_id: str | None = None
    service: Literal["MIDI", "SOIR"] | None = None
    check_date: datetime | None = None
    value_celsius: Decimal | None = Field(default=None, ge=-80, le=300)
    min_celsius: Decimal | None = Field(default=None, ge=-80, le=300)
    max_celsius: Decimal | None = Field(default=None, ge=-80, le=300)
    recorded_at: datetime | None = None
    is_compliant: bool | None = None
    corrective_action: str | None = None
    note: str | None = None


class HaccpTaskCreate(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    category: str = Field(min_length=2, max_length=120)
    frequency: Literal["DAILY", "WEEKLY", "MONTHLY", "AFTER_SERVICE", "ON_DEMAND"] = "DAILY"
    due_at: datetime | None = None
    notes: str | None = None
    responsible: str | None = None


class HaccpTaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=180)
    category: str | None = Field(default=None, min_length=2, max_length=120)
    frequency: Literal["DAILY", "WEEKLY", "MONTHLY", "AFTER_SERVICE", "ON_DEMAND"] | None = None
    status: Literal["TODO", "DONE", "NON_COMPLIANT"] | None = None
    due_at: datetime | None = None
    completed_at: datetime | None = None
    completed_by: str | None = None
    corrective_action: str | None = None
    notes: str | None = None


class HaccpTaskValidationCreate(BaseModel):
    responsible: str = Field(min_length=2, max_length=160)
    completed_at: datetime | None = None
    comment: str | None = None
    corrective_action: str | None = None
    status: Literal["DONE", "NON_COMPLIANT"] = "DONE"


class FoodLabelCreate(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    item_name: str = Field(min_length=2, max_length=180)
    source_type: Literal["STOCK", "RECIPE", "FREE", "PRODUCTION"] = "FREE"
    source_id: str | None = None
    expiry_kind: Literal["DLC", "DDM"] = "DLC"
    batch_number: str | None = None
    quantity: Decimal | None = Field(default=None, ge=0)
    unit: str | None = None
    prepared_at: datetime
    expires_at: datetime
    storage_area: str | None = None
    conservation_temperature: str | None = None
    allergens: list[str] = Field(default_factory=list)
    notes: str | None = None


class FoodLabelUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=180)
    item_name: str | None = Field(default=None, min_length=2, max_length=180)
    source_type: Literal["STOCK", "RECIPE", "FREE", "PRODUCTION"] | None = None
    source_id: str | None = None
    expiry_kind: Literal["DLC", "DDM"] | None = None
    batch_number: str | None = None
    quantity: Decimal | None = Field(default=None, ge=0)
    unit: str | None = None
    prepared_at: datetime | None = None
    expires_at: datetime | None = None
    storage_area: str | None = None
    conservation_temperature: str | None = None
    allergens: list[str] | None = None
    notes: str | None = None
    status: Literal["ACTIVE", "PRINTED", "EXPIRED"] | None = None


class ProductionCreate(BaseModel):
    recipe_id: str
    quantity_produced: Decimal = Field(gt=0)
    produced_at: datetime | None = None
    shelf_life_hours: int = Field(default=72, ge=1, le=720)
    label_count: int = Field(default=1, ge=1, le=50)
    lot_number: str | None = Field(default=None, min_length=2, max_length=80)
    storage_area: str | None = None
    conservation_temperature: str | None = None
    waste_quantity: Decimal = Field(default=Decimal("0"), ge=0)
    waste_reason: str | None = None
    notes: str | None = None


class ProductionUpdate(BaseModel):
    waste_quantity: Decimal | None = Field(default=None, ge=0)
    waste_reason: str | None = None
    notes: str | None = None
    status: Literal["ACTIVE", "ARCHIVED"] | None = None


class PurchaseOrderLineCreate(BaseModel):
    inventory_item_id: str
    quantity_ordered: Decimal = Field(gt=0)
    unit_cost: Decimal | None = Field(default=None, ge=0)


class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    notes: str | None = None
    lines: list[PurchaseOrderLineCreate] = Field(default_factory=list)


class PurchaseOrderUpdate(BaseModel):
    notes: str | None = None
    status: Literal["DRAFT", "SENT", "RECEIVED", "ARCHIVED"] | None = None


class PurchaseOrderLineUpdate(BaseModel):
    line_id: str | None = None
    quantity_ordered: Decimal | None = Field(default=None, gt=0)
    quantity_received: Decimal | None = Field(default=None, ge=0)
    unit_cost: Decimal | None = Field(default=None, ge=0)


class PurchaseOrderReceive(BaseModel):
    lines: list[PurchaseOrderLineUpdate] = Field(default_factory=list)


class InvoiceLineOut(BaseModel):
    id: str
    code_article: str | None = None
    label: str
    quantity: Decimal
    unit: str
    unit_price: Decimal
    total: Decimal
    tax_rate: Decimal | None = None
    confidence: Decimal | None = None
    inventory_item_id: str | None = None


class InvoiceOut(BaseModel):
    id: str
    original_name: str
    stored_name: str | None = None
    status: str
    supplier_id: str | None = None
    supplier_name: str | None = None
    uploaded_by_name: str | None = None
    number: str | None = None
    total_excluding_tax: Decimal | None = None
    total_including_tax: Decimal | None = None
    invoice_date: datetime | None = None
    ocr_confidence: Decimal | None = None
    processed_at: datetime | None = None
    approved_at: datetime | None = None
    rejected_reason: str | None = None
    mime_type: str | None = None
    file_size: int | None = None
    storage_path: str
    uploaded_at: datetime
    document_url: str | None = None
    can_reprocess: bool = True
    can_approve: bool = True
    lines: list[InvoiceLineOut] = Field(default_factory=list)


class InvoiceUploadRequest(BaseModel):
    supplier_id: str


class InvoiceLineUpdate(BaseModel):
    id: str | None = None
    code_article: str | None = None
    label: str = Field(min_length=1, max_length=180)
    quantity: Decimal = Field(gt=0)
    unit: str = Field(min_length=1, max_length=32)
    unit_price: Decimal = Field(ge=0)
    total: Decimal = Field(ge=0)
    inventory_item_id: str | None = None


class InvoiceUpdateRequest(BaseModel):
    supplier_id: str | None = None
    number: str | None = None
    invoice_date: datetime | None = None
    total_excluding_tax: Decimal | None = None
    total_including_tax: Decimal | None = None
    status: Literal["UPLOADED", "OCR_PROCESSING", "OCR_REVIEW", "APPROVED", "REJECTED"] | None = None
    lines: list[InvoiceLineUpdate] | None = None


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
