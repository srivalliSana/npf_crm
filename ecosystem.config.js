// PM2 Ecosystem Config — https://crm.cutmap.ac.in
// Usage:
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 startup

module.exports = {
  apps: [
    {
      name: 'ccrm',
      // Serves the built Vite dist folder via a static file server.
      // Install serve globally first: npm install -g serve
      script: 'serve',
      args: '-s ccrm/dist -l 3000',
      cwd: __dirname,
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
      },
      // Auto-restart on crash
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      // Logging
      out_file: './logs/ccrm-out.log',
      error_file: './logs/ccrm-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
