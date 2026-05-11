from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime

from prisma import Json

from app.core.config import get_settings
from app.db.prisma import db


def _addition_defaults() -> dict:
    return {
        "enabled": False,
        "api_url": "",
        "api_key": "",
        "restaurant_id": "",
        "connection_status": "INACTIF",
        "status": "INACTIF",
        "last_tested_at": None,
        "last_sync_at": None,
        "last_error": None,
    }


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
                {"title": "Friteuse", "frequency": "AFTER_SERVICE", "service": "MATIN"},
                {"title": "Friteuse", "frequency": "AFTER_SERVICE", "service": "SOIR"},
                {"title": "Piano de cuisson", "frequency": "AFTER_SERVICE", "service": "MATIN"},
                {"title": "Piano de cuisson", "frequency": "AFTER_SERVICE", "service": "SOIR"},
                {"title": "Four", "frequency": "AFTER_SERVICE", "service": "MATIN"},
                {"title": "Four", "frequency": "AFTER_SERVICE", "service": "SOIR"},
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
            "addition": _addition_defaults(),
            "ladition": _addition_defaults(),
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


def _normalize_addition_integration(settings_payload: dict) -> dict:
    settings_payload = deepcopy(settings_payload)
    integrations = settings_payload.setdefault("integrations", {})
    addition = integrations.get("addition") or integrations.get("ladition") or {}
    normalized = _deep_merge(_addition_defaults(), addition)
    normalized["status"] = normalized.get("connection_status") or normalized.get("status") or "INACTIF"
    integrations["addition"] = normalized
    integrations["ladition"] = deepcopy(normalized)
    return settings_payload


def _format_integration_timestamp(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat()


def _parse_integration_timestamp(value: object) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _addition_connection_status(addition: dict) -> str:
    if not addition.get("enabled"):
        return "INACTIF"
    missing = [field for field in ("api_url", "api_key", "restaurant_id") if not str(addition.get(field) or "").strip()]
    if missing:
        return "A CONFIGURER"
    return addition.get("connection_status") or addition.get("status") or "CONFIGURÉ"


async def _sync_addition_credential_from_settings(restaurant_id: str, settings_payload: dict) -> None:
    integration_settings = (settings_payload or {}).get("integrations", {})
    addition = integration_settings.get("addition") or integration_settings.get("ladition")
    if not addition:
      return
    credential_data = {
        "restaurantId": restaurant_id,
        "provider": "L_ADDITION",
        "displayName": "L'Addition",
        "apiKey": addition.get("api_key") or None,
        "restaurantExternalId": addition.get("restaurant_id") or None,
        "apiUrl": addition.get("api_url") or None,
        "enabled": bool(addition.get("enabled")),
        "connectionStatus": _addition_connection_status(addition),
        "lastTestedAt": _parse_integration_timestamp(addition.get("last_tested_at")),
        "lastSyncAt": _parse_integration_timestamp(addition.get("last_sync_at")),
        "lastError": addition.get("last_error"),
        "metadata": Json(
            {
                "integration": "L'Addition",
                "synced_from_settings": True,
                "updatedAt": datetime.now(UTC).isoformat(),
            }
        ),
    }
    existing = await db.integrationcredential.find_first(
        where={"restaurantId": restaurant_id, "provider": "L_ADDITION"}
    )
    if existing:
        await db.integrationcredential.update(where={"id": existing.id}, data=credential_data)
    else:
        await db.integrationcredential.create(data=credential_data)


async def get_company_settings_snapshot(restaurant_id: str) -> dict:
    restaurant = await db.restaurant.find_unique(where={"id": restaurant_id})
    if not restaurant:
        raise ValueError("Restaurant introuvable")
    company = await db.companysettings.find_first(where={"restaurantId": restaurant_id})
    merged_settings = _deep_merge(_default_settings(), company.settings if company and company.settings else {})
    merged_settings = _normalize_addition_integration(merged_settings)
    integration = await db.integrationcredential.find_first(
        where={"restaurantId": restaurant_id, "provider": "L_ADDITION"}
    )
    addition_settings = merged_settings["integrations"]["addition"]
    if integration:
        addition_settings.update(
            {
                "enabled": integration.enabled,
                "api_url": integration.apiUrl or addition_settings.get("api_url", ""),
                "api_key": integration.apiKey or addition_settings.get("api_key", ""),
                "restaurant_id": integration.restaurantExternalId or addition_settings.get("restaurant_id", ""),
                "connection_status": integration.connectionStatus,
                "status": integration.connectionStatus,
                "last_tested_at": _format_integration_timestamp(integration.lastTestedAt),
                "last_sync_at": _format_integration_timestamp(integration.lastSyncAt),
                "last_error": integration.lastError,
            }
        )
        merged_settings["integrations"]["addition"] = addition_settings
        merged_settings["integrations"]["ladition"] = deepcopy(addition_settings)
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
    settings_update = deepcopy(settings_update or {})
    if settings_update.get("integrations"):
        settings_update = _normalize_addition_integration(settings_update)
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
            mapped_key = field_map.get(key, key)
            mapped_restaurant_update[mapped_key] = Json(value) if mapped_key == "openingHours" else value
        await db.restaurant.update(
            where={"id": restaurant_id},
            data=mapped_restaurant_update,
        )
    company = await db.companysettings.find_first(where={"restaurantId": restaurant_id})
    current_settings = _default_settings()
    if company and company.settings:
        current_settings = _deep_merge(current_settings, company.settings)
    next_settings = _deep_merge(current_settings, settings_update)
    next_settings = _normalize_addition_integration(next_settings)
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
    await _sync_addition_credential_from_settings(restaurant_id, next_settings)
    return await get_company_settings_snapshot(restaurant_id)
