# CCRM → Multi-Tenant SaaS — Implementation Plan

Goal: turn the single-tenant CCRM (built for Centurion) into a multi-tenant SaaS that
serves many independent organizations from one codebase + one database, with strict
data isolation. Target: 2 orgs now, 10+ within a year.

**All work happens on the `saas-multitenant` branch. `main` (live Centurion) is untouched
until we cut over.**

## Tenancy model
**Shared database + `tenant_id` on every row** (row-level isolation, query-enforced).
- Cheapest to operate, scales to hundreds of tenants.
- Promote a heavy/enterprise tenant to its own DB later if needed.
- The cardinal rule: **every query is scoped by `tenant_id`**. One missed scope = a
  cross-tenant data leak. We enforce this through a single data-access layer, not ad-hoc SQL.

## Tenant resolution
- Each tenant has a **subdomain** (`acme.crm.app`) and/or is identified by the logged-in
  user's tenant.
- `tenant_id` is a **JWT claim** (set at login). Middleware sets `req.tenantId` from the JWT
  (and validates it matches the host's tenant where applicable).
- A tenant-scoping query helper injects `tenant_id` so route code can't forget it.

---

## Phases

### Phase 0 — Design (this doc) ✅

### Phase 1 — Tenant foundation (additive, safe)
- `tenants` table: `id, name, slug/subdomain, status, plan, created_at`.
- Seed a default **"centurion"** tenant (id 1); backfill all existing rows to it.
- Add `tenant_id` to every data table (default 1): `users, leads, applications, payments,
  documents, notifications, integration_settings, lead_transfers, tasks, events,
  rcs_templates, rcs_messages, upload_logs, lead_assignment_counter, esse_leads,
  ftl_leads, gtib_leads, gttech_leads, social_comments, drip_sequences, email_campaigns`,
  + indexes on `tenant_id`.
- Auth: add `tenant_id` to the login JWT; `tenantMiddleware` sets `req.tenantId`
  (defaults to 1 for backward-compat so nothing breaks during the transition).
- A `scoped(tenantId)` query helper / and/or a convention `WHERE tenant_id = $`.
- **Nothing changes behaviourally yet** — columns default to tenant 1.

### Phase 2 — Scope every query (the bulk of the work, highest risk)
- Add `AND tenant_id = $tenant` to **every** SELECT/UPDATE/DELETE, and `tenant_id`
  to every INSERT, across `server/index.js` + `server/db.js` + webhook handlers.
- Centralize via a helper so it's consistent; add a lint/test that flags raw `FROM leads`
  without a tenant scope.
- **`integration_settings` must become per-tenant** (it's currently one global table —
  each tenant needs their own SMTP/Meta/RCS/Razorpay/Sheets). `getIntegrationSetting(key)`
  → `getIntegrationSetting(tenantId, key)`.
- Webhooks become **per-tenant**: `/api/webhooks/meta/:tenantSlug`, etc., so an inbound
  Meta/Google/GT-form lead lands in the right tenant. Verify tokens per tenant.

### Phase 3 — De-hardcode the org (config, not code)
- **Branding** per tenant: name, logo, colors, login page, the cutm.ac.in landing/links.
- **Entities/pipeline** per tenant: today CUTM/CUTMAP/FTL/GTIB/GTTECH/ESSE + the lead
  stages are hardcoded. Move to per-tenant config (each org defines its own entities +
  stage list). Tables: `tenant_entities`, `tenant_stages` (or JSON on `tenants`).
- **Auth** per tenant: allowed Google login domains per tenant (currently cutm/cutmap
  hardcoded); invite flow.
- Allowed-domain + branding drive the login screen by subdomain.

### Phase 4 — Onboarding & platform admin
- Self-serve (or admin-created) **tenant signup** → creates tenant + first **Super Admin**
  + default entities/stages.
- A **platform super-admin** console (above tenant super-admins) to create/suspend
  tenants and view usage. (Distinct from the per-tenant Super Admin flag we already have.)
- Subdomain provisioning + routing (wildcard DNS + host→tenant resolution).

### Phase 5 — Billing & limits
- Plans + subscription (Razorpay/Stripe), per-plan limits (max leads/users/SMS/email),
  usage metering, trials, expiry/suspension, invoices.

### Phase 6 — Hardening & ops (prerequisite for go-live)
- **Close the security gaps** (the open data endpoints + secrets) — mandatory before a
  second external org's data is on the system. Per-tenant a leak is a breach.
- Move secrets to env / per-tenant encrypted storage (not the plaintext settings table).
- Fix the deploy model (single canonical deploy + CI), per-tenant backups, monitoring,
  rate limiting, connection pooling.

---

## Hard rules / risks
1. **Query scoping is everything.** Enforce via one helper; never hand-write unscoped SQL.
2. **integration_settings + webhooks are currently global** — must go per-tenant or
   tenants will share credentials / leads route to the wrong org.
3. **De-hardcoding CUTM/CUTMAP/GT** touches dashboard, sidebar, lead manager, webhooks.
4. Security debt (open endpoints) must clear before go-live.

## Cutover
- Build + test on `saas-multitenant` with Centurion as tenant 1 + a test tenant 2.
- When green, merge to `main` and migrate; Centurion users see no change (they're tenant 1).
