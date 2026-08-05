# Deploying to the Hostinger VPS

One VPS serves everything: nginx answers the domain, hands `/api/` to the
backend container, and serves the built SPA for every other path. Postgres runs
beside them on the same Docker network and is never exposed to the internet.

Push to `main` → GitHub runs the quality check → only if it passes does GitHub
SSH in and update the server. Nothing is uploaded by hand.

---

> Starting from an empty database. The old Railway data was test data and is
> not being migrated, so there is nothing to restore — the first boot creates
> the schema and the super admin, and you enter real data from there.

## 1. Prepare the VPS

SSH in as root and install Docker:

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
```

Create the user GitHub will log in as:

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy          # run docker without sudo
mkdir -p /srv/hatim && chown deploy:deploy /srv/hatim
```

Firewall — SSH and web only:

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

---

## 2. Clone both repos as siblings

The compose file mounts `../Hatim/dist`, so these folder names matter:

```bash
su - deploy
cd /srv/hatim
git clone https://github.com/Arifur999/ss_backend.git hatim_Backend
git clone https://github.com/Arifur999/ss-project.git Hatim
mkdir -p Hatim/dist        # CI fills this on the first frontend deploy
```

---

## 3. Write the backend `.env`

`/srv/hatim/hatim_Backend/.env` — never committed:

```bash
POSTGRES_USER=hatim
POSTGRES_PASSWORD=<long random password>
POSTGRES_DB=furniture_business

# Host is the compose service name, NOT localhost, and must match the three above.
DATABASE_URL=postgresql://hatim:<same password>@postgres:5432/furniture_business

ACCESS_TOKEN_SECRET=<long random string>
REFRESH_TOKEN_SECRET=<a different long random string>
SUPER_ADMIN_EMAIL=hatimsasseee@gmail.com
SUPER_ADMIN_PASSWORD=<your password>

FRONTEND_URL=https://cosmeticdentalbranding.com

RESEND_API_KEY=<your key>
RESEND_FROM_EMAIL=<your key>
CLOUDINARY_CLOUD_NAME=<your key>
CLOUDINARY_API_KEY=<your key>
CLOUDINARY_API_SECRET=<your key>
MRAM_API_KEY=<your MRAM key>
MRAM_SENDER_ID=<your approved sender id>
```

Copy every value you already had on Railway. `openssl rand -hex 32` makes a
good secret. Then lock the file down: `chmod 600 .env`.

---

## 4. First start

```bash
cd /srv/hatim/hatim_Backend
docker compose up -d --build
docker compose logs -f backend      # Ctrl-C once the server has started
```

The container runs `prisma migrate deploy` on start, so every table is created
on this first boot, and the super admin from `SUPER_ADMIN_EMAIL` /
`SUPER_ADMIN_PASSWORD` is seeded. Nothing else to load — the database starts
empty and you enter real data through the app.

Check it came up:

```bash
docker compose ps                          # all three services "Up"
curl -s -o /dev/null -w "%{http_code}\n" localhost/api/v1/auth/me   # expect 401
```

`401` is the healthy answer: the route exists and is asking for a login.

---

## 5. Point the domain at the VPS

In Hostinger DNS for `cosmeticdentalbranding.com`, replace the existing records:

| Type | Name  | Value       |
| ---- | ----- | ----------- |
| A    | `@`   | your VPS IP |
| A    | `www` | your VPS IP |

Wait until `dig +short cosmeticdentalbranding.com` returns the VPS IP, then open
`http://cosmeticdentalbranding.com` — the site should load over plain HTTP.

---

## 6. Turn on HTTPS

```bash
cd /srv/hatim/hatim_Backend
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  -d cosmeticdentalbranding.com -d www.cosmeticdentalbranding.com \
  --email hatimsasseee@gmail.com --agree-tos --no-eff-email
```

Once that succeeds, open `nginx.conf`, uncomment the Phase 2 block **and** the
HTTP→HTTPS redirect line, then `docker compose restart nginx`.

Certificates last 90 days, so schedule renewal — `crontab -e` as deploy:

```
0 3 * * 1 cd /srv/hatim/hatim_Backend && docker compose run --rm certbot renew && docker compose restart nginx
```

---

## 7. Wire up automatic deploys

On the VPS, create the key GitHub will use:

```bash
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/github_deploy          # the PRIVATE key - copy all of it
ssh-keyscan -H <VPS_IP>           # copy this output too
```

Add these to **both** repos (Settings → Secrets and variables → Actions):

| Secret                | Value                                          |
| --------------------- | ---------------------------------------------- |
| `VPS_HOST`            | VPS IP                                          |
| `VPS_USER`            | `deploy`                                        |
| `VPS_SSH_KEY`         | the whole private key, `-----BEGIN` to `-----END` |
| `VPS_SSH_KNOWN_HOSTS` | the `ssh-keyscan` output                        |
| `VPS_APP_DIR`         | `/srv/hatim`                                    |
| `VPS_SSH_PORT`        | only if SSH is not on port 22                   |

The same five secrets go in both repos. Each workflow ends by asking nginx on
the server's own localhost whether the app answers, so nothing here depends on
the domain resolving or a certificate existing — the deploys work before DNS is
switched over and keep working afterwards.

From then on every push to `main` type-checks, lints and builds; only if that
passes does GitHub update the server — the backend rebuilds its image and runs
pending migrations, the frontend uploads a fresh `dist`. Each workflow finishes
by checking the live site actually answers.

---

## Everyday commands

```bash
cd /srv/hatim/hatim_Backend
docker compose ps                  # what is running
docker compose logs -f backend     # follow API logs
docker compose restart backend     # restart just the API
docker compose down && docker compose up -d --build   # full rebuild
```

Back up the database on a schedule — the VPS is now the only copy:

```bash
docker compose exec postgres pg_dump -U hatim -Fc furniture_business > ~/backup-$(date +%F).dump
```
