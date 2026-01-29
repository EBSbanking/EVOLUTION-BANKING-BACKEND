import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';

// Define enums
export const LICENSE_TYPES = {
  STANDARD: 'Standard',
  PRO: 'Pro',
  ENTERPRISE: 'Enterprise'
};

class License extends Model {
  // Static method to find active licenses
  static async findActiveLicenses() {
    return await this.findAll({
      where: {
        expires: {
          [DataTypes.Op.gt]: new Date()
        },
        is_used: false
      },
      order: [['expires', 'ASC']]
    });
  }

  // Static method to find expired licenses
  static async findExpiredLicenses() {
    return await this.findAll({
      where: {
        expires: {
          [DataTypes.Op.lte]: new Date()
        }
      },
      order: [['expires', 'DESC']]
    });
  }

  // Static method to find by issued_to (company/user)
  static async findByIssuedTo(issuedTo, options = {}) {
    const defaultOptions = {
      where: { issued_to: issuedTo },
      order: [['created_at', 'DESC']]
    };
    
    return await this.findAll({ ...defaultOptions, ...options });
  }

  // Static method to find by license type
  static async findByLicenseType(licenseType, options = {}) {
    const defaultOptions = {
      where: { license_type: licenseType },
      order: [['created_at', 'DESC']]
    };
    
    return await this.findAll({ ...defaultOptions, ...options });
  }

  // Static method to find unused licenses
  static async findUnusedLicenses() {
    return await this.findAll({
      where: {
        is_used: false,
        expires: {
          [DataTypes.Op.gt]: new Date()
        }
      },
      order: [['created_at', 'ASC']]
    });
  }

  // Static method to find used licenses
  static async findUsedLicenses() {
    return await this.findAll({
      where: { is_used: true },
      order: [['used_at', 'DESC']]
    });
  }

  // Static method to validate license key
  static async validateLicenseKey(encryptedKey, checkExpiry = true) {
    const whereClause = {
      encrypted_key: encryptedKey,
      is_used: false
    };
    
    if (checkExpiry) {
      whereClause.expires = {
        [DataTypes.Op.gt]: new Date()
      };
    }
    
    const license = await this.findOne({
      where: whereClause
    });
    
    if (!license) {
      return {
        valid: false,
        message: 'License key is invalid, expired, or already used'
      };
    }
    
    return {
      valid: true,
      license: license,
      message: 'License key is valid'
    };
  }

  // Static method to get license statistics
  static async getLicenseStatistics() {
    const result = await this.findAll({
      attributes: [
        'license_type',
        'is_used',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.literal('CASE WHEN expires > NOW() THEN 1 ELSE 0 END')), 'active_count']
      ],
      group: ['license_type', 'is_used'],
      raw: true
    });
    
    return result.reduce((stats, row) => {
      const type = row.license_type;
      const isUsed = row.is_used;
      
      if (!stats[type]) {
        stats[type] = {
          total: 0,
          used: 0,
          unused: 0,
          active: 0
        };
      }
      
      stats[type].total += parseInt(row.count);
      stats[type].active += parseInt(row.active_count) || 0;
      
      if (isUsed) {
        stats[type].used += parseInt(row.count);
      } else {
        stats[type].unused += parseInt(row.count);
      }
      
      return stats;
    }, {});
  }

  // Instance method to mark license as used
  async markAsUsed() {
    if (this.is_used) {
      throw new Error('License is already marked as used');
    }
    
    if (this.expires <= new Date()) {
      throw new Error('Cannot mark expired license as used');
    }
    
    this.is_used = true;
    this.used_at = new Date();
    
    return await this.save();
  }

  // Instance method to renew license
  async renew(newExpiryDate, newLicenseType = null) {
    if (!this.is_used) {
      throw new Error('Cannot renew unused license');
    }
    
    // Create a new license based on the old one
    const newLicense = await License.create({
      issued_to: this.issued_to,
      license_type: newLicenseType || this.license_type,
      expires: newExpiryDate,
      encrypted_key: await this.generateNewEncryptedKey() // You'll need to implement this
    });
    
    // Optionally mark old license as archived or keep as is
    this.updatedAt = new Date();
    await this.save();
    
    logger.info(`License renewed`, {
      oldLicenseId: this.id,
      newLicenseId: newLicense.id,
      issuedTo: this.issued_to,
      newExpiry: newExpiryDate
    });
    
    return newLicense;
  }

  // Instance method to check if license is active
  get isActive() {
    return !this.is_used && this.expires > new Date();
  }

  // Instance method to check days remaining
  get daysRemaining() {
    if (this.is_used || this.expires <= new Date()) {
      return 0;
    }
    
    const now = new Date();
    const diffTime = Math.abs(this.expires - now);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Instance method to check if license is expired
  get isExpired() {
    return this.expires <= new Date();
  }

  // Instance method to get license status
  get status() {
    if (this.is_used) {
      return 'USED';
    } else if (this.expires <= new Date()) {
      return 'EXPIRED';
    } else {
      return 'ACTIVE';
    }
  }

  // Static method to generate encrypted key (placeholder - implement your own encryption)
  static async generateEncryptedKey() {
    // Implement your encryption logic here
    // Example: return crypto.randomBytes(32).toString('hex');
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `LIC_${timestamp}_${random}`;
  }

  // Instance method to generate new encrypted key
  async generateNewEncryptedKey() {
    // Implement your encryption logic here
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `LIC_${this.issued_to.replace(/\s+/g, '_')}_${timestamp}_${random}`;
  }
}

