# syntax=docker/dockerfile:1

# ---- Build stage -----------------------------------------------------------
# Debian-slim (not alpine): Prisma's engines need OpenSSL/glibc and work
# reliably here without musl/libssl detection issues.
FROM node:20-slim AS build
WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install all deps (incl. dev) using the lockfile for reproducible builds.
COPY package*.json ./
RUN npm ci

# Generate the Prisma client (repositories import @prisma/client).
COPY prisma ./prisma
RUN npx prisma generate

# Compile TypeScript -> dist/
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Production stage ------------------------------------------------------
FROM node:20-slim AS production
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Carry over installed modules (includes the Prisma CLI + generated client,
# needed at startup to sync the schema) and the compiled output.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package*.json ./
COPY docker-entrypoint.sh ./

# Normalise line endings (in case of CRLF from Windows) and make executable.
# Pre-create the uploads dir so the mounted named volume seeds with `node`
# ownership (a fresh volume otherwise mounts root-owned and the app can't write).
RUN sed -i 's/\r$//' docker-entrypoint.sh \
  && chmod +x docker-entrypoint.sh \
  && mkdir -p /app/uploads \
  && chown -R node:node /app

USER node
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
