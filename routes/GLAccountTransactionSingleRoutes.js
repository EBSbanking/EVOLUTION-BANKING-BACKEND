import express from 'express';
import { createGLTransaction  } from '../controllers/GLAccountTransactionSingle.js';

const router = express.Router();

// POST /api/gl-transactions - create a new GL transaction
router.post('/create', createGLTransaction );

export default router;
