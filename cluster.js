// cluster.js - COMPLETE CLUSTER MANAGER WITH STAGGERED STARTS
import cluster from 'cluster';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const config = {
    instances: parseInt(process.env.WORKER_COUNT) || os.cpus().length,
    basePort: 3002,  // Backend API port
    restartDelay: 5000,
    maxMemoryRestart: 1024 * 1024 * 1024, // 1GB
    healthCheckInterval: 30000,
    gracefulShutdownTimeout: 10000,
    maxRetries: 5, // Maximum number of port retry attempts
    workerStartDelay: 3000 // Delay between worker starts (ms)
};

if (cluster.isPrimary) {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║     Evolution Banking System - CLUSTER MANAGER           ║
╠══════════════════════════════════════════════════════════╣
║  🚀 PRIMARY PROCESS (PID: ${process.pid})                ║
║  📊 Starting ${config.instances} backend instances       ║
║  🔌 Base Port: ${config.basePort} (backend API)         ║
║  🔌 Load Balancer: Port 5000 (run separately)           ║
║  ⏱️  Staggered start: ${config.workerStartDelay/1000}s between workers ║
╚══════════════════════════════════════════════════════════╝
    `);

    const workers = new Map();
    const workerHealth = new Map();
    let isShuttingDown = false;

    // Start all workers with staggered delays
    console.log('\n🚀 Starting workers with staggered delays...');
    for (let i = 0; i < config.instances; i++) {
        setTimeout(() => {
            startWorker(i + 1, config.basePort + i);
        }, i * config.workerStartDelay);
    }

    // Set up health check interval
    setInterval(() => {
        performHealthChecks();
    }, config.healthCheckInterval);

    // Handle messages from workers
    cluster.on('message', (worker, message) => {
        const workerInfo = workers.get(worker.id);
        
        switch (message.type) {
            case 'ready':
                if (workerInfo) {
                    workerInfo.status = 'ready';
                    workerInfo.readyTime = Date.now();
                    workerInfo.retryCount = 0; // Reset retry count on successful start
                    console.log(`✅ Worker ${workerInfo.id} is READY on port ${workerInfo.port}`);
                }
                break;
                
            case 'port-retry':
                if (workerInfo) {
                    workerInfo.retryCount = (workerInfo.retryCount || 0) + 1;
                    console.log(`🔄 Worker ${workerInfo.id} retrying port ${workerInfo.port} (attempt ${workerInfo.retryCount})`);
                }
                break;
                
            case 'health':
                workerHealth.set(worker.id, {
                    ...message.data,
                    lastUpdate: Date.now()
                });
                break;
                
            case 'memory-warning':
                console.warn(`⚠️ Worker ${workerInfo?.id} memory usage high: ${message.usage}`);
                break;
                
            case 'error':
                console.error(`❌ Worker ${workerInfo?.id} reported error:`, message.error);
                break;
        }
    });

    // Handle worker exit
    cluster.on('exit', (worker, code, signal) => {
        const workerInfo = workers.get(worker.id);
        
        if (isShuttingDown) return;
        
        const uptime = workerInfo ? Math.round((Date.now() - workerInfo.startTime) / 1000) : '?';
        
        console.log(`
⚠️ WORKER ${workerInfo?.id || 'Unknown'} DIED
   PID: ${worker.process.pid}
   Port: ${workerInfo?.port || 'Unknown'}
   Status: ${workerInfo?.status || 'Unknown'}
   Uptime: ${uptime}s
   Code: ${code}
   Signal: ${signal}
        `);

        // Remove from maps
        workers.delete(worker.id);
        workerHealth.delete(worker.id);

        // Calculate delay with exponential backoff
        const crashCount = workerInfo?.crashCount || 0;
        const retryCount = workerInfo?.retryCount || 0;
        const baseDelay = Math.max(config.restartDelay, retryCount * 2000); // Longer delay if many port retries
        const delay = Math.min(baseDelay * Math.pow(2, crashCount), 60000);
        
        console.log(`🔄 Restarting worker in ${delay/1000}s...`);
        
        setTimeout(() => {
            if (workers.size < config.instances && !isShuttingDown) {
                // Try the same port first, but if it failed too many times, try next available
                let newWorkerPort = workerInfo?.port || (config.basePort + workers.size);
                const retryCount = workerInfo?.retryCount || 0;
                
                if (retryCount > config.maxRetries) {
                    // Too many retries on this port, try next port
                    newWorkerPort = config.basePort + workers.size + 1;
                    console.log(`⚠️ Worker ${workerInfo?.id} exceeded max retries, trying port ${newWorkerPort}`);
                }
                
                console.log(`🔄 Restarting worker ${workerInfo?.id || (workers.size + 1)} on port ${newWorkerPort}`);
                
                const newWorker = startWorker(workerInfo?.id || (workers.size + 1), newWorkerPort);
                
                if (newWorker) {
                    const newWorkerInfo = workers.get(newWorker.id);
                    if (newWorkerInfo) {
                        newWorkerInfo.crashCount = (workerInfo?.crashCount || 0) + 1;
                        newWorkerInfo.retryCount = retryCount; // Preserve retry count
                    }
                }
            }
        }, delay);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        console.log(`
🔻 RECEIVED ${signal}
   Shutting down gracefully...
   Waiting for workers to finish (max ${config.gracefulShutdownTimeout/1000}s)
        `);

        const shutdownPromises = [];
        for (const [id, worker] of Object.entries(cluster.workers || {})) {
            shutdownPromises.push(new Promise((resolve) => {
                worker.send({ type: 'shutdown' });
                
                const timeout = setTimeout(() => {
                    console.log(`⚠️ Worker ${id} force killed`);
                    worker.kill('SIGKILL');
                    resolve();
                }, config.gracefulShutdownTimeout);
                
                worker.once('exit', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            }));
        }

        await Promise.all(shutdownPromises);
        
        console.log('✅ All workers terminated');
        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Helper function to start a worker
    function startWorker(id, port) {
        const workerEnv = {
            ...process.env,
            PORT: port,
            WORKER_ID: id,
            NODE_ENV: process.env.NODE_ENV || 'development'
        };

        const worker = cluster.fork(workerEnv);
        
        const workerInfo = {
            id: id,
            pid: worker.process.pid,
            port: port,
            status: 'starting',
            startTime: Date.now(),
            crashCount: 0,
            retryCount: 0
        };
        
        workers.set(worker.id, workerInfo);
        
        console.log(`🚀 Worker ${id} starting (PID: ${worker.process.pid}, Port: ${port})`);
        
        return worker;
    }

    // Health check function
    async function performHealthChecks() {
        const now = Date.now();
        
        for (const [workerId, health] of workerHealth) {
            if (now - health.lastUpdate > config.healthCheckInterval * 2) {
                const workerInfo = workers.get(workerId);
                console.warn(`⚠️ Worker ${workerInfo?.id} not responding to health checks`);
                
                const worker = cluster.workers[workerId];
                if (worker) {
                    console.log(`🔄 Restarting unresponsive worker ${workerInfo?.id}`);
                    worker.kill('SIGTERM');
                }
            }
            
            if (health.memory && health.memory.heapUsed > config.maxMemoryRestart) {
                const workerInfo = workers.get(workerId);
                console.warn(`⚠️ Worker ${workerInfo?.id} exceeded memory limit, restarting...`);
                
                const worker = cluster.workers[workerId];
                if (worker) {
                    worker.kill('SIGTERM');
                }
            }
        }
    }

    console.log(`
📋 NEXT STEPS:
   1. Backend workers are running on ports ${config.basePort}-${config.basePort + config.instances - 1}
   2. Start the load balancer: node loadbalancer-server.js
   3. Access the API through the load balancer: http://localhost:5000
   4. If you see EADDRINUSE errors, run: taskkill /F /IM node.exe
    `);

} else {
    // WORKER PROCESS - your existing worker code remains exactly the same
    (async () => {
        try {
            console.log(`👷 Worker ${process.env.WORKER_ID} starting (PID: ${process.pid}, Port: ${process.env.PORT})`);
            
            // Import and start the server
            const serverModule = await import('./server.js');
            const app = serverModule.default;
            
            // Start server with port retry logic
            const startServer = () => {
                const server = app.listen(process.env.PORT, '0.0.0.0')
                    .on('error', (err) => {
                        if (err.code === 'EADDRINUSE') {
                            console.log(`⚠️ Port ${process.env.PORT} in use, retrying in 2s...`);
                            
                            // Notify primary about retry
                            if (process.send) {
                                process.send({ 
                                    type: 'port-retry', 
                                    pid: process.pid, 
                                    port: process.env.PORT,
                                    workerId: process.env.WORKER_ID
                                });
                            }
                            
                            // Retry after 2 seconds
                            setTimeout(startServer, 2000);
                        } else {
                            console.error('❌ Server error:', err);
                            
                            // Report error to primary
                            if (process.send) {
                                process.send({
                                    type: 'error',
                                    error: {
                                        message: err.message,
                                        stack: err.stack
                                    }
                                });
                            }
                            
                            process.exit(1);
                        }
                    })
                    .on('listening', () => {
                        console.log(`✅ Worker ${process.env.WORKER_ID} listening on port ${process.env.PORT}`);
                        
                        // Notify primary we're ready
                        if (process.send) {
                            process.send({ 
                                type: 'ready', 
                                pid: process.pid, 
                                port: process.env.PORT,
                                workerId: process.env.WORKER_ID
                            });
                        }
                    });
                
                return server;
            };

            // Use the retry-enabled server starter
            const server = startServer();

            // Send health metrics periodically
            const healthInterval = setInterval(() => {
                if (process.send && server) {
                    process.send({
                        type: 'health',
                        data: {
                            memory: process.memoryUsage(),
                            uptime: process.uptime(),
                            connections: server._connections || 0,
                            workerId: process.env.WORKER_ID
                        }
                    });
                }
            }, 15000);

            // Handle shutdown messages
            process.on('message', (msg) => {
                if (msg.type === 'shutdown') {
                    console.log(`🔻 Worker ${process.env.WORKER_ID} shutting down gracefully...`);
                    
                    clearInterval(healthInterval);
                    
                    server.close(() => {
                        console.log(`✅ Worker ${process.env.WORKER_ID} closed`);
                        process.exit(0);
                    });

                    setTimeout(() => {
                        console.error(`❌ Worker ${process.env.WORKER_ID} forced exit`);
                        process.exit(1);
                    }, 10000);
                }
            });

            // Handle uncaught errors
            process.on('uncaughtException', (err) => {
                console.error(`❌ Worker ${process.env.WORKER_ID} uncaught exception:`, err);
                
                if (process.send) {
                    process.send({
                        type: 'error',
                        error: {
                            message: err.message,
                            stack: err.stack
                        }
                    });
                }
                
                server.close(() => {
                    process.exit(1);
                });
                
                setTimeout(() => process.exit(1), 5000);
            });

            process.on('unhandledRejection', (reason) => {
                console.error(`❌ Worker ${process.env.WORKER_ID} unhandled rejection:`, reason);
            });

            // Memory warning
            setInterval(() => {
                const memoryUsage = process.memoryUsage();
                const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
                
                if (heapUsedMB > 700) {
                    console.warn(`⚠️ Worker ${process.env.WORKER_ID} high memory: ${heapUsedMB}MB`);
                    
                    if (process.send) {
                        process.send({
                            type: 'memory-warning',
                            usage: `${heapUsedMB}MB`
                        });
                    }
                }
            }, 60000);

        } catch (err) {
            console.error(`❌ Worker ${process.env.WORKER_ID} failed to start:`, err);
            process.exit(1);
        }
    })();
}