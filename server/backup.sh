#!/bin/bash
# CCRM Daily Backup Script
# - Dumps PostgreSQL DB to /var/backups/ccrm/
# - Tars the code directory
# - Keeps last 14 daily backups; older auto-deleted
# - Emails Admin via msmtp (uses same SMTP config as CRM if msmtp installed)
#
# Setup:
#   sudo cp /opt/npf_crm/server/backup.sh /usr/local/bin/ccrm-backup.sh
#   sudo chmod +x /usr/local/bin/ccrm-backup.sh
#   sudo crontab -e
#     0 2 * * * /usr/local/bin/ccrm-backup.sh >> /var/log/ccrm-backup.log 2>&1

set -e

BACKUP_DIR="/var/backups/ccrm"
CODE_DIR="/var/www/ccrm"
DB_NAME="${CCRM_DB_NAME:-ccrm_db}"
DB_USER="${CCRM_DB_USER:-ccrm_user}"
RETENTION_DAYS=14
ADMIN_EMAIL="${CCRM_ADMIN_EMAIL:-admin@cutmap.ac.in}"

DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

sudo mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/code"

# 1. Database dump (compressed)
DB_FILE="$BACKUP_DIR/db/ccrm_db_${TIMESTAMP}.sql.gz"
echo "[$(date)] Dumping database to $DB_FILE..."
PGPASSWORD="${CCRM_DB_PASS:-Ccrm@123}" pg_dump -U "$DB_USER" -h localhost "$DB_NAME" | gzip > "$DB_FILE"
DB_SIZE=$(du -h "$DB_FILE" | cut -f1)

# 2. Code tarball (excluding node_modules + uploads)
CODE_FILE="$BACKUP_DIR/code/ccrm_code_${TIMESTAMP}.tar.gz"
echo "[$(date)] Archiving code to $CODE_FILE..."
tar --exclude='node_modules' --exclude='*.log' --exclude='uploads/bulk-temp' \
    -czf "$CODE_FILE" -C "$CODE_DIR" .
CODE_SIZE=$(du -h "$CODE_FILE" | cut -f1)

# 3. Cleanup old backups
echo "[$(date)] Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "*.gz" -mtime +$RETENTION_DAYS -delete

# 4. Email summary
TOTAL_BACKUPS=$(ls "$BACKUP_DIR/db" 2>/dev/null | wc -l)
SUMMARY="CCRM Daily Backup — $DATE

✓ Database: $DB_FILE ($DB_SIZE)
✓ Code: $CODE_FILE ($CODE_SIZE)
✓ Retention: $RETENTION_DAYS days
✓ Total backups on disk: $TOTAL_BACKUPS

Backup location: $BACKUP_DIR
Server: $(hostname) $(uname -r)
Disk usage: $(df -h $BACKUP_DIR | tail -1)
"

echo "$SUMMARY"

# Send email via msmtp if available, otherwise just log
if command -v msmtp &> /dev/null; then
  echo -e "Subject: ✓ CCRM Backup OK — $DATE\nTo: $ADMIN_EMAIL\n\n$SUMMARY" | msmtp "$ADMIN_EMAIL" || echo "msmtp send failed (config?)"
elif command -v mail &> /dev/null; then
  echo "$SUMMARY" | mail -s "✓ CCRM Backup OK — $DATE" "$ADMIN_EMAIL"
else
  echo "[Note] No mailer found (msmtp / mail). Summary only logged."
fi

echo "[$(date)] Backup complete."
