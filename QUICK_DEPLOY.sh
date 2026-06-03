#!/bin/bash

# CCRM Quick Deployment Script
# Run this on your production server to deploy the latest code

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                CCRM QUICK DEPLOYMENT SCRIPT                    ║"
echo "║                    Version 1.5.0                               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if already in a git repo
if [ ! -d ".git" ]; then
  echo "❌ ERROR: Not a git repository"
  echo "Please run this from the npf_crm directory"
  exit 1
fi

echo -e "${BLUE}Step 1: Pulling latest code from GitHub${NC}"
git fetch origin
git checkout main
git pull origin main

echo -e "${BLUE}Step 2: Installing server dependencies${NC}"
cd server
npm install --omit=dev
cd ..

echo -e "${BLUE}Step 3: Building React frontend${NC}"
cd ccrm
npm run build
cd ..

echo -e "${BLUE}Step 4: Stopping CCRM backend service${NC}"
sudo systemctl stop ccrm-backend || echo "⚠️  Service was not running"

sleep 2

echo -e "${BLUE}Step 5: Copying files to /var/www/ccrm${NC}"
# Make sure destination exists
sudo mkdir -p /var/www/ccrm/server
sudo mkdir -p /var/www/ccrm/ccrm

# Copy backend
sudo cp -r server/* /var/www/ccrm/server/

# Copy frontend
sudo cp -r ccrm/dist/* /var/www/ccrm/ccrm/dist/

# Fix permissions
sudo chown -R nobody:nogroup /var/www/ccrm/

echo -e "${BLUE}Step 6: Starting CCRM backend service${NC}"
sudo systemctl start ccrm-backend

sleep 3

echo -e "${BLUE}Step 7: Checking service status${NC}"
sudo systemctl status ccrm-backend --no-pager

echo ""
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE!${NC}"
echo ""
echo "📋 Next Steps:"
echo "  1. Open: https://crm.cutmap.ac.in"
echo "  2. Go to: Settings → Integrations"
echo "  3. Configure: AWS S3 Backup credentials"
echo "  4. Configure: Daily Email Reports recipients"
echo "  5. Test: Click 'Test' button next to each integration"
echo "  6. Monitor: sudo journalctl -u ccrm-backend -f"
echo ""
echo "✨ To verify deployment:"
echo "  - Check logs: sudo journalctl -u ccrm-backend -n 20"
echo "  - Test email: POST /api/admin/test-daily-report"
echo "  - Check S3: Look for backups/YYYY-MM-DD/ folder"
echo ""
