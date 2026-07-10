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
EXPOSE 5000
CMD ["node", "dist/server.js"]
