from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.agent_routes import router as agent_router
from app.api.agents_routes import router as agents_router
from app.api.routes import router as api_router
from app.api.rules_routes import router as rules_router
from app.api.threats_routes import router as threats_router
from app.api.workflows_routes import router as workflows_router
from app.core.config import get_settings
from app.services.dependencies import get_governance_service
from app.services.seed import demo_events


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="FastAPI backend for the GreenGuard Cloud MVP.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def seed_demo_data() -> None:
        if settings.seed_data_enabled:
            service = get_governance_service()
            if not service.has_events:
                service.ingest_events(demo_events(), actor_id="system-seed")

    app.include_router(api_router)
    app.include_router(rules_router)
    app.include_router(agents_router)
    app.include_router(threats_router)
    app.include_router(agent_router)
    app.include_router(workflows_router)
    return app


app = create_app()
