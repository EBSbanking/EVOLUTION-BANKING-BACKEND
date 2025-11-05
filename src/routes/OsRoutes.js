import express from 'express';
import { triggerEndOfDayProcess, getCurrentBusinessDate, getServiceErrors, getDormantAccountsCount, getStatus } from '../controllers/OsController.js';

const router = express.Router();

router.get('/dormant-accounts/count', getDormantAccountsCount); // existing
router.post('/trigger-services', triggerEndOfDayProcess);               // existing
router.get('/status', getStatus);  
router.get('/processing-date', getCurrentBusinessDate); 
router.get('/error-service', getServiceErrors); 
                     

export default router;
