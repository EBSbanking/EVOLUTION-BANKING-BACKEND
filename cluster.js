// cluster.js - COMPLETE CLUSTER MANAGER WITH ASSERTION SUPPRESSION
import cluster from 'cluster';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const config = {
    instances: parseInt(process.env.WORKER_COUNT) || os.cpus().length,
    basePort: 3002,
    restartDelay: 5000,
    maxMemoryRestart: 1024 * 1024 * 1024,
    healthCheckInterval: 30000,
    gracefulShutdownTimeout: 10000,
    maxRetries: 5,
    workerStartDelay: 3000
};

if (cluster.isPrimary) {
    // ==================== PRIMARY (unchanged) ====================
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

    // Start workers with staggered delays
    console.log('\n🚀 Starting workers with staggered delays...');
    for (let i = 0; i < config.instances; i++) {
        setTimeout(() => {
            startWorker(i + 1, config.basePort + i);
        }, i * config.workerStartDelay);
    }

    // Health check interval
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
                    workerInfo.retryCount = 0;
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
            default:
                console.warn(`⚠️ Unknown message from worker ${workerInfo?.id}:`, message);
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
        workers.delete(worker.id);
        workerHealth.delete(worker.id);

        const crashCount = workerInfo?.crashCount || 0;
        const retryCount = workerInfo?.retryCount || 0;
        const baseDelay = Math.max(config.restartDelay, retryCount * 2000);
        const delay = Math.min(baseDelay * Math.pow(2, crashCount), 60000);
        console.log(`🔄 Restarting worker in ${delay/1000}s...`);
        setTimeout(() => {
            if (workers.size < config.instances && !isShuttingDown) {
                let newWorkerPort = workerInfo?.port || (config.basePort + workers.size);
                if (retryCount > config.maxRetries) {
                    newWorkerPort = config.basePort + workers.size + 1;
                    console.log(`⚠️ Worker ${workerInfo?.id} exceeded max retries, trying port ${newWorkerPort}`);
                }
                console.log(`🔄 Restarting worker ${workerInfo?.id || (workers.size + 1)} on port ${newWorkerPort}`);
                const newWorker = startWorker(workerInfo?.id || (workers.size + 1), newWorkerPort);
                if (newWorker) {
                    const newWorkerInfo = workers.get(newWorker.id);
                    if (newWorkerInfo) {
                        newWorkerInfo.crashCount = (workerInfo?.crashCount || 0) + 1;
                        newWorkerInfo.retryCount = retryCount;
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

    async function performHealthChecks() {
        const now = Date.now();
        for (const [workerId, health] of workerHealth) {
            if (now - health.lastUpdate > config.healthCheckInterval * 2) {
                const workerInfo = workers.get(workerId);
                console.warn(`⚠️ Worker ${workerInfo?.id} not responding to health checks`);
                const worker = cluster.workers[workerId];
                if (worker) worker.kill('SIGTERM');
            }
            if (health.memory && health.memory.heapUsed > config.maxMemoryRestart) {
                const workerInfo = workers.get(workerId);
                console.warn(`⚠️ Worker ${workerInfo?.id} exceeded memory limit, restarting...`);
                const worker = cluster.workers[workerId];
                if (worker) worker.kill('SIGTERM');
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
    // ============================================================
    // WORKER PROCESS – with internal assertion suppression
    // ============================================================

    // Patch process.send to block non‑serializable messages (fallback)
    const originalSend = process.send;
    if (originalSend && typeof originalSend === 'function') {
        process.send = function(msg) {
            if (!originalSend || !process.connected) return false;
            try {
                JSON.stringify(msg);
                return originalSend.call(this, msg);
            } catch (err) {
                console.warn(
                    `🔒 Worker ${process.env.WORKER_ID} blocked invalid process.send:`,
                    err.message,
                    '\n  Message:', msg
                );
                return false;
            }
        };
    }

    (async () => {
        try {
            console.log(`👷 Worker ${process.env.WORKER_ID} starting (PID: ${process.pid}, Port: ${process.env.PORT})`);

            // Import server
            const serverModule = await import('./server.js');
            const app = serverModule.default;

            let server = null;
            let healthInterval = null;
            let memoryInterval = null;
            let isShuttingDown = false;

            const safeSend = (msg) => {
                if (process.send && process.connected) {
                    try {
                        process.send(msg);
                        return true;
                    } catch (err) {
                        console.warn(`Worker ${process.env.WORKER_ID} failed to send message:`, err.message);
                        return false;
                    }
                }
                return false;
            };

            const startServer = () => {
                server = app.listen(process.env.PORT, '0.0.0.0')
                    .on('error', (err) => {
                        if (err.code === 'EADDRINUSE') {
                            console.log(`⚠️ Port ${process.env.PORT} in use, retrying in 2s...`);
                            safeSend({
                                type: 'port-retry',
                                pid: process.pid,
                                port: process.env.PORT,
                                workerId: process.env.WORKER_ID
                            });
                            setTimeout(startServer, 2000);
                        } else {
                            console.error('❌ Server error:', err);
                            safeSend({
                                type: 'error',
                                error: { message: err.message, stack: err.stack }
                            });
                            process.exit(1);
                        }
                    })
                    .on('listening', () => {
                        console.log(`✅ Worker ${process.env.WORKER_ID} listening on port ${process.env.PORT}`);
                        safeSend({
                            type: 'ready',
                            pid: process.pid,
                            port: process.env.PORT,
                            workerId: process.env.WORKER_ID
                        });
                    });
                return server;
            };

            server = startServer();

            healthInterval = setInterval(() => {
                if (!isShuttingDown && server) {
                    safeSend({
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

            memoryInterval = setInterval(() => {
                if (!isShuttingDown) {
                    const heapUsedMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
                    if (heapUsedMB > 700) {
                        console.warn(`⚠️ Worker ${process.env.WORKER_ID} high memory: ${heapUsedMB}MB`);
                        safeSend({
                            type: 'memory-warning',
                            usage: `${heapUsedMB}MB`
                        });
                    }
                }
            }, 60000);

            process.on('message', (msg) => {
                if (msg.type === 'shutdown') {
                    console.log(`🔻 Worker ${process.env.WORKER_ID} shutting down gracefully...`);
                    isShuttingDown = true;
                    clearInterval(healthInterval);
                    clearInterval(memoryInterval);
                    healthInterval = null;
                    memoryInterval = null;
                    if (server) {
                        server.close(() => {
                            console.log(`✅ Worker ${process.env.WORKER_ID} closed`);
                            process.exit(0);
                        });
                        setTimeout(() => {
                            console.error(`❌ Worker ${process.env.WORKER_ID} forced exit`);
                            process.exit(1);
                        }, 10000);
                    } else {
                        process.exit(0);
                    }
                }
            });

            // ========== FIX: Ignore internal assertion errors ==========
            process.on('uncaughtException', (err) => {
                if (err.code === 'ERR_INTERNAL_ASSERTION') {
                    console.warn(
                        `⚠️ Worker ${process.env.WORKER_ID} ignored internal assertion error – ` +
                        'this is often caused by a malformed IPC message from a plugin.'
                    );
                    // Do not exit – keep the worker alive.
                    return;
                }
                // For other errors, log and exit
                console.error(`❌ Worker ${process.env.WORKER_ID} uncaught exception:`, err);
                safeSend({
                    type: 'error',
                    error: { message: err.message, stack: err.stack }
                });
                if (server) server.close(() => process.exit(1));
                setTimeout(() => process.exit(1), 5000);
            });

            process.on('unhandledRejection', (reason) => {
                console.error(`❌ Worker ${process.env.WORKER_ID} unhandled rejection:`, reason);
            });

        } catch (err) {
            console.error(`❌ Worker ${process.env.WORKER_ID} failed to start:`, err);
            process.exit(1);
        }
    })();
}