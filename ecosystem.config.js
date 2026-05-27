// PM2 Ecosystem Config — https://crm.cutmap.ac.in
// 
// SETUP (run once on server):
//   cd ccrm && npm install && npm run build && cd ..
//   cd server && npm install && cd ..
//   npm install -g pm2
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 startup   ← run the printed command to enable on reboot
//
// AFTER A CODE UPDATE:
//   git pull
//   cd ccrm && npm run build && cd ..
//   pm2 restart ccrm

module.exports = {
  apps: [
    {
      name: 'ccrm',
      script: 'server/index.js',
      cwd: __dirname,
      // Node 18+ supports ESM natively
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      out_file: './logs/ccrm-out.log',
      error_file: './logs/ccrm-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
