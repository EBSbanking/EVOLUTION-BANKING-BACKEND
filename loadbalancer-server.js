// loadbalancer-server.js - Standalone Load Balancer
import express from 'express';
import http from 'http';
import { createProxyMiddleware } from 'http-proxy-middleware';
import loadBalancerMiddleware, { metricsHandler, getLoadBalancerStatus } from './loadbalancer.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = 3002;  // Load balancer runs on port 5000
const BACKEND_PORT = process.env.PORT || 3002;  // Backend runs on 3002
const BACKEND_HOST = process.env.BACKEND_HOST || 'localhost';

// Install http-proxy-middleware if not already installed:
// npm install http-proxy-middleware

console.log(`
╔══════════════════════════════════════════════════════════╗
║     Evolution Banking - Load Balancer                    ║
╠══════════════════════════════════════════════════════════╣
║  🚀 Starting load balancer on port ${PORT}                ║
║  🔗 Backend server: http://${BACKEND_HOST}:${BACKEND_PORT}     ║
╚══════════════════════════════════════════════════════════╝
`);

// Use the load balancer middleware for all requests
app.use(loadBalancerMiddleware);

// Health check endpoint for the load balancer itself
app.get('/lb-health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    port: PORT,
    backend: `http://${BACKEND_HOST}:${BACKEND_PORT}`,
    timestamp: new Date().toISOString(),
    loadBalancer: getLoadBalancerStatus()
  });
});

// Metrics endpoint
app.get('/metrics', metricsHandler);

// Status endpoint
app.get('/lb-status', (req, res) => {
  res.json(getLoadBalancerStatus());
});

// Proxy configuration
const proxyOptions = {
  target: `http://${BACKEND_HOST}:${BACKEND_PORT}`,
  changeOrigin: true,
  pathRewrite: {
    '^/': '/' // No path rewriting needed
  },
  onProxyReq: (proxyReq, req, res) => {
    // Add load balancer headers
    proxyReq.setHeader('X-Forwarded-For', req.socket.remoteAddress);
    proxyReq.setHeader('X-Forwarded-Proto', req.protocol);
    proxyReq.setHeader('X-Forwarded-Host', req.headers.host);
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err.message);
    res.status(503).json({
      error: 'Backend service unavailable',
      message: err.message,
      timestamp: new Date().toISOString()
    });
  },
  logLevel: 'warn'
};

// Create proxy middleware
const proxyMiddleware = createProxyMiddleware(proxyOptions);

// Apply proxy to all routes
app.use('*', (req, res, next) => {
  // Skip health and metrics endpoints
  if (req.path === '/lb-health' || req.path === '/metrics' || req.path === '/lb-status') {
    return next();
  }
  
  console.log(`🔄 Proxying: ${req.method} ${req.path} -> ${BACKEND_HOST}:${BACKEND_PORT}`);
  proxyMiddleware(req, res, next);
});

// Create HTTP server
const server = http.createServer(app);

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Load balancer running on port ${PORT}`);
  console.log(`📊 Metrics available at http://localhost:${PORT}/metrics`);
  console.log(`📊 Status available at http://localhost:${PORT}/lb-status`);
  console.log(`🔄 Proxying requests to http://${BACKEND_HOST}:${BACKEND_PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🔻 Shutting down load balancer...');
  server.close(() => {
    console.log('✅ Load balancer closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n🔻 Shutting down load balancer...');
  server.close(() => {
    console.log('✅ Load balancer closed');
    process.exit(0);
  });
});