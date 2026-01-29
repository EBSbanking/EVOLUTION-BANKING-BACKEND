import fs from 'fs';
import { v2 as cloudinaryV2 } from 'cloudinary';
import dotenv from 'dotenv';
import sequelize from '../../config/db.js';
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
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    
    return result;
  } catch (error) {
    // Clean up temp file if upload fails
    if (file.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    throw error;
  }
};

export const uploadGuarantorDocuments = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    console.log('Request files:', req.files);
    console.log('Request body:', req.body);

    // Validate required files
    if (!req.files || !req.files['IMAGE'] || !req.files['DOCUMENT']) {
      await transaction.rollback();
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
    if (!GUARANTOR_ID) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        code: 'INVALID_GUARANTOR_ID',
        message: 'GUARANTOR_ID is required'
      });
    }

    // Process files in parallel
    const [imageResult, docResult] = await Promise.all([
      processGuarantorFile(imageFile, 'IMAGE'),
      processGuarantorFile(documentFile, 'DOCUMENT')
    ]);

    // Database operations - using UploadGuarantorDocuments instead of FileUpload
    const [imageDoc, documentDoc] = await Promise.all([
      UploadGuarantorDocuments.create({
        GUARANTOR_ID,
        filename: imageResult.original_filename,
        url: imageResult.secure_url,
        public_id: imageResult.public_id,
        size: imageFile.size,
        format: imageResult.format,
        uploadedBy: uploadedBy || 'System',
        docType: 'IMAGE'
      }, { transaction }),
      
      UploadGuarantorDocuments.create({
        GUARANTOR_ID,
        filename: docResult.original_filename,
        url: docResult.secure_url,
        public_id: docResult.public_id,
        size: documentFile.size,
        format: docResult.format,
        uploadedBy: uploadedBy || 'System',
        docType: 'DOCUMENT'
      }, { transaction })
    ]);

    // Update guarantor
    await Guarantor.update(
      {
        imageUrl: imageResult.secure_url,
        documentUrl: docResult.secure_url,
        updatedAt: new Date()
      },
      {
        where: { id: GUARANTOR_ID },
        transaction
      }
    );

    // Get updated guarantor
    const guarantor = await Guarantor.findByPk(GUARANTOR_ID, { transaction });

    if (!guarantor) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        code: 'GUARANTOR_NOT_FOUND',
        message: 'Guarantor not found'
      });
    }

    await transaction.commit();

    return res.status(201).json({
      success: true,
      code: 'DOCUMENTS_UPLOADED',
      message: 'Documents uploaded successfully',
      data: {
        guarantorId: GUARANTOR_ID,
        guarantor: guarantor,
        image: imageDoc,
        document: documentDoc
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Controller error:', error);
    
    // Cleanup any remaining temp files
    if (req.files) {
      Object.values(req.files).flat().forEach(file => {
        if (file.path && fs.existsSync(file.path)) {
          try {
            fs.unlinkSync(file.path);
          } catch (cleanupError) {
            console.error('Failed to cleanup file:', cleanupError);
          }
        }
      });
    }
    
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to process documents',
      error: error.message
    });
  }
};

// Additional controller functions for guarantor documents

export const getGuarantorDocuments = async (req, res) => {
  try {
    const { GUARANTOR_ID } = req.params;

    if (!GUARANTOR_ID) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_PARAMETER',
        message: 'GUARANTOR_ID is required'
      });
    }

    const documents = await UploadGuarantorDocuments.findAll({
      where: { GUARANTOR_ID },
      order: [['uploadedAt', 'DESC']]
    });

    if (!documents || documents.length === 0) {
      return res.status(404).json({
        success: false,
        code: 'NO_DOCUMENTS_FOUND',
        message: 'No documents found for this guarantor'
      });
    }

    return res.status(200).json({
      success: true,
      code: 'DOCUMENTS_FETCHED',
      message: 'Documents retrieved successfully',
      data: {
        guarantorId: GUARANTOR_ID,
        documents: documents,
        count: documents.length
      }
    });

  } catch (error) {
    console.error('Get documents error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to fetch documents',
      error: error.message
    });
  }
};

export const getGuarantorDocumentById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_PARAMETER',
        message: 'Document ID is required'
      });
    }

    const document = await UploadGuarantorDocuments.findByPk(id);

    if (!document) {
      return res.status(404).json({
        success: false,
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Document not found'
      });
    }

    return res.status(200).json({
      success: true,
      code: 'DOCUMENT_FETCHED',
      message: 'Document retrieved successfully',
      data: document
    });

  } catch (error) {
    console.error('Get document error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to fetch document',
      error: error.message
    });
  }
};

export const deleteGuarantorDocument = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;

    if (!id) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        code: 'MISSING_PARAMETER',
        message: 'Document ID is required'
      });
    }

    const document = await UploadGuarantorDocuments.findByPk(id, { transaction });

    if (!document) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Document not found'
      });
    }

    // Delete from Cloudinary
    if (document.public_id) {
      try {
        await cloudinaryV2.uploader.destroy(document.public_id);
      } catch (cloudinaryError) {
        console.warn('Failed to delete from Cloudinary:', cloudinaryError.message);
        // Continue with database deletion even if Cloudinary fails
      }
    }

    await document.destroy({ transaction });

    // If this was an image or document for a guarantor, update the guarantor record
    if (document.docType === 'IMAGE' || document.docType === 'DOCUMENT') {
      const updateData = {};
      if (document.docType === 'IMAGE') {
        updateData.imageUrl = null;
      } else if (document.docType === 'DOCUMENT') {
        updateData.documentUrl = null;
      }

      await Guarantor.update(updateData, {
        where: { id: document.GUARANTOR_ID },
        transaction
      });
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      code: 'DOCUMENT_DELETED',
      message: 'Document deleted successfully',
      data: {
        deletedId: id,
        documentType: document.docType,
        guarantorId: document.GUARANTOR_ID
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Delete document error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to delete document',
      error: error.message
    });
  }
};

export const updateGuarantorDocument = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!id) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        code: 'MISSING_PARAMETER',
        message: 'Document ID is required'
      });
    }

    const document = await UploadGuarantorDocuments.findByPk(id, { transaction });

    if (!document) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Document not found'
      });
    }

    // Update document
    await document.update(updates, { transaction });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      code: 'DOCUMENT_UPDATED',
      message: 'Document updated successfully',
      data: document
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Update document error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to update document',
      error: error.message
    });
  }
};

export default {
  uploadGuarantorDocuments,
  getGuarantorDocuments,
  getGuarantorDocumentById,
  deleteGuarantorDocument,
  updateGuarantorDocument
};