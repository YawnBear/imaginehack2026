from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_REPO_ROOT = _BACKEND_ROOT.parent


class Settings(BaseSettings):
    app_name: str = "GreenGuard Cloud API"
    frontend_origin: str | None = None
    local_frontend_origin: str = "http://localhost:3000"
    database_url: str | None = None
    ai_provider_api_key: str | None = None
    ai_provider_base_url: str = "https://console-api.grafilab.ai/api/"
    ai_model: str = "grafilab-chat"
    agent_token: str = "safecloud-demo-agent-token"

    model_config = SettingsConfigDict(
        # Read repo-root and backend-local env files. Later files override
        # earlier ones, while real process env still has highest priority.
        env_file=(
            _REPO_ROOT / ".env",
            _BACKEND_ROOT / ".env",
            _REPO_ROOT / ".env.local",
            _BACKEND_ROOT / ".env.local",
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def ai_enabled(self) -> bool:
        """AI text generation is on only with a real, non-placeholder key.

        Treated as disabled when the key is missing, blank, or still a
        placeholder (contains REPLACE / your-key). This keeps the app fully
        functional via deterministic template fallback when no key is set.
        """
        key = (self.ai_provider_api_key or "").strip()
        if not key:
            return False
        lowered = key.lower()
        if "replace" in lowered or "your-key" in lowered:
            return False
        return True

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
