# Platform Admin (`admin.mydomain.com`) — Architecture & Phased Plan

**Status:** Phase 1 implementation in progress / landed in repo  
**Product app:** TeamFlow / Agaze — `app.mydomain.com` (this repo: `asana2-main`)  
**Marketing:** `mydomain.com` (separate marketing site; out of scope for this file except newsletter intake)  
**Platform ops:** `admin.mydomain.com` → local: `platform-admin/` on port **3010** (`npm run dev:platform-admin`)

---

## 1. Recommendation: same monorepo, separate app folder

**Do not** build platform admin inside the customer product UI (`src/pages/AdminPage.tsx`). That page is **workspace Admin Center** for company `SUPER_ADMIN` / `ADMIN` roles.

**Do** keep platform admin in the **same git monorepo**, as a **separate deployable app**, sharing the database and entitlement logic.

### Why same repo
- One Prisma schema / one Postgres (Supabase) — already has `plan`, `Subscription`, `Payment`, etc.
- Shared TypeScript types and a shared `entitlements` module used by **both** product API and platform API.
- Single source of truth for feature keys (`chat`, `payroll`, …).

### Why separate folder + separate deploy
- Different auth, threat model, and host (`admin.*` vs `app.*`).
- Customer JWT must **never** authorize platform routes.
- You can lock down networking (IP allowlist / VPN) only on the admin service.

### Target folder layout (evolve toward this)

```text
addis-tech/   (or keep asana2-main as product root and add siblings later)
├── apps/
│   ├── web/                 # today’s React app → app.mydomain.com
│   ├── api/                 # today’s Express product API
│   ├── platform-admin/      # React UI → admin.mydomain.com
│   └── platform-api/        # Express (or same process with /platform/*) for ops only
├── packages/
│   ├── db/                  # prisma schema + client
│   ├── entitlements/        # plan defaults + resolveWorkspaceEntitlements()
│   └── shared-types/
└── apps/marketing/          # optional later → mydomain.com
```

### Practical near-term (Phase 1 without a full monorepo split)

Stay inside `asana2-main` first to move fast:

```text
asana2-main/
├── src/                     # product UI (unchanged role)
├── server/                  # product API
├── prisma/                  # shared DB (extend here)
├── packages/entitlements/   # NEW — shared feature resolution
├── platform-admin/          # NEW — Vite React app (admin UI only)
└── server/platform/         # NEW — platform routes, separate auth middleware
```

Deploy options:
- **Preferred:** two Render (or similar) services — product + platform-admin+api.
- **Acceptable early:** one API process with `/api/*` (product) and `/platform/api/*` (ops), but **two frontends** on two hostnames; platform routes reject non-staff tokens always.

**Verdict:** separate folder + shared DB/packages; not a totally separate git repo unless compliance forces it later.

---

## 2. Critical naming: two different “admins”

| Name today | Meaning | Host |
|---|---|---|
| `WorkspaceMember.role = SUPER_ADMIN` | Owns **one company workspace** | `app.*` Admin Center |
| `WorkspaceMember.role = ADMIN` | Company admin | `app.*` |
| **Platform Staff** (NEW) | Owns **the product** (all tenants) | `admin.*` |

Never reuse customer `SUPER_ADMIN` for platform access. Add something like:

- `PlatformUser` / `StaffAccount` table, or
- `User.platformRole = null | 'SUPPORT' | 'BILLING' | 'OWNER'`

Compromise of platform OWNER ≈ lose the product. Treat accordingly (Section 6).

---

## 3. What already exists in the DB (wire admin to these)

These models/fields are **already in** `prisma/schema.prisma` but largely **not enforced** in product APIs yet. Platform admin must be designed to control them **as features go live**.

| Schema piece | Current state | Platform admin control when live |
|---|---|---|
| `Workspace.plan` (`FREE` \| `STARTER` \| `BUSINESS`) | Default `FREE`; unused for gates | Change plan; see effective entitlements |
| `Workspace.status` (`ACTIVE` \| `PENDING` \| `SUSPENDED`) | Default `ACTIVE`; unused | Suspend / reinstate workspace (blocks app login/API) |
| `Workspace.billingEmail` | Unused | Edit / view |
| `Workspace.slug` | Optional | View / set vanity slug |
| `Subscription` | Model exists; no checkout flow | View status, seats, period end; mark trial; block renew; cancel |
| `Payment` (Chapa / Telebirr / SantimPay oriented) | Model exists; no webhooks | List payments; mark failed/paid manually in emergencies |
| `WorkspaceJoinRequest` | Comment: “Not used by the app yet” | Approve / reject SaaS intake requests |
| `WorkspaceMember.status` (`ACTIVE` \| `DISABLED`) | Exists | Disable user in workspace |
| `PayrollRun` / `PayrollItem` | Schema + some UI | Gate by entitlement `payroll`; support view |
| `TimeEntry` | Schema; product usage unclear | Gate by `time_tracking` when shipped |
| Chat (`Channel`, `Message`, …) | Live for all workspaces | Gate by `chat` entitlement |
| Invitations / seats | Invite works; seats on `Subscription` unused | Enforce seat limits from plan |

