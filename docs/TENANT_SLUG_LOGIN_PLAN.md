# Implementation Plan: Per-Tenant URL Slug + Branding on Login

## Goal

Today every tenant shares one URL (`crm.cutmap.ac.in`) and one hardcoded
"Centurion University" login screen. We want:

- `crm.cutmap.ac.in` (no slug) → keeps working exactly as today (Centurion).
- `crm.cutmap.ac.in/<slug>` (e.g. `/cuedu`) → shows **that tenant's own**
  name/logo on the login screen, not Centurion's.
- After login, each tenant's dashboard already shows only their own data —
  this mostly works today and just needs two hardcoded strings/lists fixed
  (see Phase 3).

## What already exists (do not rebuild this)

The multi-tenant backend is already in place. Confirmed in the codebase:

- `tenants` table has `slug`, `branding` (JSONB), `entities` (JSONB),
  `stages` (JSONB), `custom_domain` — `server/db.js:762-861`.
- Every request resolves `req.tenantId` via middleware (custom domain → JWT
  → default Centurion) — `server/index.js:47-77`.
- Core data routes (`/api/leads`, `/api/applications`,
  `/api/dashboard/stats`, 29 tables total) already filter by
  `tenant_id = req.tenantId` — e.g. `server/index.js:854`, `:1404-1406`,
  `:2282-2296`. No cross-tenant data leak found in sampled routes.
- A **public, unauthenticated** endpoint already returns a tenant's
  branding/entities/stages by slug:
  `GET /api/tenant/public?slug=<slug>` — `server/index.js:3263-3271`.
  (Currently accepts `?slug=` query param or subdomain — not a URL path
  segment yet.)
- Post-login, `Sidebar.jsx` and `LeadManager.jsx` already read
  `tenantConfig.branding` / `.entities` / `.stages` from context
  (`CcrmContext.jsx:258-269`) and render tenant-specific nav/entities/stage
  filters. A tenant created via Platform Admin already gets a correctly
  scoped dashboard once logged in — **except** for two hardcoded spots
  listed in Phase 3.
- Platform Admin can already create tenants with a unique `slug`
  (`POST /api/platform/tenants`, UI in `PlatformTenants.jsx`) — CU EDU
  (`slug: cuedu`) was created this way.

## What's actually missing

1. No URL path (`/cuedu`) resolves to a slug today — only `?slug=` query
   param or subdomain.
2. `Login.jsx` never calls the tenant branding API at all — org name and
   logo are hardcoded (`ccrm/src/pages/Login.jsx:14`, `:221`, `:300`).
3. `Navbar.jsx` hardcodes "Centurion University..." as literal text
   (`ccrm/src/components/Navbar.jsx:52`, `:65`) instead of reading
   `tenantConfig.branding`.
4. `Dashboard.jsx` hardcodes a stage list (`ALL_STAGES`, line 7) and a
   `cutm`/`cutmap` domain-breakdown panel (lines 14, 175-176, 231) that's
   Centurion-specific and will be empty/meaningless for other tenants.

---

## Phase 1 — Route: `/<slug>` reaches a branded login page

**Frontend (`ccrm/src/App.jsx`)**
- Add a route: `<Route path="/:tenantSlug/login" element={<Login />} />` in
  addition to the existing plain `/login` route (`App.jsx:83-86`). Keep the
  existing `/login` untouched so Centurion's current bookmarks/links don't
  break.
