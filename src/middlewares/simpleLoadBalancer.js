/**
 * Simple Load Balancer Client Middleware
 * For backend servers - only provides status endpoints, no health checking
 */

let loadBalancerStatus = {
    enabled: true,
    workerId: process.env.WORKER_ID || 1,
    port: process.env.PORT || 3002,
    clusterMode: process.env.CLUSTER_MODE === 'true' || !!process.env.WORKER_ID
};

// Simple middleware that just passes through
const simpleLoadBalancerMiddleware = (req, res, next) => {
    // Just pass through - this is a client, not a load balancer
    next();
};

// Status getter
export const getLoadBalancerStatus = () => ({
    ...loadBalancerStatus,
    timestamp: new Date().toISOString()
});

// Control functions (no-ops for backend)
export const enableLoadBalancer = () => {
    loadBalancerStatus.enabled = true;
    console.log('✅ Load balancer client enabled');
};

export const disableLoadBalancer = () => {
    loadBalancerStatus.enabled = false;
    console.log('⚠️ Load balancer client disabled');
};

export const resetCircuitBreaker = () => {
    console.log('🔄 Circuit breaker reset (no-op on backend)');
};

export const clearQueue = () => {
    console.log('🧹 Queue cleared (no-op on backend)');
};

// Metrics handler
export const metricsHandler = (req, res) => {
    res.json({
        ...getLoadBalancerStatus(),
        message: 'Backend server - metrics available from load balancer on port 5000'
    });
};

export default simpleLoadBalancerMiddleware;