import express from 'express';
import SMSController from '../controllers/SMSController.js'; // ← Import the object
import { debugEmailStatementService } from '../utils/emailStatementService.js';

const router = express.Router();

router.post('/create', SMSController.sendSMSAfterTransaction); // ← Access the method
// router.get('/status/:smsId', SMSController.getSMSStatus);
// router.post('/resend/:smsId', SMSController.resendSMS);


// In your routes file
router.get('/email-statements/debug', async (req, res) => {
  try {
    const result = await debugEmailStatementService();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;