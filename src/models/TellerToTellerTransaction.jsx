import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class TellerToTellerTransaction extends Model {
  // Instance method: Acknowledge receipt
  async acknowledgeReceipt(recipientName) {
    this.RECIPIENT_ACKNOWLEDGED = true;
    this.RECIPIENT_ACKNOWLEDGED_BY = recipientName;
    this.RECIPIENT_ACKNOWLEDGED_DT = new Date();
    this.MODIFIED_BY = recipientName;
    this.MODIFY_DT = new Date();
    return await this.save();
  }

  // Instance method: Raise dispute
  async raiseDispute(reason) {
    this.HAS_DISPUTE = true;
    this.DISPUTE_REASON = reason;
    this.DISPUTE_RESOLVED = false;
    this.MODIFY_DT = new Date();
    return await this.save();
  }

  // Instance method: Resolve dispute
  async resolveDispute(resolvedBy, resolutionNotes) {
    this.HAS_DISPUTE = false;
    this.DISPUTE_RESOLVED = true;
    this.DISPUTE_RESOLVED_BY = resolvedBy;
    this.DISPUTE_RESOLVED_DT = new Date();
    this.DISPUTE_REASON = resolutionNotes;
    this.MODIFIED_BY = resolvedBy;
    this.MODIFY_DT = new Date();
    return await this.save();
  }

  // Virtual getter: Check if supervisor authorization is required
  get requiresSupervisorAuth() {
    // This would require accessing the parent Transaction model
    // In Sequelize, you would typically handle this through associations
    return true; // Default - override based on your logic
  }

  // Virtual getter: Check if transfer can be completed
  get canCompleteTransfer() {
    if (this.SUPERVISOR_AUTHORIZATION_REQUIRED && !this.SUPERVISOR_AUTHORIZED_BY) {
      return false;
    }
    
    if (!this.RECIPIENT_ACKNOWLEDGED) {
      return false;
    }
    
    return true;
  }
}

TellerToTellerTransaction.init({
  // Primary key referencing base Transaction
  TRANSACTION_ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
    unique: true,
    comment: 'Reference to base transaction'
  },

  // Teller-to-teller specific fields
  SOURCE_TELLER_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Source teller ID'
  },
  SOURCE_TELLER_NAME: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Source teller name'
  },
  DESTINATION_TELLER_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Destination teller ID'
  },
  DESTINATION_TELLER_NAME: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Destination teller name'
  },

  // Transfer details
  TRANSFER_REASON: {
    type: DataTypes.ENUM(
      'BALANCE_ADJUSTMENT',
      'CASH_REQUEST',
      'OVERCASH',
      'SHORTCASH',
      'CUSTOMER_SERVICE',
      'OPERATIONAL_NEED'
    ),
    allowNull: false,
    comment: 'Reason for the transfer'
  },
  CUSTOM_REFERENCE: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Custom reference number'
  },

  // Authorization for teller transfers
  SUPERVISOR_AUTHORIZATION_REQUIRED: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Whether supervisor authorization is required'
  },
  SUPERVISOR_AUTHORIZED_BY: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Supervisor who authorized the transfer'
  },
  SUPERVISOR_AUTHORIZATION_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Date and time of supervisor authorization'
  },

  // Recipient acknowledgment
  RECIPIENT_ACKNOWLEDGED: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether recipient has acknowledged the transfer'
  },
  RECIPIENT_ACKNOWLEDGED_BY: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Recipient who acknowledged the transfer'
  },
  RECIPIENT_ACKNOWLEDGED_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Date and time of recipient acknowledgment'
  },

  // Limits and controls
  IS_WITHIN_SAME_BRANCH: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Whether transfer is within the same branch'
  },
  INTER_BRANCH_TRANSFER: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether this is an inter-branch transfer'
  },
  DESTINATION_BRANCH_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Destination branch ID for inter-branch transfers'
  },

  // Dispute resolution
  HAS_DISPUTE: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether there is a dispute on this transfer'
  },
  DISPUTE_REASON: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Reason for the dispute'
  },
  DISPUTE_RESOLVED: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether the dispute has been resolved'
  },
  DISPUTE_RESOLVED_BY: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Person who resolved the dispute'
  },
  DISPUTE_RESOLVED_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Date and time when dispute was resolved'
  },

  // Audit fields
  CREATED_BY: {
    type: DataTypes.STRING(24),
    allowNull: false,
    comment: 'User who created the record'
  },
  CREATE_DT: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: 'Creation date and time'
  },
  MODIFIED_BY: {
    type: DataTypes.STRING(24),
    allowNull: true,
    comment: 'User who last modified the record'
  },
  MODIFY_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last modification date and time'
  },
  CREATED_AT: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: 'System timestamp for creation'
  },
  UPDATED_AT: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: 'System timestamp for updates'
  }
}, {
  sequelize,
  modelName: 'TellerToTellerTransaction',
  tableName: 'TELLER_TO_TELLER_TRANSACTION',
  timestamps: true, // Using Sequelize timestamps (CREATED_AT, UPDATED_AT)
  comment: 'Teller to Teller Transaction table',
  indexes: [
    {
      name: 'idx_source_teller_create_dt',
      fields: ['SOURCE_TELLER_ID', 'CREATE_DT'],
      order: [['CREATE_DT', 'DESC']]
    },
    {
      name: 'idx_destination_teller_create_dt',
      fields: ['DESTINATION_TELLER_ID', 'CREATE_DT'],
      order: [['CREATE_DT', 'DESC']]
    },
    {
      name: 'idx_transfer_reason',
      fields: ['TRANSFER_REASON']
    },
    {
      name: 'idx_inter_branch_transfer',
      fields: ['INTER_BRANCH_TRANSFER']
    },
    {
      name: 'idx_has_dispute',
      fields: ['HAS_DISPUTE']
    },
    {
      name: 'idx_dispute_resolved',
      fields: ['DISPUTE_RESOLVED']
    },
    {
      name: 'idx_source_destination_teller',
      fields: ['SOURCE_TELLER_ID', 'DESTINATION_TELLER_ID']
    },
    {
      name: 'idx_transaction_status',
      fields: ['RECIPIENT_ACKNOWLEDGED', 'SUPERVISOR_AUTHORIZED_BY']
    }
  ],
  hooks: {
    beforeCreate: (transaction, options) => {
      // Set CREATE_DT if not provided
      if (!transaction.CREATE_DT) {
        transaction.CREATE_DT = new Date();
      }
    },
    beforeUpdate: (transaction, options) => {
      // Update MODIFY_DT on modification
      transaction.MODIFY_DT = new Date();
    }
  }
});

