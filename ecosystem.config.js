const fs = require('fs');
const path = require('path');

// Load .env file and return as object (no external dependency)
function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return {};
  return fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .reduce((acc, line) => {
      const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
      if (match) acc[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
      return acc;
    }, {});
}

const APP_DIR = '/home/deploy/ridenrest-app';
const envVars = loadEnv(path.join(APP_DIR, '.env'));

module.exports = {
  apps: [
    {
      name: 'ridenrest-web',
      script: 'apps/web/.next/standalone/apps/web/server.js',
      cwd: APP_DIR,
      env: {
        ...envVars,
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
        ...envVars,
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
