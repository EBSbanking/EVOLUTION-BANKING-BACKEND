/**
 * Intelligent Load Balancer & Auto-Scaling Middleware
 * For Express.js - Configured for port 3002 cluster
 */

import os from 'os';
import { EventEmitter } from 'events';
import crypto from 'crypto';

class LoadBalancerMiddleware extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            maxRequestsPerIp: options.maxRequestsPerIp || 100,
            rateLimitWindow: options.rateLimitWindow || 60000,
            enableRedisRateLimit: options.enableRedisRateLimit || false,
            redisClient: options.redisClient || null,
            cpuThreshold: options.cpuThreshold || 70,
            memoryThreshold: options.memoryThreshold || 80,
            eventLoopThreshold: options.eventLoopThreshold || 100,
            failureThreshold: options.failureThreshold || 5,
            recoveryTimeout: options.recoveryTimeout || 30000,
            halfOpenMaxRequests: options.halfOpenMaxRequests || 3,
            maxQueueSize: options.maxQueueSize || 1000,
            queueTimeout: options.queueTimeout || 30000,
            enablePriorityQueue: options.enablePriorityQueue || true,
            healthCheckInterval: options.healthCheckInterval || 10000,
            healthCheckTimeout: options.healthCheckTimeout || 5000,
            unhealthyThreshold: options.unhealthyThreshold || 3,
            backendInstances: options.backendInstances || [`http://localhost:${process.env.PORT || 3002}`],
            enableAutoScaling: options.enableAutoScaling || false,
            minInstances: options.minInstances || 1,
            maxInstances: options.maxInstances || os.cpus().length,
            scaleUpThreshold: options.scaleUpThreshold || 70,
            scaleDownThreshold: options.scaleDownThreshold || 30,
            enableIpWhitelist: options.enableIpWhitelist || false,
            ipWhitelist: options.ipWhitelist || [],
            enableIpBlacklist: options.enableIpBlacklist || false,
            ipBlacklist: options.ipBlacklist || [],
            enableMetrics: options.enableMetrics !== false,
            metricsPrefix: options.metricsPrefix || 'load_balancer',
            logLevel: options.logLevel || 'info',
            enableRequestLogging: options.enableRequestLogging || false,
            basePort: 3002,
            currentPort: process.env.PORT || 3002
        };

        this.CIRCUIT_STATES = {
            CLOSED: 'CLOSED',
            OPEN: 'OPEN',
            HALF_OPEN: 'HALF_OPEN'
        };
        
        this.state = {
            isEnabled: true,
            circuitState: this.CIRCUIT_STATES.CLOSED,
            circuitOpenUntil: null,
            halfOpenSuccessCount: 0,
            halfOpenRequestCount: 0,
            requestQueue: {
                high: [],
                normal: [],
                low: []
            },
            processingQueue: false,
            activeRequests: 0,
            totalRequests: 0,
            failedRequests: 0,
            rateLimitMap: new Map(),
            instanceHealth: {},
            lastCpuUsage: process.cpuUsage(),
            lastEventLoopDelay: 0,
            consecutiveHealthCheckFailures: 0,
            workerId: process.env.WORKER_ID || 1,
            clusterMode: process.env.CLUSTER_MODE === 'true' || !!process.env.WORKER_ID
        };
        
        this.metrics = {
            startTime: Date.now(),
            requestsPerSecond: 0,
            averageResponseTime: 0,
            responseTimes: [],
            statusCodes: {},
            errors: {},
            endpoints: new Map()
        };
        
        this.init();
    }
    
    getClusterInstances() {
        const instances = [];
        const basePort = 3002;
        const workerCount = parseInt(process.env.WORKER_COUNT) || os.cpus().length;
        
        if (this.state.clusterMode) {
            for (let i = 0; i < workerCount; i++) {
                instances.push(`http://localhost:${basePort + i}`);
            }
        } else {
            instances.push(`http://localhost:${this.config.currentPort}`);
        }
        
        return instances;
    }
    
    init() {
        setInterval(() => this.checkHealth(), this.config.healthCheckInterval);
        
        if (this.config.enableMetrics) {
            setInterval(() => this.collectMetrics(), 5000);
        }
        
        setInterval(() => this.processQueue(), 100);
        
        if (!this.config.enableRedisRateLimit) {
            setInterval(() => this.cleanRateLimitMap(), 60000);
        }
        
        setInterval(() => this.measureEventLoopDelay(), 1000);
        
        if (this.config.enableAutoScaling) {
            setInterval(() => this.checkAutoScaling(), 30000);
        }
        
        this.log('info', '✅ Load Balancer Middleware initialized', {
            workerId: this.state.workerId,
            port: this.config.currentPort,
            instances: this.config.backendInstances.length,
            circuitBreaker: this.config.failureThreshold,
            rateLimit: `${this.config.maxRequestsPerIp}/${this.config.rateLimitWindow/1000}s`,
            clusterMode: this.state.clusterMode
        });
    }
    
    log(level, message, data = {}) {
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        if (levels[level] >= levels[this.config.logLevel]) {
            const logEntry = {
                timestamp: new Date().toISOString(),
                level,
                message,
                workerId: this.state.workerId,
                port: this.config.currentPort,
                pid: process.pid,
                ...data
            };
            
            if (level === 'error') console.error(JSON.stringify(logEntry));
            else if (level === 'warn') console.warn(JSON.stringify(logEntry));
            else console.log(JSON.stringify(logEntry));
            
            this.emit('log', logEntry);
        }
    }
    
    generateRequestId() {
        return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${this.state.workerId}`;
    }
    
    getRequestPriority(req) {
        if (!this.config.enablePriorityQueue) return 'normal';
        
        if (req.headers.authorization || req.session?.userId) {
            return 'high';
        }
        
        if (req.path.includes('/health') || req.path.includes('/metrics')) {
            return 'low';
        }
        
        const criticalEndpoints = ['/api/login', '/api/payment', '/api/transaction'];
        if (criticalEndpoints.some(endpoint => req.path.includes(endpoint))) {
            return 'high';
        }
        
        return 'normal';
    }
    
    middleware = (req, res, next) => {
        if (!this.state.isEnabled) return next();
        
        const startTime = Date.now();
        const clientIp = this.getClientIp(req);
        const requestId = this.generateRequestId();
        const priority = this.getRequestPriority(req);
        
        if (!this.checkIpAccess(clientIp)) {
            return this.sendError(res, 403, 'Access denied', requestId);
        }
        
        req.loadBalancer = {
            requestId,
            workerId: this.state.workerId,
            port: this.config.currentPort,
            timestamp: startTime,
            priority,
            queuePosition: this.getQueuePosition(priority)
        };
        
        if (this.state.circuitState !== this.CIRCUIT_STATES.CLOSED) {
            const circuitResult = this.handleCircuitBreaker(req, res, requestId);
            if (!circuitResult.allowed) return circuitResult.response;
        }
        
        if (!this.checkRateLimit(clientIp)) {
            this.log('warn', 'Rate limit exceeded', { ip: clientIp, requestId });
            return this.sendError(res, 429, 'Too many requests - rate limit exceeded', requestId);
        }
        
        const load = this.getSystemLoad();
        if (load.isOverloaded) {
            const queueResult = this.handleQueue(req, res, next, startTime, clientIp, requestId, priority, load);
            if (queueResult.queued) return;
        }
        
        this.processRequest(req, res, next, startTime, clientIp, requestId, priority);
    };
    
    getQueuePosition(priority) {
        if (!this.config.enablePriorityQueue) {
            return this.state.requestQueue.normal.length;
        }
        return this.state.requestQueue[priority].length;
    }
    
    handleCircuitBreaker(req, res, requestId) {
        const now = Date.now();
        
        if (this.state.circuitState === this.CIRCUIT_STATES.OPEN) {
            if (now > this.state.circuitOpenUntil) {
                this.state.circuitState = this.CIRCUIT_STATES.HALF_OPEN;
                this.state.halfOpenSuccessCount = 0;
                this.state.halfOpenRequestCount = 0;
                this.log('info', 'Circuit breaker half-open - testing recovery');
            } else {
                return {
                    allowed: false,
                    response: this.sendError(res, 503, 'Service temporarily unavailable (circuit open)', requestId)
                };
            }
        }
        
        if (this.state.circuitState === this.CIRCUIT_STATES.HALF_OPEN) {
            if (this.state.halfOpenRequestCount >= this.config.halfOpenMaxRequests) {
                return {
                    allowed: false,
                    response: this.sendError(res, 503, 'Service in recovery mode - try again later', requestId)
                };
            }
            this.state.halfOpenRequestCount++;
        }
        
        return { allowed: true };
    }
    
    handleQueue(req, res, next, startTime, clientIp, requestId, priority, load) {
        const queueLength = this.config.enablePriorityQueue ? 
            this.state.requestQueue[priority].length : 
            this.state.requestQueue.normal.length;
        
        if (queueLength < this.config.maxQueueSize) {
            this.queueRequest(req, res, next, startTime, clientIp, requestId, priority);
            this.log('debug', 'Request queued', {
                requestId,
                priority,
                queueLength,
                load: `${Math.round(load.cpu)}% CPU, ${Math.round(load.memory)}% memory`
            });
            return { queued: true };
        } else {
            this.sendError(res, 503, 'Server overloaded - queue full', requestId);
            return { queued: false };
        }
    }
    
    processRequest(req, res, next, startTime, clientIp, requestId, priority) {
        this.state.activeRequests++;
        this.state.totalRequests++;
        
        this.trackRateLimit(clientIp);
        
        const endpoint = `${req.method} ${req.path}`;
        if (!this.metrics.endpoints.has(endpoint)) {
            this.metrics.endpoints.set(endpoint, { count: 0, totalTime: 0 });
        }
        
        const originalJson = res.json;
        const originalSend = res.send;
        const originalEnd = res.end;
        
        res.json = (data) => {
            const duration = Date.now() - startTime;
            this.recordRequest(endpoint, duration, res.statusCode);
            this.cleanup();
            return originalJson.call(res, data);
        };
        
        res.send = (data) => {
            const duration = Date.now() - startTime;
            this.recordRequest(endpoint, duration, res.statusCode);
            this.cleanup();
            return originalSend.call(res, data);
        };
        
        res.end = (...args) => {
            const duration = Date.now() - startTime;
            this.recordRequest(endpoint, duration, res.statusCode);
            this.cleanup();
            return originalEnd.call(res, ...args);
        };
        
        const originalStatus = res.status;
        res.status = (code) => {
            if (code >= 400) this.trackError(code, endpoint);
            if (code >= 500) {
                this.state.failedRequests++;
                this.trackFailure();
            }
            return originalStatus.call(res, code);
        };
        
        res.setHeader('X-Load-Balancer-Worker', this.state.workerId);
        res.setHeader('X-Load-Balancer-Port', this.config.currentPort);
        res.setHeader('X-Request-Id', requestId);
        res.setHeader('X-Queue-Position', this.getQueuePosition(priority));
        
        if (this.config.enableRequestLogging) {
            this.log('info', `Request processed`, {
                requestId,
                method: req.method,
                path: req.path,
                priority,
                ip: clientIp
            });
        }
        
        next();
    }
    
    cleanup() {
        this.state.activeRequests--;
    }
    
    recordRequest(endpoint, duration, statusCode) {
        this.metrics.responseTimes.push(duration);
        if (this.metrics.responseTimes.length > 1000) {
            this.metrics.responseTimes.shift();
        }
        
        this.metrics.statusCodes[statusCode] = (this.metrics.statusCodes[statusCode] || 0) + 1;
        
        const endpointData = this.metrics.endpoints.get(endpoint);
        if (endpointData) {
            endpointData.count++;
            endpointData.totalTime += duration;
        }
    }
    
    trackError(statusCode, endpoint) {
        if (!this.metrics.errors[endpoint]) {
            this.metrics.errors[endpoint] = {};
        }
        this.metrics.errors[endpoint][statusCode] = (this.metrics.errors[endpoint][statusCode] || 0) + 1;
    }
    
    queueRequest(req, res, next, startTime, clientIp, requestId, priority) {
        const queueItem = {
            req,
            res,
            next,
            startTime,
            clientIp,
            requestId,
            priority,
            timestamp: Date.now()
        };
        
        if (this.config.enablePriorityQueue) {
            this.state.requestQueue[priority].push(queueItem);
        } else {
            this.state.requestQueue.normal.push(queueItem);
        }
        
        setTimeout(() => {
            this.removeFromQueue(queueItem);
            if (!res.headersSent) {
                this.sendError(res, 503, 'Request timeout in queue', requestId);
            }
        }, this.config.queueTimeout);
    }
    
    removeFromQueue(queueItem) {
        if (this.config.enablePriorityQueue) {
            const queue = this.state.requestQueue[queueItem.priority];
            const index = queue.indexOf(queueItem);
            if (index > -1) queue.splice(index, 1);
        } else {
            const index = this.state.requestQueue.normal.indexOf(queueItem);
            if (index > -1) this.state.requestQueue.normal.splice(index, 1);
        }
    }
    
    async processQueue() {
        if (this.state.processingQueue) return;
        
        this.state.processingQueue = true;
        
        const load = this.getSystemLoad();
        const maxConcurrent = Math.max(1, Math.floor(20 * (1 - load.cpu / 100)));
        let processed = 0;
        
        if (this.config.enablePriorityQueue) {
            processed += await this.processQueueByPriority('high', maxConcurrent - processed);
            if (processed < maxConcurrent) {
                processed += await this.processQueueByPriority('normal', maxConcurrent - processed);
            }
            if (processed < maxConcurrent) {
                processed += await this.processQueueByPriority('low', maxConcurrent - processed);
            }
        } else {
            processed += await this.processQueueByPriority('normal', maxConcurrent);
        }
        
        this.state.processingQueue = false;
    }
    
    async processQueueByPriority(priority, maxToProcess) {
        const queue = this.config.enablePriorityQueue ? 
            this.state.requestQueue[priority] : 
            this.state.requestQueue.normal;
        
        let processed = 0;
        
        while (queue.length > 0 && processed < maxToProcess) {
            const item = queue.shift();
            if (item) {
                this.processRequest(
                    item.req,
                    item.res,
                    item.next,
                    item.startTime,
                    item.clientIp,
                    item.requestId,
                    item.priority
                );
                processed++;
            }
        }
        
        return processed;
    }
    
    getSystemLoad() {
        const cpuLoad = os.loadavg()[0];
        const cpuUsage = (cpuLoad / os.cpus().length) * 100;
        
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const memoryUsage = ((totalMem - freeMem) / totalMem) * 100;
        
        const eventLoopDelay = this.state.lastEventLoopDelay;
        
        const queueSize = this.config.enablePriorityQueue ?
            this.state.requestQueue.high.length +
            this.state.requestQueue.normal.length +
            this.state.requestQueue.low.length :
            this.state.requestQueue.normal.length;
        
        const isOverloaded = 
            cpuUsage > this.config.cpuThreshold ||
            memoryUsage > this.config.memoryThreshold ||
            eventLoopDelay > this.config.eventLoopThreshold ||
            queueSize > 100 ||
            this.state.activeRequests > 50;
        
        return {
            cpu: Math.round(cpuUsage * 100) / 100,
            memory: Math.round(memoryUsage * 100) / 100,
            eventLoop: eventLoopDelay,
            isOverloaded,
            queueSize,
            activeRequests: this.state.activeRequests,
            loadAverage: os.loadavg()
        };
    }
    
    measureEventLoopDelay() {
        const start = Date.now();
        setImmediate(() => {
            this.state.lastEventLoopDelay = Date.now() - start;
        });
    }
    
    getClientIp(req) {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.socket?.remoteAddress ||
               req.connection?.remoteAddress ||
               '0.0.0.0';
    }
    
    checkIpAccess(ip) {
        if (this.config.enableIpWhitelist && !this.config.ipWhitelist.includes(ip)) {
            return false;
        }
        if (this.config.enableIpBlacklist && this.config.ipBlacklist.includes(ip)) {
            return false;
        }
        return true;
    }
    
    async checkRateLimit(ip) {
        if (this.config.enableRedisRateLimit && this.config.redisClient) {
            return this.checkRedisRateLimit(ip);
        }
        
        const now = Date.now();
        const record = this.state.rateLimitMap.get(ip);
        
        if (!record) return true;
        
        if (now - record.timestamp > this.config.rateLimitWindow) {
            this.state.rateLimitMap.delete(ip);
            return true;
        }
        
        return record.count < this.config.maxRequestsPerIp;
    }
    
    async checkRedisRateLimit(ip) {
        try {
            const key = `rate_limit:${ip}`;
            const client = this.config.redisClient;
            
            const current = await client.incr(key);
            if (current === 1) {
                await client.expire(key, Math.ceil(this.config.rateLimitWindow / 1000));
            }
            
            return current <= this.config.maxRequestsPerIp;
        } catch (error) {
            this.log('error', 'Redis rate limit check failed', { error: error.message });
            return true;
        }
    }
    
    trackRateLimit(ip) {
        if (this.config.enableRedisRateLimit) return;
        
        const now = Date.now();
        const record = this.state.rateLimitMap.get(ip);
        
        if (!record) {
            this.state.rateLimitMap.set(ip, {
                count: 1,
                timestamp: now
            });
        } else {
            record.count++;
        }
    }
    
    cleanRateLimitMap() {
        const now = Date.now();
        for (const [ip, record] of this.state.rateLimitMap) {
            if (now - record.timestamp > this.config.rateLimitWindow) {
                this.state.rateLimitMap.delete(ip);
            }
        }
    }
    
    trackFailure() {
        const recentFailures = this.metrics.errors.recent || [];
        recentFailures.push(Date.now());
        
        if (recentFailures.length > 100) recentFailures.shift();
        
        this.metrics.errors.recent = recentFailures;
        
        const failuresInWindow = recentFailures.filter(
            t => t > Date.now() - 60000
        ).length;
        
        if (failuresInWindow >= this.config.failureThreshold) {
            this.state.circuitState = this.CIRCUIT_STATES.OPEN;
            this.state.circuitOpenUntil = Date.now() + this.config.recoveryTimeout;
            this.log('warn', `⚠️ Circuit breaker opened for ${this.config.recoveryTimeout}ms`, {
                failuresInWindow,
                threshold: this.config.failureThreshold
            });
        }
    }
    
    async checkHealth() {
        for (const instance of this.config.backendInstances) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.config.healthCheckTimeout);
                
                const response = await fetch(`${instance}/health`, {
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    const data = await response.json();
                    this.state.instanceHealth[instance] = {
                        status: 'healthy',
                        timestamp: Date.now(),
                        responseTime: response.duration || 0,
                        data
                    };
                    this.state.consecutiveHealthCheckFailures = 0;
                } else {
                    throw new Error(`Health check failed with status ${response.status}`);
                }
            } catch (error) {
                this.state.consecutiveHealthCheckFailures++;
                
                this.state.instanceHealth[instance] = {
                    status: this.state.consecutiveHealthCheckFailures >= this.config.unhealthyThreshold ? 
                        'unhealthy' : 'degraded',
                    timestamp: Date.now(),
                    error: error.message,
                    failures: this.state.consecutiveHealthCheckFailures
                };
                
                this.log('warn', `Health check failed for ${instance}`, {
                    error: error.message,
                    failures: this.state.consecutiveHealthCheckFailures
                });
            }
        }
        
        this.emit('health', this.state.instanceHealth);
    }
    
    checkAutoScaling() {
        if (!this.config.enableAutoScaling) return;
        
        const load = this.getSystemLoad();
        const currentInstances = this.config.backendInstances.length;
        
        if (load.cpu > this.config.scaleUpThreshold && 
            currentInstances < this.config.maxInstances) {
            this.emit('scale-up', {
                reason: 'High CPU load',
                currentLoad: load.cpu,
                threshold: this.config.scaleUpThreshold,
                currentInstances,
                maxInstances: this.config.maxInstances
            });
        }
        
        if (load.cpu < this.config.scaleDownThreshold && 
            currentInstances > this.config.minInstances) {
            this.emit('scale-down', {
                reason: 'Low CPU load',
                currentLoad: load.cpu,
                threshold: this.config.scaleDownThreshold,
                currentInstances,
                minInstances: this.config.minInstances
            });
        }
    }
    
    collectMetrics() {
        const now = Date.now();
        const uptime = (now - this.metrics.startTime) / 1000;
        
        this.metrics.requestsPerSecond = this.state.totalRequests / uptime;
        
        if (this.metrics.responseTimes.length > 0) {
            this.metrics.averageResponseTime = 
                this.metrics.responseTimes.reduce((a, b) => a + b, 0) / 
                this.metrics.responseTimes.length;
        }
        
        const metrics = {
            timestamp: now,
            workerId: this.state.workerId,
            port: this.config.currentPort,
            uptime,
            requests: {
                total: this.state.totalRequests,
                active: this.state.activeRequests,
                queued: this.getQueuePosition('normal'),
                failed: this.state.failedRequests,
                perSecond: this.metrics.requestsPerSecond
            },
            performance: {
                avgResponseTime: Math.round(this.metrics.averageResponseTime),
                responseTime95: this.calculatePercentile(95),
                responseTime99: this.calculatePercentile(99)
            },
            circuitBreaker: {
                state: this.state.circuitState,
                openUntil: this.state.circuitOpenUntil
            },
            system: this.getSystemLoad(),
            instances: this.state.instanceHealth
        };
        
        this.emit('metrics', metrics);
        return metrics;
    }
    
    calculatePercentile(percentile) {
        if (this.metrics.responseTimes.length === 0) return 0;
        
        const sorted = [...this.metrics.responseTimes].sort((a, b) => a - b);
        const index = Math.ceil(percentile / 100 * sorted.length) - 1;
        return Math.round(sorted[index] || 0);
    }
    
    sendError(res, status, message, requestId) {
        if (res.headersSent) return;
        
        const response = {
            success: false,
            message,
            requestId,
            timestamp: new Date().toISOString(),
            loadBalancer: {
                workerId: this.state.workerId,
                port: this.config.currentPort,
                queueSize: this.getQueuePosition('normal'),
                activeRequests: this.state.activeRequests,
                circuitState: this.state.circuitState
            }
        };
        
        return res.status(status).json(response);
    }
    
    setEnabled(enabled) {
        this.state.isEnabled = enabled;
        this.log('info', `🔄 Load balancer ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    getStatus() {
        return {
            enabled: this.state.isEnabled,
            workerId: this.state.workerId,
            port: this.config.currentPort,
            clusterMode: this.state.clusterMode,
            circuitBreaker: {
                state: this.state.circuitState,
                openUntil: this.state.circuitOpenUntil
            },
            queue: {
                high: this.state.requestQueue.high.length,
                normal: this.state.requestQueue.normal.length,
                low: this.state.requestQueue.low.length,
                total: this.getQueuePosition('normal')
            },
            activeRequests: this.state.activeRequests,
            totalRequests: this.state.totalRequests,
            failedRequests: this.state.failedRequests,
            system: this.getSystemLoad(),
            instances: this.state.instanceHealth,
            metrics: this.collectMetrics()
        };
    }
    
    resetCircuitBreaker() {
        this.state.circuitState = this.CIRCUIT_STATES.CLOSED;
        this.state.circuitOpenUntil = null;
        this.state.halfOpenSuccessCount = 0;
        this.state.halfOpenRequestCount = 0;
        this.log('info', '🔄 Circuit breaker manually reset');
    }
    
    clearQueue() {
        this.state.requestQueue = {
            high: [],
            normal: [],
            low: []
        };
        this.log('info', `🧹 Queue cleared`);
    }
}

