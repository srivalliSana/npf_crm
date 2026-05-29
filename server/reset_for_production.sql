-- ============================================================================
-- CCRM — RESET FOR PRODUCTION
-- ============================================================================
-- Wipes all operational/test data while KEEPING:
--   • users (all logins / counsellors / admins)
--   • integration_settings (SMTP, SMS, WhatsApp, Razorpay, etc.)
--   • admission_targets (configured KPI targets)
--
-- Run on production server with:
--   sudo -u postgres psql ccrm_db -f /var/www/ccrm/server/reset_for_production.sql
-- OR
--   psql -U ccrm_user -d ccrm_db -f /opt/npf_crm/server/reset_for_production.sql
-- ============================================================================

BEGIN;

-- Operational data — wipe in dependency order
TRUNCATE TABLE email_logs            RESTART IDENTITY CASCADE;
TRUNCATE TABLE email_campaigns       RESTART IDENTITY CASCADE;
TRUNCATE TABLE whatsapp_logs         RESTART IDENTITY CASCADE;
TRUNCATE TABLE call_logs             RESTART IDENTITY CASCADE;
TRUNCATE TABLE drip_sequences        RESTART IDENTITY CASCADE;
TRUNCATE TABLE documents             RESTART IDENTITY CASCADE;
TRUNCATE TABLE queries               RESTART IDENTITY CASCADE;
TRUNCATE TABLE tasks                 RESTART IDENTITY CASCADE;
TRUNCATE TABLE events                RESTART IDENTITY CASCADE;
TRUNCATE TABLE notifications         RESTART IDENTITY CASCADE;
TRUNCATE TABLE payments              RESTART IDENTITY CASCADE;
TRUNCATE TABLE applications          RESTART IDENTITY CASCADE;
TRUNCATE TABLE leads                 RESTART IDENTITY CASCADE;

-- Reset application-number sequence so CUEEAP260001 starts fresh
SELECT setval('cueeap_seq', 1, false);

-- Reset round-robin counters but keep counsellor rows
UPDATE lead_assignment_counter SET assignment_count = 0, last_assigned = NULL;

-- Tables we EXPLICITLY KEEP (no TRUNCATE):
--   users               — all logins preserved
--   integration_settings — SMTP/SMS/WhatsApp/Razorpay credentials kept
--   admission_targets    — KPI targets kept

COMMIT;

-- Confirmation report
SELECT
  (SELECT COUNT(*) FROM leads)                    AS leads,
  (SELECT COUNT(*) FROM applications)              AS applications,
  (SELECT COUNT(*) FROM payments)                  AS payments,
  (SELECT COUNT(*) FROM email_campaigns)           AS campaigns,
  (SELECT COUNT(*) FROM email_logs)                AS email_logs,
  (SELECT COUNT(*) FROM call_logs)                 AS call_logs,
  (SELECT COUNT(*) FROM whatsapp_logs)             AS whatsapp_logs,
  (SELECT COUNT(*) FROM users)                     AS users_kept,
  (SELECT COUNT(*) FROM integration_settings)      AS integrations_kept;
