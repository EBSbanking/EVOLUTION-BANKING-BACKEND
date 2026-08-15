// models/RFIDToken.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';

const RFIDToken = sequelize.define('RFIDToken', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  // Your physical token details
  serial_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    trim: true,
    comment: 'S/N: 0927984580'
  },
  batch_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
    trim: true,
    comment: 'B/N: 0927965'
  },
  // RFID data read from the token
  card_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
    trim: true,
    comment: 'Unique identifier read from the RFID token'
  },
  facility_code: {
    type: DataTypes.STRING(10),
    allowNull: true,
    trim: true
  },
  raw_data: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Raw RFID data from the token'
  },
  // Token metadata
  manufacturer: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'HID Global'
  },
  device_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'Mini Token'
  },
  date_code: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'FEB 15 - manufacturing date'
  },
  // Token status
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  is_primary: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Primary token for 2FA'
  },
  last_used_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  used_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: { args: [0], msg: 'Used count cannot be negative' }
    }
  },
  registered_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  registered_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'rfid_tokens',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: false,
  getterMethods: {
    formatted_last_used() {
      return this.last_used_at ? new Date(this.last_used_at).toLocaleString() : 'Never';
    },
    token_display_name() {
      return `${this.manufacturer} ${this.device_type} (S/N: ${this.serial_number})`;
    }
  }
});

// Define associations
RFIDToken.associate = (models) => {
  RFIDToken.belongsTo(models.User, {
    foreignKey: 'user_id',
    as: 'user'
  });
  
  RFIDToken.belongsTo(models.User, {
    foreignKey: 'registered_by',
    as: 'registrar'
  });
};

// Static methods
RFIDToken.findBySerial = async function(serialNumber) {
  return this.findOne({
    where: { 
      serial_number: serialNumber,
      is_active: true 
    },
    include: [{
      model: sequelize.models.User,
      as: 'user',
      attributes: ['id', 'user_name', 'username', 'email', 'first_name', 'last_name', 'status']
    }]
  });
};

RFIDToken.findByCardNumber = async function(cardNumber) {
  return this.findOne({
    where: {
      [Op.or]: [
        { card_number: cardNumber },
        { raw_data: cardNumber }
      ],
      is_active: true
    },
    include: [{
      model: sequelize.models.User,
      as: 'user',
      attributes: ['id', 'user_name', 'username', 'email', 'first_name', 'last_name', 'status']
    }]
  });
};

RFIDToken.getUserTokens = async function(userId) {
  return this.findAll({
    where: { 
      user_id: userId,
      is_active: true 
    },
    order: [
      ['is_primary', 'DESC'],
      ['last_used_at', 'DESC']
    ]
  });
};

RFIDToken.prototype.incrementUsage = async function() {
  this.used_count = (this.used_count || 0) + 1;
  this.last_used_at = new Date();
  return this.save();
};

RFIDToken.prototype.deactivate = async function() {
  this.is_active = false;
  return this.save();
};

RFIDToken.prototype.reactivate = async function() {
  this.is_active = true;
  return this.save();
};

export default RFIDToken;
