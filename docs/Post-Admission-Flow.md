# Post-Admission Flow — Email Verification → Documents → Semester Fee → ERP

## What was asked for

Once a lead is interested and the application (basic) fee is paid:

1. Student's email must be verified via OTP.
2. On successful verification, student gets an email with a **unique link** to upload all required documents.
3. Counsellor/Admin verifies the documents.
4. Student pays the **1st semester fee** (distinct from the application fee).
5. On semester-fee payment, student gets **ERP access** — until then they're identified only by lead ID / admission number.

## How it's implemented

| Step | Trigger | What happens |
|---|---|---|
| Application fee approved | Admin clicks **Approve** on Payments | Admission letter auto-sends (existing) **+ new:** a 6-digit email OTP is generated and emailed, valid 30 min |
| Email OTP verify | Student visits `/verify-email/:appNo`, enters OTP | `applications.email_verified = true`; system finds the matching lead and re-uses the existing (previously orphaned — see note) document-link infrastructure to generate a token, emails the student a **unique upload link**: `/document-upload/:token` |
| Document upload | Student visits the emailed link (no login) | Uploads each required doc by type; saved as `Pending` in the Documents module, same as every other upload path |
| Document verification | Counsellor/Admin reviews in Documents tab | Unchanged — existing Verify/Reject flow |
| Semester fee unlock | Admin/Manager clicks **Unlock Semester Fee** on the application | `applications.semester_fee_status: Locked → Pending` |
| Semester fee payment | Same Razorpay/offline flow as the application fee, now targeting a second `payments` row (`fee_type = 'Semester'`) | `Pending → Payment Done → Paid` on Approve |
| ERP access | Semester fee approved | `applications.erp_access_granted = true`; student emailed and told to use their **Admission Number** as their ERP login ID until a permanent Student ID is issued |

## Note on the "unique link"

The document-upload **token system already existed** in the backend (`document_links` table, `/api/document-upload/:token` routes) but had **no frontend page** — the existing "Share Upload Link" button on the Student File was silently copying a dead URL to the clipboard. This build fixes that gap (`DocumentUpload.jsx`) rather than building a parallel system, so both the manual share-link button and the new automatic email now point to a working page.

## What's intentionally out of scope

- **No real ERP/LMS exists** in this codebase (confirmed in the earlier gap analysis). "ERP access granted" is a tracked status + notification email, not an account provisioning call into a real system — that integration is a separate, later build once there's an actual ERP to call.
- **No fee-structure config** — the ₹45,000 semester-fee default is hardcoded the same way the ₹25,000 application fee already was; a real fee-structure table is part of the "Fee & Payment" gap already flagged, not re-solved here.
- Document verification still requires a human counsellor decision — there's no auto-detection of "all 10 required docs verified" that auto-unlocks the semester fee; an Admin/Manager clicks Unlock deliberately.

## Files touched

- `server/db.js` — new columns on `applications` (email verification, semester fee status, ERP access) and `payments` (`fee_type`)
- `server/index.js` — OTP send/verify/resend, semester-fee unlock/generate, ERP-access grant, payment-approval branching by fee type, document-upload route now records the real doc type
- `ccrm/src/pages/VerifyEmail.jsx` — new public OTP-entry page
- `ccrm/src/pages/DocumentUpload.jsx` — new public token-based upload page (fixes the previously dead link)
- `ccrm/src/pages/ApplicationDetails.jsx` — new "Post-Admission" panel (email status, unlock/pay semester fee, ERP badge)
- `ccrm/src/context/CcrmContext.jsx` — `generatePaymentLink` now accepts an optional `paymentId` so it can target the semester-fee row specifically
- `ccrm/src/App.jsx` — two new public routes
