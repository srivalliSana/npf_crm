# Automated Daily Reporting & Backup System

## What Was Implemented

### 1. **Daily Productivity Email Report (3:00 AM IST)**
- **Schedule:** Every day at 3:00 AM India Standard Time (Asia/Kolkata)
- **What it sends:** HTML-formatted email with:
  - KPI Summary (Total Leads, Untouched, Interested, Process for Pay, Applications, Revenue)
  - Counselor-wise breakdown table
  - Sender: SMTP credentials configured in Integrations
  - Recipients: Configurable via Settings → Integrations (comma-separated emails)

### 2. **Daily S3 Backup (3:00 AM IST)**
- **Schedule:** Immediately after email (same 3:00 AM IST cron job)
- **What gets backed up:**
  - `db.sql.gz` — Full PostgreSQL database dump
  - `uploads.tar.gz` — All uploaded files (documents, avatars, etc.)
  - `server.log.gz` — Last 24 hours of server logs
- **Storage:** AWS S3 in date-stamped folders: `backups/2026-06-02/`
- **Credentials:** AWS Access Key, Secret, Bucket, Region configured via Settings

### 3. **Configuration UI**
**Settings → Integrations page now includes:**

#### S3 Backup Card
- AWS Access Key ID
- AWS Secret Access Key
- S3 Bucket Name
- AWS Region (default: ap-south-1 for Mumbai)

#### Daily Email Reports Card
- Email Recipients field (textarea for comma-separated emails)
- Examples: `admin@cutm.ac.in, manager@cutm.ac.in`

### 4. **Testing Endpoint**
- **Endpoint:** `POST /api/admin/test-daily-report`
- **Auth:** Admin only
- **Triggers:** Both email and backup immediately (for testing without waiting till 3am)

---

## How to Use

### Step 1: Configure SMTP (if not already done)
Go to Settings → Integrations → Gmail / SMTP Email and enter:
- SMTP Host (smtp.gmail.com)
- SMTP Port (587)
- Gmail Address
- App Password
- From Name

### Step 2: Configure Daily Email Recipients
Settings → Integrations → Daily Email Reports
- Enter comma-separated email addresses
- Save

### Step 3: Configure S3 Backup
Settings → Integrations → AWS S3 Backup
- Enter AWS Access Key ID
- Enter AWS Secret Access Key
- Enter S3 Bucket Name
- Enter AWS Region (ap-south-1 for Mumbai)
- Save

### Step 4: Test (Optional)
To verify emails and backups are working:
```bash
curl -X POST http://localhost:3001/api/admin/test-daily-report \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json"
```

Or use the browser console:
```javascript
fetch('/api/admin/test-daily-report', { method: 'POST' })
  .then(r => r.json())
  .then(console.log)
```

---

## Backend Files Modified

### server/package.json
- Added `node-cron@^3.0.3` — for scheduling cron jobs
- Added `@aws-sdk/client-s3@^3.600.0` — for S3 upload

### server/index.js
- Added `import cron from 'node-cron'`
- Added `import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'`
- Added `import { promisify } from 'util'` and `import { exec } from 'child_process'`

**New Functions:**
1. `sendProductivityEmailReport()` — Fetches counselor stats and emails them
2. `performS3Backup()` — Dumps DB, tars uploads, zips logs, uploads to S3

**Cron Job:**
- Scheduled at 3:00 AM IST (0 3 * * * in Asia/Kolkata timezone)
- Calls both functions sequentially

**Test Endpoint:**
- `POST /api/admin/test-daily-report` — Admin-only endpoint for manual triggering

---

## Frontend Files Modified

### ccrm/src/pages/Integrations.jsx
- Added Cloud icon import
- Added two new integration definitions:
  - **s3backup:** AWS S3 Backup configuration
  - **reporting:** Daily Email Reports configuration
- Added category colors for Backup and Reporting
- Updated field rendering to support `textarea` fields for multi-line input

---

## Logs to Monitor

After deployment, check server logs:
```bash
sudo journalctl -u ccrm-backend -f
```

Look for:
- `[Cron] Starting 3am daily tasks...` — Job started
- `[Cron] Email report sent to X recipient(s)` — Email succeeded
- `[Backup] S3 backup complete: ...` — Backup succeeded
- `[Cron] Email report failed:` — Email error
- `[Backup] S3 backup failed:` — Backup error

---

## Deployment Checklist

1. ✅ Run `npm install` in `/var/www/ccrm/server`
2. ✅ Run `npm run build` in `/var/www/ccrm/ccrm` (if on local machine)
3. ✅ Copy updated files to production server
4. ✅ Restart backend: `sudo systemctl restart ccrm-backend`
5. ⬜ Configure S3 credentials in Settings UI
6. ⬜ Configure email recipients in Settings UI
7. ⬜ Test via `POST /api/admin/test-daily-report`
8. ⬜ Check logs: `sudo journalctl -u ccrm-backend -f`
9. ⬜ Verify S3 bucket has backups/YYYY-MM-DD/ folders
10. ⬜ Check email inbox for report

---

## Notes

- **Timezone:** All cron jobs run in Asia/Kolkata (IST) timezone. Adjust if needed.
- **Database:** Backup uses `pg_dump -U ccrm_user ccrm_db`. Adjust if DB credentials differ.
- **S3 Permissions:** AWS IAM user needs `s3:PutObject` permission on the bucket
- **Email:** Requires SMTP to be configured first
- **Frequency:** Daily at 3:00 AM IST. To change time, modify the cron expression in `startServer()`
- **Retention:** Backups are stored in S3 with date-stamped paths. Implement lifecycle policies in S3 if you want automatic deletion after N days.
