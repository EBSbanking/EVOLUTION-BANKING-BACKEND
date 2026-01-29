import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const LocalGovernment = sequelize.define('LocalGovernment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  LOCAL_GOV_ID: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true,
    trim: true
  },
  LOCAL_GOV_NM: {
    type: DataTypes.STRING,
    allowNull: false,
    trim: true,
    validate: {
      notNull: { msg: 'Local government name is required' },
      notEmpty: { msg: 'Local government name cannot be empty' }
    }
  },
  URBAN: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  RURAL: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  STATE_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'States',
      key: 'id'
    },
    validate: {
      notNull: { msg: 'State ID is required' }
    }
  }
}, {
  tableName: 'local_governments',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    {
      unique: true,
      fields: ['LOCAL_GOV_ID']
    },
    {
      fields: ['LOCAL_GOV_NM']
    },
    {
      fields: ['STATE_ID']
    },
    {
      fields: ['URBAN']
    },
    {
      fields: ['RURAL']
    },
    {
      fields: ['STATE_ID', 'URBAN']
    },
    {
      fields: ['STATE_ID', 'RURAL']
    }
  ]
});

// Define associations
LocalGovernment.associate = (models) => {
  LocalGovernment.belongsTo(models.State, {
    foreignKey: 'STATE_ID',
    as: 'state'
  });
  
  LocalGovernment.hasMany(models.Ward, {
    foreignKey: 'LOCAL_GOV_ID',
    sourceKey: 'id',
    as: 'wards'
  });
  
  LocalGovernment.hasMany(models.Customer, {
    foreignKey: 'LOCAL_GOV_ID',
    sourceKey: 'id',
    as: 'customers'
  });
  
  LocalGovernment.hasMany(models.Branch, {
    foreignKey: 'LOCAL_GOV_ID',
    sourceKey: 'id',
    as: 'branches'
  });
};

// Static methods
LocalGovernment.findByStateId = async function(stateId) {
  return this.findAll({
    where: { STATE_ID: stateId },
    order: [['LOCAL_GOV_NM', 'ASC']],
    include: ['state']
  });
};

LocalGovernment.findUrbanAreas = async function(stateId = null) {
  const where = { URBAN: true };
  if (stateId) {
    where.STATE_ID = stateId;
  }
  
  return this.findAll({
    where,
    order: [['LOCAL_GOV_NM', 'ASC']],
    include: ['state']
  });
};

LocalGovernment.findRuralAreas = async function(stateId = null) {
  const where = { RURAL: true };
  if (stateId) {
    where.STATE_ID = stateId;
  }
  
  return this.findAll({
    where,
    order: [['LOCAL_GOV_NM', 'ASC']],
    include: ['state']
  });
};

LocalGovernment.findByLocalGovId = async function(localGovId) {
  return this.findOne({
    where: { LOCAL_GOV_ID: localGovId },
    include: ['state']
  });
};

LocalGovernment.searchByName = async function(searchTerm, stateId = null) {
  const where = {
    LOCAL_GOV_NM: { [Op.like]: `%${searchTerm}%` }
  };
  
  if (stateId) {
    where.STATE_ID = stateId;
  }
  
  return this.findAll({
    where,
    order: [['LOCAL_GOV_NM', 'ASC']],
    include: ['state'],
    limit: 50
  });
};

// Instance methods
LocalGovernment.prototype.isUrban = function() {
  return this.URBAN === true;
};

LocalGovernment.prototype.isRural = function() {
  return this.RURAL === true;
};

LocalGovernment.prototype.getLocationType = function() {
  if (this.URBAN && this.RURAL) {
    return 'MIXED';
  } else if (this.URBAN) {
    return 'URBAN';
  } else if (this.RURAL) {
    return 'RURAL';
  } else {
    return 'UNKNOWN';
  }
};

LocalGovernment.prototype.getSummary = function() {
  return {
    id: this.id,
    localGovId: this.LOCAL_GOV_ID,
    name: this.LOCAL_GOV_NM,
    locationType: this.getLocationType(),
    stateId: this.STATE_ID,
    stateName: this.state ? this.state.STATE_NM : null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

export default LocalGovernment;