// controllers/identificationController.js
import { v2 as cloudinaryV2 } from 'cloudinary';
import IdentificationInformation from '../models/IdentificationInformation.js';
import Customer from '../models/Customer.js'; // Assuming you have a Customer model
import sequelize from '../../config/db.js';
import fs from 'fs';
import path from 'path';
import { Op } from 'sequelize';

// Cloudinary configuration
cloudinaryV2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Async handler utility
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const uploadIdentification = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { 
      CUST_ID, 
      CUST_NM, 
      docId, 
      documentType, 
      documentId, 
      countryOfIssuer, 
      expiryDate,
      issueDate,
      isPrimary = false 
    } = req.body;

    // Validate required fields
    if (!CUST_ID || !documentType || !documentId || !countryOfIssuer || !expiryDate) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'CUST_ID, documentType, documentId, countryOfIssuer, and expiryDate are required fields.'
      });
    }

    // Validate expiry date
    const expiry = new Date(expiryDate);
    if (expiry <= new Date()) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Expiry date must be in the future.'
      });
    }

    // Check if file exists
    if (!req.file) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Please upload an identification document.'
      });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      await transaction.rollback();
      // Clean up uploaded file
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only JPEG, PNG, GIF, and PDF files are allowed.'
      });
    }

    // Check if customer exists
    const customer = await Customer.findByPk(CUST_ID, { transaction });
    if (!customer) {
      await transaction.rollback();
      // Clean up uploaded file
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({
        success: false,
        message: `Customer with ID ${CUST_ID} not found.`
      });
    }

    // Check for duplicate document number for this customer
    const existingDocument = await IdentificationInformation.findOne({
      where: {
        CUST_ID,
        documentId: documentId.trim().toUpperCase()
      },
      transaction
    });

    if (existingDocument) {
      await transaction.rollback();
      // Clean up uploaded file
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        message: `Document with number ${documentId} already exists for this customer.`
      });
    }

    // Check for duplicate docId if provided
    if (docId) {
      const existingDocId = await IdentificationInformation.findOne({
        where: { docId },
        transaction
      });

      if (existingDocId) {
        await transaction.rollback();
        // Clean up uploaded file
        if (req.file.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({
          success: false,
          message: `Document ID ${docId} already exists.`
        });
      }
    }

    // Upload to Cloudinary
    let cloudinaryResult;
    try {
      cloudinaryResult = await cloudinaryV2.uploader.upload(req.file.path, {
        resource_type: req.file.mimetype === 'application/pdf' ? 'raw' : 'image',
        folder: 'identifications',
        public_id: `${CUST_ID}_${Date.now()}`,
        format: 'jpg',
        quality: 'auto',
        fetch_format: 'auto'
      });
    } catch (cloudinaryError) {
      await transaction.rollback();
      // Clean up uploaded file
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      console.error('Cloudinary upload error:', cloudinaryError);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload document to cloud storage.',
        error: cloudinaryError.message
      });
    }

    // Clean up local file after successful upload
    if (req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    // Generate thumbnail for images (not PDFs)
    let thumbnailUrl = null;
    if (req.file.mimetype !== 'application/pdf') {
      try {
        thumbnailUrl = cloudinaryV2.url(cloudinaryResult.public_id, {
          width: 200,
          height: 150,
          crop: 'fill',
          quality: 'auto',
          fetch_format: 'auto'
        });
      } catch (thumbnailError) {
        console.warn('Failed to generate thumbnail:', thumbnailError);
      }
    }

    // If setting as primary, update other documents
    if (isPrimary) {
      await IdentificationInformation.update(
        { isPrimary: false },
        {
          where: { CUST_ID },
          transaction
        }
      );
    }

    // Create identification record
    const identificationData = {
      CUST_ID,
      CUST_NM: CUST_NM || customer.CUST_NM || customer.fullName,
      docId: docId || `DOC-${CUST_ID}-${Date.now()}`,
      documentType,
      documentId: documentId.trim().toUpperCase(),
      countryOfIssuer: countryOfIssuer.toUpperCase(),
      expiryDate: expiry,
      issueDate: issueDate ? new Date(issueDate) : null,
      imagePath: cloudinaryResult.secure_url,
      imageThumbnail: thumbnailUrl,
      status: 'active',
      verificationStatus: 'pending',
      isPrimary,
      createdBy: req.user?.id || 'system'
    };

    const identification = await IdentificationInformation.create(identificationData, { transaction });

    await transaction.commit();

    console.log(`✅ Identification document uploaded for customer ${CUST_ID}: ${documentId}`);

    res.status(201).json({
      success: true,
      message: 'Identification document uploaded successfully.',
      data: {
        ...identification.toJSON(),
        expiryDays: identification.daysUntilExpiry ? identification.daysUntilExpiry() : null
      }
    });

  } catch (error) {
    await transaction.rollback();
    
    // Clean up uploaded file if exists
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Failed to clean up file:', unlinkError);
      }
    }
    
    console.error('💥 Error uploading identification document:', error);
    
    // Handle specific errors
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'Document ID or document number already exists.'
      });
    }
    
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map(err => err.message).join(', ');
      return res.status(400).json({
        success: false,
        message: `Validation error: ${messages}`
      });
    }
    
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer reference.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to upload identification document.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get all identification documents with filtering
export const getIdentifications = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    CUST_ID,
    documentType,
    status,
    verificationStatus,
    isPrimary,
    search
  } = req.query;

  const whereClause = {};

  // Build where clause
  if (CUST_ID) whereClause.CUST_ID = CUST_ID;
  if (documentType) whereClause.documentType = documentType;
  if (status) whereClause.status = status;
  if (verificationStatus) whereClause.verificationStatus = verificationStatus;
  if (isPrimary !== undefined) whereClause.isPrimary = isPrimary === 'true';

  // Search across multiple fields
  if (search) {
    whereClause[Op.or] = [
      { documentId: { [Op.like]: `%${search}%` } },
      { docId: { [Op.like]: `%${search}%` } },
      { CUST_NM: { [Op.like]: `%${search}%` } }
    ];
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows: identifications } = await IdentificationInformation.findAndCountAll({
    where: whereClause,
    limit: parseInt(limit),
    offset: offset,
    order: [['created_at', 'DESC']],
    include: [{
      model: Customer,
      attributes: ['CUST_NM', 'email', 'phone'] // Adjust based on your Customer model
    }]
  });

  const totalPages = Math.ceil(count / parseInt(limit));

  res.status(200).json({
    success: true,
    message: 'Identification documents retrieved successfully.',
    data: {
      identifications,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: count,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    }
  });
});

