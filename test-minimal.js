import http from 'http';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('✅ SIMPLE TEST SERVER IS WORKING!');
});

server.listen(3002, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  ✅ SIMPLE TEST SERVER RUNNING ON PORT 3002              ║
║     http://localhost:3002                                ║
╚══════════════════════════════════════════════════════════╝
  `);
});

server.on('error', (err) => {
  console.error('❌ Server error:', err.message);
});