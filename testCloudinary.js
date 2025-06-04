import cloudinary from 'cloudinary';
import { v2 as cloudinaryV2 } from 'cloudinary';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configure Cloudinary
cloudinaryV2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Check if Cloudinary is connected
cloudinaryV2.api.resources()
  .then(result => {
    console.log('Cloudinary Connection Successful:', result);
  })
  .catch(error => {
    console.error('Cloudinary Connection Failed:', error);
  });
