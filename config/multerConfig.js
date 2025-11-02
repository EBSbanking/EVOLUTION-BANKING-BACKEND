// config/multerConfig.js
import multer from 'multer';
import path from 'path';

// Configure storage
const storage = multer.memoryStorage();

// File filter function - more permissive for testing
const fileFilter = (req, file, cb) => {
  // Check file extension
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = ['.xls', '.xlsx', '.csv'];
  
  // More permissive mime types for testing
  const allowedMimeTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroEnabled.12'
  ];

  console.log('File upload attempt:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    extension: fileExtension
  });

  if (allowedExtensions.includes(fileExtension) || 
      allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    console.log('File rejected - invalid type:', file.mimetype, fileExtension);
    cb(new Error(`Only Excel files (.xls, .xlsx) are allowed. Got: ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // Increased to 50MB for testing
    files: 1
  }
});

export default upload;