// middleware/debugMiddleware.js
export const debugFormData = (req, res, next) => {
  console.log('=== FORM DATA DEBUG ===');
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Content-Length:', req.headers['content-length']);
  console.log('Body keys:', Object.keys(req.body));
  console.log('Files:', req.files);
  console.log('File:', req.file);
  console.log('========================');
  next();
};