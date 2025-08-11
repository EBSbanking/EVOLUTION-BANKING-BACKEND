// routes/system.js
import express from 'express';
const router = express.Router();

router.get('/status', (req, res) => {
  try {
    // You can also ping DB or any service here
    res.status(200).json({ status: 'ok', timestamp: new Date() });
  } catch (error) {
    res.status(500).json({ status: 'down', error: error.message });
  }
});

export default router;
