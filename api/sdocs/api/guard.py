"""A request that changes something must carry X-Simple-Docs: 1. The
session cookie is SameSite=Strict, but every other app on this machine's
localhost counts as the same site; a page can't add this header to a request
for another origin without a CORS preflight, which this API never answers.
Reading needs no header."""
from __future__ import annotations

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from sdocs.api.errors import body

HEADER = b"x-simple-docs"
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


class SameSiteOnly:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] in UNSAFE:
            if dict(scope["headers"]).get(HEADER) != b"1":
                response = JSONResponse(status_code=403, content=body(
                    "header_required",
                    "A request that changes something needs the header X-Simple-Docs: 1."))
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)
