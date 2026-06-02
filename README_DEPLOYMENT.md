# 🚀 Automated Daily Reporting & S3 Backup Deployment

## What's New

Your CCRM now has:
- ✅ **Daily Productivity Email Report** — Sent automatically at 3:00 AM IST with counselor-wise stats
- ✅ **Daily S3 Backup** — Database, uploads, and logs backed up to AWS S3 at 3:00 AM IST
- ✅ **Admin Configuration UI** — All settings configurable via Settings → Integrations page
- ✅ **Test Endpoint** — Manually trigger email and backup without waiting till 3am

---

## Quick Start (Production Deployment)

### Step 1: Deploy Code to Server
**On your production server, run:**
```bash
cd /path/to/npf_crm
bash DEPLOY.sh
```

This will:
- Pull latest code from GitHub
- Install dependencies
- Build React frontend
- Restart the backend service

**Or manually:**
```bash
git pull origin main
cd server && npm install && cd ..
cd ccrm && npm run build && cd ..
sudo systemctl restart ccrm-backend
```

### Step 2: Configure Settings
1. **Open** https://crm.cutmap.ac.in
2. **Login** as Admin
3. **Go to** Settings → Integrations

#### Configure AWS S3 Backup:
```
- AWS Access Key ID: [from AWS IAM]
- AWS Secret Access Key: [from AWS IAM]
- S3 Bucket Name: cutm-ccrm-backups (or your bucket)
- AWS Region: ap-south-1
```
Click **Save**

#### Configure Daily Email Reports:
```
- Email Recipients: admin@cutm.ac.in, manager@cutm.ac.in, director@cutm.ac.in
```
Click **Save**

### Step 3: Test (Optional)
**Test manually without waiting till 3am:**

**Via Browser Console:**
```javascript
fetch('/api/admin/test-daily-report', {method: 'POST'})
  .then(r => r.json())
  .then(console.log)
```

**Via curl:**
```bash
curl -X POST https://crm.cutmap.ac.in/api/admin/test-daily-report \
  -H "Authorization: Bearer <admin_token>"
```

---

## Files Changed

| File | Changes |
|------|---------|
| `server/package.json` | Added `node-cron` & `@aws-sdk/client-s3` |
| `server/index.js` | Added cron jobs, email, & backup functions |
| `ccrm/src/pages/Integrations.jsx` | Added S3 & Email Reports config cards |
| `DEPLOY.sh` | Automated deployment script |
| `DEPLOYMENT_STEPS.txt` | Detailed deployment instructions |
| `AUTOMATED_REPORTING_SETUP.md` | Technical documentation |

---

## How It Works

### Daily Productivity Email (3:00 AM IST)
1. **Trigger:** Runs automatically every day at 3:00 AM India Standard Time
2. **Data:** Fetches KPI summary + per-counselor stats from database
3. **Format:** HTML email with styled table
4. **Recipients:** Configured in Settings → Daily Email Reports
5. **Requirements:** SMTP must be configured first (Settings → Gmail / SMTP Email)

### Daily S3 Backup (3:00 AM IST)
1. **Trigger:** Runs immediately after email (same 3:00 AM IST)
2. **What's backed up:**
   - `db.sql.gz` — Full PostgreSQL database
   - `uploads.tar.gz` — All uploaded files
   - `server.log.gz` — Last 24 hours of logs
3. **Location:** S3 bucket → `backups/YYYY-MM-DD/`
4. **Requirements:** AWS credentials must be configured in Settings → AWS S3 Backup

---

## Configuration Details

### SMTP (for Email)
**Required before emails can be sent**

Settings → Integrations → Gmail / SMTP Email
```
SMTP Host:  smtp.gmail.com
SMTP Port:  587
Email:      noreply@cutm.ac.in (or your Gmail)
Password:   Your 16-char Google App Password
From Name:  CUTM Admissions
```

### AWS S3
**Required for database backups**

Create an AWS IAM user with:
```
Policy: s3:PutObject on your bucket
Access Key ID: [copy to Settings]
Secret Access Key: [copy to Settings]
Bucket: cutm-ccrm-backups (or create one)
Region: ap-south-1 (Mumbai)
```

### Email Recipients
**Comma-separated list of who receives the daily report**

Settings → Integrations → Daily Email Reports
```
admin@cutm.ac.in, manager@cutm.ac.in, director@cutm.ac.in
```

---

## Monitoring & Logs

### Watch Logs in Real-Time
```bash
sudo journalctl -u ccrm-backend -f
```

