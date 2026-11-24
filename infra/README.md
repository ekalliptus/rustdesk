# EL-Desk VPS Infrastructure & API Deployment

This directory deploys the self-hosted `hbbs`/`hbbr` relay and `rustdesk-api` backend for `EL-Desk`.

## 1. Cloudflare DNS Records

| Record | Target | Proxy Status | Service |
| :--- | :--- | :--- | :--- |
| `relay.desk.ekalliptus.com` | `<VPS_IP>` | **DNS Only (Grey Cloud)** | `hbbs` / `hbbr` (`21115-21119`) |
| `api.desk.ekalliptus.com` | `<VPS_IP>` | **Proxied (Orange Cloud)** | Nginx HTTPS -> `127.0.0.1:21114` |
| `dl.desk.ekalliptus.com` | Cloudflare R2 bucket | **Proxied (Orange Cloud)** | Installers, APK, `latest.json` |
| `desk.ekalliptus.com` | Cloudflare Pages | **Proxied (Orange Cloud)** | Web Profile & Download Portal |

Never enable Orange Cloud on `relay.desk.ekalliptus.com`. Cloudflare HTTP proxy drops raw TCP/UDP ports `21115-21119`.

## 2. Configure Environment & Start Containers

```bash
cd infra
cp .env.example .env
# Edit .env with NeonDB `-pooler` DATABASE_URL and >=32-byte JWT_SECRET
mkdir -p data/hbbs

docker compose up -d --build
```

## 3. Extract Public Key (`RS_PUB_KEY`)

```bash
cat infra/data/hbbs/id_ed25519.pub
```

Put ONLY `id_ed25519.pub` into GitHub Secret `CUSTOM_RS_PUB_KEY`. Never copy or commit `id_ed25519` (private key).

## 4. Initialize NeonDB Schema & Seed Admin User

Run directly via the built container (applies `migrations/001_init.sql` and creates/updates the admin account):

```bash
docker compose exec -T rustdesk-api /usr/local/bin/seed-admin \
  -migrate=true \
  -username="admin" \
  -password="<strong-password>" \
  -display-name="EL-Desk Admin" \
  -admin=true
```

## 5. Configure Nginx & Firewall (UFW)

1. Install Cloudflare Origin Certificate & key for `desk.ekalliptus.com` / `*.desk.ekalliptus.com` at:
   - `/etc/ssl/cloudflare/desk.ekalliptus.com.pem`
   - `/etc/ssl/cloudflare/desk.ekalliptus.com.key`
2. Enable the site:
   ```bash
   sudo cp infra/nginx/api.desk.ekalliptus.com.conf /etc/nginx/sites-available/api.desk.ekalliptus.com.conf
   sudo ln -sf /etc/nginx/sites-available/api.desk.ekalliptus.com.conf /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
3. Apply UFW rules (verify SSH port first):
   ```bash
   sudo bash infra/ufw-rules.sh
   ```

## 6. NeonDB Scale-to-Zero Design

- `POST /api/heartbeat`, `GET /api/admin/online-peers`, `POST /api/sysinfo_ver`, and `GET /healthz` operate strictly in memory (`sync.Map`, 45s TTL) with zero NeonDB queries.
- `hbbs` keeps its own local SQLite database inside `infra/data/hbbs/`.
- `pgxpool` uses `QueryExecModeSimpleProtocol`, `MinConns = 0`, `MaxConns = 5`, and `MaxConnIdleTime = 2m` with zero keepalive pings so NeonDB suspends cleanly during idle periods.
