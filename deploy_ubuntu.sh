#!/bin/bash
# ==============================================================================
# CCRM CENTURION CRM - AUTOMATED UBUNTU 22.04 LTS DEPLOYMENT SCRIPT
# ==============================================================================
# This script installs Node.js, Nginx, PostgreSQL, msmtp, sets up database 
# schemas, builds Vite static assets, and deploys the API under Systemd.
#
# Usage:
#   chmod +x deploy_ubuntu.sh
#   sudo ./deploy_ubuntu.sh
# ==============================================================================

set -e

# ANSI Color Codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0;35m' # No Color
CLEAR='\033[0m'

echo -e "${BLUE}==================================================================${CLEAR}"
echo -e "${GREEN}      CCRM ERP SYSTEM - SYSTEMATIC DEPLOYMENT IN UBUNTU 22.04      ${CLEAR}"
echo -e "${BLUE}==================================================================${CLEAR}"

# 1. Check Root Privileges
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Error: Please run this script as root (sudo).${CLEAR}"
  exit 1
fi

# 2. Update System Packages
echo -e "\n${YELLOW}[1/8] Updating system packages...${CLEAR}"
apt update && apt upgrade -y

# 3. Install System Dependencies (Git, Curl, msmtp)
echo -e "\n${YELLOW}[2/8] Installing core system dependencies & msmtp...${CLEAR}"
apt install -y git curl build-essential msmtp msmtp-mta ca-certificates

# 4. Install Node.js LTS (v20.x)
echo -e "\n${YELLOW}[3/8] Installing Node.js v20.x...${CLEAR}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
echo -e "${GREEN}Node.js version: $(node -v)${CLEAR}"
echo -e "${GREEN}NPM version: $(npm -v)${CLEAR}"

# 5. Install & Configure PostgreSQL Server
echo -e "\n${YELLOW}[4/8] Installing and setting up PostgreSQL database...${CLEAR}"
apt install -y postgresql postgresql-contrib

# Start and enable PostgreSQL service
systemctl start postgresql
systemctl enable postgresql

# Create PostgreSQL database, user, and grant privileges
echo -e "${BLUE}Bootstrapping PostgreSQL user 'ccrm_user' and database 'ccrm_db'...${CLEAR}"
sudo -u postgres psql -c "CREATE USER ccrm_user WITH PASSWORD 'Ccrm@123';" || true
sudo -u postgres psql -c "ALTER USER ccrm_user WITH PASSWORD 'Ccrm@123';"
sudo -u postgres psql -c "CREATE DATABASE ccrm_db OWNER ccrm_user;" || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ccrm_db TO ccrm_user;"

# 6. Deploy Codebase and Directory Structures
echo -e "\n${YELLOW}[5/8] Copying files and configuring directories...${CLEAR}"
DEPLOY_DIR="/var/www/ccrm"
mkdir -p "$DEPLOY_DIR"

# Copy local workspace files to deploy directory
# (Assumes script is executed from the cloned repository folder)
cp -r . "$DEPLOY_DIR/"
cd "$DEPLOY_DIR"

# Create uploads directory structure with proper permissions
mkdir -p server/uploads/avatars
mkdir -p server/uploads/documents
chmod -R 775 server/uploads
chown -R www-data:www-data server/uploads

# Create .env config files for backend
echo -e "${BLUE}Creating environment configuration file...${CLEAR}"
cat <<EOT > server/.env
PORT=5000
DATABASE_URL=postgresql://ccrm_user:Ccrm%40123@localhost:5432/ccrm_db
JWT_SECRET=ccrm-prod-jwt-secret-key-998877
NODE_ENV=production
EOT

# 7. Install Dependencies & Build Frontend/Backend
echo -e "\n${YELLOW}[6/8] Building Vite React static assets & installing node packages...${CLEAR}"
# Install and build React frontend
cd ccrm
npm install --include=dev
npm run build

# Install Express backend node modules
cd ../server
npm install

# 8. Configure Nginx Web Server as Reverse Proxy
echo -e "\n${YELLOW}[7/8] Configuring Nginx reverse proxy...${CLEAR}"
apt install -y nginx

# Setup Nginx Server Block config
NGINX_CONF="/etc/nginx/sites-available/ccrm"
cat <<EOT > "$NGINX_CONF"
server {
    listen 80;
    server_name _;

    # Serve .well-known/assetlinks.json for TWA / Play Store verification
    location /.well-known/ {
        root $DEPLOY_DIR/ccrm/dist;
        try_files \$uri =404;
        add_header Content-Type application/json;
    }

    # React Static Assets Frontend
    location / {
        root $DEPLOY_DIR/ccrm/dist;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }

    # Uploads Storage Reverse Proxy
    location /uploads/ {
        proxy_pass http://127.0.0.1:5000/uploads/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Express API Backend Reverse Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # Max upload size limit for documents
        client_max_body_size 50M;
    }
}
EOT

# Enable Nginx block and disable default configuration
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Restart Nginx
nginx -t
systemctl restart nginx
systemctl enable nginx

# 9. Configure Systemd Service for Express backend
echo -e "\n${YELLOW}[8/8] Creating background Systemd Service for Express Backend...${CLEAR}"
SYSTEMD_CONF="/etc/systemd/system/ccrm-backend.service"

cat <<EOT > "$SYSTEMD_CONF"
[Unit]
Description=CCRM Express.js Backend Server
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=$DEPLOY_DIR/server
ExecStart=/usr/bin/node index.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOT

# Reload Systemd daemon, enable, and start service
systemctl daemon-reload
systemctl start ccrm-backend
systemctl enable ccrm-backend

# ==============================================================================
echo -e "\n${GREEN}==================================================================${CLEAR}"
echo -e "${GREEN}✓ CCRM ERP SYSTEM DEPLOYED SUCCESSFULY IN UBUNTU 22.04!${CLEAR}"
echo -e "${BLUE}------------------------------------------------------------------${CLEAR}"
echo -e "  • Frontend Web Interface: http://[your-server-ip]/${CLEAR}"
echo -e "  • Backend REST API Access: http://[your-server-ip]/api/${CLEAR}"
echo -e "  • Static File Storage:     http://[your-server-ip]/uploads/${CLEAR}"
echo -e "  • Express Daemon Status:   sudo systemctl status ccrm-backend${CLEAR}"
echo -e "  • PostgreSQL Status:       sudo systemctl status postgresql${CLEAR}"
echo -e "  • Nginx Status:            sudo systemctl status nginx${CLEAR}"
echo -e "${GREEN}==================================================================${CLEAR}"
