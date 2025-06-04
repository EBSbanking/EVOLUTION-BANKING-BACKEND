import multer from 'multer';
import path from 'path';

// Set up multer storage and file filter options
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './uploads'); // Directory where uploaded files will be stored temporarily
  },
  filename: (req, file, cb) => {
    // Set a unique filename by appending the current timestamp
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

// Filter to only accept image files
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true); // Accept the file
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, or PDF files are allowed.'), false);
  }
};

// Middleware setup with file size limit and file type validation
const uploadMiddleware = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // Maximum file size: 5MB
}).single('file'); // Single file upload (the field name in the form should be 'file')

export { uploadMiddleware };