- In `Login.jsx`, read `tenantSlug` via `useParams()`. If present, call
  `GET /api/tenant/public?slug=<tenantSlug>` on mount; if absent, either
  skip the call (fall back to today's hardcoded/env branding) or default
  to `slug=centurion` for consistency — team's call, but recommend calling
  it either way so both paths render from the same data source long-term.

**Backend**
- No change needed — `GET /api/tenant/public?slug=` already exists and is
  public (`server/index.js:3263-3271`). Just confirm it 404s or falls back
  sanely for an unknown/suspended slug (currently falls back to Centurion
  — team should decide if an unknown slug should instead show a
  "tenant not found" page rather than silently showing Centurion's
  branding under someone else's URL).

**Acceptance check:** visiting `crm.cutmap.ac.in/cuedu/login` shows a
different logo/org name than `crm.cutmap.ac.in/login`, without any change
in login behavior itself.

## Phase 2 — Wire branding into Login.jsx and Navbar.jsx

**`ccrm/src/pages/Login.jsx`**
- Replace `ORG_NAME` (line 14) and both hardcoded `<img src="https://cutmap.ac.in/...">`
  blocks (lines 221, 300) with values from the fetched tenant config
  (`branding.name`, `branding.logoUrl`), falling back to the current
  Centurion values when no slug/branding is available. Mirror the fallback
  pattern already used in `Sidebar.jsx:68,102-108`.

**`ccrm/src/components/Navbar.jsx`**
- Replace the two hardcoded "Centurion University..." strings
  (lines 52, 65) with `tenantConfig.branding.name` /
  `tenantConfig.branding.shortName`, pulled from `useCcrm()` context
  (already populated app-wide by `CcrmContext.jsx:258-269` — no new fetch
  needed here, just stop hardcoding).

**Acceptance check:** a CU EDU user, once logged in, sees "CU EDU" (or
whatever name/logo was set in Org Settings) in the top navbar instead of
"Centurion University."

## Phase 3 — De-hardcode the Dashboard

**`ccrm/src/pages/Dashboard.jsx`**
- Replace the static `ALL_STAGES` array (line 7) with
  `tenantConfig.stages`, same pattern already used in
  `LeadManager.jsx:654-655`.
- The `cutm`/`cutmap` domain-breakdown panel (lines 14, 175-176, 231,
  backed by `server/index.js:2361-2368`'s `CASE WHEN email ILIKE
  '%@cutmap.ac.in'...` bucket query) is Centurion-specific business logic,
  not a generic feature. Team should either:
  (a) hide this panel entirely for tenants whose `entities` config doesn't
      define CUTM/CUTMAP-style sub-brands, or
  (b) generalize it to bucket by the tenant's own `entities` list instead
      of a hardcoded email-domain check.
  Recommend (a) for this pass — cheaper, and (b) can be a follow-up if a
  tenant actually needs multi-brand-within-one-tenant reporting.

**Acceptance check:** CU EDU's dashboard stage-summary matrix reflects
CU EDU's own stage names (set in Org Settings), and no empty/irrelevant
"CUTM vs CUTMAP" panel appears for them.

## Phase 4 (optional hardening) — Cross-tenant login mismatch check

Right now, login is resolved purely by the user's own `tenant_id` column,
regardless of which slug's URL they typed the password into
(`server/index.js:559-606`). This means a Centurion user who happens to
visit `/cuedu/login` and enters valid Centurion credentials will still log
in successfully as a Centurion user — just momentarily looking at a
CU EDU-branded form.

This isn't a data leak (queries are still scoped by the *user's real*
`tenant_id`, not the URL), but it can be confusing. Optional improvement:
after login, compare the resolved `user.tenant_id` against the tenant the
slug in the URL points to; if they don't match, show a message like
"This account isn't part of CU EDU — redirecting to your own portal"
instead of silently proceeding. Low priority; ship Phases 1-3 first and
gauge if this confusion actually comes up.

## Explicitly out of scope for this pass

- Wildcard DNS / subdomain routing (`cuedu.crm.cutmap.ac.in`) — bigger
  infra lift (DNS + SSL), not needed since path-based `/cuedu` achieves
  the same visible outcome without new infrastructure.
- Persisting `/​<slug>​/*` in every authenticated route (e.g.
  `/cuedu/leads`, `/cuedu/dashboard`). Not needed for correctness — the
  JWT alone already determines tenant scope after login regardless of
  URL — and would require restructuring every route in `App.jsx` plus
  every internal `navigate()`/`<Link>` call. Only take this on if there's
  a specific reason (e.g. wanting the tenant visible in the URL at all
  times for support/bookmarking purposes).

## Suggested order of work

1. Phase 1 (routing + API wiring) — unlocks visible progress fastest.
2. Phase 2 (Login + Navbar branding) — the actual user-visible ask.
3. Phase 3 (Dashboard de-hardcoding) — prevents a broken-looking dashboard
   for CU EDU and any future tenant.
4. Phase 4 — only if cross-tenant login confusion turns out to matter in
   practice.

Each phase is independently shippable and testable; none require a DB
migration (all needed columns already exist).
