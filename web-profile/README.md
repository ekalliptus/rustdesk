# EL-Desk Web Profile (`web-profile/`)

Static Astro + Tailwind CSS v4 + React portal for `https://desk.ekalliptus.com`, deployed on Cloudflare Pages.

Binary installers and `latest.json` are never stored inside this folder; they are hosted in Cloudflare R2 (`https://dl.desk.ekalliptus.com`) so the Pages output remains well below Cloudflare's 25 MiB per-file and asset limits.

## Local Development

```bash
cd web-profile
npm install
npm test
npm run dev
```

To build and preview the production output locally:

```bash
npm run build
npm run preview
```

Optional build-time / runtime overrides (set in `.env` or Cloudflare Pages environment variables):

- `PUBLIC_LATEST_JSON_URL` (default: `https://dl.desk.ekalliptus.com/latest.json`)
- `PUBLIC_API_HEALTH_URL` (default: `https://api.desk.ekalliptus.com/healthz`)

## Cloudflare Pages Deployment Settings

- **Framework preset:** Astro
- **Root directory:** `web-profile`
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Environment variables:** `NODE_VERSION=22`

## Required Cloudflare R2 Bucket CORS Policy

In the Cloudflare Dashboard (`R2` -> bucket -> `Settings` -> `CORS Policy`), allow browser `GET` and `HEAD` fetches of `latest.json` from `https://desk.ekalliptus.com`:

```json
[
  {
    "AllowedOrigins": [
      "https://desk.ekalliptus.com"
    ],
    "AllowedMethods": [
      "GET",
      "HEAD"
    ],
    "AllowedHeaders": [
      "Content-Type"
    ],
    "ExposeHeaders": [
      "ETag",
      "Content-Length"
    ],
    "MaxAgeSeconds": 3600
  }
]
```
