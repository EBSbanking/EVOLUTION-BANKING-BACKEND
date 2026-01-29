// models/Country.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class Country extends Model {
  // Static method: Find country by ID
  static async findById(countryId) {
    return this.findOne({ 
      where: { COUNTRY_ID: countryId },
      include: [{
        model: sequelize.models.State,
        as: 'states'
      }]
    });
  }

  // Static method: Get all countries with states
  static async getAllWithStates() {
    return this.findAll({
      include: [{
        model: sequelize.models.State,
        as: 'states'
      }],
      order: [['COUNTRY_NM', 'ASC']]
    });
  }

  // Static method: Search countries by name
  static async searchByName(name) {
    return this.findAll({
      where: {
        COUNTRY_NM: {
          [Op.like]: `%${name}%`
        }
      },
      order: [['COUNTRY_NM', 'ASC']]
    });
  }

  // Instance method: Add state to country
  async addState(stateId) {
    const State = sequelize.models.State;
    
    // Find the state
    const state = await State.findByPk(stateId);
    if (!state) {
      throw new Error(`State with ID ${stateId} not found`);
    }
    
    // Update the state's country reference
    state.COUNTRY_ID = this.COUNTRY_ID;
    await state.save();
    
    // Refresh the association
    await this.reload({
      include: [{
        model: State,
        as: 'states'
      }]
    });
    
    return this;
  }

  // Instance method: Remove state from country
  async removeState(stateId) {
    const State = sequelize.models.State;
    
    // Find the state
    const state = await State.findByPk(stateId);
    if (!state) {
      throw new Error(`State with ID ${stateId} not found`);
    }
    
    // Check if state belongs to this country
    if (state.COUNTRY_ID !== this.COUNTRY_ID) {
      throw new Error(`State ${stateId} does not belong to country ${this.COUNTRY_ID}`);
    }
    
    // Remove the country reference
    state.COUNTRY_ID = null;
    await state.save();
    
    // Refresh the association
    await this.reload({
      include: [{
        model: State,
        as: 'states'
      }]
    });
    
    return this;
  }

  // Instance method: Get states count
  async getStatesCount() {
    const states = await this.getStates();
    return states.length;
  }

  // Instance method: Get formatted country info
  getCountryInfo() {
    return {
      countryId: this.COUNTRY_ID,
      countryName: this.COUNTRY_NM,
      createdAt: this.CREATE_DT,
      createdDate: this.created_at,
      updatedDate: this.updated_at
    };
  }
}

Country.init({
  COUNTRY_ID: {
    type: DataTypes.STRING(10),
    allowNull: false,
    primaryKey: true,
    unique: true,
    validate: {
      notEmpty: true,
      len: [1, 10]
    },
    comment: 'Country identifier code (e.g., US, NG, GB)'
  },
  COUNTRY_NM: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 100]
    },
    comment: 'Country name'
  },
  CREATE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Date when country record was created'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'Country',
  tableName: 'countries',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  hooks: {
    beforeCreate: (country) => {
      // Ensure COUNTRY_ID is uppercase
      if (country.COUNTRY_ID) {
        country.COUNTRY_ID = country.COUNTRY_ID.toUpperCase().trim();
      }
      
      // Ensure COUNTRY_NM is properly formatted
      if (country.COUNTRY_NM) {
        country.COUNTRY_NM = country.COUNTRY_NM.trim();
      }
    },
    beforeUpdate: (country) => {
      // Ensure COUNTRY_ID is uppercase
      if (country.changed('COUNTRY_ID') && country.COUNTRY_ID) {
        country.COUNTRY_ID = country.COUNTRY_ID.toUpperCase().trim();
      }
      
      // Ensure COUNTRY_NM is properly formatted
      if (country.changed('COUNTRY_NM') && country.COUNTRY_NM) {
        country.COUNTRY_NM = country.COUNTRY_NM.trim();
      }
    },
    afterCreate: (country) => {
      console.log(`Country ${country.COUNTRY_NM} (${country.COUNTRY_ID}) created`);
    },
    afterUpdate: (country) => {
      console.log(`Country ${country.COUNTRY_NM} (${country.COUNTRY_ID}) updated`);
    }
  },
  indexes: [
    {
      unique: true,
      fields: ['COUNTRY_ID']
    },
    {
      fields: ['COUNTRY_NM']
    },
    {
      fields: ['created_at']
    },
    {
      fields: ['updated_at']
    }
  ],
  scopes: {
    active: {
      // All countries are considered active by default
      // You can add filters here if needed
    },
    byRegion: (region) => ({
      // If you add a region field later
      where: { region }
    }),
    withStates: {
      include: [{
        model: sequelize.models.State,
        as: 'states',
        required: false
      }]
    },
    byName: (name) => ({
      where: {
        COUNTRY_NM: {
          [Op.like]: `%${name}%`
        }
      }
    }),
    recent: {
      order: [['created_at', 'DESC']],
      limit: 50
    }
  }
});

export default Country;
