let activeRequests = 0;
let totalRequests = 0;

export const performanceMonitor = (req, res, next) => {
  activeRequests++;
  totalRequests++;
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    activeRequests--;
    
    // Log slow requests
    if (duration > 1000) {
      console.warn(`Slow request: ${req.method} ${req.url} - ${duration}ms`);
    }
  });
  
  // Add metrics to response
  res.locals.metrics = { activeRequests, totalRequests };
  next();
};

export const getMetrics = () => ({ activeRequests, totalRequests });