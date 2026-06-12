from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import runtime_provider_summary, settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.core.readiness import ReadinessService


def create_app() -> FastAPI:
    configure_logging()

    application = FastAPI(
        title=settings.PROJECT_NAME,
        version="0.1.0",
        openapi_url=f"{settings.API_V1_STR}/openapi.json",
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(application)
    application.include_router(api_router, prefix=settings.API_V1_STR)

    @application.get("/health", tags=["system"])
    def health_check() -> dict[str, str]:
        return {"status": "ok"}

    @application.get("/ready", tags=["system"])
    def readiness_check() -> JSONResponse:
        report = ReadinessService().run_checks()
        status_code = 200 if report.status == "ok" else 503
        return JSONResponse(
            status_code=status_code,
            content={
                **report.model_dump(),
                "runtime": runtime_provider_summary(settings),
            },
        )

    return application


app = create_app()
