// routes/uploadRoutes.js
import express from 'express';
import fileUpload from 'express-fileupload';

const router = express.Router();

// Enable file upload middleware
router.use(fileUpload());

// Handle file uploads
router.post('/', (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({ error: 'No files were uploaded.' });
    }

    const file = req.files.file; // Ensure this matches your form-data key
    const uploadPath = `uploads/${file.name}`;

    // Move the uploaded file
    file.mv(uploadPath, (err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to upload file.' });
        }
        res.status(200).json({ message: 'File uploaded successfully!', path: uploadPath });
    });
});

export default router;
