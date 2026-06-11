// controllers/IdentificationInformationController.js
import { v2 as cloudinaryV2 } from 'cloudinary';
import fs from 'fs';
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import { getCustomer, getIdentificationInformation, initializeModels } from '../models/index.js';

// Cloudinary configuration
cloudinaryV2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Ensure association – use snake_case foreign key
const ensureAssociations = async () => {
  try {
    await initializeModels();
    const IdentificationInformation = getIdentificationInformation();
    const Customer = getCustomer();
    if (IdentificationInformation && Customer && !IdentificationInformation.associations.customer) {
      IdentificationInformation.belongsTo(Customer, { foreignKey: 'cust_id', as: 'customer' });
      Customer.hasMany(IdentificationInformation, { foreignKey: 'cust_id', as: 'identifications' });
      console.log('✅ IdentificationInformation ↔ Customer association added dynamically');
    }
  } catch (err) {
    console.warn('Could not set association:', err.message);
  }
};
ensureAssociations();

// ==================== UPLOAD IDENTIFICATION ====================
export const uploadIdentification = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    // Destructure using the field names sent from client (we'll map them to model attributes)
    const {
      CUST_ID,            // from client – used to find Customer
      CUST_NM,            // optional – will be stored as cust_nm
      docId,              // from client – stored as doc_id
      documentType,       // stored as document_type
      documentId,         // from client – stored as document_number
      countryOfIssuer,    // stored as country_of_issuer
      expiryDate,         // stored as expiry_date
      issueDate,          // stored as issue_date
      isPrimary = false   // stored as is_primary
    } = req.body;

    if (!CUST_ID || !documentType || !documentId || !countryOfIssuer || !expiryDate) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'CUST_ID, documentType, documentId, countryOfIssuer, and expiryDate are required fields.'
      });
    }

    const expiry = new Date(expiryDate);
    if (expiry <= new Date()) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Expiry date must be in the future.'
      });
    }

    if (!req.file) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Please upload an identification document.'
      });
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      await transaction.rollback();
      if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only JPEG, PNG, GIF, and PDF files are allowed.'
      });
    }

    const Customer = getCustomer();
    const IdentificationInformation = getIdentificationInformation();

    // Find customer by the CUST_ID column (customers table has column `CUST_ID`)
    const customer = await Customer.findOne({ where: { CUST_ID: CUST_ID }, transaction });
    if (!customer) {
      await transaction.rollback();
      if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({
        success: false,
        message: `Customer with ID ${CUST_ID} not found.`
      });
    }

    // Check duplicate document number (document_number) for this customer
    const existingDocument = await IdentificationInformation.findOne({
      where: {
        cust_id: CUST_ID,
        document_number: documentId.trim().toUpperCase()
      },
      transaction
    });

    if (existingDocument) {
      await transaction.rollback();
      if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: `Document with number ${documentId} already exists for this customer.`
      });
    }

    // Check duplicate doc_id if provided
    if (docId) {
      const existingDocId = await IdentificationInformation.findOne({
        where: { doc_id: docId },
        transaction
      });
      if (existingDocId) {
        await transaction.rollback();
        if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
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
      if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      console.error('Cloudinary upload error:', cloudinaryError);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload document to cloud storage.',
        error: cloudinaryError.message
      });
    }

    // Clean up local file
    if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

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

    // If this document should be primary, unset previous primary for this customer
    if (isPrimary === true || isPrimary === 'true') {
      await IdentificationInformation.update(
        { is_primary: false },
        { where: { cust_id: CUST_ID }, transaction }
      );
    }

    const identificationData = {
      cust_id: CUST_ID,
      cust_nm: CUST_NM || customer.CUST_NM || customer.cust_nm || customer.fullName,
      doc_id: docId || `DOC-${CUST_ID}-${Date.now()}`,
      document_type: documentType,
      document_number: documentId.trim().toUpperCase(),
      country_of_issuer: countryOfIssuer.toUpperCase(),
      expiry_date: expiry,
      issue_date: issueDate ? new Date(issueDate) : null,
      image_path: cloudinaryResult.secure_url,
      image_thumbnail: thumbnailUrl,
      status: 'active',
      verification_status: 'pending',
      is_primary: isPrimary === true || isPrimary === 'true',
      created_by: req.user?.id || 'system'
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
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    console.error('💥 Error uploading identification document:', error);

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ success: false, message: 'Document ID or document number already exists.' });
    }
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ success: false, message: `Validation error: ${error.errors.map(e => e.message).join(', ')}` });
    }
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({ success: false, message: 'Invalid customer reference.' });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to upload identification document.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// ==================== BULK APPROVE PENDING IDENTIFICATIONS ====================
// ==================== APPROVE SINGLE IDENTIFICATION ====================
export const approveCustomerDocuments = asyncHandler(async (req, res) => {
  const { custId } = req.params;
  const { verificationNotes } = req.body || {};
  const verifiedBy = req.user?.id || 'system';

  const IdentificationInformation = getIdentificationInformation();
  const Customer = getCustomer();
  const transaction = await sequelize.transaction();

  try {
    // Verify customer exists (no business unit check)
    const customer = await Customer.findOne({
      where: { CUST_ID: custId },
      transaction
    });

    if (!customer) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Customer with ID ${custId} not found.`
      });
    }

    // Find all pending documents for this customer
    const documents = await IdentificationInformation.findAll({
      where: {
        cust_id: custId,
        verification_status: 'pending',
        status: 'active'
      },
      transaction
    });

    if (documents.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'No pending documents found for this customer.'
      });
    }

    const results = [];
    const errors = [];

    for (const doc of documents) {
      if (doc.isExpired && doc.isExpired()) {
        errors.push({
          id: doc.id,
          document_number: doc.document_number,
          message: 'Document is expired, cannot approve.'
        });
        continue;
      }

      await doc.update({
        verification_status: 'verified',
        verified_by: verifiedBy,
        verification_date: new Date(),
        verification_notes: verificationNotes || 'Approved by branch manager'
      }, { transaction });

      results.push({
        id: doc.id,
        document_number: doc.document_number,
        customer_id: doc.cust_id,
        status: 'approved'
      });
    }

    await transaction.commit();

    res.status(200).json({
      success: true,
      message: `${results.length} document(s) approved successfully.`,
      data: { approved: results, failed: errors }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Approval error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve documents.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// ==================== GET ALL IDENTIFICATIONS ====================
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

  const IdentificationInformation = getIdentificationInformation();
  const Customer = getCustomer();

  const whereClause = {};
  if (CUST_ID) whereClause.cust_id = CUST_ID;
  if (documentType) whereClause.document_type = documentType;
  if (status) whereClause.status = status;
  if (verificationStatus) whereClause.verification_status = verificationStatus;
  if (isPrimary !== undefined) whereClause.is_primary = isPrimary === 'true';

  if (search) {
    whereClause[Op.or] = [
      { document_number: { [Op.like]: `%${search}%` } },
      { doc_id: { [Op.like]: `%${search}%` } },
      { cust_nm: { [Op.like]: `%${search}%` } }
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
      as: 'customer',
      attributes: ['CUST_NM', 'email', 'phone']
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

// ==================== GET IDENTIFICATION BY ID ====================
export const getIdentificationById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const IdentificationInformation = getIdentificationInformation();
  const Customer = getCustomer();

  const identification = await IdentificationInformation.findByPk(id, {
    include: [{
      model: Customer,
      as: 'customer',
      attributes: ['CUST_NM', 'email', 'phone', 'address']
    }]
  });

  if (!identification) {
    return res.status(404).json({
      success: false,
      message: 'Identification document not found.'
    });
  }

  const identificationData = identification.toJSON();
  identificationData.daysUntilExpiry = identification.daysUntilExpiry ? identification.daysUntilExpiry() : null;
  identificationData.isExpired = identification.isExpired ? identification.isExpired() : false;

  res.status(200).json({
    success: true,
    message: 'Identification document retrieved successfully.',
    data: identificationData
  });
});

// ==================== GET IDENTIFICATIONS BY CUSTOMER ID ====================
export const getIdentificationsByCustomer = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const { status = 'active', includeExpired = 'false' } = req.query;

  const IdentificationInformation = getIdentificationInformation();

  const whereClause = { cust_id: customerId };
  if (status !== 'all') whereClause.status = status;
  if (includeExpired === 'false') {
    whereClause.expiry_date = { [Op.gte]: new Date() };
  }

  const identifications = await IdentificationInformation.findAll({
    where: whereClause,
    order: [['is_primary', 'DESC'], ['status', 'ASC'], ['expiry_date', 'ASC']]
  });

  const stats = {
    total: identifications.length,
    active: identifications.filter(doc => doc.status === 'active').length,
    verified: identifications.filter(doc => doc.verification_status === 'verified').length,
    primary: identifications.filter(doc => doc.is_primary).length,
    expired: identifications.filter(doc => doc.isExpired && doc.isExpired()).length
  };

  const documentsWithExpiry = identifications.map(doc => {
    const d = doc.toJSON();
    d.daysUntilExpiry = doc.daysUntilExpiry ? doc.daysUntilExpiry() : null;
    d.isExpired = doc.isExpired ? doc.isExpired() : false;
    return d;
  });

  res.status(200).json({
    success: true,
    message: 'Customer identification documents retrieved successfully.',
    data: { customerId, documents: documentsWithExpiry, stats }
  });
});

// ==================== UPDATE IDENTIFICATION STATUS ====================
export const updateIdentificationStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, verificationStatus, verificationNotes, verifiedBy } = req.body;

  const IdentificationInformation = getIdentificationInformation();

  const identification = await IdentificationInformation.findByPk(id);
  if (!identification) {
    return res.status(404).json({
      success: false,
      message: 'Identification document not found.'
    });
  }

  const updateData = {};
  if (status) updateData.status = status;
  if (verificationStatus) {
    updateData.verification_status = verificationStatus;
    if (verificationStatus === 'verified' || verificationStatus === 'rejected') {
      updateData.verified_by = verifiedBy || req.user?.id || 'system';
      updateData.verification_date = new Date();
      updateData.verification_notes = verificationNotes;
    }
  }

  if (status === 'active' && verificationStatus === 'verified') {
    if (identification.isExpired && identification.isExpired()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot activate and verify an expired document.'
      });
    }
  }

  await identification.update(updateData);
  console.log(`🔄 Identification ${id} updated: ${Object.keys(updateData).join(', ')}`);

  res.status(200).json({
    success: true,
    message: 'Identification document updated successfully.',
    data: identification
  });
});

// ==================== SET DOCUMENT AS PRIMARY ====================
export const setAsPrimary = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const IdentificationInformation = getIdentificationInformation();

  const identification = await IdentificationInformation.findByPk(id);
  if (!identification) {
    return res.status(404).json({
      success: false,
      message: 'Identification document not found.'
    });
  }

  if (identification.status !== 'active' || identification.verification_status !== 'verified') {
    return res.status(400).json({
      success: false,
      message: 'Only active and verified documents can be set as primary.'
    });
  }

  if (identification.isExpired && identification.isExpired()) {
    return res.status(400).json({
      success: false,
      message: 'Expired documents cannot be set as primary.'
    });
  }

  await identification.setAsPrimary(); // uses the model's instance method
  console.log(`🏆 Identification ${id} set as primary for customer ${identification.cust_id}`);

  res.status(200).json({
    success: true,
    message: 'Document set as primary successfully.',
    data: identification
  });
});

// ==================== SOFT DELETE IDENTIFICATION ====================
export const deleteIdentification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { deleteReason } = req.body;
  const IdentificationInformation = getIdentificationInformation();

  const identification = await IdentificationInformation.findByPk(id);
  if (!identification) {
    return res.status(404).json({
      success: false,
      message: 'Identification document not found.'
    });
  }

  await identification.update({
    status: 'inactive',
    metadata: {
      ...identification.metadata,
      deletedAt: new Date(),
      deletedBy: req.user?.id || 'system',
      deleteReason
    }
  });

  console.log(`🗑️ Identification ${id} marked as inactive. Reason: ${deleteReason || 'Not specified'}`);

  res.status(200).json({
    success: true,
    message: 'Identification document deleted successfully.',
    data: identification
  });
});

// ==================== GET DOCUMENTS EXPIRING SOON ====================
export const getExpiringDocuments = asyncHandler(async (req, res) => {
  const { days = 30, page = 1, limit = 20 } = req.query;
  const IdentificationInformation = getIdentificationInformation();
  const Customer = getCustomer();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const warningDate = new Date(today);
  warningDate.setDate(warningDate.getDate() + parseInt(days));

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows: documents } = await IdentificationInformation.findAndCountAll({
    where: {
      expiry_date: { [Op.between]: [today, warningDate] },
      status: 'active',
      verification_status: 'verified'
    },
    limit: parseInt(limit),
    offset: offset,
    order: [['expiry_date', 'ASC']],
    include: [{
      model: Customer,
      as: 'customer',
      attributes: ['CUST_NM', 'email', 'phone']
    }]
  });

  const documentsWithExpiry = documents.map(doc => {
    const d = doc.toJSON();
    d.daysUntilExpiry = doc.daysUntilExpiry ? doc.daysUntilExpiry() : null;
    return d;
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

// Export all functions
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