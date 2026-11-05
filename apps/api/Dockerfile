# syntax=docker/dockerfile:1
# The API and the worker (same image, different command). Stage 17: built and
# smoke-tested in CI (.github/workflows/images.yml). Stage 18: the closed beta
# runs it on one server (infra/beta, D096).
# Pattern: uv's Docker guide (docs.astral.sh/uv/guides/integration/docker, read 2026-11-05).

FROM python:3.13-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.11.25 /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0 UV_NO_DEV=1
WORKDIR /app
# Dependencies first, so code changes don't reinstall them.
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-editable
COPY . /app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-editable

FROM python:3.13-slim
# A user with no login and no write access to the code. It can write only to
# var/media, where the beta keeps photos on a volume (STORAGE_BACKEND=local, D096).
RUN useradd --system --no-create-home --uid 10001 app  && mkdir -p /app/var/media && chown -R 10001:10001 /app/var
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
COPY --from=build /app/alembic.ini /app/alembic.ini
COPY --from=build /app/migrations /app/migrations
ENV PATH="/app/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 APP_ENV=production
USER 10001
EXPOSE 8000
# The worker: `datingapp-api worker`. Migrations: `alembic upgrade head` (as the owner role).
CMD ["datingapp-api", "serve", "--host", "0.0.0.0", "--port", "8000"]
