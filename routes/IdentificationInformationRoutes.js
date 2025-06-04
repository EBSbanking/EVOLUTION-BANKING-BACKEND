import express from 'express';
import { uploadIdentification } from '../controllers/IdentificationInformationController.js'; // Import the controller function
import { uploadMiddleware } from '../middlewares/uploadMiddleware.js';
const router = express.Router();

// Define the POST route for uploading identification
router.post('/api/identifications/upload', uploadMiddleware, uploadIdentification);

export default router;
