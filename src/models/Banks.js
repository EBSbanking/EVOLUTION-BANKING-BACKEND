import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class Bank extends Model {}

Bank.init(
  {
    // Core Identifiers
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 255],
      },
    },
    code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
        len: [1, 20],
      },
    },
    long_code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 20],
      },
    },
    last_updated: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    
    // Additional fields
    status: {
      type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED'),
      defaultValue: 'ACTIVE',
      validate: {
        isIn: [['ACTIVE', 'INACTIVE', 'SUSPENDED']],
      },
    },
    country: {
      type: DataTypes.STRING(3),
      defaultValue: 'NG',
      validate: {
        len: [2, 3],
      },
    },
    
    // Virtual field for display name (implemented as getter)
    displayName: {
      type: DataTypes.VIRTUAL,
      get() {
        return `${this.name} (${this.code})`;
      },
    },
  },
  {
    sequelize,
    modelName: 'Bank',
    tableName: 'banks',
    timestamps: true, // Adds createdAt and updatedAt
    underscored: true,
    hooks: {
      beforeValidate: (bank) => {
        // Trim and uppercase code
        if (bank.code) {
          bank.code = bank.code.trim().toUpperCase();
        }
        
        // Trim name
        if (bank.name) {
          bank.name = bank.name.trim();
        }
        
        // Trim long_code
        if (bank.long_code) {
          bank.long_code = bank.long_code.trim();
        }
        
        // Update last_updated on modification
        if (bank.changed()) {
          bank.last_updated = new Date();
        }
      },
      beforeCreate: (bank) => {
        bank.last_updated = new Date();
      },
    },
  }
);

// Static method to find active banks
Bank.findActive = async function() {
  return await this.findAll({
    where: { status: 'ACTIVE' },
    order: [['name', 'ASC']],
  });
};

// Static method to find by code
Bank.findByCode = async function(code) {
  return await this.findOne({
    where: { code: code.toUpperCase() },
  });
};

// Static method to find by name (case-insensitive search)
Bank.findByName = async function(name, options = {}) {
  const { exact = false } = options;
  
  if (exact) {
    return await this.findOne({
      where: { name },
    });
  }
  
  return await this.findOne({
    where: sequelize.where(
      sequelize.fn('LOWER', sequelize.col('name')),
      sequelize.fn('LOWER', name)
    ),
  });
};

// Static method to get all banks with pagination
Bank.getAll = async function(page = 1, limit = 20, filters = {}) {
  const offset = (page - 1) * limit;
  
  const whereClause = {};
  
  // Apply filters
  if (filters.status) {
    whereClause.status = filters.status;
  }
  
  if (filters.country) {
    whereClause.country = filters.country;
  }
  
  if (filters.search) {
    whereClause[Op.or] = [
      { name: { [Op.like]: `%${filters.search}%` } },
      { code: { [Op.like]: `%${filters.search}%` } },
    ];
  }
  
  const { count, rows } = await this.findAndCountAll({
    where: whereClause,
    limit,
    offset,
    order: [['name', 'ASC']],
  });
  
  return {
    data: rows,
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    },
  };
};

// Static method to create or update bank
Bank.upsertBank = async function(bankData, transaction = null) {
  const {
    name,
    code,
    long_code,
    status = 'ACTIVE',
    country = 'NG',
  } = bankData;
  
  if (!name || !code || !long_code) {
    throw new Error('Name, code, and long_code are required');
  }
  
  const [bank, created] = await this.upsert(
    {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      long_code: long_code.trim(),
      status,
      country,
      last_updated: new Date(),
    },
    {
      transaction,
      returning: true,
    }
  );
  
  return { bank, created };
};

// Static method to update bank status
Bank.updateStatus = async function(code, status, transaction = null) {
  if (!['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
    throw new Error('Invalid status');
  }
  
  const [affectedRows] = await this.update(
    {
      status,
      last_updated: new Date(),
    },
    {
      where: { code: code.toUpperCase() },
      transaction,
    }
  );
  
  return affectedRows;
};

// Static method to validate bank data
Bank.validateBank = function(bankData) {
  const errors = [];
  
  if (!bankData.name || bankData.name.trim().length === 0) {
    errors.push('Bank name is required');
  }
  
  if (!bankData.code || bankData.code.trim().length === 0) {
    errors.push('Bank code is required');
  }
  
  if (!bankData.long_code || bankData.long_code.trim().length === 0) {
    errors.push('Bank long code is required');
  }
  
  if (bankData.code && bankData.code.length > 20) {
    errors.push('Bank code cannot exceed 20 characters');
  }
  
  if (bankData.long_code && bankData.long_code.length > 20) {
    errors.push('Bank long code cannot exceed 20 characters');
  }
  
  if (bankData.name && bankData.name.length > 255) {
    errors.push('Bank name cannot exceed 255 characters');
  }
  
  if (bankData.status && !['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(bankData.status)) {
    errors.push('Invalid status value');
  }
  
  return errors;
};

// Instance method to check if bank is active
Bank.prototype.isActive = function() {
  return this.status === 'ACTIVE';
};

// Instance method to get basic info
Bank.prototype.getBasicInfo = function() {
  return {
    id: this.id,
    name: this.name,
    code: this.code,
    long_code: this.long_code,
    status: this.status,
    country: this.country,
    displayName: this.displayName,
  };
};

// Static method to get bank statistics
Bank.getStatistics = async function() {
  const total = await this.count();
  const active = await this.count({ where: { status: 'ACTIVE' } });
  const inactive = await this.count({ where: { status: 'INACTIVE' } });
  const suspended = await this.count({ where: { status: 'SUSPENDED' } });
  
  // Get banks by country
  const banksByCountry = await this.findAll({
    attributes: [
      'country',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
    ],
    group: ['country'],
  });
  
  return {
    total,
    byStatus: { active, inactive, suspended },
    byCountry: banksByCountry.reduce((acc, item) => {
      acc[item.country] = item.get('count');
      return acc;
    }, {}),
  };
};

export default Bank;
