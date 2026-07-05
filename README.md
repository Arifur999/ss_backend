# Furniture Business Management — Backend

Multi-tenant SaaS backend for the Furniture Business Management app.

## Stack

- **Express 5** + **TypeScript** (ESM)
- **Prisma 7** + **PostgreSQL** (driver adapter: `@prisma/adapter-pg`)
- **Zod v4** request validation
- **JWT** auth (access + refresh cookies), role-based access (`super_admin`, `owner`, `manager`, `sales_staff`, `accountant`)
- **Cloudinary** image uploads
- **node-cron** subscription expiry checks

## Architecture

```
src/
  config/          env, cloudinary, multer
  app/
    lib/           prisma client
    errorHelpers/  AppError + zod/prisma error normalizers
    middleware/    checkAuth, checkSubscription, validateRequest, globalErrorHandler, notFound
    shared/        catchAsync, sendResponse
    utils/         jwt, token, cookie, seed, subscription, activityLog
    module/        one folder per feature: <feature>.{interface,validation,service,controller,route}.ts
    routes/        mounts every module under /api/v1
prisma/schema/     multi-file Prisma schema (33+ models)
```

Every workspace table carries `owner_id`; all queries are scoped by the authenticated user's workspace (replaces Supabase RLS). Owner access is gated by subscription status (`checkSubscription` middleware).

## Getting started

```bash
npm install --legacy-peer-deps
cp .env.example .env   # fill DATABASE_URL and secrets
npm run migrate        # create database schema
npm run dev            # start dev server on :5000
```

The super admin account is seeded automatically on boot from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`.
