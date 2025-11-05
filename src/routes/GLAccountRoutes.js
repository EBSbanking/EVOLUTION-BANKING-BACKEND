// routes/GLAccountRoutes.js

import express from 'express';
import GLAccountController from '../controllers/GLAccountController.js'; // Ensure this path is correct

const router = express.Router();

// GL Account CRUD routes
router.post('/create', GLAccountController.createGLAccount);
router.get('/create', GLAccountController.getAllGLAccounts);
router.get('/gl-accounts/:GL_ACCT_NO', GLAccountController.getGLAccountById);
router.put('/gl-accounts/:GL_ACCT_NO', GLAccountController.updateGLAccount);
router.delete('/gl-accounts/:GL_ACCT_NO', GLAccountController.deleteGLAccount);

// Subfolder routes
router.get('/subfolders/:parentId', GLAccountController.fetchSubfolders);
router.post('/subfolders', GLAccountController.createSubfolder);

// EOD / Transaction processing routes
router.post('/eod/process', GLAccountController.processEODGLTransactions);
router.post('/transactions/queue', GLAccountController.queueGLTransaction);

export default router;
