import express from 'express';
import sendSMSAfterTransaction  from '../controllers/SMSController.js';

const router = express.Router();

// POST route to create an SMS
router.post('/create', sendSMSAfterTransaction);

export default router;
