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
        'STATE_ID',
        'STATE_NM',
        'COUNTRY_ID',
        [sequelize.fn('COUNT', sequelize.col('localGovernments.STATE_ID')), 'localGovCount']
      ],
      include: [{
        model: LocalGovernment, // Assuming you have LocalGovernment model
        as: 'localGovernments',
        attributes: []
      }],
      group: ['State.STATE_ID'],
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
  STATE_ID: {
    type: DataTypes.STRING(50),
    primaryKey: true,
    allowNull: false,
    unique: true,
    comment: 'Unique state identifier'
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
    type: DataTypes.STRING(50), // Or INTEGER if your Country model uses integer IDs
    allowNull: false,
    comment: 'Reference to country'
  }
}, {
  sequelize,
  modelName: 'State',
  tableName: 'STATES',
  timestamps: true,
  createdAt: 'CREATED_AT',
  updatedAt: 'UPDATED_AT',
  comment: 'States table',
  indexes: [
    {
      name: 'idx_state_id',
      fields: ['STATE_ID'],
      unique: true
    },
    {
      name: 'idx_state_nm',
      fields: ['STATE_NM']
    },
    {
      name: 'idx_country_id',
      fields: ['COUNTRY_ID']
    },
    {
      name: 'idx_state_country',
      fields: ['STATE_NM', 'COUNTRY_ID'],
      unique: true // Ensure state name is unique within a country
    },
    {
      name: 'idx_created_at',
      fields: ['CREATED_AT']
    },
    {
      name: 'idx_updated_at',
      fields: ['UPDATED_AT']
    }
  ],
  hooks: {
    beforeValidate: (state, options) => {
      // Trim string fields
      if (state.STATE_ID) state.STATE_ID = state.STATE_ID.trim();
      if (state.STATE_NM) state.STATE_NM = state.STATE_NM.trim();
      if (state.COUNTRY_ID) state.COUNTRY_ID = state.COUNTRY_ID.trim();
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
    },
    
    afterCreate: (state, options) => {
      console.log(`State "${state.STATE_NM}" (ID: ${state.STATE_ID}) created`);
    },
    
    afterUpdate: (state, options) => {
      console.log(`State "${state.STATE_NM}" (ID: ${state.STATE_ID}) updated`);
    }
  }
});

export default State;