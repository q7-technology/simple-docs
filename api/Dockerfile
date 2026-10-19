FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_ROOT_USER_ACTION=ignore

# uv, pinned, only to turn uv.lock into a requirements list
COPY --from=ghcr.io/astral-sh/uv:0.12.9 /uv /usr/local/bin/uv

# the API runs as this person, never as root
RUN useradd --system --uid 10001 --user-group --create-home --home-dir /home/sdocs \
    --shell /usr/sbin/nologin sdocs

WORKDIR /app

# the packages first, exactly as uv.lock pins them, so a code change reuses this layer
COPY pyproject.toml uv.lock ./
RUN uv export --frozen --no-dev --no-hashes --no-emit-project -o /tmp/requirements.txt \
    && pip install --no-cache-dir -r /tmp/requirements.txt \
    && rm -rf /tmp/requirements.txt /root/.cache

COPY sdocs ./sdocs
COPY alembic.ini ./
COPY alembic ./alembic
RUN pip install --no-cache-dir --no-deps . && rm -rf /root/.cache

USER sdocs

EXPOSE 8000
CMD ["uvicorn", "sdocs.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
