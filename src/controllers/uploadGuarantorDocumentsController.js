import mongoose from 'mongoose';
import fs from 'fs';
import { v2 as cloudinaryV2 } from 'cloudinary';
import dotenv from 'dotenv';
import UploadGuarantorDocuments from '../models/uploadGuarantorDocuments.js';
import Guarantor from '../models/Guarantor.js';

dotenv.config();

cloudinaryV2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Enhanced file processor
const processGuarantorFile = async (file, folder) => {
  try {
    const result = await cloudinaryV2.uploader.upload(file.path, {
      folder: `GUARANTOR/DOCUMENTS/${folder}`,
      resource_type: 'auto',
      quality: 'auto:good',
      timeout: 30000
    });

    // Clean up temp file
    fs.unlinkSync(file.path);
    
    return result;
  } catch (error) {
    // Clean up temp file if upload fails
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    throw error;
  }
};

export const uploadGuarantorDocuments = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log('Request files:', req.files);
    console.log('Request body:', req.body);

    // Validate required files
    if (!req.files || !req.files['IMAGE'] || !req.files['DOCUMENT']) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FILES',
        message: 'Both IMAGE and DOCUMENT files are required',
        receivedFiles: req.files ? Object.keys(req.files) : []
      });
    }

    const { GUARANTOR_ID, uploadedBy } = req.body;
    const [imageFile, documentFile] = [req.files['IMAGE'][0], req.files['DOCUMENT'][0]];

    // Validate GUARANTOR_ID
    if (!GUARANTOR_ID || !mongoose.Types.ObjectId.isValid(GUARANTOR_ID)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_GUARANTOR_ID',
        message: 'Valid GUARANTOR_ID is required'
      });
    }

    // Process files in parallel
    const [imageResult, docResult] = await Promise.all([
      processGuarantorFile(imageFile, 'IMAGE'),
      processGuarantorFile(documentFile, 'DOCUMENT')
    ]);

    // Database operations - using UploadGuarantorDocuments instead of FileUpload
    const [imageDoc, documentDoc] = await Promise.all([
      new UploadGuarantorDocuments({
        GUARANTOR_ID,
        filename: imageResult.original_filename,
        url: imageResult.secure_url,
        public_id: imageResult.public_id,
        size: imageFile.size,
        format: imageResult.format,
        uploadedBy: uploadedBy || 'System',
        docType: 'IMAGE'
      }).save({ session }),
      
      new UploadGuarantorDocuments({
        GUARANTOR_ID,
        filename: docResult.original_filename,
        url: docResult.secure_url,
        public_id: docResult.public_id,
        size: documentFile.size,
        format: docResult.format,
        uploadedBy: uploadedBy || 'System',
        docType: 'DOCUMENT'
      }).save({ session })
    ]);

    // Update guarantor
    await Guarantor.findByIdAndUpdate(
      GUARANTOR_ID,
      {
        $set: {
          imageUrl: imageResult.secure_url,
          documentUrl: docResult.secure_url,
          updatedAt: new Date()
        }
      },
      { new: true, session }
    );

    await session.commitTransaction();

    return res.status(201).json({
      success: true,
      code: 'DOCUMENTS_UPLOADED',
      message: 'Documents uploaded successfully',
      data: {
        guarantorId: GUARANTOR_ID,
        image: imageDoc,
        document: documentDoc
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Controller error:', error);
    
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to process documents',
      error: error.message
    });
  } finally {
    session.endSession();
    
    // Cleanup any remaining temp files
    if (req.files) {
      Object.values(req.files).flat().forEach(file => {
        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
  }
};

export default {
  uploadGuarantorDocuments: uploadGuarantorDocuments
};