"""Every error is {"error": {"code", "message", "fields"?}} (the design, §8)."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field, field_validator

from sdocs.api import errors
from sdocs.api.errors import ApiError


class ThingIn(BaseModel):
    name: str = Field(max_length=10)
    count: int

    @field_validator("name")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Can't be blank.")
        return value


def shaped() -> TestClient:
    app = FastAPI()
    errors.install(app)

    @app.post("/things")
    def add(body: ThingIn):
        return {}

    @app.get("/taken")
    def taken():
        raise ApiError(409, "name_taken", "That name is taken.")

    return TestClient(app)


def test_an_unknown_address_is_a_404_in_the_shape(client):
    r = client.get("/v1/nothing-here")
    assert r.status_code == 404
    assert r.json() == {"error": {"code": "not_found",
                                  "message": "There's nothing at this address."}}


def test_one_field_wrong_says_so_in_its_own_words():
    r = shaped().post("/things", json={"name": " ", "count": 1})
    assert r.status_code == 422
    assert r.json() == {"error": {"code": "invalid", "message": "Can't be blank.",
                                  "fields": {"name": "Can't be blank."}}}


def test_several_fields_wrong_are_listed_by_name():
    r = shaped().post("/things", json={"name": "x" * 11})
    body = r.json()["error"]
    assert r.status_code == 422 and body["code"] == "invalid"
    assert body["message"] == "Check the fields marked."
    assert body["fields"]["count"] == "Fill this in."
    assert set(body["fields"]) == {"name", "count"}


def test_an_api_error_keeps_its_status_code_and_message():
    r = shaped().get("/taken")
    assert r.status_code == 409
    assert r.json() == {"error": {"code": "name_taken", "message": "That name is taken."}}


def test_the_wrong_method_is_a_405_in_the_shape():
    r = shaped().get("/things")
    assert r.status_code == 405
    assert r.json()["error"]["code"] == "method_not_allowed"
    assert "POST" in r.headers["allow"]
