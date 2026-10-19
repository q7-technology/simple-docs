"""A request that changes something must carry X-Simple-Docs: 1. The
session cookie is SameSite=Strict, but every other app on this machine's
localhost counts as the same site; a page can't add this header to a request
for another origin without a CORS preflight, which this API never answers.
Reading (GET, HEAD, OPTIONS) needs no header; every other method does.

Browsers send localhost's cookies to every port on localhost, so any other
server running on this machine sees the session cookie. That is fine for one
person's own machine; for anything more, serve Simple Docs on its own
hostname over https with DOCS_COOKIE_SECURE=true."""
from __future__ import annotations

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from sdocs.api.errors import body

HEADER = b"x-simple-docs"
SAFE = {"GET", "HEAD", "OPTIONS"}


class SameSiteOnly:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] not in SAFE:
            if dict(scope["headers"]).get(HEADER) != b"1":
                response = JSONResponse(status_code=403, content=body(
                    "header_required",
                    "A request that changes something needs the header X-Simple-Docs: 1."))
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)
