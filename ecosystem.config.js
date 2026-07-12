module.exports = {
  apps: [{
    name: 'evolution-backend',
    script: './server.js',
    instances: 'max',                // Use all available CPU cores
    exec_mode: 'cluster',            // Cluster mode for load balancing
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
  }]
};