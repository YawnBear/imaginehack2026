from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "GreenGuard Cloud API"
    frontend_origin: str | None = None
    local_frontend_origin: str = "http://localhost:3000"
    seed_data_enabled: bool = True
    database_url: str | None = None
    ai_provider_api_key: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        origins = {
            self.local_frontend_origin,
            "http://127.0.0.1:3000",
        }
        if self.frontend_origin:
            origins.add(self.frontend_origin)
        return sorted(origins)


@lru_cache
def get_settings() -> Settings:
    return Settings()
