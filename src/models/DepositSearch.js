// models/DepositSearch.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class DepositSearch extends Model {
  // Static method: Search by account number (partial or exact)
  static async searchByAccountNumber(accountNumber, options = {}) {
    const defaultOptions = {
      where: {
        ACCT_NO: {
          [Op.like]: `%${accountNumber}%`
        }
      },
      order: [['ACCT_NO', 'ASC']],
      limit: options.limit || 50
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Search by account name (partial or exact)
  static async searchByAccountName(accountName, options = {}) {
    const defaultOptions = {
      where: {
        ACCT_NM: {
          [Op.like]: `%${accountName}%`
        }
      },
      order: [['ACCT_NM', 'ASC'], ['ACCT_NO', 'ASC']],
      limit: options.limit || 50
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Search by customer ID
  static async searchByCustomerId(customerId, options = {}) {
    const defaultOptions = {
      where: {
        PRIMARY_CUST_ID: customerId
      },
      order: [['OPENED_DT', 'DESC'], ['ACCT_NO', 'ASC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Advanced search with multiple criteria
  static async advancedSearch(criteria, options = {}) {
    const whereClause = {};
    
    // Build where clause based on provided criteria
    if (criteria.accountNumber) {
      whereClause.ACCT_NO = {
        [Op.like]: `%${criteria.accountNumber}%`
      };
    }
    
    if (criteria.accountName) {
      whereClause.ACCT_NM = {
        [Op.like]: `%${criteria.accountName}%`
      };
    }
    
    if (criteria.productCode) {
      whereClause.PROD_CD = criteria.productCode;
    }
    
    if (criteria.businessUnitCode) {
      whereClause.BU_CD = criteria.businessUnitCode;
    }
    
    if (criteria.customerId) {
      whereClause.PRIMARY_CUST_ID = criteria.customerId;
    }
    
    if (criteria.openedDateFrom && criteria.openedDateTo) {
      whereClause.OPENED_DT = {
        [Op.between]: [criteria.openedDateFrom, criteria.openedDateTo]
      };
    } else if (criteria.openedDateFrom) {
      whereClause.OPENED_DT = {
        [Op.gte]: criteria.openedDateFrom
      };
    } else if (criteria.openedDateTo) {
      whereClause.OPENED_DT = {
        [Op.lte]: criteria.openedDateTo
      };
    }
    
    if (criteria.minBalance !== undefined) {
      whereClause.LEDGER_BAL = {
        ...whereClause.LEDGER_BAL,
        [Op.gte]: criteria.minBalance
      };
    }
    
    if (criteria.maxBalance !== undefined) {
      whereClause.LEDGER_BAL = {
        ...whereClause.LEDGER_BAL,
        [Op.lte]: criteria.maxBalance
      };
    }

    const defaultOptions = {
      where: whereClause,
      order: criteria.sortBy ? [[criteria.sortBy, criteria.sortOrder || 'ASC']] : [['ACCT_NO', 'ASC']],
      limit: criteria.limit || 100,
      offset: criteria.offset || 0
    };

    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Get search summary by business unit
  static async getBusinessUnitSummary() {
    const results = await this.findAll({
      attributes: [
        'BU_CD',
        [sequelize.fn('COUNT', sequelize.col('ACCT_NO')), 'accountCount'],
        [sequelize.fn('SUM', sequelize.col('LEDGER_BAL')), 'totalBalance']
      ],
      group: ['BU_CD'],
      order: [['BU_CD', 'ASC']]
    });

    return results.map(result => ({
      businessUnitCode: result.BU_CD,
      accountCount: result.getDataValue('accountCount'),
      totalBalance: parseFloat(result.getDataValue('totalBalance') || 0)
    }));
  }

  // Static method: Get search summary by product
  static async getProductSummary() {
    const results = await this.findAll({
      attributes: [
        'PROD_CD',
        [sequelize.fn('COUNT', sequelize.col('ACCT_NO')), 'accountCount'],
        [sequelize.fn('SUM', sequelize.col('LEDGER_BAL')), 'totalBalance'],
        [sequelize.fn('AVG', sequelize.col('LEDGER_BAL')), 'averageBalance']
      ],
      group: ['PROD_CD'],
      order: [['PROD_CD', 'ASC']]
    });

    return results.map(result => ({
      productCode: result.PROD_CD,
      accountCount: result.getDataValue('accountCount'),
      totalBalance: parseFloat(result.getDataValue('totalBalance') || 0),
      averageBalance: parseFloat(result.getDataValue('averageBalance') || 0)
    }));
  }

  // Static method: Get recent accounts
  static async getRecentAccounts(limit = 20) {
    return this.findAll({
      order: [['createdAt', 'DESC']],
      limit: limit
    });
  }

  // Static method: Find duplicate account numbers
  static async findDuplicateAccountNumbers() {
    const results = await this.findAll({
      attributes: [
        'ACCT_NO',
        [sequelize.fn('COUNT', sequelize.col('ACCT_NO')), 'duplicateCount']
      ],
      group: ['ACCT_NO'],
      having: sequelize.where(sequelize.fn('COUNT', sequelize.col('ACCT_NO')), '>', 1)
    });

    return results.map(result => ({
      accountNumber: result.ACCT_NO,
      duplicateCount: result.getDataValue('duplicateCount')
    }));
  }

  // Instance method: Get search result details
  getSearchResult() {
    return {
      accountNumber: this.ACCT_NO,
      accountName: this.ACCT_NM,
      productCode: this.PROD_CD,
      openedDate: this.OPENED_DT,
      ledgerBalance: parseFloat(this.LEDGER_BAL),
      formattedBalance: parseFloat(this.LEDGER_BAL).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }),
      businessUnitCode: this.BU_CD,
      primaryCustomerId: this.PRIMARY_CUST_ID,
      metadata: {
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
      }
    };
  }

  // Instance method: Check if account is recent (opened within last 30 days)
  isRecentAccount() {
    if (!this.OPENED_DT) return false;
    
    const openedDate = new Date(
      this.OPENED_DT.substring(0, 4),
      parseInt(this.OPENED_DT.substring(4, 6)) - 1,
      this.OPENED_DT.substring(6, 8)
    );
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    return openedDate >= thirtyDaysAgo;
  }

  // Instance method: Get account age in days
  getAccountAge() {
    if (!this.OPENED_DT) return null;
    
    const openedDate = new Date(
      this.OPENED_DT.substring(0, 4),
      parseInt(this.OPENED_DT.substring(4, 6)) - 1,
      this.OPENED_DT.substring(6, 8)
    );
    
    const today = new Date();
    const diffTime = Math.abs(today - openedDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  }

  // Instance method: Get formatted opened date
  getFormattedOpenedDate() {
    if (!this.OPENED_DT) return 'N/A';
    
    const year = this.OPENED_DT.substring(0, 4);
    const month = this.OPENED_DT.substring(4, 6);
    const day = this.OPENED_DT.substring(6, 8);
    
    return `${year}-${month}-${day}`;
  }

  // Instance method: Get account balance category
  getBalanceCategory() {
    const balance = parseFloat(this.LEDGER_BAL);
    
    if (balance < 0) return 'OVERDRAFT';
    if (balance === 0) return 'ZERO';
    if (balance < 1000) return 'SMALL';
    if (balance < 10000) return 'MEDIUM';
    if (balance < 100000) return 'LARGE';
    return 'VERY_LARGE';
  }

  // Virtual getter: Account display name
  get accountDisplay() {
    return `${this.ACCT_NO} - ${this.ACCT_NM}`;
  }

  // Virtual getter: Is high value account?
  get isHighValue() {
    return parseFloat(this.LEDGER_BAL) >= 100000;
  }

  // Virtual getter: Is active account?
  get isActive() {
    return parseFloat(this.LEDGER_BAL) !== 0;
  }
}

DepositSearch.init({
  // Primary key
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: 'Search record identifier'
  },

  // Account information
  ACCT_NO: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Account number',
    validate: {
      notEmpty: {
        msg: 'Account number cannot be empty'
      },
      len: {
        args: [1, 20],
        msg: 'Account number must be between 1 and 20 characters'
      }
    }
  },

  ACCT_NM: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Account name',
    validate: {
      notEmpty: {
        msg: 'Account name cannot be empty'
      },
      len: {
        args: [1, 50],
        msg: 'Account name must be between 1 and 50 characters'
      }
    }
  },

  PROD_CD: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Product code',
    validate: {
      notEmpty: {
        msg: 'Product code cannot be empty'
      }
    }
  },

  OPENED_DT: {
    type: DataTypes.STRING(8),
    allowNull: false,
    comment: 'Opened date (YYYYMMDD format)',
    validate: {
      notEmpty: {
        msg: 'Opened date cannot be empty'
      },
      len: {
        args: [8, 8],
        msg: 'Opened date must be exactly 8 characters (YYYYMMDD)'
      },
      isDateString(value) {
        if (value.length !== 8) {
          throw new Error('Opened date must be exactly 8 characters');
        }
        
        const year = parseInt(value.substring(0, 4));
        const month = parseInt(value.substring(4, 6)) - 1;
        const day = parseInt(value.substring(6, 8));
        
        const date = new Date(year, month, day);
        
        if (
          date.getFullYear() !== year ||
          date.getMonth() !== month ||
          date.getDate() !== day
        ) {
          throw new Error('Invalid date format. Use YYYYMMDD');
        }
        
        // Check if date is not in the future
        const today = new Date();
        if (date > today) {
          throw new Error('Opened date cannot be in the future');
        }
      }
    }
  },

  LEDGER_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Ledger balance',
    validate: {
      isDecimal: {
        msg: 'Ledger balance must be a valid decimal number'
      }
    }
  },

  BU_CD: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Business unit code',
    validate: {
      isInt: {
        msg: 'Business unit code must be an integer'
      },
      min: {
        args: [1],
        msg: 'Business unit code must be greater than 0'
      }
    }
  },

  PRIMARY_CUST_ID: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Primary customer identifier',
    validate: {
      notEmpty: {
        msg: 'Primary customer ID cannot be empty'
      },
      len: {
        args: [1, 20],
        msg: 'Primary customer ID must be between 1 and 20 characters'
      }
    }
  },

  // Sequelize timestamps
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },

  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'DepositSearch',
  tableName: 'deposit_search',
  timestamps: true,
  hooks: {
    beforeValidate: (record) => {
      // Trim all string fields
      if (record.ACCT_NO) record.ACCT_NO = record.ACCT_NO.trim();
      if (record.ACCT_NM) record.ACCT_NM = record.ACCT_NM.trim();
      if (record.PROD_CD) record.PROD_CD = record.PROD_CD.trim();
      if (record.OPENED_DT) record.OPENED_DT = record.OPENED_DT.trim();
      if (record.PRIMARY_CUST_ID) record.PRIMARY_CUST_ID = record.PRIMARY_CUST_ID.trim();
      
      // Ensure OPENED_DT is exactly 8 characters
      if (record.OPENED_DT && record.OPENED_DT.length !== 8) {
        // Try to reformat if it's a valid date
        try {
          const date = new Date(record.OPENED_DT);
          if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            record.OPENED_DT = `${year}${month}${day}`;
          }
        } catch (error) {
          // If reformatting fails, validation will catch it
        }
      }
      
      // Convert LEDGER_BAL to string for proper decimal handling if needed
      if (record.LEDGER_BAL && typeof record.LEDGER_BAL === 'string') {
        record.LEDGER_BAL = parseFloat(record.LEDGER_BAL);
      }
    },
    
    beforeCreate: (record) => {
      // Validate that account number doesn't already exist
      return DepositSearch.findOne({
        where: { ACCT_NO: record.ACCT_NO }
      }).then(existingRecord => {
        if (existingRecord) {
          throw new Error(`Account number ${record.ACCT_NO} already exists in search index`);
        }
      });
    },
    
    beforeUpdate: (record) => {
      // If updating ACCT_NO, check for duplicates excluding current record
      if (record.changed('ACCT_NO')) {
        return DepositSearch.findOne({
          where: {
            ACCT_NO: record.ACCT_NO,
            id: { [Op.ne]: record.id }
          }
        }).then(existingRecord => {
          if (existingRecord) {
            throw new Error(`Account number ${record.ACCT_NO} already exists in search index`);
          }
        });
      }
    }
  },
  indexes: [
    // Primary index
    { fields: ['id'] },
    
    // Search indexes
    { fields: ['ACCT_NO'] },
    { fields: ['ACCT_NM'] },
    { fields: ['PRIMARY_CUST_ID'] },
    { fields: ['PROD_CD'] },
    { fields: ['BU_CD'] },
    
    // Composite indexes for common search patterns
    { fields: ['ACCT_NO', 'ACCT_NM'] },
    { fields: ['PRIMARY_CUST_ID', 'PROD_CD'] },
    { fields: ['BU_CD', 'PROD_CD'] },
    { fields: ['OPENED_DT', 'LEDGER_BAL'] },
    
    // Full-text search index (if supported by your database)
    // { fields: ['ACCT_NO', 'ACCT_NM'], type: 'FULLTEXT' },
    
    // Performance indexes for sorting
    { fields: ['LEDGER_BAL'] },
    { fields: ['OPENED_DT'] },
    { fields: ['createdAt'] },
    
    // Unique constraints
    { fields: ['ACCT_NO'], unique: true },
    { fields: ['ACCT_NO', 'PRIMARY_CUST_ID'], unique: true }
  ],
  scopes: {
    byAccountNumber: (accountNumber) => ({
      where: { ACCT_NO: accountNumber }
    }),
    byAccountName: (accountName) => ({
      where: {
        ACCT_NM: {
          [Op.like]: `%${accountName}%`
        }
      }
    }),
    byCustomerId: (customerId) => ({
      where: { PRIMARY_CUST_ID: customerId }
    }),
    byProductCode: (productCode) => ({
      where: { PROD_CD: productCode }
    }),
    byBusinessUnit: (businessUnitCode) => ({
      where: { BU_CD: businessUnitCode }
    }),
    byDateRange: (startDate, endDate) => ({
      where: {
        OPENED_DT: {
          [Op.between]: [startDate, endDate]
        }
      }
    }),
    byBalanceRange: (minBalance, maxBalance) => ({
      where: {
        LEDGER_BAL: {
          [Op.between]: [minBalance, maxBalance]
        }
      }
    }),
    highValue: {
      where: { LEDGER_BAL: { [Op.gte]: 100000 } }
    },
    zeroBalance: {
      where: { LEDGER_BAL: 0 }
    },
    negativeBalance: {
      where: { LEDGER_BAL: { [Op.lt]: 0 } }
    },
    recent: {
      where: {
        createdAt: {
          [Op.gte]: new Date(new Date() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    },
    sortedByBalance: {
      order: [['LEDGER_BAL', 'DESC']]
    },
    sortedByDate: {
      order: [['OPENED_DT', 'DESC']]
    },
    sortedByName: {
      order: [['ACCT_NM', 'ASC']]
    },
    limitResults: (limit) => ({
      limit: limit
    })
  }
});

export default DepositSearch;
