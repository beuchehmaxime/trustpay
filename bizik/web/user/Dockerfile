# syntax=docker/dockerfile:1
#
# BiZik user web app (Next.js standalone). Multi-stage: install → build →
# minimal runtime. The user app's build script uses --webpack (Serwist needs it).

# ---- Dependencies ----------------------------------------------------------
FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---- Build -----------------------------------------------------------------
FROM node:20-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* is inlined into the client bundle at build time. The browser
# runs on the host, so it reaches the API gateway at localhost:8080.
ARG NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build

# ---- Production ------------------------------------------------------------
FROM node:20-slim AS production
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next standalone output + the assets it does NOT bundle (static chunks, public/).
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3000
CMD ["node", "server.js"]
