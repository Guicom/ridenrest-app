const APP_DIR = '/home/deploy/ridenrest-app';

module.exports = {
  apps: [
    {
      name: 'ridenrest-web',
      script: 'apps/web/.next/standalone/apps/web/server.js',
      cwd: APP_DIR,
      env: {
        PORT: 3011,
        NODE_ENV: 'production',
        HOSTNAME: '0.0.0.0',
      },
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/var/log/pm2/ridenrest-web-error.log',
      out_file: '/var/log/pm2/ridenrest-web-out.log',
      merge_logs: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '5s',
    },
    {
      name: 'ridenrest-api',
      script: 'apps/api/dist/main.js',
      cwd: APP_DIR,
      env: {
        PORT: 3010,
        NODE_ENV: 'production',
      },
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/var/log/pm2/ridenrest-api-error.log',
      out_file: '/var/log/pm2/ridenrest-api-out.log',
      merge_logs: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '5s',
    },
  ],
};