**Design rule:** every shippable product capability gets a stable **feature key**. Plans define defaults; platform overrides win. App and API both call `resolveEntitlements(workspaceId)` — UI hide is not enough.

---

## 4. Bare-minimum architecture (sketch)

```text
                    ┌─────────────────────┐
  mydomain.com      │  Marketing site     │  newsletter form → NewsletterSubscriber
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
  app.mydomain.com  │  Product Web        │
                    └─────────┬───────────┘
                              │ JWT (customer)
                    ┌─────────▼───────────┐
                    │  Product API        │──┐
                    │  /api/*             │  │ requireEntitlement('chat')
                    └─────────┬───────────┘  │ requireWorkspaceActive()
                              │              │
                         ┌────▼────┐         │
                         │ Postgres │◄────────┤
                         │ (shared) │         │
                         └────▲────┘         │
                              │              │
                    ┌─────────┴───────────┐  │
  admin.mydomain.com│  Platform Admin UI  │  │
                    └─────────┬───────────┘  │
                              │ Staff JWT + MFA
                    ┌─────────▼───────────┐  │
                    │  Platform API       │──┘
                    │  /platform/api/*    │  mutates plan, overrides, status
                    └─────────────────────┘  writes PlatformAuditLog
```

### Shared entitlement resolution (must live in product codebase first)

```text
Plan catalog (config or Plan table)
    + Workspace.plan / Subscription
    + WorkspaceFeatureOverride[]   (NEW)
    + promo / campaign grants      (NEW, later)
    ────────────────────────────────
    → EffectiveEntitlements {
         features: { chat, payroll, time_tracking, … },
         limits: { seats, projects, storageMb, … },
         flags: { renewBlocked, trialEndsAt, … }
      }
```

Product bootstrap should return entitlements so the app can hide nav items; **every mutating route still re-checks on the server**.

### New tables (minimum for Phase 1–2)

| Table | Purpose |
|---|---|
| `PlatformUser` | Staff accounts (email, password hash / SSO id, role, MFA secret) |
| `PlatformAuditLog` | Who changed what, before/after JSON, IP, timestamp |
| `WorkspaceFeatureOverride` | `workspaceId`, `featureKey`, `enabled`, `reason`, `expiresAt?`, `setByStaffId` |
| `PlanDefinition` (or JSON config early) | Defaults per `FREE` / `STARTER` / `BUSINESS` |
| `NewsletterSubscriber` | Marketing email list (or sync from ESP) |

Later: `Campaign`, `PromoGrant`, `SegmentSnapshot`, billing webhook event store.

---

## 5. Product app changes required (do these alongside admin)

Platform admin is useless if the app ignores plan/status.

### Phase 1 app changes (hard dependencies)
1. **`resolveEntitlements(workspaceId)`** shared helper used by API middleware.
2. **Middleware:** `requireWorkspaceNotSuspended` on authenticated product routes.
3. **Middleware:** `requireFeature('chat' | 'payroll' | …)` on feature routers.
4. **Bootstrap / `/api/auth/me`:** return `{ entitlements, workspaceStatus, plan }` so UI can hide Chat/Payroll.
5. **Seat awareness:** when inviting, compare active members vs `Subscription.seats` / plan limit.
6. **On signup:** create `Subscription` row (`FREE`, `INACTIVE` or `TRIALING`) aligned with `Workspace.plan`.
7. **Rename clarity in docs/UI:** customer “Super admin” ≠ platform staff (optional copy tweak only).

### Phase 2 app changes
8. Upgrade / billing pages on `app.*` (customer self-serve) reading same entitlement model.
9. Payment webhooks (Chapa/Telebirr/…) update `Subscription` + `Payment`; admin can override.
10. Soft limits UX (banners: “Chat not on Free — upgrade” / “Promo chat until DATE”).
11. Wire `WorkspaceJoinRequest` if marketing uses “request access” instead of open signup.

