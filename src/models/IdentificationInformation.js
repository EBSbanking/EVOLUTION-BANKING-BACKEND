// models/IdentificationInformation.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const IdentificationInformation = sequelize.define('IdentificationInformation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },

  cust_id: {
    type: DataTypes.STRING(50),           // ← Must match customers.CUST_ID type (likely VARCHAR)
    allowNull: false,
    field: 'cust_id',
    references: {
      model: 'customers',
      key: 'CUST_ID'
    }
  },

  cust_nm: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'cust_nm'
  },

  doc_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'doc_id',
    comment: 'Unique document identifier'
  },

  document_type: {
    type: DataTypes.ENUM(
      'Passport',
      "Driver's License",
      'National ID',
      "Voter's ID",
      'Residence Permit',
      'Military ID',
      'Student ID',
      'Other'
    ),
    allowNull: false,
    field: 'document_type'
  },

  document_number: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'document_number',
    comment: 'Official document number (e.g., passport number)'
  },

  country_of_issuer: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'NGA',
    field: 'country_of_issuer',
    comment: 'ISO 3-letter country code'
  },

  issue_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'issue_date',
    comment: 'Date when document was issued'
  },

  expiry_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'expiry_date',
    comment: 'Document expiry date'
  },

  image_path: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'image_path',
    comment: 'Path or URL to the document image'
  },

  image_thumbnail: {
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

  verification_status: {
    type: DataTypes.ENUM('pending', 'verified', 'rejected', 'expired'),
    allowNull: false,
    defaultValue: 'pending',
    field: 'verification_status'
  },

  verified_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'verified_by',
    references: {
      model: 'users',
      key: 'id'
    }
  },

  verification_date: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'verification_date'
  },

  verification_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'verification_notes'
  },

  is_primary: {
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

  // Only essential indexes to avoid "too many keys" error
  indexes: [
    { unique: true, fields: ['doc_id'], name: 'idx_doc_id_unique' },
    { fields: ['cust_id'], name: 'idx_cust_id' },
    { fields: ['document_number'], name: 'idx_document_number' },
    { fields: ['status', 'verification_status'], name: 'idx_status_verification' },
    { fields: ['expiry_date'], name: 'idx_expiry_date' },
    { fields: ['is_primary'], name: 'idx_is_primary' }
  ],

  hooks: {
    beforeCreate: (doc) => {
      // Generate unique doc_id if missing
      if (!doc.doc_id) {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        doc.doc_id = `DOC-${timestamp}-${random}`;
      }

      // Normalize document number
      if (doc.document_number) {
        doc.document_number = doc.document_number.trim().toUpperCase();
      }
    },

    beforeUpdate: (doc) => {
      if (doc.changed('document_number')) {
        doc.document_number = doc.document_number.trim().toUpperCase();
      }
    }
  }
});

// ────────────────────────────────────────────────
// STATIC METHODS
// ────────────────────────────────────────────────

IdentificationInformation.findByCustomerId = async function (customerId, options = {}) {
  return this.findAll({
    where: { cust_id: customerId },
    order: [['is_primary', 'DESC'], ['created_at', 'DESC']],
    ...options
  });
};

IdentificationInformation.findPrimary = async function (customerId) {
  return this.findOne({
    where: {
      cust_id: customerId,
      is_primary: true,
      status: 'active',
      verification_status: 'verified'
    }
  });
};

IdentificationInformation.findExpiringSoon = async function (days = 30) {
  const today = new Date();
  const warningDate = new Date(today);
  warningDate.setDate(warningDate.getDate() + days);

  return this.findAll({
    where: {
      expiry_date: { [Op.between]: [today, warningDate] },
      status: 'active',
      verification_status: 'verified'
    },
    order: [['expiry_date', 'ASC']]
  });
};

// ────────────────────────────────────────────────
// INSTANCE METHODS
// ────────────────────────────────────────────────

IdentificationInformation.prototype.verify = async function (verifiedById, notes = '') {
  return this.update({
    verification_status: 'verified',
    verified_by: verifiedById,
    verification_date: new Date(),
    verification_notes: notes || null
  });
};

IdentificationInformation.prototype.reject = async function (verifiedById, notes = '') {
  return this.update({
    verification_status: 'rejected',
    verified_by: verifiedById,
    verification_date: new Date(),
    verification_notes: notes || null,
    status: 'inactive'
  });
};

IdentificationInformation.prototype.markExpired = async function () {
  return this.update({
    status: 'expired',
    is_primary: false,
    verification_status: 'expired'
  });
};

IdentificationInformation.prototype.setAsPrimary = async function () {
  const t = await sequelize.transaction();

  try {
    // Reset other primary documents for this customer
    await this.constructor.update(
      { is_primary: false },
      {
        where: {
          cust_id: this.cust_id,
          id: { [Op.ne]: this.id }
        },
        transaction: t
      }
    );

    // Set this one as primary
    await this.update({ is_primary: true }, { transaction: t });

    await t.commit();
    return this;
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

IdentificationInformation.prototype.isExpired = function () {
  if (!this.expiry_date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(this.expiry_date);
  expiry.setHours(0, 0, 0, 0);
  return expiry < today;
};

IdentificationInformation.prototype.daysUntilExpiry = function () {
  if (!this.expiry_date) return null;
  const today = new Date();
  const expiry = new Date(this.expiry_date);
  const diffTime = expiry - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Export
export default IdentificationInformation;