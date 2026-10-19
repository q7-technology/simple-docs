"""SameSite=Strict keeps other sites' requests from carrying the cookie, but
every other app on localhost is the same site. A page can't add a header of
its own to another origin's request without the browser asking first, and
this API never answers that question, so the header closes the gap."""
from conftest import PASSWORD, sign_in
from fastapi.testclient import TestClient

from sdocs.api.app import app

REFUSED = {"error": {"code": "header_required", "message":
                     "A request that changes something needs the header X-Simple-Docs: 1."}}


def test_a_change_without_the_header_is_refused(engine, editor):
    bare = TestClient(app)
    r = bare.post("/v1/auth/sign-in", json={"username": "mel", "password": PASSWORD})
    assert r.status_code == 403 and r.json() == REFUSED
    for method in ("put", "patch", "delete"):
        assert getattr(bare, method)("/v1/anything").json() == REFUSED


def test_any_other_value_or_method_is_refused(engine):
    bare = TestClient(app)
    assert bare.post("/v1/auth/sign-out", headers={"X-Simple-Docs": "0"}).json() == REFUSED
    assert bare.request("PROPFIND", "/v1/anything").json() == REFUSED


def test_reading_needs_no_header(engine):
    bare = TestClient(app)
    assert bare.get("/v1/health").status_code == 200
    assert bare.head("/v1/health").status_code != 403
    assert bare.options("/v1/health").status_code != 403


def test_with_the_header_it_goes_through(client, editor):
    assert sign_in(client, "mel")["username"] == "mel"