### Phase 3+ app changes
12. Usage metering for fair limits (messages/day, storage).
13. Time tracking UI gated by entitlement.
14. Export compliance / data retention hooks.

---

## 6. Security (strict) — rated by phase

Compromise of `admin.*` = loss of tenant control, billing, and feature abuse. Assume hostile internet.

### Phase 0 — before any real tenants pay (non-negotiable before production money)
| # | Control | Notes |
|---|---|---|
| S0.1 | Separate staff auth | Never accept product JWT on `/platform/*` |
| S0.2 | No public signup on admin | Seed first OWNER via CLI / env break-glass |
| S0.3 | Long random secrets | Separate `PLATFORM_JWT_SECRET` from product `JWT_SECRET` |
| S0.4 | HTTPS only + secure cookies / short-lived access tokens | Staff sessions ≤ 8h; refresh optional |
| S0.5 | Rate limit login + lockout | After N failures, cooldown |
| S0.6 | Audit log every mutation | Plan change, override, suspend, impersonate |
| S0.7 | Deploy admin on its own hostname | `admin.mydomain.com` |
| S0.8 | Env isolation | Production DB credentials not in staff laptops casually |

### Phase 1 — first internal ops use
| # | Control | Notes |
|---|---|---|
| S1.1 | **MFA mandatory** for all staff | TOTP minimum; prefer passkeys later |
| S1.2 | Role separation | `SUPPORT` (read + limited) vs `BILLING` vs `OWNER` |
| S1.3 | Step-up auth | Re-enter MFA / password for suspend, grant paid features, impersonate |
| S1.4 | IP allowlist **or** VPN | Especially early; relax only with MFA + alerts |
| S1.5 | Alerting | Email/Slack on every staff login + privilege change |
| S1.6 | Read-only support mode default | Write requires explicit role |

### Phase 2 — when billing / promos are live
| # | Control | Notes |
|---|---|---|
| S2.1 | Impersonation is timed + audited | Banner in app; auto-expire 15–30 min |
| S2.2 | Break-glass OWNER offline | Hardware key; not day-to-day |
| S2.3 | WAF / bot protection on admin login | Cloudflare etc. |
| S2.4 | Secrets in vault / hosted secret manager | Rotate JWT secrets with dual-key window |
| S2.5 | Anomaly detection | New country login, mass entitlement grants |

### Phase 3 — mature production
| # | Control | Notes |
|---|---|---|
| S3.1 | SSO (Google Workspace / Microsoft) for staff only | Disable password where possible |
| S3.2 | Passkeys / hardware WebAuthn required for OWNER | |
| S3.3 | Quarterly access review | Remove ex-employees same day |
| S3.4 | Pen test / bug bounty on admin surface | |
| S3.5 | Separate DB role for platform API | Least privilege vs product API if feasible |

---

## 7. Platform admin features — phased backlog

### Phase 1 — Bare minimum ops console (ship this first)

**Goal:** Search a workspace → see plan/status → change plan or feature override → change applies on next API call.

| Feature | Description | Depends on app change |
|---|---|---|
| Staff login | Email/password + MFA | PlatformUser |
| Workspace search | By name, id, owner email, slug | — |
| Workspace detail | Plan, status, member count, createdAt, billingEmail | — |
| Set plan | `FREE` / `STARTER` / `BUSINESS` | Entitlement resolver |
| Feature overrides | Toggle `chat`, `payroll`, … with reason + optional expiry | `requireFeature` |
| Suspend / unsuspend | Sets `Workspace.status` | Suspend middleware |
| Member list (read) | Users in workspace + roles | — |
| Disable member | `WorkspaceMember.status = DISABLED` | Auth checks membership status |
| Audit log UI | Filter by workspace / staff / action | PlatformAuditLog |
| Entitlement preview | “Effective features” after overrides | Shared resolver |

**Out of scope for Phase 1:** campaigns, newsletter CRM, full billing console, impersonation.

---

### Phase 2 — Billing, intake, support

| Feature | Description |
|---|---|
| Subscription panel | View/edit `Subscription` (status, seats, `currentPeriodEnd`, `renewBlocked`) |
| Payments list | `Payment` rows per workspace; manual reconcile |
| Join requests queue | Approve/reject `WorkspaceJoinRequest` → create workspace |
| Promo override presets | “Grant chat 30 days” button (writes override + expiry) |
| Support notes | Internal note thread on workspace |
| Basic segments export CSV | e.g. plan=FREE, created>30d, departments=0 |
| Customer impersonation (optional) | Timed, audited, MFA step-up |
| Newsletter list view | Read `NewsletterSubscriber` / ESP sync |

