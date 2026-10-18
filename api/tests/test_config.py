from sdocs.config import Settings

SECRETS = {
    "DOCS_OPENROUTER_API_KEY": "sk-or-v1-0123456789abcdef",
    "DOCS_GITHUB_TOKEN": "github_pat_0123456789abcdef",
    "DOCS_MONKIRO_API_KEY": "mk_live_0123456789abcdef",
}


def test_settings_come_from_docs_variables(monkeypatch):
    monkeypatch.setenv("DOCS_DATABASE_URL", "postgresql+psycopg://a:b@db:5432/sdocs")
    monkeypatch.setenv("DOCS_REPO_ROOT", "/srv/repos")
    monkeypatch.setenv("DOCS_COOKIE_SECURE", "true")
    s = Settings()
    assert s.database_url == "postgresql+psycopg://a:b@db:5432/sdocs"
    assert s.repo_root == "/srv/repos"
    assert s.cookie_secure is True


def test_secrets_are_read_but_never_printed(monkeypatch):
    for name, value in SECRETS.items():
        monkeypatch.setenv(name, value)
    s = Settings()
    assert s.openrouter_api_key == SECRETS["DOCS_OPENROUTER_API_KEY"]
    assert s.github_token == SECRETS["DOCS_GITHUB_TOKEN"]
    assert s.monkiro_api_key == SECRETS["DOCS_MONKIRO_API_KEY"]
    shown = repr(s) + str(s)
    for value in SECRETS.values():
        assert value not in shown


def test_a_variable_without_the_prefix_is_not_read(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-wrong-name")
    assert Settings().openrouter_api_key == ""


def test_the_cookie_is_not_secure_by_default_for_plain_localhost(monkeypatch):
    monkeypatch.delenv("DOCS_COOKIE_SECURE", raising=False)
    assert Settings().cookie_secure is False
