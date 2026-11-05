# syntax=docker/dockerfile:1
# The landing page and staff console (Next.js standalone output). Built from the
# repository root (npm workspaces, one lockfile): docker build -f apps/web/Dockerfile .
# Stage 17: built and smoke-tested in CI; not deployed anywhere.

FROM node:22-slim AS build
WORKDIR /repo
# Every workspace's package.json, so the lockfile resolves; only the web app's
# dependencies are installed.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/api-types/package.json packages/api-types/
COPY e2e/package.json e2e/
RUN --mount=type=cache,target=/root/.npm npm ci --workspace @datingapp/web --include-workspace-root=false --no-audit --no-fund
COPY apps/web apps/web
COPY replica/design/tokens.json replica/design/tokens.json
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
RUN npm run build -w @datingapp/web \
 && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

FROM node:22-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
