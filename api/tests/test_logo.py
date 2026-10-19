from sqlalchemy import func, select

from sdocs.api.app import app
from sdocs.models import OrgLogo
from sdocs.services import settings

# Only the first bytes are checked, so a signature and padding will do here
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


def _upload(c, content: bytes, mime: str = "image/png"):
    return c.put("/v1/settings/org/logo", content=content, headers={"Content-Type": mime})


def test_an_admin_uploads_a_logo_anyone_can_fetch(admin_client, client):
    assert _upload(admin_client, PNG).status_code == 204
    logo_id = client.get("/v1/branding").json()["logo_id"]
    assert logo_id is not None
    assert admin_client.get("/v1/settings/org").json()["logo_id"] == logo_id
    r = client.get("/v1/branding/logo")
    assert r.status_code == 200 and r.content == PNG
    assert r.headers["content-type"] == "image/png"
    assert r.headers["x-content-type-options"] == "nosniff"


def test_a_new_logo_takes_over_and_the_old_row_stays(admin_client, client, db):
    _upload(admin_client, PNG)
    first = client.get("/v1/branding").json()["logo_id"]
    _upload(admin_client, JPEG, "image/jpeg")
    assert client.get("/v1/branding").json()["logo_id"] != first
    r = client.get("/v1/branding/logo")
    assert r.content == JPEG and r.headers["content-type"] == "image/jpeg"
    assert db.execute(select(func.count()).select_from(OrgLogo)).scalar() == 2


def test_svg_and_other_kinds_are_refused(admin_client):
    svg = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"
    r = _upload(admin_client, svg, "image/svg+xml")
    assert r.status_code == 415
    assert r.json() == {"error": {"code": "unsupported_type",
                                  "message": "Use a PNG or JPEG for the logo."}}


def test_a_file_that_isnt_what_it_says_is_refused(admin_client):
    r = _upload(admin_client, JPEG, "image/png")
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {"logo": "That file isn't the PNG or JPEG it says it is."}


def test_a_logo_over_512_kb_is_refused(admin_client):
    r = _upload(admin_client, PNG + b"\x00" * (512 * 1024))
    assert r.status_code == 413 and r.json()["error"]["code"] == "too_large"


def test_a_logo_of_exactly_512_kb_is_accepted(admin_client):
    exactly = PNG + b"\x00" * (512 * 1024 - len(PNG))
    assert _upload(admin_client, exactly).status_code == 204


def test_the_logo_is_asked_for_again_cheaply(admin_client, client):
    _upload(admin_client, PNG)
    logo_id = client.get("/v1/branding").json()["logo_id"]
    r = client.get("/v1/branding/logo")
    assert r.headers["etag"] == f'"{logo_id}"'
    r = client.get("/v1/branding/logo", headers={"If-None-Match": f'"{logo_id}"'})
    assert r.status_code == 304 and r.content == b"" and r.headers["etag"] == f'"{logo_id}"'
    r = client.get("/v1/branding/logo", headers={"If-None-Match": '"something-else"'})
    assert r.status_code == 200 and r.content == PNG


def test_a_damaged_logo_setting_is_no_logo(admin, client, db):
    settings.write(db, {settings.ORG_LOGO: "not-a-uuid"}, admin)
    db.commit()
    r = client.get("/v1/branding/logo")
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"


def test_the_api_description_names_both_kinds_of_logo():
    body = app.openapi()["paths"]["/v1/settings/org/logo"]["put"]["requestBody"]
    assert set(body["content"]) == {"image/png", "image/jpeg"}
    assert body["content"]["image/jpeg"]["schema"] == {"type": "string", "format": "binary"}


def test_removing_the_logo_goes_back_to_the_mark(admin_client, client):
    _upload(admin_client, PNG)
    assert admin_client.delete("/v1/settings/org/logo").status_code == 204
    assert client.get("/v1/branding").json()["logo_id"] is None
    r = client.get("/v1/branding/logo")
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"


def test_only_an_admin_changes_the_logo(editor_client):
    assert _upload(editor_client, PNG).status_code == 403
    assert editor_client.delete("/v1/settings/org/logo").status_code == 403
