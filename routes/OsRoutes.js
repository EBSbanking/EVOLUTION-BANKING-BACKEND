import express from 'express';
import { triggerServices, getDormantAccountsCount, getStatus } from '../controllers/OsController.js';

const router = express.Router();

router.get('/dormant-accounts/count', getDormantAccountsCount); // existing
router.post('/trigger-services', triggerServices);               // existing
router.get('/status', getStatus);                                // new

export default router;