License.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: 'Auto-increment primary key'
  },
  expires: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'License expiration date'
  },
  issued_to: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Company or user name the license is issued to',
    validate: {
      notEmpty: {
        msg: 'Issued to cannot be empty'
      },
      len: {
        args: [1, 255],
        msg: 'Issued to must be between 1 and 255 characters'
      }
    },
    set(value) {
      this.setDataValue('issued_to', value ? value.trim() : value);
    }
  },
  license_type: {
    type: DataTypes.ENUM(
      LICENSE_TYPES.STANDARD,
      LICENSE_TYPES.PRO,
      LICENSE_TYPES.ENTERPRISE
    ),
    allowNull: false,
    defaultValue: LICENSE_TYPES.STANDARD,
    comment: 'Type of license'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Creation timestamp'
  },
  encrypted_key: {
    type: DataTypes.STRING(500),
    allowNull: false,
    unique: true,
    comment: 'Encrypted license key',
    validate: {
      notEmpty: {
        msg: 'Encrypted key cannot be empty'
      }
    }
  },
  is_used: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether the license has been used'
  },
  used_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when license was used'
  }
}, {
  sequelize,
  modelName: 'License',
  tableName: 'licenses',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  comment: 'Software license management',
  indexes: [
    {
      name: 'idx_encrypted_key',
      fields: ['encrypted_key'],
      unique: true
    },
    {
      name: 'idx_issued_to',
      fields: ['issued_to']
    },
    {
      name: 'idx_license_type',
      fields: ['license_type']
    },
    {
      name: 'idx_expires',
      fields: ['expires']
    },
    {
      name: 'idx_is_used',
      fields: ['is_used']
    },
    {
      name: 'idx_created_at',
      fields: ['created_at']
    },
    {
      name: 'idx_used_at',
      fields: ['used_at']
    },
    {
      name: 'idx_issued_expires',
      fields: ['issued_to', 'expires']
    },
    {
      name: 'idx_type_expires',
      fields: ['license_type', 'expires']
    },
    {
      name: 'idx_status',
      fields: ['is_used', 'expires']
    },
    {
      name: 'idx_active_licenses',
      fields: ['is_used', 'expires', 'license_type']
    }
  ],
  hooks: {
    beforeValidate: (license, options) => {
      // Trim string fields
      if (license.issued_to) {
        license.issued_to = license.issued_to.trim();
      }
      if (license.encrypted_key) {
        license.encrypted_key = license.encrypted_key.trim();
      }
    },
    
    beforeCreate: async (license, options) => {
      // Generate encrypted key if not provided
      if (!license.encrypted_key) {
        license.encrypted_key = await License.generateEncryptedKey();
      }
      
      // Validate expiration date is in the future
      if (license.expires <= new Date()) {
        throw new Error('License expiration date must be in the future');
      }
      
      // Set used_at to null for new licenses
      if (!license.is_used) {
        license.used_at = null;
      }
    },
    
    beforeUpdate: (license, options) => {
      // Update used_at when marking as used
      if (license.changed('is_used') && license.is_used) {
        license.used_at = new Date();
      }
      
      // Clear used_at when marking as unused
      if (license.changed('is_used') && !license.is_used) {
        license.used_at = null;
      }
      
      // Prevent changing encrypted_key after creation
      if (license.changed('encrypted_key') && !license.isNewRecord) {
        throw new Error('Cannot change encrypted key after creation');
      }
      
      // Validate that used licenses cannot be marked as unused
      if (license.changed('is_used') && license.previous('is_used') && !license.is_used) {
        throw new Error('Cannot mark used license as unused');
      }
    },
    
    afterCreate: (license, options) => {
      logger.info(`License created`, {
        licenseId: license.id,
        issuedTo: license.issued_to,
        licenseType: license.license_type,
        expires: license.expires
      });
    },
    
    afterUpdate: (license, options) => {
      if (license.changed('is_used')) {
        logger.info(`License usage status changed`, {
          licenseId: license.id,
          oldStatus: license.previous('is_used'),
          newStatus: license.is_used,
          usedAt: license.used_at
        });
      }
    }
  }
});

export default License;