# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# The CMG application (payment and material screens), self-hosted: the built Worker runs in workerd (through
# wrangler dev, as wrangler.selfhost.jsonc describes) with its D1 database and
# R2 attachment store kept in the /data volume. Build context: the repo root.
# Debian, not Alpine: workerd needs glibc.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . ./
RUN npx vinext build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app /app
COPY --chmod=755 docker/payment-entrypoint.sh /usr/local/bin/payment-entrypoint.sh
ENV WRANGLER_SEND_METRICS=false CI=1
VOLUME /data
EXPOSE 8787
ENTRYPOINT ["payment-entrypoint.sh"]
