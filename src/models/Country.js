// models/Country.js - FIXED VERSION
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class Country extends Model {
  static async findById(countryId) {
    return this.findOne({
      where: { id: countryId },
      include: [{ model: sequelize.models.State, as: 'states' }]
    });
  }

  static async getAllWithStates() {
    return this.findAll({
      include: [{ model: sequelize.models.State, as: 'states' }],
      order: [['name', 'ASC']]
    });
  }

  static async searchByName(name) {
    return this.findAll({
      where: { name: { [Op.like]: `%${name}%` } },
      order: [['name', 'ASC']]
    });
  }

  static async getByCode(code) {
    return this.findOne({
      where: { code: code.toUpperCase().trim() }
    });
  }

  static async getActiveCountries() {
    return this.findAll({
      where: { is_active: true },
      order: [['name', 'ASC']]
    });
  }

  static async getSupportedCountries() {
    return this.findAll({
      where: { is_supported: true, is_active: true },
      order: [['name', 'ASC']]
    });
  }

  async addState(stateId) {
    const State = sequelize.models.State;
    const state = await State.findByPk(stateId);
    if (!state) throw new Error(`State with ID ${stateId} not found`);
    state.countryId = this.id;
    await state.save();
    await this.reload({ include: [{ model: State, as: 'states' }] });
    return this;
  }

  async removeState(stateId) {
    const State = sequelize.models.State;
    const state = await State.findByPk(stateId);
    if (!state) throw new Error(`State with ID ${stateId} not found`);
    if (state.countryId !== this.id) throw new Error(`State does not belong to this country`);
    state.countryId = null;
    await state.save();
    await this.reload({ include: [{ model: State, as: 'states' }] });
    return this;
  }

  async getStatesCount() {
    const states = await this.getStates();
    return states.length;
  }

  getCountryInfo() {
    return {
      id: this.id,
      code: this.code,
      name: this.name,
      iso_code: this.iso_code,
      iso_numeric: this.iso_numeric,
      dialing_code: this.dialing_code,
      currency_code: this.currency_code,
      currency_name: this.currency_name,
      region: this.region,
      sub_region: this.sub_region,
      capital: this.capital,
      population: this.population,
      area: this.area,
      timezone: this.timezone,
      languages: this.languages,
      flag_emoji: this.flag_emoji,
      is_active: this.is_active,
      is_supported: this.is_supported,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  isActive() {
    return this.is_active === true;
  }

  isSupported() {
    return this.is_supported === true;
  }
}

Country.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  code: {
    type: DataTypes.STRING(10),
    allowNull: false,
    unique: true,
    comment: 'Country code (e.g., US, NG, GB)'
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Country name'
  },
  iso_code: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'ISO 3166-1 alpha-3 country code (e.g., NGA)'
  },
  iso_numeric: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'ISO 3166-1 numeric code (e.g., 566)'
  },
  dialing_code: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'International dialing code (e.g., +234)'
  },
  currency_code: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Currency code (e.g., NGN, USD)'
  },
  currency_name: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Currency name (e.g., Naira)'
  },
  region: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Region (e.g., Africa, Europe)'
  },
  sub_region: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Sub-region (e.g., Western Africa)'
  },
  capital: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Capital city'
  },
  population: {
    type: DataTypes.BIGINT,
    allowNull: true,
    defaultValue: 0,
    comment: 'Population'
  },
  area: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    defaultValue: 0.00,
    comment: 'Area in square kilometers'
  },
  timezone: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Timezone (e.g., Africa/Lagos)'
  },
  languages: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Official languages'
  },
  flag_emoji: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Flag emoji (e.g., 🇳🇬)'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Country active status'
  },
  is_supported: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Supported country for banking operations'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    onUpdate: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'Country',
  tableName: 'countries',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: false,
  hooks: {
    beforeCreate: (country) => {
      // ✅ FIX: Only process if the value exists and is a string
      if (country.code && typeof country.code === 'string') {
        country.code = country.code.toUpperCase().trim();
      }
      if (country.name && typeof country.name === 'string') {
        country.name = country.name.trim();
      }
      if (country.iso_code && typeof country.iso_code === 'string') {
        country.iso_code = country.iso_code.toUpperCase().trim();
      }
      if (country.currency_code && typeof country.currency_code === 'string') {
        country.currency_code = country.currency_code.toUpperCase().trim();
      }
      // ✅ Skip flag_emoji processing entirely - it can contain emojis
      // ✅ Skip region, sub_region, capital, timezone, languages - they can contain special chars
    },
    beforeUpdate: (country) => {
      // ✅ FIX: Only process if the value exists and is a string
      if (country.changed('code') && country.code && typeof country.code === 'string') {
        country.code = country.code.toUpperCase().trim();
      }
      if (country.changed('name') && country.name && typeof country.name === 'string') {
        country.name = country.name.trim();
      }
      if (country.changed('iso_code') && country.iso_code && typeof country.iso_code === 'string') {
        country.iso_code = country.iso_code.toUpperCase().trim();
      }
      if (country.changed('currency_code') && country.currency_code && typeof country.currency_code === 'string') {
        country.currency_code = country.currency_code.toUpperCase().trim();
      }
      // ✅ Skip flag_emoji processing entirely
    }
  },
  scopes: {
    withStates: {
      include: [{ model: sequelize.models.State, as: 'states', required: false }]
    },
    byName: (name) => ({
      where: { name: { [Op.like]: `%${name}%` } }
    }),
    recent: {
      order: [['created_at', 'DESC']],
      limit: 50
    },
    active: {
      where: { is_active: true }
    },
    supported: {
      where: { is_supported: true, is_active: true }
    }
  }
});

export default Country;