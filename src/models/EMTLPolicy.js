// models/EMTLPolicy.js - Updated to match existing table schema

import { DataTypes, Op } from 'sequelize';
import sequelize from '../../config/db.js';

const CONFIG = {
  policyId: process.env.EMTL_POLICY_ID || 'EMTL-001',
  threshold: parseFloat(process.env.EMTL_THRESHOLD) || 10000,
  levyAmount: parseFloat(process.env.EMTL_LEVY_AMOUNT) || 50,
  levyType: process.env.EMTL_LEVY_TYPE || 'FLAT',
  glAccount: process.env.EMTL_GL_ACCOUNT || '2401000001',
  glAccountName: process.env.EMTL_GL_ACCOUNT_NAME || 'EMTL Payable',
  beneficiary: process.env.EMTL_BENEFICIARY || 'FIRS',
  beneficiaryAccount: process.env.EMTL_BENEFICIARY_ACCOUNT || '0000000001',
  beneficiaryBank: process.env.EMTL_BENEFICIARY_BANK || 'CBN',
  exemptions: {
    transactionTypes: process.env.EMTL_EXEMPT_TYPES?.split(',') || ['SALARY', 'SELF_TRANSFER'],
    customerSegments: process.env.EMTL_EXEMPT_SEGMENTS?.split(',') || ['GOVERNMENT', 'DIPLOMATIC'],
    minAmount: parseFloat(process.env.EMTL_MIN_AMOUNT) || 10000,
    maxAmount: parseFloat(process.env.EMTL_MAX_AMOUNT) || 10000000,
  },
};

const EMTLPolicy = sequelize.define('EMTLPolicy', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  policy_id: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false,
    defaultValue: CONFIG.policyId,
    field: 'policy_id',
  },
  policy_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'Electronic Money Transfer Levy',
    field: 'name', // maps to 'name' column
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  min_amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'min_amount',
  },
  max_amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 999999999.99,
    field: 'max_amount',
  },
  levy_type: {
    type: DataTypes.ENUM('FLAT', 'PERCENTAGE'),
    allowNull: false,
    defaultValue: 'FLAT',
    field: 'levy_type',
  },
  levy_value: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    field: 'levy_value',
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active',
  },
  applies_to: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'ALL',
    field: 'applies_to',
  },
  // Extra fields added via ALTER
  enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  threshold: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: CONFIG.threshold,
  },
  levy_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: CONFIG.levyAmount,
  },
  percentage_rate: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
  },
  exemptions: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: CONFIG.exemptions,
  },
  effective_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  expiry_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  gl_account: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: CONFIG.glAccount,
  },
  gl_account_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: CONFIG.glAccountName,
  },
  beneficiary: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: CONFIG.beneficiary,
  },
  beneficiary_account: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: CONFIG.beneficiaryAccount,
  },
  beneficiary_bank: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: CONFIG.beneficiaryBank,
  },
  version: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  created_by: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'SYSTEM',
  },
  created_date: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updated_by: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  updated_date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'emtl_policies',
  timestamps: true,
  createdAt: 'created_date',
  updatedAt: 'updated_date',
  underscored: true,
});

// ============================================
// STATIC METHODS
// ============================================

EMTLPolicy.getActivePolicy = async () => {
  const today = new Date().toISOString().split('T')[0];
  return await EMTLPolicy.findOne({
    where: {
      enabled: true,
      is_active: true,
      effective_date: { [Op.lte]: today },
      [Op.or]: [{ expiry_date: null }, { expiry_date: { [Op.gte]: today } }],
    },
    order: [['created_date', 'DESC']],
  });
};

EMTLPolicy.updatePolicy = async (updateData, updatedBy) => {
  // Find the first active policy or the first record
  let policy = await EMTLPolicy.findOne({
    where: { is_active: true, enabled: true },
    order: [['id', 'ASC']],
  });

  if (!policy) {
    // If no policy exists, create a new one with defaults
    policy = await EMTLPolicy.create({
      policy_id: CONFIG.policyId,
      policy_name: 'Electronic Money Transfer Levy',
      min_amount: 0,
      max_amount: 999999999.99,
      levy_type: 'FLAT',
      levy_value: 50,
      is_active: true,
      applies_to: 'ALL',
      enabled: true,
      threshold: CONFIG.threshold,
      levy_amount: CONFIG.levyAmount,
      exemptions: CONFIG.exemptions,
      effective_date: new Date().toISOString().split('T')[0],
      gl_account: CONFIG.glAccount,
      gl_account_name: CONFIG.glAccountName,
      beneficiary: CONFIG.beneficiary,
      beneficiary_account: CONFIG.beneficiaryAccount,
      beneficiary_bank: CONFIG.beneficiaryBank,
      version: 1,
      created_by: updatedBy || 'SYSTEM',
    });
  }

  // Update fields from updateData
  const fieldsToUpdate = [
    'enabled', 'threshold', 'levy_amount', 'levy_type', 'gl_account', 'effective_date',
    'exemptions', 'beneficiary', 'min_amount', 'max_amount', 'levy_value',
    'policy_id', 'description', 'gl_account_name', 'beneficiary_account',
    'beneficiary_bank', 'percentage_rate', 'is_active', 'applies_to'
  ];

  for (const field of fieldsToUpdate) {
    if (updateData[field] !== undefined) {
      policy[field] = updateData[field];
    }
  }

  policy.updated_by = updatedBy || 'SYSTEM';
  policy.updated_date = new Date();
  policy.version = (policy.version || 0) + 1;

  await policy.save();
  return policy;
};

EMTLPolicy.calculate = async (transactionData) => {
  const policy = await EMTLPolicy.getActivePolicy();
  if (!policy) {
    return { amount: 0, applicable: false, reason: 'No active policy' };
  }

  const { amount, transactionType, customerSegment, sourceCustomer, destinationCustomer } = transactionData;
  const exemptions = policy.exemptions || {};

  if (exemptions.transactionTypes?.includes(transactionType)) {
    return { amount: 0, applicable: false, reason: 'Transaction type exempt', policy };
  }
  if (sourceCustomer && sourceCustomer === destinationCustomer) {
    return { amount: 0, applicable: false, reason: 'Self-transfer exempt', policy };
  }
  if (customerSegment && exemptions.customerSegments?.includes(customerSegment)) {
    return { amount: 0, applicable: false, reason: 'Customer segment exempt', policy };
  }
  if (amount < (exemptions.minAmount || 0)) {
    return { amount: 0, applicable: false, reason: 'Below minimum threshold', policy };
  }
  if (exemptions.maxAmount && amount > exemptions.maxAmount) {
    return { amount: 0, applicable: false, reason: 'Exceeds maximum threshold', policy };
  }

  let levy = 0;
  if (policy.levy_type === 'FLAT') {
    levy = parseFloat(policy.levy_value) || 0;
  } else if (policy.levy_type === 'PERCENTAGE' && policy.percentage_rate) {
    levy = (amount * parseFloat(policy.percentage_rate)) / 100;
  }

  return {
    amount: levy,
    applicable: true,
    reason: 'EMTL applied',
    policy,
    glAccount: policy.gl_account,
    glAccountName: policy.gl_account_name,
    beneficiary: policy.beneficiary,
    beneficiaryAccount: policy.beneficiary_account,
    beneficiaryBank: policy.beneficiary_bank,
  };
};

EMTLPolicy.syncTable = async () => {
  try {
    await EMTLPolicy.sync({ alter: true });
    console.log('✅ EMTLPolicy table synced successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to sync EMTLPolicy table:', error.message);
    return false;
  }
};

export default EMTLPolicy;