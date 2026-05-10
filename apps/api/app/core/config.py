from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "local"
    app_name: str = "Chez Therese et Denise"

    database_url: str = Field(alias="DATABASE_URL")

    jwt_secret: str = Field(alias="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(
        default=60,
        alias="ACCESS_TOKEN_EXPIRE_MINUTES",
    )

    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://ctd.aymeric.online",
        "https://api.ctd.aymeric.online",
    ]

    cors_origin_regex: str = Field(
        default=r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|ctd\.aymeric\.online|api\.ctd\.aymeric\.online|[0-9]{1,3}(\.[0-9]{1,3}){3})(:\d+)?$",
        alias="CORS_ORIGIN_REGEX",
    )

    seed_local_admin: bool = Field(
        default=True,
        alias="SEED_LOCAL_ADMIN",
    )

    seed_admin_email: str = Field(
        default="aymericvenacterpro@gmail.com",
        alias="SEED_ADMIN_EMAIL",
    )

    seed_admin_password: str = Field(
        default="admin",
        alias="SEED_ADMIN_PASSWORD",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        populate_by_name=True,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