// Class methods for common queries
TellerToTellerTransaction.findBySourceTeller = function(tellerId, options = {}) {
  const defaultOptions = {
    where: { SOURCE_TELLER_ID: tellerId },
    order: [['CREATE_DT', 'DESC']]
  };
  
  return this.findAll({ ...defaultOptions, ...options });
};

TellerToTellerTransaction.findByDestinationTeller = function(tellerId, options = {}) {
  const defaultOptions = {
    where: { DESTINATION_TELLER_ID: tellerId },
    order: [['CREATE_DT', 'DESC']]
  };
  
  return this.findAll({ ...defaultOptions, ...options });
};

TellerToTellerTransaction.findPendingAcknowledgements = function(destinationTellerId) {
  return this.findAll({
    where: {
      DESTINATION_TELLER_ID: destinationTellerId,
      RECIPIENT_ACKNOWLEDGED: false
    },
    order: [['CREATE_DT', 'ASC']]
  });
};

TellerToTellerTransaction.findPendingSupervisorAuth = function(sourceTellerId = null) {
  const whereClause = {
    SUPERVISOR_AUTHORIZATION_REQUIRED: true,
    SUPERVISOR_AUTHORIZED_BY: null
  };
  
  if (sourceTellerId) {
    whereClause.SOURCE_TELLER_ID = sourceTellerId;
  }
  
  return this.findAll({
    where: whereClause,
    order: [['CREATE_DT', 'ASC']]
  });
};

TellerToTellerTransaction.findActiveDisputes = function() {
  return this.findAll({
    where: {
      HAS_DISPUTE: true,
      DISPUTE_RESOLVED: false
    },
    order: [['CREATE_DT', 'ASC']]
  });
};

TellerToTellerTransaction.findInterBranchTransfers = function(dateRange = null) {
  const whereClause = {
    INTER_BRANCH_TRANSFER: true
  };
  
  if (dateRange) {
    whereClause.CREATE_DT = {
      [DataTypes.Op.between]: [dateRange.start, dateRange.end]
    };
  }
  
  return this.findAll({
    where: whereClause,
    order: [['CREATE_DT', 'DESC']]
  });
};

// Get statistics
TellerToTellerTransaction.getTellerStatistics = async function(tellerId, startDate, endDate) {
  return await this.findAll({
    attributes: [
      'TRANSFER_REASON',
      [sequelize.fn('COUNT', sequelize.col('TRANSACTION_ID')), 'transfer_count'],
      [sequelize.fn('SUM', sequelize.literal('(SELECT TRANSACTION_AMOUNT FROM TRANSACTIONS t WHERE t.TRANSACTION_ID = TELLER_TO_TELLER_TRANSACTION.TRANSACTION_ID)')), 'total_amount']
    ],
    where: {
      [DataTypes.Op.or]: [
        { SOURCE_TELLER_ID: tellerId },
        { DESTINATION_TELLER_ID: tellerId }
      ],
      CREATE_DT: {
        [DataTypes.Op.between]: [startDate, endDate]
      }
    },
    group: ['TRANSFER_REASON'],
    raw: true
  });
};

export default TellerToTellerTransaction;