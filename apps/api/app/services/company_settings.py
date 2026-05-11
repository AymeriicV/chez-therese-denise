from __future__ import annotations

from copy import deepcopy

from prisma import Json

from app.core.config import get_settings
from app.db.prisma import db


def _default_settings() -> dict:
    settings = get_settings()
    return {
        "haccp": {
            "temperature_schedule": [
                {"day": "MER", "service": "MIDI"},
                {"day": "MER", "service": "SOIR"},
                {"day": "JEU", "service": "MIDI"},
                {"day": "JEU", "service": "SOIR"},
                {"day": "VEN", "service": "MIDI"},
                {"day": "VEN", "service": "SOIR"},
                {"day": "SAM", "service": "MIDI"},
                {"day": "SAM", "service": "SOIR"},
                {"day": "DIM", "service": "MIDI"},
            ],
            "cleaning_tasks": [
                {"title": "Sol", "frequency": "DAILY"},
                {"title": "Plans de travail", "frequency": "DAILY"},
                {"title": "Frigos", "frequency": "DAILY"},
                {"title": "Lave-main", "frequency": "DAILY"},
                {"title": "Plonge", "frequency": "DAILY"},
                {"title": "Machine à plonge", "frequency": "DAILY"},
                {"title": "Friteuse", "frequency": "AFTER_SERVICE"},
                {"title": "Piano de cuisson", "frequency": "AFTER_SERVICE"},
                {"title": "Four", "frequency": "AFTER_SERVICE"},
                {"title": "Hotte", "frequency": "WEEKLY"},
            ],
        },
        "stock": {
            "units": ["kg", "g", "l", "lt", "piece", "bd", "sht", "bri", "boite"],
            "categories": ["Viande", "Poisson", "Fruits et légumes", "Épicerie", "Boissons"],
            "default_reorder_point": "0",
            "storage_areas": ["Chambre froide", "Congélateur", "Sec", "Bar", "Cuisine"],
        },
        "invoices": {
            "ocr_mode": "hybrid" if settings.openai_api_key else "local",
            "confidence_threshold": 0.75,
            "templates": [],
            "openai_configured": bool(settings.openai_api_key),
            "model": settings.openai_invoice_model,
        },
        "price_alerts": {
            "enabled": True,
            "threshold_percent": "0.05",
            "notify_dashboard": True,
        },
        "integrations": {
            "ladition": {
                "enabled": False,
                "api_url": "",
                "api_key": "",
                "status": "INACTIF",
            }
        },
        "printers": [],
    }


def _deep_merge(base: dict, incoming: dict | None) -> dict:
    result = deepcopy(base)
    for key, value in (incoming or {}).items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


async def get_company_settings_snapshot(restaurant_id: str) -> dict:
    restaurant = await db.restaurant.find_unique(where={"id": restaurant_id})
    if not restaurant:
        raise ValueError("Restaurant introuvable")
    company = await db.companysettings.find_first(where={"restaurantId": restaurant_id})
    merged_settings = _deep_merge(_default_settings(), company.settings if company and company.settings else {})
    return {
        "restaurant": {
            "id": restaurant.id,
            "name": restaurant.name,
            "legal_name": restaurant.legalName,
            "address": restaurant.address,
            "phone": restaurant.phone,
            "email": restaurant.email,
            "siret": restaurant.siret,
            "vat_number": restaurant.vatNumber,
            "logo_url": restaurant.logoUrl,
            "opening_hours": restaurant.openingHours or {},
            "timezone": restaurant.timezone,
            "currency": restaurant.currency,
        },
        "company": {
            "brand_name": company.brandName if company else restaurant.name,
            "invoice_email": company.invoiceEmail if company else None,
            "haccp_manager": company.haccpManager if company else None,
        },
        "settings": merged_settings,
    }


async def upsert_company_settings_snapshot(
    restaurant_id: str,
    *,
    restaurant_update: dict | None = None,
    company_update: dict | None = None,
    settings_update: dict | None = None,
) -> dict:
    company_update = company_update or {}
    if restaurant_update:
        mapped_restaurant_update = {}
        field_map = {
            "name": "name",
            "legal_name": "legalName",
            "address": "address",
            "phone": "phone",
            "email": "email",
            "siret": "siret",
            "vat_number": "vatNumber",
            "logo_url": "logoUrl",
            "opening_hours": "openingHours",
        }
        for key, value in restaurant_update.items():
            if value is None:
                continue
            mapped_restaurant_update[field_map.get(key, key)] = value
        await db.restaurant.update(
            where={"id": restaurant_id},
            data=mapped_restaurant_update,
        )
    company = await db.companysettings.find_first(where={"restaurantId": restaurant_id})
    current_settings = _default_settings()
    if company and company.settings:
        current_settings = _deep_merge(current_settings, company.settings)
    next_settings = _deep_merge(current_settings, settings_update)
    company_data = {
        "brandName": company_update.get("brand_name") if company_update else None,
        "invoiceEmail": company_update.get("invoice_email") if company_update else None,
        "haccpManager": company_update.get("haccp_manager") if company_update else None,
        "settings": Json(next_settings),
    }
    if company:
        await db.companysettings.update(
            where={"id": company.id},
            data={key: value for key, value in company_data.items() if value is not None},
        )
    else:
        restaurant = await db.restaurant.find_unique(where={"id": restaurant_id})
        await db.companysettings.create(
            data={
                "restaurant": {"connect": {"id": restaurant_id}},
                "brandName": company_data["brandName"] or (restaurant.name if restaurant else "Chez Thérèse et Denise"),
                "invoiceEmail": company_data["invoiceEmail"],
                "haccpManager": company_data["haccpManager"],
                "settings": Json(next_settings),
            }
        )
    return await get_company_settings_snapshot(restaurant_id)