---

### Phase 3 — Growth & campaigns

| Feature | Description |
|---|---|
| Campaign builder | Segment → offer → feature grant / discount code |
| Automated segments | “Signed up, never created department”, “inactive 14d”, “newsletter only” |
| Email campaign hooks | Send via Resend/Postmark; don’t build full ESP |
| Usage dashboards | Seats used, messages, tasks, storage |
| Plan catalog UI | Edit limits without code deploy |
| Coupon / discount codes | Tied to payment provider |

---

### Phase 4 — Scale & automation

| Feature | Description |
|---|---|
| Global feature flags | Kill switch for chat/payroll for everyone |
| Abuse console | OTP abuse, spam workspaces, rate-limit overrides |
| Multi-staff permissions matrix | Fine-grained |
| Webhooks out | Notify Slack on suspend / large plan change |
| Data tools | GDPR export/delete workspace (legal) |
| Compose email | Free-form subject/body, DB recipients, templates, Resend send |

### Phase 4 delivered checklist (lite)
- [x] Compose / send email (`/platform/api/mail/*`) + Compose UI (paste, search, segment, templates, dry run, history)
- [x] Global feature kill-switches (`GlobalFeatureFlag`) applied last in entitlement resolution
- [x] Lite abuse console (sparse workspaces, invite-heavy, OTP/unverified, suspend shortcut)

### Phase 4 deferred (heavy)
- [ ] Multi-staff fine-grained permissions matrix
- [ ] Slack/outbound webhooks
- [ ] GDPR export/delete workspace tools
- [ ] Full rate-limit override / abuse automation

---

## 8. Suggested feature keys (catalog)

Define early; admin toggles these; unimplemented features stay `false` everywhere until product ships them.

| Key | Product area | Notes |
|---|---|---|
| `projects` | Core | Usually always on |
| `departments` | Core | |
| `chat` | Chat | Primary freemium gate candidate |
| `payroll` | Payroll | Already in schema/UI path |
| `time_tracking` | TimeEntry | Schema ready; gate when UI ships |
| `invites` | Auth | Or fold into seat limit |
| `api_access` | Future | |
| `priority_support` | Meta | Non-technical flag |
| `custom_roles` | Future | |
| `advanced_analytics` | Dashboard | |

**Limits (not booleans):** `maxSeats`, `maxProjects`, `maxStorageMb`, `maxDepartments`.

Example defaults (tune later):

| | FREE | STARTER | BUSINESS |
|---|---|---|---|
| seats | 5 | 25 | 100 |
| chat | no | yes | yes |
| payroll | no | no | yes |
| time_tracking | no | yes | yes |

Platform override: “Workspace X gets `chat=true` until DATE” even on FREE.

---

## 9. Example admin user flows

1. **Promo chat for one customer**  
   Search workspace → Feature overrides → enable `chat` → reason “Q1 promo” → expiry → Save → audit row → their app bootstrap shows Chat; API accepts chat routes.

2. **Non-paying abuser**  
   Workspace detail → Suspend → product API returns 403 `WORKSPACE_SUSPENDED` → optional email.

3. **Block renewal**  
   Subscription → `renewBlocked=true` → webhook/ cron won’t extend; status becomes `CANCELED` / `PAST_DUE` per policy.

4. **Signed up, empty workspace**  
   Phase 3 segment → export emails → campaign; or Phase 2 CSV export manually.

---

## 10. API sketch (platform)

All under `/platform/api`, staff auth only.

```text
POST   /platform/api/auth/login
POST   /platform/api/auth/mfa/verify
GET    /platform/api/workspaces?query=
GET    /platform/api/workspaces/:id
PATCH  /platform/api/workspaces/:id                 # status, plan, billingEmail
PUT    /platform/api/workspaces/:id/overrides       # feature overrides
GET    /platform/api/workspaces/:id/entitlements    # effective resolved
PATCH  /platform/api/workspaces/:id/subscription
GET    /platform/api/workspaces/:id/payments
GET    /platform/api/audit?workspaceId=
GET    /platform/api/join-requests
POST   /platform/api/join-requests/:id/approve
```

Product side (examples):

```text
GET    /api/entitlements              # for current workspace
# existing routes gain requireFeature / requireActiveWorkspace
```

---

## 11. Implementation order (summary)

