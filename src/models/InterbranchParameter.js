// src/models/InterbranchParameter.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class InterbranchParameter extends Model {
  /**
   * Helper method for defining associations.
   * This method is not a part of Sequelize lifecycle.
   * The `models/index` file will call this method automatically.
   */
  static associate(models) {
    // Define association with GL Account
    this.belongsTo(models.GlAccount, {
      foreignKey: 'settlement_gl_account',
      targetKey: 'gl_acct_no',
      as: 'glAccount',
      constraints: false,
    });
    
    // Optional: Define association with Branch
    this.belongsTo(models.Branch, {
      foreignKey: 'source_branch_code',
      targetKey: 'branch_code',
      as: 'sourceBranch',
      constraints: false,
    });
    
    this.belongsTo(models.Branch, {
      foreignKey: 'destination_branch_code',
      targetKey: 'branch_code',
      as: 'destinationBranch',
      constraints: false,
    });
  }

  /**
   * Find interbranch settlement GL for a branch pair
   * @param {string} sourceBranch - Source branch code
   * @param {string} destBranch - Destination branch code
   * @param {object} transaction - Optional transaction object
   * @returns {Promise<object|null>} InterbranchParameter instance or null
   */
  static async findByBranchPair(sourceBranch, destBranch, transaction = null) {
    const options = transaction ? { transaction } : {};
    
    return await this.findOne({
      where: {
        source_branch_code: sourceBranch,
        destination_branch_code: destBranch,
        is_active: true,
      },
      ...options,
    });
  }

  /**
   * Get settlement GL for a branch pair with fallback
   * @param {string} sourceBranch - Source branch code
   * @param {string} destBranch - Destination branch code
   * @param {object} transaction - Optional transaction object
   * @returns {Promise<string|null>} GL account number or null
   */
  static async getSettlementGlAccount(sourceBranch, destBranch, transaction = null) {
    const options = transaction ? { transaction } : {};
    
    // Try exact match first
    let param = await this.findOne({
      where: {
        source_branch_code: sourceBranch,
        destination_branch_code: destBranch,
        is_active: true,
      },
      ...options,
    });
    
    if (param) {
      return param.settlement_gl_account;
    }
    
    // Try reverse branch pair (if symmetric)
    param = await this.findOne({
      where: {
        source_branch_code: destBranch,
        destination_branch_code: sourceBranch,
        is_active: true,
      },
      ...options,
    });
    
    if (param) {
      return param.settlement_gl_account;
    }
    
    // Fallback: Try wildcard source
    param = await this.findOne({
      where: {
        source_branch_code: '*',
        destination_branch_code: destBranch,
        is_active: true,
      },
      ...options,
    });
    
    if (param) {
      return param.settlement_gl_account;
    }
    
    // Fallback: Try wildcard destination
    param = await this.findOne({
      where: {
        source_branch_code: sourceBranch,
        destination_branch_code: '*',
        is_active: true,
      },
      ...options,
    });
    
    if (param) {
      return param.settlement_gl_account;
    }
    
    // Final fallback: Try default
    param = await this.findOne({
      where: {
        source_branch_code: '*',
        destination_branch_code: '*',
        is_active: true,
      },
      ...options,
    });
    
    return param ? param.settlement_gl_account : null;
  }

  /**
   * Get all active interbranch parameters for a branch
   * @param {string} branchCode - Branch code
   * @param {object} options - Query options
   * @returns {Promise<Array>} Array of InterbranchParameter instances
   */
  static async getBranchSettlements(branchCode, options = {}) {
    const { 
      limit = 100, 
      offset = 0,
      orderBy = 'source_branch_code',
      orderDir = 'ASC'
    } = options;
    
    return await this.findAndCountAll({
      where: {
        [Op.or]: [
          { source_branch_code: branchCode },
          { destination_branch_code: branchCode },
        ],
        is_active: true,
      },
      limit,
      offset,
      order: [[orderBy, orderDir]],
    });
  }

  /**
   * Activate or deactivate a branch pair
   * @param {string} sourceBranch - Source branch code
   * @param {string} destBranch - Destination branch code
   * @param {boolean} active - Active status
   * @param {string} updatedBy - User making the change
   * @param {object} transaction - Optional transaction object
   * @returns {Promise<boolean>} Success status
   */
  static async setActiveStatus(sourceBranch, destBranch, active, updatedBy, transaction = null) {
    const options = transaction ? { transaction } : {};
    
    const [updated] = await this.update(
      {
        is_active: active,
        updated_by: updatedBy,
        updated_at: new Date(),
      },
      {
        where: {
          source_branch_code: sourceBranch,
          destination_branch_code: destBranch,
        },
        ...options,
      }
    );
    
    return updated > 0;
  }

  /**
   * Find matching settlement GL for transaction
   * @param {string} sourceBranch - Source branch code
   * @param {string} destBranch - Destination branch code
   * @param {object} transaction - Optional transaction object
   * @returns {Promise<object|null>} Settlement GL account info
   */
  static async findSettlementGlAccount(sourceBranch, destBranch, transaction = null) {
    const glAccountNo = await this.getSettlementGlAccount(sourceBranch, destBranch, transaction);
    
    if (!glAccountNo) {
      return null;
    }
    
    // Get the full GL account details
    const GlAccount = sequelize.models.GlAccount;
    if (!GlAccount) {
      return { gl_acct_no: glAccountNo };
    }
    
    const glAccount = await GlAccount.findOne({
      where: { gl_acct_no: glAccountNo, rec_st: 'Active' },
      transaction,
    });
    
    return glAccount || { gl_acct_no: glAccountNo };
  }
}

