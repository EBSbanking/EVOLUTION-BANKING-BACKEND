// import mongoose from 'mongoose';
// import { v2 as cloudinaryV2 } from 'cloudinary';
// import IdentificationInformation from './models/IdentificationInformation.js';
// import dotenv from 'dotenv';
// import path from 'path';
// import { fileURLToPath } from 'url';
// import fs from 'fs';

// // Load environment variables
// dotenv.config();

// // Configure Cloudinary
// cloudinaryV2.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// });

// // Resolve the directory and file path (to simulate __dirname)
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // MongoDB connection with proper options
// const connectToDatabase = async () => {
//   try {
//     const mongoUri = process.env.MONGODB_URI;
//     if (!mongoUri) {
//       throw new Error('MONGODB_URI is not defined in the .env file.');
//     }

//     await mongoose.connect(mongoUri, {
//       useNewUrlParser: true,
//       useUnifiedTopology: true,
//     });
//     console.log('MongoDB connected successfully.');
//   } catch (err) {
//     console.error('MongoDB connection error:', err);
//     process.exit(1); // Exit if the connection fails
//   }
// };

// // Test identification information upload
// const testIdentificationUpload = async () => {
//   try {
//     // Test data for identification information
//     const testData = {
//       CUST_ID: 12345,
//       CUST_NM: 'John Doe',
//       docId: 'DOC123456789',
//       documentType: 'Passport',
//       documentId: 'P123456789',
//       countryOfIssuer: 'USA',
//       expiryDate: new Date('2028-12-31'),
//     };

//     // Define the file path (adjust as needed)
//     const filePath = path.join(__dirname, './image for test/Our Logo Update.JPG');

//     // Check if the file exists
//     if (!fs.existsSync(filePath)) {
//       throw new Error(`File not found: ${filePath}`);
//     }

//     // Upload file to Cloudinary
//     const cloudinaryResult = await cloudinaryV2.uploader.upload(filePath, {
//       resource_type: 'image', // Ensure it's treated as an image
//     });

//     // Add the uploaded image URL to the test data
//     testData.image = cloudinaryResult.secure_url;

//     // Save the identification information to the database
//     const newRecord = new IdentificationInformation(testData);
//     const savedRecord = await newRecord.save();

//     console.log('Identification information saved successfully:', savedRecord);
//   } catch (error) {
//     console.error('Error during identification information upload:', error);
//   }
// };

// // Main execution block
// const main = async () => {
//   await connectToDatabase();
//   await testIdentificationUpload();
//   mongoose.connection.close();
// };

// main().catch(err => {
//   console.error('Error in main execution:', err);
//   mongoose.connection.close(); // Ensure we close the connection even on error
// });
