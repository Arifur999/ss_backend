# Deploying (Docker + Nginx)

## One-time server setup

1. Get a VPS (Ubuntu 22.04/24.04), point your domain's A record at its IP.
2. Install Docker + Docker Compose plugin, then `ufw allow 22,80,443` (leave everything else closed).
3. Clone both repos as **sibling folders**:
   ```
   git clone <hatim_Backend repo url>
   git clone <Hatim repo url>
   ```

## First deploy

1. In `hatim_Backend/`, create `.env` from `.env.example`, fill in every real secret, and add:
   ```
   POSTGRES_USER=app
   POSTGRES_PASSWORD=<pick a strong password>
   POSTGRES_DB=furniture_business
   DATABASE_URL=postgresql://app:<same password>@postgres:5432/furniture_business
   ```
   Note the host is `postgres` (the compose service name), not `localhost`.

2. In `Hatim/`, set `.env` to `VITE_API_BASE_URL=/api/v1` (relative path - nginx serves both the frontend and `/api/` from the same origin, so this must NOT be `http://localhost:5000/...` or the deployed site will try to call your own laptop from a stranger's browser).

3. Build the frontend (nginx serves this folder directly - no frontend container):
   ```
   cd Hatim && npm ci && npm run build
   ```

4. Bring up the stack:
   ```
   cd ../hatim_Backend && docker compose up -d --build
   ```

5. Run the database migrations inside the running backend container:
   ```
   docker compose exec backend npx prisma migrate deploy
   ```

6. Get your SSL certificate (nginx.conf starts HTTP-only on purpose - see the comment at the top of that file for why):
   ```
   docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
     -d yourdomain.com -d www.yourdomain.com --email you@example.com --agree-tos --no-eff-email
   ```
   Then uncomment the HTTPS `server` block in `nginx.conf`, replace `yourdomain.com`, and `docker compose restart nginx`.

   Renewal (certs last 90 days) - add this as a monthly cron job on the host:
   ```
   docker compose run --rm certbot renew && docker compose restart nginx
   ```

## Every later deploy

```
git pull                                  # in both hatim_Backend and Hatim
cd Hatim && npm ci && npm run build       # only if frontend changed
cd ../hatim_Backend
docker compose up -d --build              # only if backend changed
docker compose exec backend npx prisma migrate deploy   # only if the schema changed
```

CI (`.github/workflows/ci.yml` in both repos) runs type-check + lint + build automatically on every push/PR to main - check that it's green before deploying.
