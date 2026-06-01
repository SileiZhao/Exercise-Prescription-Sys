import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.logging import ErrorAlertService


logger = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        logger.exception(
            "Unhandled application error",
            extra={"request_id": request_id},
        )
        try:
            ErrorAlertService().notify_exception(
                exc,
                path=request.url.path,
                method=request.method,
                request_id=request_id,
            )
        except Exception:
            logger.exception("Failed to send error alert", extra={"request_id": request_id})
        return JSONResponse(
            status_code=500,
            content={"detail": "服务器内部错误", "request_id": request_id},
        )
