# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Admissions staff** (counsellors, admins, managers) at Centurion University of Technology and Management (CUTM), Andhra Pradesh campuses. They work leads and applications all day: calling, scheduling follow-ups, moving leads through stages, tracking documents and payments.
- **Applicants and students** using the public `/apply` page, student portal, status check and document upload. They come occasionally, often on a phone.

Staff and applicant experiences matter equally.

## Product Purpose

CCRM is the admissions CRM for CUTM: lead capture (public inquiry form, bulk import, campaigns), lead assignment, follow-up reminders and scheduling, a pipeline board, application and document tracking, payments and seat confirmation, calendar and reporting. Success: no enquiry is dropped, and staff finish routine tasks in few steps.

## Positioning

A CRM built for one university's admissions cycle (CUEE 2026), with the whole journey from first enquiry to seat confirmation in one place, rather than a generic sales CRM.

## Operating Context

Staff sign in with official university Google accounts only (cutm.ac.in, cutmap.ac.in). The app runs as a Vite + React SPA with an Express/Postgres backend. Staff use desktop and increasingly phones. Pages such as the lead board and lead record are designed to fit one screen with inner scrolling only.

## Capabilities and Constraints

- All existing functionality must keep working; redesign changes presentation, not behaviour.
- JavaScript React 18 + Tailwind 3, no TypeScript, no shadcn.
- Must be responsive down to 390px with no horizontal page overflow.
- Performance matters: routes are lazy-loaded; avoid heavy animation on app screens.
- Languages for lead assignment include English, Hindi, Odia, Telugu.
- Known gap (not design): the Google login endpoint does not yet verify the ID token server-side.

## Brand Commitments

- Name: Centurion University of Technology and Management (CUTM).
- Logo: the supplied transparent emblem at `ccrm/public/logo.png` (and emblem PNGs), used exactly as given.
- Tagline in use: "Every enquiry, followed through."
- Current theme "Lagoon Gold" (teal #02677f, gold #ffb500, square corners) is in use, but the palette is open to change; logo and name are fixed.

## Evidence on Hand

- Campus photography in `ccrm/public/landing/images/` (low resolution, mostly ≤860px wide) and the Centurion gate photo in `ccrm/public/parallax/`.
- No testimonials, rankings beyond those already on the public page (NAAC A+, 100+ programmes, 4 campuses), or higher-resolution campus photos supplied yet.

## Product Principles

1. Every enquiry gets followed through: reminders, schedules and status are always visible where the work happens.
2. Staff speed beats decoration: fewer clicks, scannable lists, readable type.
3. One system across staff app and public pages, recognisably CUTM.
4. Works on a phone as a first-class surface, not a squeezed desktop.
5. Never fabricate proof; use real content and state absences.

## Accessibility & Inclusion

Text must be comfortably readable (the TL flagged small type; base sizes were raised). Respect reduced-motion. No product-specific standard beyond sensible contrast and touch-target sizes was stated.
