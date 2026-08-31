from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import get_settings

settings = get_settings()


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    """Rejects requests whose declared Content-Length exceeds the configured
    cap before any body (file upload included) is read into memory — the
    Python equivalent of the original app's explicit Server Action body
    size limit (raised to 50MB there to fit zipped drawing folders)."""

    def __init__(self, app, max_body_bytes: int):
        super().__init__(app)
        self.max_body_bytes = max_body_bytes

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                if int(content_length) > self.max_body_bytes:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": f"Request body too large — max {self.max_body_bytes // (1024 * 1024)}MB."},
                    )
            except ValueError:
                pass
        return await call_next(request)
