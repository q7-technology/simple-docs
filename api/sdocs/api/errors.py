"""Every error the API gives has one shape (the design, §8):

    {"error": {"code": "...", "message": "...", "fields": {...}}}

`code` is for programs, `message` is written for people, and `fields` (a
field's name → what is wrong with it) comes only when the request itself had
something wrong in it."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

CHECK_FIELDS = "Check the fields marked."


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str,
                 fields: dict[str, str] | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.fields = fields


def body(code: str, message: str, fields: dict[str, str] | None = None) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if fields:
        error["fields"] = fields
    return {"error": error}


def invalid(field: str, message: str) -> ApiError:
    """One field is wrong: a 422 that names it."""
    return ApiError(422, "invalid", message, {field: message})


def not_found(message: str = "There's nothing here by that id.") -> ApiError:
    return ApiError(404, "not_found", message)


def forbidden(message: str = "Your role can't do that. Ask an admin.") -> ApiError:
    return ApiError(403, "forbidden", message)


def commit_unique(db, taken: dict[str, ApiError]) -> None:
    """Commit, as the check before it said was fine. Two requests at once can
    both pass that check; the one that loses to a unique constraint named in
    `taken` gets that constraint's error, as if the check had caught it."""
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        error = taken.get(getattr(getattr(e.orig, "diag", None), "constraint_name", None) or "")
        if error is None:
            raise
        raise error from None


def field_errors(errors) -> dict[str, str]:
    out: dict[str, str] = {}
    for e in errors:
        loc = [str(x) for x in e.get("loc", ()) if x != "body"]
        if e.get("type") == "missing":
            message = "Fill this in."
        else:
            # a check of our own says it plainly, without pydantic's "Value error, "
            message = str(e.get("msg", "Not valid.")).removeprefix("Value error, ")
        out.setdefault(".".join(loc) or "body", message)
    return out


_STATUS = {
    404: ("not_found", "There's nothing at this address."),
    405: ("method_not_allowed", "This address doesn't take that kind of request."),
}


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError):
        return JSONResponse(status_code=exc.status,
                            content=body(exc.code, exc.message, exc.fields))

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError):
        fields = field_errors(exc.errors())
        message = next(iter(fields.values())) if len(fields) == 1 else CHECK_FIELDS
        return JSONResponse(status_code=422, content=body("invalid", message, fields))

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException):
        code, message = _STATUS.get(exc.status_code, ("error", str(exc.detail)))
        return JSONResponse(status_code=exc.status_code, content=body(code, message),
                            headers=exc.headers)
