# syntax=docker/dockerfile:1

# TrustPay - the AI mediation service.
#
# Its own container, deliberately. TrustPay is a suggestion engine and nothing
# else: it reads a case file, calls Meta's models, and posts back a
# recommendation for a human to approve. Keeping it in a separate image from
# the Bizik backend means it cannot acquire a database handle, a payment
# credential or a ledger write by accident - it has none of them to begin with,
# and the isolation is what makes that true rather than a promise.
#
# Debian-slim to match the backend image, so the two behave the same way under
# the same base and there is one OpenSSL story across the stack.

# ---- Build stage -----------------------------------------------------------
FROM node:20-slim AS build
WORKDIR /app

# Lockfile install for reproducible builds.
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Production stage ------------------------------------------------------
FROM node:20-slim AS production
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Production deps only. Nothing in here needs a build toolchain at runtime.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Scratch space for audio and image work. Evidence is fetched, processed and
# dropped - nothing is retained between requests.
RUN mkdir -p /app/work && chown -R node:node /app

USER node
EXPOSE 4100

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4100/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/server.js"]