// Get identification by ID
export const getIdentificationById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const identification = await IdentificationInformation.findByPk(id, {
    include: [{
      model: Customer,
      attributes: ['CUST_NM', 'email', 'phone', 'address']
    }]
  });

  if (!identification) {
    return res.status(404).json({
      success: false,
      message: 'Identification document not found.'
    });
  }

  // Calculate days until expiry
  const identificationData = identification.toJSON();
  identificationData.daysUntilExpiry = identification.daysUntilExpiry ? identification.daysUntilExpiry() : null;
  identificationData.isExpired = identification.isExpired ? identification.isExpired() : false;

  res.status(200).json({
    success: true,
    message: 'Identification document retrieved successfully.',
    data: identificationData
  });
});

// Get identifications by customer ID
export const getIdentificationsByCustomer = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const { status = 'active', includeExpired = 'false' } = req.query;

  const whereClause = { CUST_ID: customerId };

  if (status !== 'all') {
    whereClause.status = status;
  }

  if (includeExpired === 'false') {
    whereClause.expiryDate = {
      [Op.gte]: new Date()
    };
  }

  const identifications = await IdentificationInformation.findAll({
    where: whereClause,
    order: [
      ['isPrimary', 'DESC'],
      ['status', 'ASC'],
      ['expiryDate', 'ASC']
    ]
  });

  // Calculate stats
  const stats = {
    total: identifications.length,
    active: identifications.filter(doc => doc.status === 'active').length,
    verified: identifications.filter(doc => doc.verificationStatus === 'verified').length,
    primary: identifications.filter(doc => doc.isPrimary).length,
    expired: identifications.filter(doc => {
      if (!doc.isExpired) return false;
      return doc.isExpired();
    }).length
  };

  // Add expiry info to each document
  const documentsWithExpiry = identifications.map(doc => {
    const docData = doc.toJSON();
    docData.daysUntilExpiry = doc.daysUntilExpiry ? doc.daysUntilExpiry() : null;
    docData.isExpired = doc.isExpired ? doc.isExpired() : false;
    return docData;
  });

  res.status(200).json({
    success: true,
    message: 'Customer identification documents retrieved successfully.',
    data: {
      customerId,
      documents: documentsWithExpiry,
      stats
    }
  });
});

