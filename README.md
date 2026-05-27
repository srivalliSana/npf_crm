# CCRM — Centurion CRM

Production URL: **https://crm.cutmap.ac.in**

## Local Development

```bash
cd ccrm
npm install
npm run dev
```

## Production Deployment (Ubuntu/Linux server)

### 1. Install Node.js & PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2 serve
```

### 2. Clone & Build
```bash
git clone https://github.com/srivalliSana/npf_crm.git
cd npf_crm/ccrm
npm install
npm run build
```

### 3. Start with PM2
```bash
cd ..                          # back to npf_crm root
pm2 start ecosystem.config.js
pm2 save
pm2 startup                    # follow the printed command to enable on reboot
```

App will be served on **port 3000**. Point your Nginx/Apache reverse proxy for `crm.cutmap.ac.in` to `http://localhost:3000`.

### 4. Nginx reverse proxy (example)
```nginx
server {
    listen 80;
    server_name crm.cutmap.ac.in;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Then enable HTTPS with Certbot:
```bash
sudo certbot --nginx -d crm.cutmap.ac.in
```

### 5. PM2 useful commands
```bash
pm2 list              # see running apps
pm2 logs ccrm         # tail logs
pm2 restart ccrm      # restart after update
pm2 stop ccrm         # stop
```

## Google OAuth Setup

1. Go to https://console.cloud.google.com/
2. Create OAuth 2.0 credentials (Web application)
3. Add Authorized JavaScript origins:
   - `https://crm.cutmap.ac.in`
   - `http://localhost:5173` (for dev)
4. Paste the Client ID into `ccrm/.env`:
   ```
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```

## Admin Login

| Role | Email | Password |
|------|-------|----------|
| Admin | `vkumar@cutm.ac.in` | `Admin@123` |
| Manager | `anitas@cutm.ac.in` | `Manager@123` |
| Counselor | `rahulv@cutm.ac.in` | `Counselor@123` |