### Look for These Messages
```
✓ [Cron] Starting 3am daily tasks...
✓ [Cron] Email report sent to 3 recipient(s)
✓ [Backup] S3 backup complete: backups/2026-06-02/

✗ [Cron] Email report failed: ...
✗ [Backup] S3 backup failed: ...
```

### Check Last Backup Timestamp
In database:
```sql
SELECT * FROM integration_settings 
WHERE key = 's3_last_backup_at';
```

---

## Troubleshooting

### "Email not sending"
- ✓ Is SMTP configured? (Settings → Gmail / SMTP Email)
- ✓ Is email recipients list filled? (Settings → Daily Email Reports)
- ✓ Are there any errors in logs? (`sudo journalctl -u ccrm-backend`)

### "S3 backup failing"
- ✓ Are AWS credentials filled correctly? (Settings → AWS S3 Backup)
- ✓ Does AWS user have s3:PutObject permission?
- ✓ Does the S3 bucket exist and is the region correct?
- ✓ Check logs for exact error

### "Cron job not running"
- ✓ Is server timezone set to Asia/Kolkata?
  ```bash
  timedatectl
  ```
- ✓ Is the backend service running?
  ```bash
  sudo systemctl status ccrm-backend
  ```
- ✓ Test manually with `/api/admin/test-daily-report` endpoint

### "Service failed to start after deployment"
- ✓ Check logs: `sudo journalctl -u ccrm-backend -n 50`
- ✓ Verify npm install: `ls -la /var/www/ccrm/server/node_modules/`
- ✓ Verify files were copied: `ls -la /var/www/ccrm/server/index.js`

---

## API Endpoints

### Test Endpoint (Admin Only)
```
POST /api/admin/test-daily-report

Response:
{
  "status": "Email and backup triggered successfully"
}
```

### Get Integration Settings
```
GET /api/integration-settings

Returns all configured integrations (credentials masked)
```

### Save Integration Settings
```
POST /api/integrations
Body:
{
  "key": "report_email_recipients",
  "value": "admin@cutm.ac.in, manager@cutm.ac.in"
}
```

---

## Schedule Changes

### Change Backup Time
Edit `server/index.js` line ~4336:
```javascript
// Current: 3:00 AM IST
cron.schedule('0 3 * * *', async () => {
  // 0 3 = 3:00 AM IST
  // 0 9 = 9:00 AM IST
  // 30 3 = 3:30 AM IST
}, { timezone: 'Asia/Kolkata' })
```

Cron format: `minute hour day month weekday`
- `0 3 * * *` = Every day at 3:00 AM
- `0 9 * * *` = Every day at 9:00 AM
- `0 3 * * 1` = Every Monday at 3:00 AM

---

## Retention & Cleanup

### S3 Backups
Backups are stored indefinitely. To automatically delete old backups:

1. **Go to AWS S3 Console**
2. **Select your bucket**
3. **Management → Lifecycle policies**
4. **Create rule:**
   - Prefix: `backups/`
   - Expiration: 30 days (or whatever you want)

### Database Backups
To restore from S3:
```bash
aws s3 cp s3://cutm-ccrm-backups/backups/2026-06-02/db.sql.gz .
gunzip db.sql.gz
psql -U ccrm_user ccrm_db < db.sql
```

---

## Support & Documentation

- **Detailed Technical Docs:** See `AUTOMATED_REPORTING_SETUP.md`
- **Deployment Instructions:** See `DEPLOYMENT_STEPS.txt`
- **Code:** `server/index.js` (functions: `sendProductivityEmailReport()`, `performS3Backup()`)
- **UI:** `ccrm/src/pages/Integrations.jsx`

---

## Deployment Checklist

Before going live:

- [ ] Code deployed to production server
- [ ] Dependencies installed (`npm install`)
- [ ] Frontend built (`npm run build`)
- [ ] Service restarted (`sudo systemctl restart ccrm-backend`)
- [ ] SMTP configured (Settings → Gmail / SMTP Email)
- [ ] Email recipients configured (Settings → Daily Email Reports)
- [ ] S3 credentials configured (Settings → AWS S3 Backup)
- [ ] Test endpoint called successfully
- [ ] Email received in test inbox
- [ ] S3 backup visible in bucket
- [ ] Logs monitored for errors
- [ ] No security issues (credentials securely stored in DB)

---

## Questions?

Check the logs first:
```bash
sudo journalctl -u ccrm-backend -f
```

Then review the detailed documentation files included in the repo.
