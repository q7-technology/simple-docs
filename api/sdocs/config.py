"""What .env says, read from DOCS_ variables. Step 1 uses the database and
the cookie flag; the rest are here so .env.example is whole from the start,
and so a secret can never be printed by accident (repr=False)."""
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DOCS_", extra="ignore")

    database_url: str = "postgresql+psycopg://sdocs:sdocs-dev@127.0.0.1:5436/sdocs"

    # The only folder Simple Docs may read code from (step 4). In Compose the
    # host folder named in .env is mounted read-only here; run outside
    # Docker, it is the folder itself.
    repo_root: str = "/repos"

    # Secrets. They stay on the server: none of them is ever sent to the
    # browser, and repr() leaves them out.
    openrouter_api_key: str = Field(default="", repr=False)  # step 3
    github_token: str = Field(default="", repr=False)  # steps 4 and 8
    monkiro_api_key: str = Field(default="", repr=False)  # step 8

    # The session cookie's Secure flag: off for the design's plain
    # http://localhost:8080, on behind https.
    cookie_secure: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