| Order | Work | Owner surface |
|---|---|---|
| 1 | Entitlement package + DB overrides + plan defaults | Shared / product API |
| 2 | Gate chat (and suspend) in product API + UI hide | `app.*` |
| 3 | PlatformUser + MFA login + audit log | `admin.*` |
| 4 | Workspace search/detail/plan/override/suspend UI | `admin.*` |
| 5 | Wire Subscription on signup; seat checks | `app.*` |
| 6 | Payments provider + admin payment view | both |
| 7 | Join requests + newsletter + segments | admin + marketing |
| 8 | Campaigns / global flags / SSO | later |

---

## 12. Explicit non-goals (avoid early)

- Building platform admin inside customer Admin Center.
- Trusting UI-only feature hiding.
- Using workspace `SUPER_ADMIN` as platform god-mode.
- Full ESP / HubSpot clone in Phase 1.
- Redis/multi-region before single-region entitlements work.

---

## 13. Decisions to confirm before coding

1. **Payment rails:** Chapa / Telebirr / SantimPay first (schema-aligned) vs Stripe for intl.
2. **Open signup vs join-request approval** for new companies.
3. **Freemium chat:** off on FREE by default — yes/no?
4. **Monorepo timing:** nested `platform-admin/` now vs full `apps/` split later.
5. **Who is first platform OWNER** and how MFA is enrolled.

---

## 14. Document history

| Date | Note |
|---|---|
| 2026-09-10 | Initial plan from current `asana2-main` schema + domain strategy |
| 2026-09-10 | Phase 1 landed: entitlements, platform API + MFA, `platform-admin/` UI |
| 2026-09-11 | Phase 4 lite: compose email, global flags, abuse console; heavy security deferred |

## 15. Phase 1 — how to run locally

1. Migration already named `20260910160000_platform_admin_phase1` (applied via `npx prisma migrate deploy`).
2. Add to `.env`:
   - `PLATFORM_JWT_SECRET` (different from `JWT_SECRET`)
   - `PLATFORM_OWNER_EMAIL` / `PLATFORM_OWNER_PASSWORD` (min 12 chars) for seeding
3. Seed staff: `npm run seed:platform-owner`
4. Start API (port 3001) as usual + product Vite (3000).
5. Start platform UI: `npm run dev:platform-admin` → http://127.0.0.1:3010
6. First login forces MFA enrollment (TOTP). Then search workspaces → set plan / overrides / suspend.

**Note:** FREE plan has `chat: false` by default. Use platform overrides or set plan to STARTER to restore chat for a workspace.

### Phase 1 delivered checklist
- [x] `PlatformUser`, `PlatformAuditLog`, `WorkspaceFeatureOverride`, `Subscription.renewBlocked`
- [x] Entitlement catalog + `resolveEntitlements` + API gates (suspend + chat feature)
- [x] `/api/entitlements` + `/me` includes entitlements; sidebar hides chat/payroll
- [x] Seat limit on invite; Free `Subscription` on workspace create
- [x] `/platform/api/*` staff auth + MFA + workspace ops + audit
- [x] `platform-admin/` Vite console (login, search, plan, overrides, members, audit)

### Phase 2 delivered checklist
- [x] Subscription panel (status, seats, period end, renewBlocked)
- [x] Payments list + manual record/reconcile
- [x] Join requests queue + public `POST /api/join-requests`
- [x] Promo preset: grant chat 30 days (+ generic grant-feature)
- [x] Support notes on workspace
- [x] Segment CSV export (free_empty, signed_up_no_department, newsletter)
- [x] Impersonation (30m, MFA step-up, product `/#/impersonate`)
- [x] Newsletter list + public `POST /api/newsletter/subscribe`
- [x] Soft upgrade banner on Free (no chat)

### Phase 3 delivered checklist
- [x] Campaign builder (segment → feature/coupon/email) + dry run / run
- [x] Segments: free_empty, signed_up_no_department, newsletter, inactive_14d
- [x] Email campaign hooks via existing SMTP / Ethereal
- [x] Usage overview + per-workspace usage meters
- [x] Plan catalog UI (DB-backed, OWNER editable, no redeploy)
- [x] Coupons (create / enable / disable)

### Phase 4 delivered checklist (lite)
- [x] Compose / send email (`/platform/api/mail/*`) + Compose UI (paste, search, segment, templates, dry run, history)
- [x] Global feature kill-switches (`GlobalFeatureFlag`) applied last in entitlement resolution
- [x] Lite abuse console (sparse workspaces, invite-heavy, OTP/unverified, suspend shortcut)

### Phase 4 deferred (heavy)
- [ ] Multi-staff fine-grained permissions matrix
- [ ] Slack/outbound webhooks
- [ ] GDPR export/delete workspace tools
- [ ] Full rate-limit override / abuse automation
