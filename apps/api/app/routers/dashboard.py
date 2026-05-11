from fastapi import APIRouter, Depends

from app.models.schemas import DashboardResponse, DashboardOverviewOut, ModuleSummary
from app.routers.deps import get_restaurant_context
from app.services.insights import build_dashboard_overview

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardResponse)
async def dashboard(ctx=Depends(get_restaurant_context)):
    overview = await build_dashboard_overview(ctx["restaurant_id"])
    modules = [
        ModuleSummary(key="ocr", label="OCR factures", href="/invoices", status="review", metric=str(overview["kpis"]["pending_ocr"])),
        ModuleSummary(key="suppliers", label="Fournisseurs", href="/suppliers", status="active", metric=str(len(overview["top_suppliers"]))),
        ModuleSummary(key="stock", label="Stocks intelligents", href="/stock", status="live", metric=str(overview["kpis"]["low_stock"])),
        ModuleSummary(key="haccp", label="HACCP / PMS", href="/haccp", status="compliance", metric=str(overview["kpis"]["haccp_todo"])),
        ModuleSummary(key="planning", label="Planning equipe", href="/planning", status="live", metric=str(overview["kpis"]["planning_today"])),
        ModuleSummary(key="time_clock", label="Badgeuse", href="/time-clock", status="live", metric=str(overview["kpis"]["present_employees"])),
        ModuleSummary(key="analytics", label="Analytics", href="/analytics", status="live", metric=str(overview["kpis"]["price_alerts"])),
        ModuleSummary(key="settings", label="Parametres entreprise", href="/settings", status="active", metric=overview["restaurant"]["name"]),
    ]
    return DashboardResponse(
        restaurant=overview["restaurant"],
        kpis=overview["kpis"],
        modules=modules,
        generated_at=overview["generated_at"],
    )


@router.get("/overview", response_model=DashboardOverviewOut)
async def dashboard_overview(ctx=Depends(get_restaurant_context)):
    return await build_dashboard_overview(ctx["restaurant_id"])
