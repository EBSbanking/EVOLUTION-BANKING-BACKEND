// src/models/LocalGovernment.js
import { DataTypes, Op } from 'sequelize';
import sequelize from '../../config/db.js';

const LocalGovernment = sequelize.define('LocalGovernment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  LOCAL_GOV_ID: {
    type: DataTypes.STRING(255),
    unique: true,
    allowNull: true,
    // Remove any validation that restricts characters
    set(value) {
      if (value) {
        // Keep original value without sanitization
        this.setDataValue('LOCAL_GOV_ID', value.trim());
      }
    }
  },
  LOCAL_GOV_NM: {
    type: DataTypes.STRING(255),
    allowNull: false,
    set(value) {
      if (value) {
        this.setDataValue('LOCAL_GOV_NM', value.trim());
      }
    },
    validate: {
      notNull: { msg: 'Local government name is required' },
      notEmpty: { msg: 'Local government name cannot be empty' },
      len: {
        args: [1, 255],
        msg: 'Local government name must be between 1 and 255 characters'
      }
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
      model: 'states',
      key: 'id'  // References the auto-increment id from states table
    },
    validate: {
      notNull: { msg: 'State ID is required' },
      isInt: { msg: 'State ID must be an integer' }
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
    },
    {
      fields: ['createdAt']
    },
    {
      fields: ['updatedAt']
    }
  ],
  hooks: {
    beforeValidate: (localGov) => {
      if (localGov.LOCAL_GOV_ID) {
        localGov.LOCAL_GOV_ID = localGov.LOCAL_GOV_ID.trim();
      }
      if (localGov.LOCAL_GOV_NM) {
        localGov.LOCAL_GOV_NM = localGov.LOCAL_GOV_NM.trim();
      }
    },
    beforeCreate: (localGov) => {
      if (!localGov.LOCAL_GOV_ID && localGov.LOCAL_GOV_NM) {
        const stateId = localGov.STATE_ID || 'ST';
        const govCode = localGov.LOCAL_GOV_NM.toUpperCase().replace(/\s+/g, '_');
        localGov.LOCAL_GOV_ID = `${stateId}_${govCode}`;
      }
    },
    afterCreate: (localGov) => {
      console.log(`Local Government "${localGov.LOCAL_GOV_NM}" created (ID: ${localGov.id})`);
    },
    afterUpdate: (localGov) => {
      console.log(`Local Government "${localGov.LOCAL_GOV_NM}" updated (ID: ${localGov.id})`);
    }
  }
});

// Define associations
LocalGovernment.associate = (models) => {
  LocalGovernment.belongsTo(models.State, {
    foreignKey: 'STATE_ID',
    targetKey: 'id',  // References State.id (auto-increment)
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
    include: [{
      model: this.sequelize.models.State,
      as: 'state'
    }]
  });
};

LocalGovernment.findByStateCode = async function(stateCode) {
  return this.findAll({
    include: [{
      model: this.sequelize.models.State,
      as: 'state',
      where: { STATE_ID: stateCode }
    }],
    order: [['LOCAL_GOV_NM', 'ASC']]
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
    include: [{
      model: this.sequelize.models.State,
      as: 'state'
    }]
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
    include: [{
      model: this.sequelize.models.State,
      as: 'state'
    }]
  });
};

LocalGovernment.findByLocalGovId = async function(localGovId) {
  return this.findOne({
    where: { LOCAL_GOV_ID: localGovId },
    include: [{
      model: this.sequelize.models.State,
      as: 'state'
    }]
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
    include: [{
      model: this.sequelize.models.State,
      as: 'state'
    }],
    limit: 50
  });
};

LocalGovernment.getStatsByState = async function() {
  const [results] = await this.sequelize.query(`
    SELECT 
      s.STATE_NM,
      s.STATE_ID,
      COUNT(lg.id) as total_lgs,
      SUM(CASE WHEN lg.URBAN = 1 THEN 1 ELSE 0 END) as urban_count,
      SUM(CASE WHEN lg.RURAL = 1 THEN 1 ELSE 0 END) as rural_count
    FROM local_governments lg
    JOIN states s ON lg.STATE_ID = s.id
    GROUP BY lg.STATE_ID
    ORDER BY s.STATE_NM ASC
  `);
  return results;
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
    isUrban: this.isUrban(),
    isRural: this.isRural(),
    stateId: this.STATE_ID,
    stateName: this.state ? this.state.STATE_NM : null,
    stateCode: this.state ? this.state.STATE_ID : null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

LocalGovernment.prototype.toJSON = function() {
  const data = { ...this.get() };
  if (data.state) {
    data.stateName = data.state.STATE_NM;
    data.stateCode = data.state.STATE_ID;
  }
  return data;
};

export default LocalGovernment;