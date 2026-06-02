#!/bin/bash

# Deployment script for CCRM with automated reporting & S3 backup
# Run this on the production server to pull latest changes and restart

set -e

echo "=========================================="
echo "CCRM Deployment Script"
echo "=========================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REPO_DIR="${1:-.}"
BRANCH="${2:-main}"

if [ ! -d "$REPO_DIR/.git" ]; then
  echo -e "${YELLOW}Not a git repository: $REPO_DIR${NC}"
  exit 1
fi

cd "$REPO_DIR"

echo -e "${BLUE}1. Pulling latest code from GitHub...${NC}"
git fetch origin
git checkout $BRANCH
git pull origin $BRANCH

echo -e "${BLUE}2. Installing server dependencies...${NC}"
cd server
npm install --omit=dev
cd ..

echo -e "${BLUE}3. Building React frontend...${NC}"
cd ccrm
npm run build
cd ..

echo -e "${BLUE}4. Stopping CCRM backend service...${NC}"
sudo systemctl stop ccrm-backend || true

sleep 2

echo -e "${BLUE}5. Copying built files to /var/www/ccrm...${NC}"
sudo rsync -av --delete server/ /var/www/ccrm/server/ 2>/dev/null || sudo cp -r server/* /var/www/ccrm/server/
sudo rsync -av --delete ccrm/dist/ /var/www/ccrm/ccrm/dist/ 2>/dev/null || sudo cp -r ccrm/dist/* /var/www/ccrm/ccrm/dist/

echo -e "${BLUE}6. Starting CCRM backend service...${NC}"
sudo systemctl start ccrm-backend

sleep 3

echo -e "${BLUE}7. Checking service status...${NC}"
sudo systemctl status ccrm-backend --no-pager

echo -e "${GREEN}✓ Deployment complete!${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Go to Settings → Integrations"
echo "  2. Configure AWS S3 credentials"
echo "  3. Configure email recipients"
echo "  4. Test: POST /api/admin/test-daily-report"
echo ""
echo "Monitor logs: sudo journalctl -u ccrm-backend -f"
