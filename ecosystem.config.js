module.exports = {
  apps: [{
    name: 'evolution-backend',
    script: './server.js',
    instances: 'max', // Use all CPU cores
    exec_mode: 'cluster',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      CLUSTER_MODE: 'true',
      UV_THREADPOOL_SIZE: 64
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    kill_timeout: 5000,
    listen_timeout: 5000,
    shutdown_with_message: true,
    node_args: [
      '--max-old-space-size=4096',
      '--max-http-header-size=16384',
      '--expose-gc'
    ]
  }, {
    name: 'metrics',
    script: './scripts/metrics-server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 9090
    },
    error_file: './logs/metrics-error.log',
    out_file: './logs/metrics-out.log'
  }]
};