InterbranchParameter.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    source_branch_code: {
      type: DataTypes.STRING(10),
      allowNull: false,
      validate: {
        notNull: {
          msg: 'Source branch code is required',
        },
        notEmpty: {
          msg: 'Source branch code cannot be empty',
        },
        len: {
          args: [1, 10],
          msg: 'Source branch code must be between 1 and 10 characters',
        },
      },
    },
    destination_branch_code: {
      type: DataTypes.STRING(10),
      allowNull: false,
      validate: {
        notNull: {
          msg: 'Destination branch code is required',
        },
        notEmpty: {
          msg: 'Destination branch code cannot be empty',
        },
        len: {
          args: [1, 10],
          msg: 'Destination branch code must be between 1 and 10 characters',
        },
        isNotSameBranch(value) {
          if (this.source_branch_code && value === this.source_branch_code) {
            throw new Error('Source and destination branches cannot be the same');
          }
        },
      },
    },
    settlement_gl_account: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notNull: {
          msg: 'Settlement GL account is required',
        },
        notEmpty: {
          msg: 'Settlement GL account cannot be empty',
        },
        len: {
          args: [1, 50],
          msg: 'Settlement GL account must be between 1 and 50 characters',
        },
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      validate: {
        len: {
          args: [0, 1000],
          msg: 'Description cannot exceed 1000 characters',
        },
      },
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      validate: {
        isIn: {
          args: [[true, false]],
          msg: 'is_active must be a boolean value',
        },
      },
    },
    created_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
      validate: {
        len: {
          args: [0, 100],
          msg: 'Created by cannot exceed 100 characters',
        },
      },
    },
    updated_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
      validate: {
        len: {
          args: [0, 100],
          msg: 'Updated by cannot exceed 100 characters',
        },
      },
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'InterbranchParameter',
    tableName: 'interbranch_parameters',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        name: 'idx_interbranch_source_branch',
        fields: ['source_branch_code'],
      },
      {
        name: 'idx_interbranch_dest_branch',
        fields: ['destination_branch_code'],
      },
      {
        name: 'idx_interbranch_branch_pair',
        fields: ['source_branch_code', 'destination_branch_code'],
        unique: true,
      },
      {
        name: 'idx_interbranch_is_active',
        fields: ['is_active'],
      },
    ],
    hooks: {
      beforeCreate: (param) => {
        // Ensure source and destination are not the same
        if (param.source_branch_code === param.destination_branch_code) {
          throw new Error('Source and destination branches cannot be the same');
        }
        
        // Trim branch codes
        param.source_branch_code = param.source_branch_code.trim();
        param.destination_branch_code = param.destination_branch_code.trim();
        param.settlement_gl_account = param.settlement_gl_account.trim();
      },
      beforeUpdate: (param) => {
        if (param.source_branch_code && param.destination_branch_code) {
          if (param.source_branch_code === param.destination_branch_code) {
            throw new Error('Source and destination branches cannot be the same');
          }
          param.source_branch_code = param.source_branch_code.trim();
          param.destination_branch_code = param.destination_branch_code.trim();
        }
        if (param.settlement_gl_account) {
          param.settlement_gl_account = param.settlement_gl_account.trim();
        }
      },
    },
  }
);

export default InterbranchParameter;