// Create singleton instance
const loadBalancer = new LoadBalancerMiddleware({
    basePort: 3002,
    logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    enablePriorityQueue: true,
    backendInstances: process.env.CLUSTER_MODE ? undefined : [`http://localhost:${process.env.PORT || 3002}`]
});

// Export middleware
export default loadBalancer.middleware;

// Export status getter
export const getLoadBalancerStatus = () => loadBalancer.getStatus();

// Export control functions
export const enableLoadBalancer = () => loadBalancer.setEnabled(true);
export const disableLoadBalancer = () => loadBalancer.setEnabled(false);
export const resetCircuitBreaker = () => loadBalancer.resetCircuitBreaker();
export const clearQueue = () => loadBalancer.clearQueue();

// Export metrics endpoint handler
export const metricsHandler = (req, res) => {
    const status = loadBalancer.getStatus();
    
    if (req.query.format === 'prometheus') {
        let metrics = '';
        metrics += `# HELP load_balancer_active_requests Current active requests\n`;
        metrics += `# TYPE load_balancer_active_requests gauge\n`;
        metrics += `load_balancer_active_requests{worker="${status.workerId}",port="${status.port}"} ${status.activeRequests}\n\n`;
        
        metrics += `# HELP load_balancer_queue_size Current queue size\n`;
        metrics += `# TYPE load_balancer_queue_size gauge\n`;
        metrics += `load_balancer_queue_size{worker="${status.workerId}",port="${status.port}"} ${status.queue.total}\n\n`;
        
        metrics += `# HELP load_balancer_requests_total Total requests processed\n`;
        metrics += `# TYPE load_balancer_requests_total counter\n`;
        metrics += `load_balancer_requests_total{worker="${status.workerId}",port="${status.port}"} ${status.totalRequests}\n\n`;
        
        metrics += `# HELP load_balancer_response_time_avg Average response time in ms\n`;
        metrics += `# TYPE load_balancer_response_time_avg gauge\n`;
        metrics += `load_balancer_response_time_avg{worker="${status.workerId}",port="${status.port}"} ${status.metrics.avgResponseTime}\n`;
        
        res.set('Content-Type', 'text/plain');
        return res.send(metrics);
    }
    
    res.json(status);
};