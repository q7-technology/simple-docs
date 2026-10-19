from sqlalchemy import select

from sdocs.models import Setting

ACME = {"name": "Acme Pty Ltd", "abn": "51824753556", "phone": "03 9000 0000",
        "email": "Office@Acme.com.au", "address": "1 Collins Street\n\nMelbourne  VIC 3000 "}
SAVED = {"name": "Acme Pty Ltd", "abn": "51 824 753 556", "phone": "03 9000 0000",
         "email": "office@acme.com.au", "address": "1 Collins Street\nMelbourne VIC 3000",
         "logo_id": None}


def test_an_admin_sets_the_details_and_everyone_signed_in_reads_them(admin_client,
                                                                     reviewer_client, db, admin):
    r = admin_client.put("/v1/settings/org", json=ACME)
    assert r.status_code == 200 and r.json() == SAVED
    assert reviewer_client.get("/v1/settings/org").json() == SAVED
    row = db.execute(select(Setting).where(Setting.key == "org.abn")).scalar_one()
    assert row.value == "51 824 753 556" and row.updated_by == admin.id


def test_details_left_blank_are_cleared(admin_client):
    admin_client.put("/v1/settings/org", json=ACME)
    r = admin_client.put("/v1/settings/org", json={"name": "Acme", "abn": " ", "phone": "",
                                                   "email": None})
    assert r.json() == {"name": "Acme", "abn": None, "phone": None, "email": None,
                        "address": None, "logo_id": None}


def test_an_abn_must_pass_the_ato_check(admin_client):
    r = admin_client.put("/v1/settings/org", json={**ACME, "abn": "51 824 753 557"})
    assert r.status_code == 422
    assert r.json() == {"error": {"code": "invalid",
                                  "message": "That isn't a valid ABN. Check the 11 digits.",
                                  "fields": {"abn": "That isn't a valid ABN. Check the 11 digits."}}}
    r = admin_client.put("/v1/settings/org", json={**ACME, "abn": "5182475355"})
    assert r.json()["error"]["fields"] == {"abn": "An ABN is 11 digits, e.g. 51 824 753 556."}


def test_the_name_is_needed_and_the_email_checked(admin_client):
    r = admin_client.put("/v1/settings/org", json={**ACME, "name": " ", "email": "not an email"})
    assert r.json()["error"]["fields"] == {"name": "Can't be blank.",
                                           "email": "That doesn't look like an email address."}


def test_control_characters_are_refused(admin_client):
    r = admin_client.put("/v1/settings/org", json={**ACME, "phone": "03\u00009000 0000",
                                                   "address": "1 Collins\u0007 Street"})
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {
        "phone": "Use letters, numbers and punctuation only.",
        "address": "Use letters, numbers and punctuation only."}


def test_only_an_admin_changes_them(editor_client):
    assert editor_client.put("/v1/settings/org", json=ACME).status_code == 403


def test_reading_them_needs_a_session(client):
    assert client.get("/v1/settings/org").status_code == 401


def test_one_line_details_stay_on_one_line(admin_client):
    r = admin_client.put("/v1/settings/org", json={**ACME, "phone": "03 9000\n0000"})
    assert r.json()["phone"] == "03 9000 0000"


def test_only_a_newline_starts_a_new_address_line(admin_client):
    r = admin_client.put("/v1/settings/org",
                         json={**ACME, "address": "1 Collins\x85Street\r\nMelbourne\rVIC"})
    assert r.json()["address"] == "1 Collins Street\nMelbourne\nVIC"


def test_invisible_and_direction_characters_are_refused(admin_client):
    r = admin_client.put("/v1/settings/org", json={**ACME, "name": "Acme\u202e",
                                                   "phone": "03\u200b9000 0000"})
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {
        "name": "Use letters, numbers and punctuation only.",
        "phone": "Use letters, numbers and punctuation only."}


def test_an_abn_may_be_written_with_hyphens_or_dots(admin_client):
    for written in ("51-824-753-556", "51.824.753.556"):
        r = admin_client.put("/v1/settings/org", json={**ACME, "abn": written})
        assert r.json()["abn"] == "51 824 753 556"
