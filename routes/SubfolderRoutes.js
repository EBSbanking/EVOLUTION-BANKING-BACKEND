import express from 'express';
import { createSubfolder, fetchSubfolders } from '../controllers/SubfolderController.js';

const router = express.Router();

// Route to create a new subfolder
router.post('/create', createSubfolder);

// Route to fetch subfolders (optionally filtered by parentId)
router.get('/fetch', fetchSubfolders);

export default router;
