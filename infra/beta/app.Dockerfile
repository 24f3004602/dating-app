# syntax=docker/dockerfile:1
# The closed beta's front door (stage 18, D096): Caddy, with the app's web build
# baked in. Built from the repository root by compose.yaml. The build settings
# come from .env (make-env.sh); app.config.ts refuses placeholders.

FROM node:22-slim AS build
WORKDIR /repo
# Every workspace's package.json, so the lockfile resolves; only the app's
# dependencies (and the API types it imports) are installed.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/api-types/package.json packages/api-types/
COPY e2e/package.json e2e/
RUN --mount=type=cache,target=/root/.npm npm ci --workspace @datingapp/mobile --include-workspace-root=false --no-audit --no-fund
COPY packages/api-types packages/api-types
COPY apps/mobile apps/mobile
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_WEB_URL
ARG EXPO_PUBLIC_TERMS_VERSION=beta-2026-11
ARG EXPO_PUBLIC_PRIVACY_VERSION=beta-2026-11
ARG BRAND_NAME=Haanji
ARG BRAND_NAME_DEVANAGARI=
ENV CI=1 EXPO_NO_TELEMETRY=1 APP_VARIANT=beta EXPO_PUBLIC_INVITE_ONLY=1 \
    EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL EXPO_PUBLIC_WEB_URL=$EXPO_PUBLIC_WEB_URL \
    EXPO_PUBLIC_TERMS_VERSION=$EXPO_PUBLIC_TERMS_VERSION EXPO_PUBLIC_PRIVACY_VERSION=$EXPO_PUBLIC_PRIVACY_VERSION \
    BRAND_NAME=$BRAND_NAME EXPO_PUBLIC_BRAND_NAME=$BRAND_NAME \
    EXPO_PUBLIC_BRAND_NAME_DEVANAGARI=$BRAND_NAME_DEVANAGARI
RUN cd apps/mobile && npx expo export --platform web --output-dir /out

FROM caddy:2.11.8-alpine
COPY infra/beta/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /out /srv/app
