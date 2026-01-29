// Models/IdentificationInformation.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const IdentificationInformation = sequelize.define('IdentificationInformation', {
  ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  CUST_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'cust_id',
    references: {
      model: 'customers', // Reference to your Customer table
      key: 'CUST_ID'
    }
  },
  CUST_NM: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'cust_nm'
  },
  docId: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'doc_id',
    comment: 'Unique document identifier'
  },
  documentType: {
    type: DataTypes.ENUM('Passport', "Driver's License", 'National ID', "Voter's ID", 'Residence Permit', 'Military ID', 'Student ID', 'Other'),
    allowNull: false,
    field: 'document_type'
  },
  documentId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'document_number',
    comment: 'Official document number (e.g., passport number)'
  },
  countryOfIssuer: {
    type: DataTypes.STRING(3),
    allowNull: false,
    field: 'country_of_issuer',
    defaultValue: 'NGA',
    comment: 'ISO 3-letter country code'
  },
  issueDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'issue_date',
    comment: 'Date when document was issued'
  },
  expiryDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'expiry_date',
    comment: 'Document expiry date'
  },
  imagePath: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'image_path',
    comment: 'Path or URL to the document image'
  },
  imageThumbnail: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'image_thumbnail',
    comment: 'Path to thumbnail version of the image'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'expired', 'lost', 'stolen'),
    allowNull: false,
    defaultValue: 'active',
    field: 'status'
  },
  verificationStatus: {
    type: DataTypes.ENUM('pending', 'verified', 'rejected', 'expired'),
    allowNull: false,
    defaultValue: 'pending',
    field: 'verification_status'
  },
  verifiedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'verified_by',
    references: {
      model: 'users', // Reference to your User table
      key: 'id'
    }
  },
  verificationDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'verification_date'
  },
  verificationNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'verification_notes'
  },
  isPrimary: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_primary',
    comment: 'Whether this is the primary identification document'
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'metadata',
    comment: 'Additional document metadata'
  }
}, {
  tableName: 'identification_information',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['doc_id'],
      name: 'idx_doc_id_unique'
    },
    {
      fields: ['cust_id'],
      name: 'idx_cust_id'
    },
    {
      fields: ['document_number'],
      name: 'idx_document_number'
    },
    {
      fields: ['document_type'],
      name: 'idx_document_type'
    },
    {
      fields: ['status'],
      name: 'idx_status'
    },
    {
      fields: ['expiry_date'],
      name: 'idx_expiry_date'
    },
    {
      fields: ['verification_status'],
      name: 'idx_verification_status'
    },
    {
      fields: ['is_primary'],
      name: 'idx_is_primary'
    },
    // Composite index for common queries
    {
      fields: ['cust_id', 'is_primary'],
      name: 'idx_cust_id_primary'
    }
  ],
  hooks: {
    beforeCreate: (identification) => {
      // Generate docId if not provided
      if (!identification.docId) {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000);
        identification.docId = `DOC-${timestamp}-${random}`;
      }
      
      // Normalize document number
      if (identification.documentId) {
        identification.documentId = identification.documentId.trim().toUpperCase();
      }
      
      // Set CUST_NM if not provided (you might want to fetch from customer table)
    },
    beforeUpdate: (identification) => {
      // If setting as primary, ensure only one primary per customer
      if (identification.isPrimary && identification.changed('isPrimary')) {
        // This logic would be better implemented in a separate method
        // or using database triggers
      }
    }
  }
});

// Static Methods
IdentificationInformation.findByCustomerId = async function(customerId, options = {}) {
  const defaults = {
    where: { CUST_ID: customerId },
    order: [['isPrimary', 'DESC'], ['created_at', 'DESC']]
  };
  
  return await this.findAll({ ...defaults, ...options });
};

IdentificationInformation.findActiveByCustomerId = async function(customerId) {
  return await this.findAll({
    where: {
      CUST_ID: customerId,
      status: 'active',
      verificationStatus: 'verified'
    },
    order: [['isPrimary', 'DESC'], ['expiryDate', 'ASC']]
  });
};

IdentificationInformation.findPrimaryDocument = async function(customerId) {
  return await this.findOne({
    where: {
      CUST_ID: customerId,
      isPrimary: true,
      status: 'active',
      verificationStatus: 'verified'
    }
  });
};

IdentificationInformation.findExpiredDocuments = async function(daysThreshold = 0) {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() - daysThreshold);
  
  return await this.findAll({
    where: {
      expiryDate: {
        [Op.lt]: expiryDate
      },
      status: 'active'
    },
    order: [['expiryDate', 'ASC']]
  });
};

IdentificationInformation.findDocumentsExpiringSoon = async function(days = 30) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const warningDate = new Date(today);
  warningDate.setDate(warningDate.getDate() + days);
  
  return await this.findAll({
    where: {
      expiryDate: {
        [Op.between]: [today, warningDate]
      },
      status: 'active',
      verificationStatus: 'verified'
    },
    order: [['expiryDate', 'ASC']]
  });
};

// Instance Methods
IdentificationInformation.prototype.verify = async function(verifiedBy, notes = '') {
  return await this.update({
    verificationStatus: 'verified',
    verifiedBy: verifiedBy,
    verificationDate: new Date(),
    verificationNotes: notes
  });
};

IdentificationInformation.prototype.reject = async function(verifiedBy, notes = '') {
  return await this.update({
    verificationStatus: 'rejected',
    verifiedBy: verifiedBy,
    verificationDate: new Date(),
    verificationNotes: notes,
    status: 'inactive'
  });
};

IdentificationInformation.prototype.markAsExpired = async function() {
  return await this.update({
    status: 'expired',
    isPrimary: false,
    verificationStatus: 'expired'
  });
};

IdentificationInformation.prototype.setAsPrimary = async function() {
  const transaction = await sequelize.transaction();
  
  try {
    // First, set all other documents for this customer as non-primary
    await this.constructor.update(
      { isPrimary: false },
      {
        where: {
          CUST_ID: this.CUST_ID,
          id: { [Op.ne]: this.id }
        },
        transaction
      }
    );
    
    // Then set this document as primary
    await this.update({ isPrimary: true }, { transaction });
    
    await transaction.commit();
    return this;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

IdentificationInformation.prototype.isExpired = function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const expiry = new Date(this.expiryDate);
  expiry.setHours(0, 0, 0, 0);
  
  return expiry < today;
};

IdentificationInformation.prototype.daysUntilExpiry = function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const expiry = new Date(this.expiryDate);
  expiry.setHours(0, 0, 0, 0);
  
  const diffTime = expiry - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
};

// Associations (to be set up in your models/index.js or initialization file)
// Example:
// Customer.hasMany(IdentificationInformation, { foreignKey: 'CUST_ID', sourceKey: 'CUST_ID' });
// IdentificationInformation.belongsTo(Customer, { foreignKey: 'CUST_ID', targetKey: 'CUST_ID' });
// IdentificationInformation.belongsTo(User, { foreignKey: 'verifiedBy', as: 'verifier' });

export default IdentificationInformation;
