from fastapi import APIRouter, Depends

from app.db.prisma import db
from app.models.schemas import TemperatureCreate
from app.routers.deps import get_restaurant_context

router = APIRouter(prefix="/quality", tags=["haccp"])


@router.get("/temperatures")
async def list_temperatures(ctx=Depends(get_restaurant_context)):
    return await db.temperaturelog.find_many(
        where={"restaurantId": ctx["restaurant_id"]},
        order={"recordedAt": "desc"},
        take=50,
    )


@router.post("/temperatures")
async def create_temperature(payload: TemperatureCreate, ctx=Depends(get_restaurant_context)):
    return await db.temperaturelog.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "equipment": payload.equipment,
            "valueCelsius": payload.value_celsius,
            "isCompliant": payload.is_compliant,
            "correctiveAction": payload.corrective_action,
        }
    )
