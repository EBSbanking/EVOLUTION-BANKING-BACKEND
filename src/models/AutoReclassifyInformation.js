import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class AutoReclassifyInformation extends Model {}

AutoReclassifyInformation.init(
  {
    reclassification_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    prod_cd: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
      },
    },
    prod_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        isInt: true,
        min: 1,
      },
    },

    // Pre-Dominant Classification
    enable_pre_dominant_classification: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    pre_dominant_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    dominant_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },

    // Escheated Classification
    enable_escheated_classification: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    escheated_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    non_accrual_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    delinquent_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    matured_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },

    // Bad Debt Classification
    enable_bad_debt_classification: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    bad_debt_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },

    // Account Closures
    inactive_account_closure_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    zero_balance_account_closure_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },

    // Additional useful fields
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    created_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    updated_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'AutoReclassifyInformation',
    tableName: 'auto_reclassify_information',
    timestamps: true, // Adds createdAt and updatedAt
    underscored: true, // Use underscored field names
    
    hooks: {
      beforeValidate: (record) => {
        // Set default values for undefined fields
        if (record.enable_pre_dominant_classification === undefined) {
          record.enable_pre_dominant_classification = false;
        }
        if (record.enable_escheated_classification === undefined) {
          record.enable_escheated_classification = false;
        }
        if (record.enable_bad_debt_classification === undefined) {
          record.enable_bad_debt_classification = false;
        }
        if (record.is_active === undefined) {
          record.is_active = true;
        }
      },
    },
  }
);

// Helper methods
AutoReclassifyInformation.prototype.isPreDominantEnabled = function () {
  return this.enable_pre_dominant_classification === true;
};

AutoReclassifyInformation.prototype.isEscheatedEnabled = function () {
  return this.enable_escheated_classification === true;
};

AutoReclassifyInformation.prototype.isBadDebtEnabled = function () {
  return this.enable_bad_debt_classification === true;
};

// Calculate classification thresholds
AutoReclassifyInformation.prototype.getClassificationThresholds = function () {
  return {
    preDominant: this.pre_dominant_days,
    dominant: this.dominant_days,
    escheated: this.escheated_days,
    nonAccrual: this.non_accrual_days,
    delinquent: this.delinquent_days,
    matured: this.matured_days,
    badDebt: this.bad_debt_days,
    inactiveClosure: this.inactive_account_closure_days,
    zeroBalanceClosure: this.zero_balance_account_closure_days,
  };
};

// Static methods for common queries
AutoReclassifyInformation.findByProductCode = async function (prod_cd) {
  return await this.findOne({
    where: { prod_cd, is_active: true },
  });
};

AutoReclassifyInformation.findByProductId = async function (prod_id) {
  return await this.findOne({
    where: { prod_id, is_active: true },
  });
};

AutoReclassifyInformation.getAllActiveConfigs = async function () {
  return await this.findAll({
    where: { is_active: true },
    order: [['prod_cd', 'ASC']],
  });
};

AutoReclassifyInformation.getConfigsByFeature = async function (feature) {
  const featureFieldMap = {
    pre_dominant: 'enable_pre_dominant_classification',
    escheated: 'enable_escheated_classification',
    bad_debt: 'enable_bad_debt_classification',
  };

  const field = featureFieldMap[feature];
  if (!field) {
    throw new Error(`Invalid feature: ${feature}`);
  }

  return await this.findAll({
    where: { 
      [field]: true,
      is_active: true 
    },
    order: [['prod_cd', 'ASC']],
  });
};

// Create or update configuration
AutoReclassifyInformation.upsertConfig = async function (configData, transaction = null) {
  const {
    prod_cd,
    prod_id,
    enable_pre_dominant_classification = false,
    pre_dominant_days = 0,
    dominant_days = 0,
    enable_escheated_classification = false,
    escheated_days = 0,
    non_accrual_days = 0,
    delinquent_days = 0,
    matured_days = 0,
    enable_bad_debt_classification = false,
    bad_debt_days = 0,
    inactive_account_closure_days = 0,
    zero_balance_account_closure_days = 0,
    notes = null,
    created_by = null,
    updated_by = null,
    is_active = true,
  } = configData;

  // Validate required fields
  if (!prod_cd || !prod_id) {
    throw new Error('prod_cd and prod_id are required');
  }

  const [record, created] = await this.upsert(
    {
      prod_cd,
      prod_id,
      enable_pre_dominant_classification,
      pre_dominant_days,
      dominant_days,
      enable_escheated_classification,
      escheated_days,
      non_accrual_days,
      delinquent_days,
      matured_days,
      enable_bad_debt_classification,
      bad_debt_days,
      inactive_account_closure_days,
      zero_balance_account_closure_days,
      notes,
      created_by,
      updated_by,
      is_active,
    },
    {
      transaction,
      returning: true,
    }
  );

  return { record, created };
};

// Deactivate configuration (soft delete)
AutoReclassifyInformation.deactivateConfig = async function (prod_cd, updated_by = null) {
  return await this.update(
    {
      is_active: false,
      updated_by,
    },
    {
      where: { prod_cd },
    }
  );
};

// Reactivate configuration
AutoReclassifyInformation.reactivateConfig = async function (prod_cd, updated_by = null) {
  return await this.update(
    {
      is_active: true,
      updated_by,
    },
    {
      where: { prod_cd },
    }
  );
};

// Validate configuration data
AutoReclassifyInformation.validateConfig = function (configData) {
  const errors = [];

  if (!configData.prod_cd) {
    errors.push('Product code (prod_cd) is required');
  }

  if (!configData.prod_id) {
    errors.push('Product ID (prod_id) is required');
  }

  if (configData.prod_id && (isNaN(configData.prod_id) || configData.prod_id < 1)) {
    errors.push('Product ID must be a positive integer');
  }

  // Validate days are non-negative
  const daysFields = [
    'pre_dominant_days',
    'dominant_days',
    'escheated_days',
    'non_accrual_days',
    'delinquent_days',
    'matured_days',
    'bad_debt_days',
    'inactive_account_closure_days',
    'zero_balance_account_closure_days',
  ];

  daysFields.forEach((field) => {
    if (configData[field] !== undefined && configData[field] < 0) {
      errors.push(`${field} cannot be negative`);
    }
  });

  return errors;
};

// Get summary statistics
AutoReclassifyInformation.getSummary = async function () {
  const total = await this.count();
  const active = await this.count({ where: { is_active: true } });
  const preDominantEnabled = await this.count({ 
    where: { 
      enable_pre_dominant_classification: true,
      is_active: true 
    } 
  });
  const escheatedEnabled = await this.count({ 
    where: { 
      enable_escheated_classification: true,
      is_active: true 
    } 
  });
  const badDebtEnabled = await this.count({ 
    where: { 
      enable_bad_debt_classification: true,
      is_active: true 
    } 
  });

  return {
    total,
    active,
    preDominantEnabled,
    escheatedEnabled,
    badDebtEnabled,
  };
};

export default AutoReclassifyInformation;