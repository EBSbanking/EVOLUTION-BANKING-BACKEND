import { v2 as cloudinaryV2 } from 'cloudinary';
import IdentificationInformation from '../models/IdentificationInformation.js';
import fs from 'fs';
import path from 'path';

// Cloudinary configuration
cloudinaryV2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadIdentification = async (req, res) => {
  try {
    const { CUST_ID, CUST_NM, docId, documentType, documentId, countryOfIssuer, expiryDate } = req.body;

    // Check if file exists in the request
    if (!req.file) {
      throw new Error('No file uploaded');
    }

    // Upload to Cloudinary
    const cloudinaryResult = await cloudinaryV2.uploader.upload(req.file.path, {
      resource_type: 'image',  // Ensure it's uploaded as an image
    });

    // Prepare the data to save
    const newIdentification = new IdentificationInformation({
      CUST_ID,
      CUST_NM,
      docId,
      documentType,
      documentId,
      countryOfIssuer,
      expiryDate,
      image: cloudinaryResult.secure_url,  // Save the Cloudinary URL
    });

    // Save to database
    const savedRecord = await newIdentification.save();

    // Send response
    res.status(200).json({ message: 'Identification information saved successfully', data: savedRecord });
  } catch (error) {
    console.error('Error during identification information upload:', error);
    res.status(500).json({ message: 'Something went wrong!', error: error.message });
  }
};
