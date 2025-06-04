// GLAccountRoutes.js

// routes/GLAccountRoutes.js

import express from 'express';
import GLAccountController from '../controllers/GLAccountController.js'; // Ensure this path is correct

const router = express.Router();

// Define your routes
router.post('/create', GLAccountController.createGLAccount);  // this should match the exported function
router.get('/create', GLAccountController.getAllGLAccounts);
router.get('/gl-accounts/:GL_ACCT_NO', GLAccountController.getGLAccountById);
router.put('/gl-accounts/:GL_ACCT_NO', GLAccountController.updateGLAccount);
router.delete('/gl-accounts/:GL_ACCT_NO', GLAccountController.deleteGLAccount);

export default router;
