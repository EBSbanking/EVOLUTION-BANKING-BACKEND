// models/Country.js
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
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
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
  }
}, {
  sequelize,
  modelName: 'Country',
  tableName: 'countries',
  timestamps: true,
  underscored: true,          // converts code → code, name → name, id → id
  hooks: {
    beforeCreate: (country) => {
      if (country.code) country.code = country.code.toUpperCase().trim();
      if (country.name) country.name = country.name.trim();
    },
    beforeUpdate: (country) => {
      if (country.changed('code')) country.code = country.code.toUpperCase().trim();
      if (country.changed('name')) country.name = country.name.trim();
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
      order: [['createdAt', 'DESC']],
      limit: 50
    }
  }
});

export default Country;