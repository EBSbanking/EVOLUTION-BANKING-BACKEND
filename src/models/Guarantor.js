// models/Guarantor.js - MySQL/Sequelize Version
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const Guarantor = sequelize.define('Guarantor', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  GUARANTOR_ID: {
    type: DataTypes.STRING(7),
    allowNull: false,
    unique: true,
    validate: {
      is: /^\d{7}$/,
      len: [7, 7]
    },
    field: 'guarantor_id'
  },
  fullName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'full_name'
  },
  phoneNumber: {
    type: DataTypes.STRING(15),
    allowNull: false,
    validate: {
      is: /^\+?\d{10,15}$/
    },
    field: 'phone_number'
  },
  relationshipToBorrower: {
    type: DataTypes.ENUM(
      'Parent',
      'Sibling',
      'Spouse',
      'Business Partner',
      'Friend',
      'Relative',
      'Colleague',
      'Other'
    ),
    allowNull: false,
    field: 'relationship_to_borrower'
  },
  GUARANTEED_AMT: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00,
    field: 'guaranteed_amount'
  },
  createdBy: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'created_by'
  },
  relationshipOfficerName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'relationship_officer_name'
  },
  loanId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'loan_id'
  },
  // In your Guarantor model
status: {
  type: DataTypes.STRING(50), // Make sure it's long enough
  defaultValue: 'ACTIVE',
  validate: {
    isIn: [['ACTIVE', 'INACTIVE', 'PENDING', 'PENDING_VERIFICATION', 'SUSPENDED']]
  }
},
  email: {
    type: DataTypes.STRING(100),
    allowNull: true,
    validate: {
      isEmail: true
    },
    field: 'email'
  },
  
  address: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'address'
  },
  state: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'state'
  },
  localGovernment: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'local_government'
  },
  BU_ID: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'bu_id'
  },
  country: {
    type: DataTypes.STRING(50),
    defaultValue: 'Nigeria',
    field: 'country'
  },
  idType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'id_type'
  },
  idNumber: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'id_number'
  },
  bvn: {
    type: DataTypes.STRING(11),
    allowNull: true,
    validate: {
      is: /^\d{11}$/,
      len: [11, 11]
    },
    field: 'bvn'
  },
  dateOfBirth: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'date_of_birth'
  },
  netWorth: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    defaultValue: 0.00,
    field: 'net_worth'
  },
  annualIncome: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    defaultValue: 0.00,
    field: 'annual_income'
  },
  occupation: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'occupation'
  },
  employmentType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'employment_type'
  },
  verificationStatus: {
    type: DataTypes.ENUM('Pending', 'Verified', 'Rejected', 'Expired'),
    defaultValue: 'Pending',
    field: 'verification_status'
  },
  verifiedBy: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'verified_by'
  },
  verificationDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'verification_date'
  },
  consentDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'consent_date'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  removedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'removed_at'
  },
  removalReason: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'removal_reason'
  },
  updatedBy: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'updated_by'
  },
  // JSON field for removal request workflow
  removalRequest: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
    field: 'removal_request'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    onUpdate: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'guarantors',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['guarantor_id']
    },
    {
      unique: false,
      fields: ['full_name', 'id_number']
    },
    {
      unique: false,
      fields: ['loan_id', 'is_active']
    },
    {
      unique: false,
      fields: ['bu_id']
    },
    {
      unique: false,
      fields: ['verification_status']
    },
    {
      unique: false,
      fields: ['status']
    }
  ]
});

// Helper methods for Guarantor
Guarantor.createGuarantor = async (guarantorData) => {
  try {
    // Validate required fields for verified guarantors
    if (guarantorData.verificationStatus === 'Verified') {
      if (!guarantorData.email) {
        throw new Error('Email is required for verified guarantors');
      }
      if (!guarantorData.verifiedBy) {
        throw new Error('Verifier must be specified when status is Verified');
      }
      if (!guarantorData.consentDate) {
        guarantorData.consentDate = new Date();
      }
    }

    const guarantor = await Guarantor.create(guarantorData);
    return guarantor;
  } catch (error) {
    console.error('Error creating guarantor:', error.message);
    throw error;
  }
};

Guarantor.getActiveByLoan = async (loanId) => {
  try {
    const guarantors = await Guarantor.findAll({
      where: {
        loan_id: loanId,
        is_active: true,
        status: 'ACTIVE'
      },
      order: [['created_at', 'DESC']]
    });
    
    return guarantors;
  } catch (error) {
    console.error('Error getting active guarantors by loan:', error.message);
    throw error;
  }
};

Guarantor.findPendingRemovals = async () => {
  try {
    // Using JSON search for removal request status
    const [guarantors] = await sequelize.query(
      `SELECT * FROM guarantors 
       WHERE JSON_EXTRACT(removal_request, '$.status') = 'PENDING'
       AND is_active = 1
       AND status = 'ACTIVE'`
    );
    
    return guarantors;
  } catch (error) {
    console.error('Error finding pending removals:', error.message);
    throw error;
  }
};

Guarantor.findByRemovalStatus = async (status) => {
  try {
    const [guarantors] = await sequelize.query(
      `SELECT * FROM guarantors 
       WHERE JSON_EXTRACT(removal_request, '$.status') = ?
       ORDER BY created_at DESC`,
      { replacements: [status] }
    );
    
    return guarantors;
  } catch (error) {
    console.error('Error finding by removal status:', error.message);
    throw error;
  }
};

