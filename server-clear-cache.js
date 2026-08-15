// server-clear-cache.js
import('./server.js').catch(err => {
  console.error('Error loading server:', err);
  process.exit(1);
});