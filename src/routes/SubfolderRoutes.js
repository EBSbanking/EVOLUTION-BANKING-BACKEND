import express from 'express';
import {
  createRootSubfolder,
  createSimpleRootSubfolder,
  createSubfolderWithGLAccount,
  getAllSubfolders,
  getSubfolderById,
  fetchSubfolders
} from '../controllers/SubfolderController.js';

const router = express.Router();

// Route to create a new subfolder (original - requires GL_ACCT_NO)
router.post('/create', async (req, res) => {
  try {
    const { transactionId, GL_ACCT_NO, createdBy, description } = req.body;
    // Validate required fields
    if (!GL_ACCT_NO || !createdBy) {
      return res.status(400).json({ error: 'GL_ACCT_NO and createdBy are required' });
    }
    const subfolder = await createRootSubfolder(transactionId, { GL_ACCT_NO, createdBy, description });
    return res.status(201).json(subfolder);
  } catch (error) {
    console.error('Route error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Create simple root subfolder (no GL_ACCT_NO required)
router.post('/create-simple-root', createSimpleRootSubfolder);

// Create subfolder with GL account integration
router.post('/create-with-gl-account', createSubfolderWithGLAccount);

// Route to fetch subfolders (optionally filtered by parentId) - original endpoint
router.get('/fetch', async (req, res) => {
  try {
    const { parentId } = req.query;
    const subfolders = await fetchSubfolders(parentId);
    return res.status(200).json(subfolders);
  } catch (error) {
    console.error('Route error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Get all subfolders (new endpoint)
router.get('/', getAllSubfolders);

// Get subfolder by ID
router.get('/:id', getSubfolderById);

export default router;