Guarantor.requestRemoval = async (guarantorId, requestData) => {
  try {
    const guarantor = await Guarantor.findByPk(guarantorId);
    
    if (!guarantor) {
      throw new Error('Guarantor not found');
    }
    
    if (!guarantor.is_active) {
      throw new Error('Guarantor is not active');
    }
    
    const removalRequest = {
      requestedAt: new Date(),
      requestedBy: requestData.requestedBy,
      reason: requestData.reason,
      notes: requestData.notes || null,
      loanAccountNumber: requestData.loanAccountNumber,
      status: 'PENDING'
    };
    
    guarantor.removalRequest = removalRequest;
    await guarantor.save();
    
    return guarantor;
  } catch (error) {
    console.error('Error requesting removal:', error.message);
    throw error;
  }
};

Guarantor.approveRemoval = async (guarantorId, approvedBy) => {
  try {
    const guarantor = await Guarantor.findByPk(guarantorId);
    
    if (!guarantor) {
      throw new Error('Guarantor not found');
    }
    
    if (!guarantor.removalRequest || guarantor.removalRequest.status !== 'PENDING') {
      throw new Error('No pending removal request found');
    }
    
    guarantor.removalRequest.status = 'APPROVED';
    guarantor.removalRequest.approvedBy = approvedBy;
    guarantor.removalRequest.approvedAt = new Date();
    guarantor.status = 'DEACTIVATED';
    guarantor.removedAt = new Date();
    guarantor.is_active = false;
    
    await guarantor.save();
    
    return guarantor;
  } catch (error) {
    console.error('Error approving removal:', error.message);
    throw error;
  }
};

Guarantor.rejectRemoval = async (guarantorId, rejectedBy, notes = null) => {
  try {
    const guarantor = await Guarantor.findByPk(guarantorId);
    
    if (!guarantor) {
      throw new Error('Guarantor not found');
    }
    
    if (!guarantor.removalRequest || guarantor.removalRequest.status !== 'PENDING') {
      throw new Error('No pending removal request found');
    }
    
    guarantor.removalRequest.status = 'REJECTED';
    guarantor.removalRequest.notes = notes || guarantor.removalRequest.notes;
    guarantor.updated_by = rejectedBy;
    
    await guarantor.save();
    
    return guarantor;
  } catch (error) {
    console.error('Error rejecting removal:', error.message);
    throw error;
  }
};

Guarantor.getGuarantorStats = async (buId = null) => {
  try {
    let whereClause = '';
    let replacements = [];
    
    if (buId) {
      whereClause = 'WHERE bu_id = ?';
      replacements = [buId];
    }
    
    const [stats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_guarantors,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_guarantors,
        SUM(CASE WHEN verification_status = 'Verified' THEN 1 ELSE 0 END) as verified_guarantors,
        SUM(CASE WHEN verification_status = 'Pending' THEN 1 ELSE 0 END) as pending_verification,
        SUM(guaranteed_amount) as total_guaranteed_amount
      FROM guarantors 
      ${whereClause}
    `, { replacements });
    
    return stats[0];
  } catch (error) {
    console.error('Error getting guarantor stats:', error.message);
    throw error;
  }
};

// Initialize table if it doesn't exist
Guarantor.initializeTable = async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS guarantors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        guarantor_id VARCHAR(7) UNIQUE NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        phone_number VARCHAR(15) NOT NULL,
        relationship_to_borrower ENUM('Parent', 'Sibling', 'Spouse', 'Business Partner', 'Friend', 'Relative', 'Colleague', 'Other') NOT NULL,
        guaranteed_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
        created_by VARCHAR(50) NOT NULL,
        relationship_officer_name VARCHAR(100) NOT NULL,
        loan_id INT,
        status ENUM('ACTIVE', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'DEACTIVATED') DEFAULT 'PENDING',
        email VARCHAR(100),
        address TEXT,
        state VARCHAR(50) NOT NULL,
        local_government VARCHAR(50),
        bu_id VARCHAR(20) NOT NULL,
        country VARCHAR(50) DEFAULT 'Nigeria',
        id_type VARCHAR(50),
        id_number VARCHAR(50),
        bvn VARCHAR(11),
        date_of_birth DATE,
        net_worth DECIMAL(15,2) DEFAULT 0.00,
        annual_income DECIMAL(15,2) DEFAULT 0.00,
        occupation VARCHAR(100),
        employment_type VARCHAR(50),
        verification_status ENUM('Pending', 'Verified', 'Rejected', 'Expired') DEFAULT 'Pending',
        verified_by VARCHAR(50),
        verification_date DATETIME,
        consent_date DATETIME,
        is_active BOOLEAN DEFAULT true,
        removed_at DATETIME,
        removal_reason VARCHAR(255),
        updated_by VARCHAR(50),
        removal_request JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_guarantor_id (guarantor_id),
        INDEX idx_full_name_id (full_name, id_number),
        INDEX idx_loan_active (loan_id, is_active),
        INDEX idx_bu_id (bu_id),
        INDEX idx_verification_status (verification_status),
        INDEX idx_status (status),
        INDEX idx_is_active (is_active),
        INDEX idx_created_at (created_at),
        CONSTRAINT fk_guarantor_loan FOREIGN KEY (loan_id) REFERENCES loan_accounts(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    
    console.log('✅ Guarantors table initialized');
    return true;
  } catch (error) {
    console.error('Error initializing guarantors table:', error.message);
    return false;
  }
};

// Sync the model (creates table if it doesn't exist)
Guarantor.syncTable = async () => {
  try {
    await Guarantor.sync({ alter: true });
    console.log('✅ Guarantor table synced');
    return true;
  } catch (error) {
    console.error('Error syncing Guarantor table:', error.message);
    return false;
  }
};

export default Guarantor;