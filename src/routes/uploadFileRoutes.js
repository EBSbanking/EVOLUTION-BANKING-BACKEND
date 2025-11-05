import express from 'express';
import { uploadFileAndUpdateStatus, getFileByCUSTNO } from '../controllers/uploadController.js'; // Ensure correct export
 // Import controller functions

const router = express.Router();

// Define routes for uploading and retrieving files
router.post('/upload', uploadFileAndUpdateStatus); // POST for file upload
router.get('/:CUSTNO', getFileByCUSTNO); // GET for retrieving file by CUST_NO

export default router;
