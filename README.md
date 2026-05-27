# CCRM — Centurion CRM

Production URL: **https://crm.cutmap.ac.in**

## Architecture

```
Browser → Nginx (443/80) → Express server (port 5000)
                               ├── /api/*        → API routes (PostgreSQL)
                               ├── /uploads/*    → uploaded files
                               └── /*            → React build (ccrm/dist)
```

Express serves both the API **and** the React frontend from a single process on port 5000.

---

## Local Development

```bash
# Terminal 1 — backend
cd server && node index.js

# Terminal 2 — frontend (hot reload)
cd ccrm && npm install && npm run dev
```

---

## Production Deployment (Ubuntu/Linux)

### 1. Install Node.js & PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
```

### 2. Clone & Build
```bash
git clone https://github.com/srivalliSana/npf_crm.git
cd npf_crm

# Build the React frontend
cd ccrm
npm install
npm run build
cd ..

# Install backend dependencies
cd server
npm install
cd ..
```

### 3. Start with PM2
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup    # follow the printed command to enable on reboot
```

The app runs on **port 5000**. Nginx proxies `crm.cutmap.ac.in` → `localhost:5000`.

### 4. Nginx config
```nginx
server {
    listen 80;
    server_name crm.cutmap.ac.in;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name crm.cutmap.ac.in;

    ssl_certificate     /etc/letsencrypt/live/crm.cutmap.ac.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crm.cutmap.ac.in/privkey.pem;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable HTTPS:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d crm.cutmap.ac.in
```

### 5. After a code update
```bash
git pull
cd ccrm && npm run build && cd ..
pm2 restart ccrm
```

### 6. PM2 commands
```bash
pm2 list              # running apps
pm2 logs ccrm         # tail logs
pm2 restart ccrm      # restart
pm2 stop ccrm         # stop
```

---

## Google OAuth Setup

1. Go to https://console.cloud.google.com/ → APIs & Services → Credentials
2. Create **OAuth 2.0 Client ID** (Web application)
3. Authorized JavaScript origins:
   - `https://crm.cutmap.ac.in`
   - `http://localhost:5173`
4. Add Client ID to `ccrm/.env`:
   ```
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```
5. Rebuild: `cd ccrm && npm run build`

---

## Login Credentials

| Role | Email | Password |
|------|-------|----------|
| **Admin** | `vkumar@cutm.ac.in` | `Admin@123` |
| Manager | `anitas@cutm.ac.in` | `Manager@123` |
| Counselor | `rahulv@cutm.ac.in` | `Counselor@123` |
