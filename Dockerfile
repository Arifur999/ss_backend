# ---- deps: install once, shared by the build and runtime stages ----
# --legacy-peer-deps: multer-storage-cloudinary@4 declares a peer on
# cloudinary@^1.21, but this project uses cloudinary@2.x - same workaround
# used for local installs throughout this project.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# ---- build: generate the Prisma client (TS source, compiled below), then compile TypeScript ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- runtime: production deps only + compiled output ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps
COPY --from=build /app/dist ./dist
# prisma.config.ts + prisma/ (schema + migrations) are kept so
# `npx prisma migrate deploy` can run inside this same image on deploy.
COPY prisma.config.ts ./
COPY prisma ./prisma

# su-exec drops privileges for the server process below. ~20KB, no dependencies.
RUN apk add --no-cache su-exec

EXPOSE 5000
# `prisma migrate deploy` runs on every container start, before the server -
# it's idempotent (a no-op if nothing's pending), and platforms like Railway
# don't offer the SSH access the VPS plan used to run migrations manually.
#
# The migration stays as root; the SERVER runs as `node`.
#
# Nothing was dropping privileges at all, so a remote-code bug in any dependency
# ran as root inside the container - and the compose bind-mounts make that a short
# hop to files on the host. The obvious fix, a plain `USER node`, would also move
# the migration to a non-root user, and that runs on every single container start
# on a live shop's database. This way the long-lived process that actually faces
# the internet is unprivileged, while the two seconds of migration keeps the exact
# path that has been working in production all along.
CMD ["sh", "-c", "npx prisma migrate deploy && exec su-exec node node dist/server.js"]
