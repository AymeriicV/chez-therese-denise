from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime

from prisma import Json

from app.db.prisma import db
from app.services.audit import write_audit_log
from app.services.company_settings import get_company_settings_snapshot, upsert_company_settings_snapshot

ADDITION_PROVIDER = "L_ADDITION"


def _addition_payload(settings_snapshot: dict) -> dict:
    integrations = settings_snapshot.get("settings", {}).get("integrations", {})
    return deepcopy(integrations.get("addition") or integrations.get("ladition") or {})


def _connection_status(payload: dict) -> str:
    if not payload.get("enabled"):
        return "INACTIF"
    missing = [field for field in ("api_url", "api_key", "restaurant_id") if not str(payload.get(field) or "").strip()]
    if missing:
        return "A CONFIGURER"
    return "CONFIGURÉ"


async def _upsert_addition_credential(restaurant_id: str, payload: dict, *, status: str | None = None, last_error: str | None = None) -> None:
    credential_payload = {
        "restaurantId": restaurant_id,
        "provider": ADDITION_PROVIDER,
        "displayName": "L'Addition",
        "apiKey": payload.get("api_key") or None,
        "restaurantExternalId": payload.get("restaurant_id") or None,
        "apiUrl": payload.get("api_url") or None,
        "enabled": bool(payload.get("enabled")),
        "connectionStatus": status or _connection_status(payload),
        "lastError": last_error,
        "metadata": Json(
            {
                "integration": "L'Addition",
                "synced_from_settings": True,
                "updatedAt": datetime.now(UTC).isoformat(),
            }
        ),
    }
    existing = await db.integrationcredential.find_first(
        where={"restaurantId": restaurant_id, "provider": ADDITION_PROVIDER}
    )
    if existing:
        await db.integrationcredential.update(where={"id": existing.id}, data=credential_payload)
    else:
        await db.integrationcredential.create(data=credential_payload)


async def test_addition_connection(restaurant_id: str, user_id: str | None = None) -> dict:
    snapshot = await get_company_settings_snapshot(restaurant_id)
    payload = _addition_payload(snapshot)
    status = _connection_status(payload)
    if status == "A CONFIGURER":
        last_error = "Renseignez l'API key, l'ID restaurant et l'URL API."
    elif status == "INACTIF":
        last_error = "Intégration désactivée."
    else:
        last_error = None
    payload["connection_status"] = status
    payload["last_tested_at"] = datetime.now(UTC).isoformat()
    payload["last_error"] = last_error
    await upsert_company_settings_snapshot(
        restaurant_id,
        settings_update={"integrations": {"addition": payload, "ladition": payload}},
    )
    await _upsert_addition_credential(restaurant_id, payload, status=status, last_error=last_error)
    await write_audit_log(
        restaurant_id=restaurant_id,
        user_id=user_id,
        action="integration.addition_tested",
        entity="IntegrationCredential",
        entity_id=restaurant_id,
        metadata={"provider": ADDITION_PROVIDER, "status": status},
    )
    return await get_company_settings_snapshot(restaurant_id)


async def sync_addition_sales(restaurant_id: str, user_id: str | None = None) -> dict:
    snapshot = await get_company_settings_snapshot(restaurant_id)
    payload = _addition_payload(snapshot)
    payload["last_sync_at"] = datetime.now(UTC).isoformat()
    payload["last_error"] = None
    if not payload.get("enabled"):
        payload["connection_status"] = "INACTIF"
        await upsert_company_settings_snapshot(
            restaurant_id,
            settings_update={"integrations": {"addition": payload, "ladition": payload}},
        )
        await _upsert_addition_credential(restaurant_id, payload, status="INACTIF")
        await write_audit_log(
            restaurant_id=restaurant_id,
            user_id=user_id,
            action="integration.addition_sync_blocked",
            entity="SalesImport",
            entity_id=restaurant_id,
            metadata={"provider": ADDITION_PROVIDER, "reason": "disabled"},
        )
        return await get_company_settings_snapshot(restaurant_id)

    credential = await db.integrationcredential.find_first(
        where={"restaurantId": restaurant_id, "provider": ADDITION_PROVIDER}
    )
    if not credential:
        await _upsert_addition_credential(restaurant_id, payload, status=_connection_status(payload))
        credential = await db.integrationcredential.find_first(
            where={"restaurantId": restaurant_id, "provider": ADDITION_PROVIDER}
        )

    await db.salesimport.create(
        data={
            "restaurantId": restaurant_id,
            "integrationCredentialId": credential.id if credential else None,
            "provider": ADDITION_PROVIDER,
            "status": "REQUESTED",
            "sourceLabel": "L'Addition",
            "startedAt": datetime.now(UTC),
            "rawPayload": Json(
                {
                    "mode": "manual",
                    "requestedAt": datetime.now(UTC).isoformat(),
                    "restaurantExternalId": payload.get("restaurant_id"),
                }
            ),
        }
    )
    await upsert_company_settings_snapshot(
        restaurant_id,
        settings_update={"integrations": {"addition": payload, "ladition": payload}},
    )
    await _upsert_addition_credential(restaurant_id, payload, status=_connection_status(payload))
    await write_audit_log(
        restaurant_id=restaurant_id,
        user_id=user_id,
        action="integration.addition_sync_requested",
        entity="SalesImport",
        entity_id=restaurant_id,
        metadata={"provider": ADDITION_PROVIDER, "mode": "manual"},
    )
    return await get_company_settings_snapshot(restaurant_id)


async def disable_addition_integration(restaurant_id: str, user_id: str | None = None) -> dict:
    snapshot = await get_company_settings_snapshot(restaurant_id)
    payload = _addition_payload(snapshot)
    payload["enabled"] = False
    payload["connection_status"] = "INACTIF"
    payload["last_error"] = None
    await upsert_company_settings_snapshot(
        restaurant_id,
        settings_update={"integrations": {"addition": payload, "ladition": payload}},
    )
    await _upsert_addition_credential(restaurant_id, payload, status="INACTIF")
    await write_audit_log(
        restaurant_id=restaurant_id,
        user_id=user_id,
        action="integration.addition_disabled",
        entity="IntegrationCredential",
        entity_id=restaurant_id,
        metadata={"provider": ADDITION_PROVIDER},
    )
    return await get_company_settings_snapshot(restaurant_id)
