// LoanFee.js - COMPLETE UPDATED VERSION WITH FIXED AUTO-TABLE CREATION
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';

const LoanFee = sequelize.define('LoanFee', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // Map to whatever column actually exists in your database
  // Common possibilities: 'PROD_ID', 'product_id', 'PRODUCT_ID', 'prod_id'
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'PROD_ID', // Change this to match your actual database column name
    validate: {
      notNull: { msg: 'Product ID is required' },
      isInt: { msg: 'Product ID must be an integer' }
    }
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'name', // Explicit mapping
    validate: {
      notNull: { msg: 'Name is required' },
      notEmpty: { msg: 'Name cannot be empty' },
      len: { args: [1, 100], msg: 'Name must be between 1 and 100 characters' }
    }
  },
  type: {
    type: DataTypes.ENUM(
      'PROCESSING_FEE',
      'INSURANCE_FEE', 
      'DOCUMENTATION_FEE',
      'LATE_PAYMENT_FEE',
      'EARLY_REPAYMENT_FEE',
      'UPFRONT_FEE',
      'ONGOING_FEE',
      'OTHER'
    ),
    allowNull: false,
    defaultValue: 'PROCESSING_FEE',
    field: 'type',
    validate: {
      notNull: { msg: 'Type is required' },
      isUppercase: true
    }
  },
  isPercentage: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_percentage'
  },
  value: {
    type: DataTypes.DECIMAL(20, 4),
    allowNull: false,
    field: 'value',
    validate: {
      notNull: { msg: 'Value is required' },
      min: { args: [0], msg: 'Value must be non-negative' }
    }
  },
  minAmount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'min_amount',
    validate: {
      min: { args: [0], msg: 'Minimum amount must be non-negative' },
      maxMinAmount(value) {
        if (this.isPercentage && value > 0 && this.maxAmount > 0 && value > this.maxAmount) {
          throw new Error('Minimum amount cannot be greater than maximum amount');
        }
      }
    }
  },
  maxAmount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'max_amount',
    validate: {
      min: { args: [0], msg: 'Maximum amount must be non-negative' }
    }
  },
  glAccountCode: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'gl_account_code',
    validate: {
      notNull: { msg: 'GL Account Code is required' },
      isValidGLAccountCode(value) {
        const pattern = /^(?:\d{6,10}|\d{1,3}(?:-\d{1,3}){5})$/;
        if (!pattern.test(value)) {
          throw new Error('GL Account Code must be 6-10 digits or XX-XX-XX-XX-XX-XX format');
        }
      }
    }
  },
  taxable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'taxable'
  },
  taxRate: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'tax_rate',
    validate: {
      min: { args: [0], msg: 'Tax rate must be non-negative' },
      max: { args: [100], msg: 'Tax rate cannot exceed 100%' },
      requiredIfTaxable(value) {
        if (this.taxable && (!value || value <= 0)) {
          throw new Error('Tax rate is required when taxable is true');
        }
      }
    }
  },
  appliesToDisbursement: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'applies_to_disbursement'
  },
  appliesToRepayment: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'applies_to_repayment'
  },
  active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'active'
  },
  createdBy: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'created_by',
    validate: {
      notNull: { msg: 'createdBy is required' },
      isValidCreatedBy(value) {
        if (value !== 'system' && !/^\d+$/.test(value) && !/^[0-9a-fA-F]{24}$/.test(value)) {
          throw new Error('createdBy must be "system" or a valid user identifier');
        }
      }
    }
  },
  workflowMetadata: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {},
    field: 'workflow_metadata'
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'loan_fees',
  modelName: 'LoanFee',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  
  getterMethods: {
    feeDescription() {
      if (this.isPercentage) {
        let desc = `${this.name} (${Number(this.value).toFixed(2)}%`;
        if (Number(this.minAmount) > 0) {
          desc += `, min ${Number(this.minAmount).toFixed(2)}`;
        }
        if (Number(this.maxAmount) > 0) {
          desc += `, max ${Number(this.maxAmount).toFixed(2)}`;
        }
        desc += ')';
        return desc;
      } else {
        return `${this.name} (Fixed: ${Number(this.value).toFixed(2)})`;
      }
    }
  },
  
});

