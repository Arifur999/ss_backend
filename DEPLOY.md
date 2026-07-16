# Deploying

Current plan: **backend on Railway, frontend on Hostinger (shared hosting)**.
A self-hosted VPS (Docker + Nginx) option is also documented below in case
that's ever preferred instead - the Dockerfile works for both.

## Option A: Railway (backend) + Hostinger (frontend) - current plan

### Backend on Railway

1. Create a Railway account, connect it to the `hatim_Backend` GitHub repo.
   Railway detects the `Dockerfile` automatically and builds from it - no
   extra Railway-specific config file needed.
2. In the same Railway project, add a **PostgreSQL** service (Railway's own
   plugin, not the `postgres` container from docker-compose.yml - that file
   is only used by the VPS option below). Railway auto-injects a
   `DATABASE_URL` env var pointing at it.
3. Add every other env var from `.env.example` as Railway environment
   variables (real secrets - JWT, Cloudinary, Gmail, bKash, etc.), plus:
   - `FRONTEND_URL` = your Hostinger domain(s), comma-separated if you'll use
     both `https://yourdomain.com` and `https://www.yourdomain.com` (see
     `src/app.ts` - CORS reads this as a comma-separated list).
   - `PORT` - leave unset; Railway injects its own and `env.ts` already
     prefers `process.env.PORT`.
4. Deploy. Railway runs the Dockerfile's `CMD`, which runs
   `npx prisma migrate deploy` automatically before starting the server -
   no manual migration step needed (unlike the VPS option, there's no SSH
   access to run one by hand).
5. In Railway's service settings -> Networking, add your custom domain
   (e.g. `api.yourdomain.com`) if you want one instead of the default
   `*.up.railway.app` URL. SSL is provisioned automatically.
6. From here on, every push to `main` (that passes `.github/workflows/ci.yml`)
   auto-deploys - see the branch protection note below.

### Frontend on Hostinger

1. Set `Hatim/.env`'s `VITE_API_BASE_URL` to the **full Railway backend URL**
   (e.g. `https://api.yourdomain.com/api/v1` or the `*.up.railway.app` one) -
   NOT a relative `/api/v1` path. Frontend and backend are on different
   domains now, unlike the same-origin nginx setup in Option B, so this must
   be absolute.
2. `npm ci && npm run build` - this produces `dist/`, including
   `dist/.htaccess` (copied automatically from `public/.htaccess` - handles
   React Router's client-side routes so a direct visit/refresh on e.g.
   `/products` doesn't 404).
3. Upload everything inside `dist/` to Hostinger's `public_html` (File
   Manager or FTP).
4. Enable free SSL for your domain in Hostinger's cPanel (usually one click).
5. Re-deploying later: rebuild locally and re-upload `dist/`, unless your
   Hostinger plan has SSH or cPanel's "Git Version Control" feature, in
   which case this can be automated too (ask when you know which you have).

### Branch protection (makes the "PR -> checked -> auto-deploy" flow real)

On GitHub, per repo: Settings -> Branches -> add a rule for `main` requiring
the CI check to pass before merging. Combined with Railway's auto-deploy on
push to `main`, this gives exactly: change -> PR -> CI quality check ->
merge only if green -> Railway deploys automatically.

## Option B: Self-hosted VPS (Docker + Nginx)

### One-time server setup

1. Get a VPS (Ubuntu 22.04/24.04), point your domain's A record at its IP.
2. Install Docker + Docker Compose plugin, then `ufw allow 22,80,443` (leave everything else closed).
3. Clone both repos as **sibling folders**:
   ```
   git clone <hatim_Backend repo url>
   git clone <Hatim repo url>
   ```

### First deploy

1. In `hatim_Backend/`, create `.env` from `.env.example`, fill in every real secret, and add:
   ```
   POSTGRES_USER=app
   POSTGRES_PASSWORD=<pick a strong password>
   POSTGRES_DB=furniture_business
   DATABASE_URL=postgresql://app:<same password>@postgres:5432/furniture_business
   ```
   Note the host is `postgres` (the compose service name), not `localhost`.

2. In `Hatim/`, set `.env` to `VITE_API_BASE_URL=/api/v1` (relative path - nginx serves both the frontend and `/api/` from the same origin here, so this must NOT be an absolute URL, unlike the Railway+Hostinger option above).

3. Build the frontend (nginx serves this folder directly - no frontend container):
   ```
   cd Hatim && npm ci && npm run build
   ```

4. Bring up the stack (this also runs migrations automatically - see the Dockerfile's CMD):
   ```
   cd ../hatim_Backend && docker compose up -d --build
   ```

5. Get your SSL certificate (nginx.conf starts HTTP-only on purpose - see the comment at the top of that file for why):
   ```
   docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
     -d yourdomain.com -d www.yourdomain.com --email you@example.com --agree-tos --no-eff-email
   ```
   Then uncomment the HTTPS `server` block in `nginx.conf`, replace `yourdomain.com`, and `docker compose restart nginx`.

   Renewal (certs last 90 days) - add this as a monthly cron job on the host:
   ```
   docker compose run --rm certbot renew && docker compose restart nginx
   ```

### Every later deploy

```
git pull                                  # in both hatim_Backend and Hatim
cd Hatim && npm ci && npm run build       # only if frontend changed
cd ../hatim_Backend
docker compose up -d --build              # only if backend changed - migrations run automatically
```

CI (`.github/workflows/ci.yml` in both repos) runs type-check + lint + build automatically on every push/PR to main - check that it's green before deploying.
