from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import create_access_token, hash_password, verify_password
from app.db.prisma import db
from app.models.schemas import LoginRequest, RegisterRequest, TokenResponse, UserOut
from app.routers.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest):
    existing = await db.user.find_unique(where={"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = await db.user.create(
        data={
            "email": payload.email.lower(),
            "passwordHash": hash_password(payload.password),
            "firstName": payload.first_name,
            "lastName": payload.last_name,
            "memberships": {
                "create": {
                    "role": "OWNER",
                    "restaurant": {
                        "create": {
                            "name": payload.restaurant_name,
                            "companySettings": {"create": {"brandName": payload.restaurant_name}},
                        }
                    },
                }
            },
        },
        include={"memberships": True},
    )
    membership = user.memberships[0]
    token = create_access_token(user.id, {"restaurant_id": membership.restaurantId, "role": membership.role})
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest):
    user = await db.user.find_unique(where={"email": payload.email.lower()}, include={"memberships": True})
    if not user or not verify_password(payload.password, user.passwordHash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    membership = user.memberships[0] if user.memberships else None
    claims = {"restaurant_id": membership.restaurantId, "role": membership.role} if membership else {}
    return TokenResponse(access_token=create_access_token(user.id, claims))


@router.get("/me", response_model=UserOut)
async def me(current_user=Depends(get_current_user)):
    user = await db.user.find_unique(where={"id": current_user.id}, include={"memberships": True})
    membership = user.memberships[0] if user and user.memberships else None
    return UserOut(
        id=user.id,
        email=user.email,
        first_name=user.firstName,
        last_name=user.lastName,
        role=membership.role if membership else None,
        restaurant_id=membership.restaurantId if membership else None,
    )