// ========================
// FIXED: Auto-table creation function - NO sequelize.sync() call
// ========================
LoanFee.ensureTableExists = async function() {
  try {
    // ✅ REMOVED: await sequelize.sync({ force: false, alter: false });
    // This was causing the BU_ROLE_ID error because it was syncing ALL models
    
    console.log('🔍 Checking if loan_fees table exists...');
    
    // Direct SQL check - only check this specific table
    const [tables] = await sequelize.query(
      "SHOW TABLES LIKE 'loan_fees'",
      { type: sequelize.QueryTypes.SELECT }
    );
    
    if (!tables || tables.length === 0) {
      console.log('⚠️ LoanFee table not found, creating via SQL...');
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS loan_fees (
          id INT AUTO_INCREMENT PRIMARY KEY,
          PROD_ID INT NOT NULL,
          name VARCHAR(100) NOT NULL,
          type VARCHAR(50) NOT NULL,
          is_percentage BOOLEAN DEFAULT FALSE,
          value DECIMAL(20, 4) NOT NULL,
          min_amount DECIMAL(20, 2) DEFAULT 0,
          max_amount DECIMAL(20, 2) DEFAULT 0,
          gl_account_code VARCHAR(20) NOT NULL,
          taxable BOOLEAN DEFAULT FALSE,
          tax_rate DECIMAL(5, 2) DEFAULT 0,
          applies_to_disbursement BOOLEAN DEFAULT TRUE,
          applies_to_repayment BOOLEAN DEFAULT FALSE,
          active BOOLEAN DEFAULT TRUE,
          created_by VARCHAR(255) NOT NULL,
          workflow_metadata JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          INDEX idx_loan_fee_prod_id (PROD_ID),
          INDEX idx_loan_fee_active (active),
          INDEX idx_loan_fee_type (type),
          INDEX idx_loan_fee_gl_account (gl_account_code),
          INDEX idx_loan_fee_created_at (created_at),
          INDEX idx_loan_fee_prod_type_active (PROD_ID, type, active),
          INDEX idx_loan_fee_prod_active_disbursement (PROD_ID, active, applies_to_disbursement),
          INDEX idx_loan_fee_prod_active_repayment (PROD_ID, active, applies_to_repayment)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('✅ LoanFee table created via SQL');
    } else {
      console.log('✅ LoanFee table already exists');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Failed to ensure LoanFee table exists:', error.message);
    return false;
  }
};

// Initialize table on module load
LoanFee.initializeTable = async function() {
  console.log('🔄 Initializing LoanFee table...');
  const success = await this.ensureTableExists();
  if (success) {
    console.log('✅ LoanFee table initialization complete');
  } else {
    console.error('❌ LoanFee table initialization failed');
  }
  return success;
};

// ========================
// Define associations
// ========================
LoanFee.associate = (models) => {
  if (models.Product) {
    LoanFee.belongsTo(models.Product, {
      foreignKey: 'PROD_ID',
      targetKey: 'id',
      as: 'product'
    });
  }
  
  if (models.User) {
    LoanFee.belongsTo(models.User, {
      foreignKey: 'created_by',
      targetKey: 'user_id',
      as: 'creator',
      constraints: false
    });
  }
  
  if (models.GLAccount) {
    LoanFee.belongsTo(models.GLAccount, {
      foreignKey: 'gl_account_code',
      targetKey: 'accountCode',
      as: 'glAccount',
      constraints: false
    });
  }
};

// ========================
// Static methods
// ========================
LoanFee.calculateFees = async function(product_id, loanAmount) {
  if (isNaN(loanAmount)) {
    throw new Error('Loan amount must be a number');
  }
  if (loanAmount <= 0) {
    throw new Error('Loan amount must be positive');
  }

  const loanAmountNum = Number(loanAmount);
  
  const fees = await this.findAll({ 
    where: { 
      PROD_ID: product_id,
      active: true,
      [Op.or]: [
        { applies_to_disbursement: true },
        { applies_to_repayment: true }
      ]
    }
  });

  return fees.map(fee => {
    let amount = fee.isPercentage 
      ? loanAmountNum * (Number(fee.value) / 100)
      : Number(fee.value);

    if (fee.isPercentage) {
      const minAmount = Number(fee.minAmount);
      const maxAmount = Number(fee.maxAmount);
      
      if (minAmount > 0) {
        amount = Math.max(amount, minAmount);
      }
      if (maxAmount > 0) {
        amount = Math.min(amount, maxAmount);
      }
    }

    const amountNum = parseFloat(amount.toFixed(2));
    const taxRate = Number(fee.taxRate);
    const taxAmount = fee.taxable ? parseFloat((amountNum * taxRate / 100).toFixed(2)) : 0;

    return {
      feeId: fee.id,
      name: fee.name,
      type: fee.type,
      isPercentage: fee.isPercentage,
      value: Number(fee.value),
      minAmount: Number(fee.minAmount),
      maxAmount: Number(fee.maxAmount),
      amount: amountNum,
      taxable: fee.taxable,
      taxRate: taxRate,
      taxAmount: taxAmount,
      totalAmount: amountNum + taxAmount,
      glAccountCode: fee.glAccountCode,
      appliesToDisbursement: fee.appliesToDisbursement,
      appliesToRepayment: fee.appliesToRepayment
    };
  });
};

LoanFee.calculateProcessingFees = async function(product_id, loanAmount) {
  const allFees = await this.calculateFees(product_id, loanAmount);
  const processingFees = allFees.filter(fee => fee.type === 'PROCESSING_FEE');
  
  const total = processingFees.reduce((sum, fee) => sum + fee.totalAmount, 0);
  const totalTax = processingFees.reduce((sum, fee) => sum + fee.taxAmount, 0);
  
  return {
    fees: processingFees,
    subtotal: parseFloat((total - totalTax).toFixed(2)),
    totalTax: parseFloat(totalTax.toFixed(2)),
    total: parseFloat(total.toFixed(2)),
    count: processingFees.length
  };
};

LoanFee.getProcessingFee = async function(product_id, loanAmount) {
  const result = await this.calculateProcessingFees(product_id, loanAmount);
  return result.total;
};

LoanFee.findActiveByProduct = async function(product_id) {
  return this.findAll({
    where: { 
      PROD_ID: product_id,
      active: true 
    },
    order: [['type', 'ASC'], ['created_at', 'DESC']]
  });
};

LoanFee.findByType = async function(product_id, type) {
  return this.findAll({
    where: { 
      PROD_ID: product_id,
      type,
      active: true 
    },
    order: [['created_at', 'DESC']]
  });
};

LoanFee.deactivate = async function(feeId) {
  const fee = await this.findByPk(feeId);
  if (!fee) {
    throw new Error('Fee not found');
  }
  
  fee.active = false;
  await fee.save();
  return fee;
};

// ========================
// Hooks
// ========================
LoanFee.beforeValidate((loanFee) => {
  // Trim string fields
  if (loanFee.name) loanFee.name = loanFee.name.trim();
  if (loanFee.glAccountCode) loanFee.glAccountCode = loanFee.glAccountCode.trim();
  if (loanFee.createdBy) loanFee.createdBy = loanFee.createdBy.trim();
  
  // Ensure uppercase for type
  if (loanFee.type) loanFee.type = loanFee.type.toUpperCase();
  
  // Ensure proper values for booleans
  if (typeof loanFee.taxable === 'string') {
    loanFee.taxable = loanFee.taxable.toLowerCase() === 'true';
  }
  if (typeof loanFee.active === 'string') {
    loanFee.active = loanFee.active.toLowerCase() === 'true';
  }
  if (typeof loanFee.isPercentage === 'string') {
    loanFee.isPercentage = loanFee.isPercentage.toLowerCase() === 'true';
  }
});

// ========================
// Static method to create a fee with auto-table creation
// ========================
LoanFee.createWithAutoTable = async function(data) {
  try {
    // Ensure table exists first (without syncing all models)
    await this.ensureTableExists();
    
    // Create the fee
    const fee = await this.create(data);
    console.log('✅ Fee created with ID:', fee.id);
    return fee;
  } catch (error) {
    console.error('❌ Error creating fee:', error.message);
    
    // If table doesn't exist, create it and retry
    if (error.message.includes('Table') && error.message.includes("doesn't exist")) {
      console.log('🔄 Table not found, attempting to create it...');
      
      try {
        await sequelize.query(`
          CREATE TABLE IF NOT EXISTS loan_fees (
            id INT AUTO_INCREMENT PRIMARY KEY,
            PROD_ID INT NOT NULL,
            name VARCHAR(100) NOT NULL,
            type VARCHAR(50) NOT NULL,
            is_percentage BOOLEAN DEFAULT FALSE,
            value DECIMAL(20, 4) NOT NULL,
            min_amount DECIMAL(20, 2) DEFAULT 0,
            max_amount DECIMAL(20, 2) DEFAULT 0,
            gl_account_code VARCHAR(20) NOT NULL,
            taxable BOOLEAN DEFAULT FALSE,
            tax_rate DECIMAL(5, 2) DEFAULT 0,
            applies_to_disbursement BOOLEAN DEFAULT TRUE,
            applies_to_repayment BOOLEAN DEFAULT FALSE,
            active BOOLEAN DEFAULT TRUE,
            created_by VARCHAR(255) NOT NULL,
            workflow_metadata JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        
        console.log('✅ Table created, retrying fee creation...');
        const fee = await this.create(data);
        return fee;
      } catch (retryError) {
        console.error('❌ Failed to create fee after table creation:', retryError.message);
        throw retryError;
      }
    }
    
    throw error;
  }
};

export default LoanFee;
