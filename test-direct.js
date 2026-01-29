// test-direct.js
import express from 'express';

const app = express();
app.use(express.json());

// Direct route - no imports
app.post('/api/account-applications/customer/:customerId/documents', (req, res) => {
  console.log('Direct route hit!', req.params.customerId);
  res.json({
    success: true,
    message: 'Direct route IS WORKING',
    customerId: req.params.customerId,
    timestamp: new Date().toISOString(),
    body: req.body
  });
});

app.get('/api/account-applications/health', (req, res) => {
  res.json({ status: 'OK', message: 'Health check working' });
});

app.get('/test', (req, res) => {
  res.json({ message: 'Test endpoint' });
});

const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log(`Test this: POST http://localhost:${PORT}/api/account-applications/customer/0000000035/documents`);
});