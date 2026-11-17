# Deploying TeamFlow on Render (app + platform admin)

TeamFlow deploys as **two Render services** from the same repo (`asana2-main`):

| Service | Type | Host | Serves |
| --- | --- | --- | --- |
| **App API + product UI** | Web Service | `app.mydomain.com` | Express `/api/*`, `/platform/api/*`, product `dist/` |
| **Platform admin** | Static Site | `admin.mydomain.com` | `platform-admin/dist` |

Data lives in **Supabase Postgres** via Prisma.

Marketing on the apex domain (`mydomain.com`) is **out of scope** for this guide — add later.

```text
Users  → app.mydomain.com  → Web Service (API + product SPA)
Staff  → admin.mydomain.com → Static Site → calls https://app.mydomain.com/platform/api
Both   → same Supabase database
```

---

## 1. Push the code to GitHub

Deploy from the folder that contains `package.json` (this repo / `asana2-main`).
Confirm `.env` is **not** committed.

---

## 2. Supabase database

1. Create or reuse a Supabase project.
2. **Project → Connect** → copy pooler URLs:
   - **Transaction** pooler (port `6543`) → `DATABASE_URL` (append `?pgbouncer=true`)
   - **Session** pooler (port `5432`) → `DIRECT_URL` (migrations)
3. Never commit real passwords.

On start, `npm start` runs `prisma migrate deploy`.

---

## 3. Render Web Service (product + API)

1. **New → Web Service** → connect the GitHub repo.
2. If the monorepo root is not `asana2-main`, set **Root Directory** to `asana2-main`.
3. Settings:

| Field | Value |
| --- | --- |
| Runtime | Node |
| Branch | `main` (or your deploy branch) |
| Build Command | `npm install --include=dev; npm run build` |
| Start Command | `npm start` |
| Instance | Starter or higher recommended for always-on |

`--include=dev` is required so Vite/TypeScript install under `NODE_ENV=production`.

### Environment variables (Web Service)

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase transaction pooler (`…:6543/postgres?pgbouncer=true`) |
| `DIRECT_URL` | Supabase session pooler (`…:5432/postgres`) |
| `JWT_SECRET` | Long random string |
| `PLATFORM_JWT_SECRET` | **Different** long random string |
| `FRONTEND_URL` | `https://app.mydomain.com` (no trailing slash) |
| `PLATFORM_ADMIN_URL` | `https://admin.mydomain.com` (no trailing slash) |
| `MARKETING_URL` | `https://teamflow.cyou` (apex marketing; CORS for newsletter) |
| `NODE_ENV` | `production` |
| `PORT` | Leave unset (Render injects it) |
| `GOOGLE_CLIENT_ID` | Optional; add prod JS origin in Google Console |
| `RESEND_API_KEY` | Resend API key (`re_…`) after domain verify |
| `EMAIL_FROM` | e.g. `TeamFlow <noreply@teamflow.cyou>` (must be on verified domain) |

### Email with Resend (OTP + invites)

1. Verify the apex domain in Resend (DNS TXT/MX as Resend shows).
2. On the **Web Service** only, set `RESEND_API_KEY` and `EMAIL_FROM`.
3. Set `FRONTEND_URL=https://app.teamflow.cyou` so invite links in email use the real app host (not `*.onrender.com`).
4. Redeploy the Web Service. Signup OTP and invite emails go through Resend SMTP automatically.
5. Check Resend → Logs if a message fails (wrong From address is the usual cause).

Optional: `CORS_ORIGINS` = comma-separated extra origins (temporary `*.onrender.com` hosts).

4. Deploy once. Note the temporary URL `https://<service>.onrender.com`.
5. **Settings → Custom Domains** → add `app.mydomain.com`.
6. At your DNS host, add a **CNAME** `app` → the Render target shown in the dashboard. Wait for HTTPS.

Until the custom domain is live, you may set:

- `FRONTEND_URL=https://<service>.onrender.com`
- `CORS_ORIGINS=https://<admin-static>.onrender.com`

Then switch to `app.` / `admin.` URLs after DNS.

---

## 4. Render Static Site (platform admin)

1. **New → Static Site** → same GitHub repo (same Root Directory if needed).
2. Settings:

| Field | Value |
| --- | --- |
| Build Command | `npm install --include=dev; npm run build:platform-admin` |
| Publish Directory | `platform-admin/dist` |

3. **Build-time** environment variable (required for admin → API calls):

| Variable | Value |
| --- | --- |
| `VITE_PLATFORM_API_BASE` | `https://app.mydomain.com` (or temporary Web Service URL) |

Vite bakes this into the JS bundle at **build** time. If you change it, **redeploy** the Static Site.

4. **Custom Domains** → `admin.mydomain.com` + DNS **CNAME** `admin` → Render target.

Locally, leave `VITE_PLATFORM_API_BASE` unset; Vite proxies `/platform` to `:3001`.

---

## 5. Render Static Site (marketing — apex `teamflow.cyou`)

1. **New → Static Site** → same repo / `main`.
2. Settings:

| Field | Value |
| --- | --- |
| Build Command | `npm install --include=dev; npm run build:marketing` |
| Publish Directory | `marketing/dist` |

3. Build-time env:

| Variable | Value |
| --- | --- |
| `VITE_APP_URL` | `https://app.teamflow.cyou` |
| `VITE_API_BASE` | `https://app.teamflow.cyou` |

CTAs go to the app; newsletter posts to `POST /api/newsletter/subscribe` on the API host.

4. **Custom Domains** → add apex `teamflow.cyou` (and optional `www`). Follow Render’s DNS instructions (often ALIAS/ANAME or CNAME for www).

5. On the **Web Service**, set `MARKETING_URL=https://teamflow.cyou` (and `https://www.teamflow.cyou` via `CORS_ORIGINS` if you use www) so newsletter CORS works. Redeploy the Web Service.

Local preview: `npm run dev:marketing` (port **3020**).

---

## 6. Optional Blueprint (`render.yaml`)

This repo includes [`render.yaml`](render.yaml). In Render: **New → Blueprint** → select the repo.
Still set secrets in the dashboard (`DATABASE_URL`, `JWT_SECRET`, etc.). Replace placeholder domains in env after first deploy if needed.

---

## 7. Post-deploy: seed platform OWNER

After the Web Service is healthy:

1. Open **Render Shell** on the Web Service (or run locally against prod DB carefully).
2. Seed staff:

```bash
PLATFORM_OWNER_EMAIL=you@company.com PLATFORM_OWNER_PASSWORD='long-random-password' npm run seed:platform-owner
```

3. Open `https://admin.mydomain.com` → login → enroll MFA → search workspaces.

Do **not** use the weak local-dev password in production.

---

## 8. Smoke test checklist

- [ ] `GET https://app.mydomain.com/api/health` → `{ status: "ok" }`
- [ ] `GET https://app.mydomain.com/platform/api/health` → `{ status: "ok", surface: "platform" }`
- [ ] Product signup/login on `app.*`
- [ ] Platform MFA login on `admin.*`
- [ ] Grant chat override for a FREE workspace → Chat appears in product after refresh
- [ ] Invite link uses `FRONTEND_URL` (`app.*`)
- [ ] Apex marketing `https://teamflow.cyou` loads; Start free → app signup
- [ ] Newsletter subscribe from marketing succeeds (check platform admin Newsletter list)

---

## 9. What happens on each Web Service deploy

1. **Build** — install (with devDeps), `prisma generate`, `tsc`, `vite build`
2. **Start** — `prisma migrate deploy`, then `tsx server/index.ts`
3. Express serves API + product `dist/`

Admin / marketing Static Sites rebuild only when those services deploy (Vite env is bake-time).

---

## 10. Common issues

- **Build fails on `@types/node` / `vite`** — Build Command missing `--include=dev`
- **Migrate fails** — `DIRECT_URL` missing/wrong; URL-encode special chars in password
- **Admin login network error** — `VITE_PLATFORM_API_BASE` wrong or Static Site not rebuilt; CORS: set `PLATFORM_ADMIN_URL`
- **Marketing newsletter CORS error** — set `MARKETING_URL=https://teamflow.cyou` on Web Service and redeploy
- **Cold start** — free Web Service sleeps; first request ~30–60s
- **Invite / impersonation links wrong** — `FRONTEND_URL` must be public `app.*` URL
- **Google Sign-In** — add `https://app.mydomain.com` to Authorized JavaScript origins
