// src/models/State.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class State extends Model {
  // Static method to find by country
  static async findByCountryId(countryId) {
    return await this.findAll({
      where: { COUNTRY_ID: countryId },
      order: [['STATE_NM', 'ASC']]
    });
  }

  // Static method to find by name (case-insensitive)
  static async findByName(stateName) {
    return await this.findAll({
      where: sequelize.where(
        sequelize.fn('LOWER', sequelize.col('STATE_NM')),
        stateName.toLowerCase()
      )
    });
  }

  // Static method to get states with local governments count
  static async getStatesWithLGCount(countryId = null) {
    const whereClause = countryId ? { COUNTRY_ID: countryId } : {};
    
    return await this.findAll({
      where: whereClause,
      attributes: [
        'id',
        'STATE_ID',
        'STATE_NM',
        'COUNTRY_ID',
        [sequelize.fn('COUNT', sequelize.col('localGovernments.id')), 'localGovCount']
      ],
      include: [{
        model: LocalGovernment, // Assuming you have LocalGovernment model
        as: 'localGovernments',
        attributes: []
      }],
      group: ['State.id'],
      order: [['STATE_NM', 'ASC']],
      raw: true
    });
  }

  // Instance method to get local governments
  async getLocalGovernments() {
    return await this.getLocalGovernments(); // Sequelize association method
  }

  // Instance method to add local government
  async addLocalGovernment(localGovId) {
    return await this.addLocalGovernment(localGovId); // Sequelize association method
  }

  // Instance method to remove local government
  async removeLocalGovernment(localGovId) {
    return await this.removeLocalGovernment(localGovId); // Sequelize association method
  }
}

State.init({
  // Auto-increment primary key
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    comment: 'Auto-increment primary key'
  },
  // Unique state identifier (varchar)
  STATE_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: 'Unique state identifier (e.g., ST_LAGOS)',
    validate: {
      notEmpty: {
        msg: 'State ID cannot be empty'
      },
      len: {
        args: [1, 50],
        msg: 'State ID must be between 1 and 50 characters'
      }
    },
    set(value) {
      // Trim and convert to uppercase
      this.setDataValue('STATE_ID', value ? value.trim().toUpperCase() : value);
    }
  },
  STATE_NM: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'State name',
    validate: {
      notEmpty: {
        msg: 'State name cannot be empty'
      },
      len: {
        args: [1, 100],
        msg: 'State name must be between 1 and 100 characters'
      }
    },
    set(value) {
      // Trim whitespace
      this.setDataValue('STATE_NM', value ? value.trim() : value);
    }
  },
  COUNTRY_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Reference to country (e.g., NG)',
    validate: {
      notEmpty: {
        msg: 'Country ID cannot be empty'
      }
    },
    set(value) {
      this.setDataValue('COUNTRY_ID', value ? value.trim().toUpperCase() : value);
    }
  }
}, {
  sequelize,
  modelName: 'State',
  tableName: 'STATES',
  timestamps: true,
  createdAt: 'CREATED_AT',
  updatedAt: 'UPDATED_AT',
  comment: 'States table',
  
  hooks: {
    beforeValidate: (state, options) => {
      // Trim string fields
      if (state.STATE_ID) state.STATE_ID = state.STATE_ID.trim().toUpperCase();
      if (state.STATE_NM) state.STATE_NM = state.STATE_NM.trim();
      if (state.COUNTRY_ID) state.COUNTRY_ID = state.COUNTRY_ID.trim().toUpperCase();
    },
    
    beforeCreate: (state, options) => {
      // Generate STATE_ID if not provided
      if (!state.STATE_ID) {
        // Generate a state ID from name (e.g., "LAGOS" -> "ST_LAGOS")
        const stateCode = state.STATE_NM.toUpperCase().replace(/\s+/g, '_');
        state.STATE_ID = `ST_${stateCode}`;
      }
      
      // Ensure STATE_ID is uppercase
      if (state.STATE_ID) {
        state.STATE_ID = state.STATE_ID.toUpperCase();
      }
    },
    
    beforeUpdate: (state, options) => {
      // Trim fields on update
      if (state.changed('STATE_NM')) {
        state.STATE_NM = state.STATE_NM.trim();
      }
      if (state.changed('STATE_ID')) {
        state.STATE_ID = state.STATE_ID.trim().toUpperCase();
      }
      if (state.changed('COUNTRY_ID')) {
        state.COUNTRY_ID = state.COUNTRY_ID.trim().toUpperCase();
      }
    },
    
    afterCreate: (state, options) => {
      console.log(`State "${state.STATE_NM}" created (ID: ${state.id}, STATE_ID: ${state.STATE_ID})`);
    },
    
    afterUpdate: (state, options) => {
      console.log(`State "${state.STATE_NM}" updated (ID: ${state.id}, STATE_ID: ${state.STATE_ID})`);
    }
  },

  // Indexes for better query performance
  indexes: [
    {
      unique: true,
      fields: ['STATE_ID']
    },
    {
      fields: ['STATE_NM']
    },
    {
      fields: ['COUNTRY_ID']
    },
    {
      fields: ['COUNTRY_ID', 'STATE_NM']
    }
  ]
});

// Define associations
State.associate = (models) => {
  State.belongsTo(models.Country, {
    foreignKey: 'COUNTRY_ID',
    targetKey: 'code', // Assuming Country model uses 'code' as primary key
    as: 'country'
  });
  
  State.hasMany(models.LocalGovernment, {
    foreignKey: 'STATE_ID',
    sourceKey: 'id',
    as: 'localGovernments'
  });
  
  State.hasMany(models.Customer, {
    foreignKey: 'STATE_ID',
    sourceKey: 'id',
    as: 'customers'
  });
  
  State.hasMany(models.Branch, {
    foreignKey: 'STATE_ID',
    sourceKey: 'id',
    as: 'branches'
  });
};

export default State;