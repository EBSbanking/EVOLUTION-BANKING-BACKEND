import express from 'express';
import { createRootSubfolder, fetchSubfolders } from '../controllers/SubfolderController.js';

const router = express.Router();

// Route to create a new subfolder
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

// Route to fetch subfolders (optionally filtered by parentId)
router.get('/fetch', async (req, res) => {
  try {
    const { parentId } = req.query; // Assuming parentId is passed as a query parameter
    const subfolders = await fetchSubfolders(parentId);
    return res.status(200).json(subfolders);
  } catch (error) {
    console.error('Route error:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;