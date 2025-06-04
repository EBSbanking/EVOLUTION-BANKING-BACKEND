// src/routes/osRoutes.js
import express from 'express';
import { triggerServices } from '../controllers/OsController.js';

const router = express.Router();

// Route to trigger all services/jobs manually
router.post('/trigger', triggerServices);

export default router;
