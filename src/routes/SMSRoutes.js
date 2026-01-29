import express from 'express';
import SMSController from '../controllers/SMSController.js'; // ← Import the object

const router = express.Router();

router.post('/create', SMSController.sendSMSAfterTransaction); // ← Access the method
// router.get('/status/:smsId', SMSController.getSMSStatus);
// router.post('/resend/:smsId', SMSController.resendSMS);

export default router;