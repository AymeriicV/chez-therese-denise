from fastapi import Depends, Header, HTTPException, status

from app.core.security import decode_access_token
from app.db.prisma import db


async def get_current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = decode_access_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    user = await db.user.find_unique(where={"id": payload["sub"]})
    if not user or not user.isActive:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")
    return user


async def get_restaurant_context(
    restaurant_id: str = Header(alias="X-Restaurant-Id"),
    current_user=Depends(get_current_user),
):
    membership = await db.restaurantmember.find_unique(
        where={"userId_restaurantId": {"userId": current_user.id, "restaurantId": restaurant_id}}
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Restaurant access denied")
    return {"restaurant_id": restaurant_id, "role": membership.role, "user": current_user}


def require_roles(*roles: str):
    async def dependency(ctx=Depends(get_restaurant_context)):
        if ctx["role"] not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return ctx

    return dependency
