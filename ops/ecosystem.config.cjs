const { execFileSync } = require('node:child_process');

const release = '/opt/restaurant-os/current';
const user = 'restaurant-os';
const uid = Number(execFileSync('id', ['-u', user], { encoding: 'utf8' }).trim());
const gid = Number(execFileSync('id', ['-g', user], { encoding: 'utf8' }).trim());
const service = {
  script: '/usr/bin/node',
  interpreter: 'none',
  uid,
  gid,
  exec_mode: 'fork',
  restart_delay: 2000,
};

module.exports = {
  apps: [
    {
      ...service,
      name: 'restaurant-os-api',
      cwd: `${release}/apps/api`,
      args: ['dist/apps/api/src/index.js'],
      env: { NODE_ENV: 'production', API_HOST: '127.0.0.1', API_PORT: '4200' },
    },
    {
      ...service,
      name: 'restaurant-os-web',
      cwd: `${release}/apps/web`,
      args: ['../../node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3200'],
      env: { NODE_ENV: 'production' },
    },
  ],
};