// Update identification status
export const updateIdentificationStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, verificationStatus, verificationNotes, verifiedBy } = req.body;

  const identification = await IdentificationInformation.findByPk(id);

  if (!identification) {
    return res.status(404).json({
      success: false,
      message: 'Identification document not found.'
    });
  }

  const updateData = {};
  const updateFields = [];

  if (status) {
    updateData.status = status;
    updateFields.push('status');
  }

  if (verificationStatus) {
    updateData.verificationStatus = verificationStatus;
    updateFields.push('verificationStatus');
    
    if (verificationStatus === 'verified' || verificationStatus === 'rejected') {
      updateData.verifiedBy = verifiedBy || req.user?.id || 'system';
      updateData.verificationDate = new Date();
      updateData.verificationNotes = verificationNotes;
      updateFields.push('verifiedBy', 'verificationDate', 'verificationNotes');
    }
  }

  // If setting as active and verified, check expiry
  if (status === 'active' && verificationStatus === 'verified') {
    if (identification.isExpired && identification.isExpired()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot activate and verify an expired document.'
      });
    }
  }

  await identification.update(updateData);

  console.log(`🔄 Identification ${id} updated: ${updateFields.join(', ')}`);

  res.status(200).json({
    success: true,
    message: 'Identification document updated successfully.',
    data: identification
  });
});

// Set document as primary
export const setAsPrimary = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const identification = await IdentificationInformation.findByPk(id);

  if (!identification) {
    return res.status(404).json({
      success: false,
      message: 'Identification document not found.'
    });
  }

  // Check if document is active and verified
  if (identification.status !== 'active' || identification.verificationStatus !== 'verified') {
    return res.status(400).json({
      success: false,
      message: 'Only active and verified documents can be set as primary.'
    });
  }

  // Check if document is expired
  if (identification.isExpired && identification.isExpired()) {
    return res.status(400).json({
      success: false,
      message: 'Expired documents cannot be set as primary.'
    });
  }

  // Use the instance method
  await identification.setAsPrimary();

  console.log(`🏆 Identification ${id} set as primary for customer ${identification.CUST_ID}`);

  res.status(200).json({
    success: true,
    message: 'Document set as primary successfully.',
    data: identification
  });
});

// Delete identification (soft delete)
export const deleteIdentification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { deleteReason } = req.body;

  const identification = await IdentificationInformation.findByPk(id);

  if (!identification) {
    return res.status(404).json({
      success: false,
      message: 'Identification document not found.'
    });
  }

  // Soft delete by updating status
  await identification.update({
    status: 'inactive',
    metadata: {
      ...identification.metadata,
      deletedAt: new Date(),
      deletedBy: req.user?.id || 'system',
      deleteReason
    }
  });

  console.log(`🗑️ Identification ${id} marked as inactive. Reason: ${deleteReason}`);

  res.status(200).json({
    success: true,
    message: 'Identification document deleted successfully.',
    data: identification
  });
});

// Get documents expiring soon
export const getExpiringDocuments = asyncHandler(async (req, res) => {
  const { days = 30, page = 1, limit = 20 } = req.query;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const warningDate = new Date(today);
  warningDate.setDate(warningDate.getDate() + parseInt(days));

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows: documents } = await IdentificationInformation.findAndCountAll({
    where: {
      expiryDate: {
        [Op.between]: [today, warningDate]
      },
      status: 'active',
      verificationStatus: 'verified'
    },
    limit: parseInt(limit),
    offset: offset,
    order: [['expiryDate', 'ASC']],
    include: [{
      model: Customer,
      attributes: ['CUST_NM', 'email', 'phone']
    }]
  });

  // Add expiry info
  const documentsWithExpiry = documents.map(doc => {
    const docData = doc.toJSON();
    docData.daysUntilExpiry = doc.daysUntilExpiry ? doc.daysUntilExpiry() : null;
    return docData;
  });

  const totalPages = Math.ceil(count / parseInt(limit));

  res.status(200).json({
    success: true,
    message: `Documents expiring within ${days} days retrieved successfully.`,
    data: {
      documents: documentsWithExpiry,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: count,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    }
  });
});

export default {
  uploadIdentification,
  getIdentifications,
  getIdentificationById,
  getIdentificationsByCustomer,
  updateIdentificationStatus,
  setAsPrimary,
  deleteIdentification,
  getExpiringDocuments
};