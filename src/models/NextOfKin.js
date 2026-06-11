// models/NextOfKin.js - FIXED VERSION
import { DataTypes, Model } from 'sequelize';

class NextOfKin extends Model {}

// Export as a function that accepts sequelize instance
export default function(sequelize) {
  // Validate sequelize instance
  if (!sequelize || typeof sequelize.define !== 'function') {
    throw new Error('Invalid sequelize instance provided to NextOfKin model');
  }

  NextOfKin.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'id'
    },
    
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'customerId',
      references: {
        model: 'customers',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
      comment: 'Reference to customer'
    },
    
    NEXTOF_KIN_NM: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'NEXTOF_KIN_NM',
      validate: {
        notEmpty: true
      },
      comment: 'Next of kin name'
    },
    
    RELATIONSHIP: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'RELATIONSHIP',
      validate: {
        notEmpty: true,
        isIn: [['Spouse', 'Parent', 'Sibling', 'Child', 'Friend', 'Other']]
      },
      comment: 'Relationship to customer'
    },
    
    PHONE_NO: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'PHONE_NO',
      validate: {
        notEmpty: true,
        len: [10, 20]
      },
      comment: 'Phone number'
    },
    
    EMAIL: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'EMAIL',
      validate: {
        isEmail: true
      },
      comment: 'Email address'
    },
    
    ADDRESS: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: 'ADDRESS',
      validate: {
        notEmpty: true,
        len: [5, 500]
      },
      comment: 'Address'
    },
    
    IS_PRIMARY: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'IS_PRIMARY',
      comment: 'Is primary next of kin'
    },
    
    CREATED_DT: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'CREATED_DT',
      comment: 'Created date'
    },
    
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'createdAt'
    },
    
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updatedAt'
    }
  }, {
    sequelize,  // This now uses the passed parameter
    modelName: 'NextOfKin',
    tableName: 'next_of_kins',
    timestamps: true,
    underscored: false,
    
    hooks: {
      beforeCreate: (kin) => {
        // Ensure email is lowercase
        if (kin.EMAIL) {
          kin.EMAIL = kin.EMAIL.toLowerCase().trim();
        }
        
        // Ensure boolean for IS_PRIMARY
        if (typeof kin.IS_PRIMARY === 'string') {
          kin.IS_PRIMARY = kin.IS_PRIMARY === 'Y' || kin.IS_PRIMARY === 'true' || kin.IS_PRIMARY === '1';
        }
        
        // Set created date if not provided
        if (!kin.CREATED_DT) {
          kin.CREATED_DT = new Date();
        }
      },
      
      beforeUpdate: async (kin) => {
        // If setting as primary, ensure only one primary per customer
        if (kin.changed('IS_PRIMARY') && kin.IS_PRIMARY === true) {
          await NextOfKin.update(
            { IS_PRIMARY: false },
            { 
              where: { 
                customerId: kin.customerId,
                id: { [DataTypes.Op.ne]: kin.id }
              }
            }
          );
        }
      }
    },
    
  });

  // ========== STATIC METHODS ==========
  NextOfKin.findByCustomerId = async function(customerId) {
    return await this.findAll({
      where: { customerId },
      order: [['IS_PRIMARY', 'DESC'], ['CREATED_DT', 'ASC']]
    });
  };

  NextOfKin.findPrimaryByCustomerId = async function(customerId) {
    return await this.findOne({
      where: { customerId, IS_PRIMARY: true }
    });
  };

  NextOfKin.createForCustomer = async function(customerId, kinData) {
    // If setting as primary, update existing primary
    if (kinData.IS_PRIMARY === true || kinData.IS_PRIMARY === 'Y') {
      await this.update(
        { IS_PRIMARY: false },
        { where: { customerId, IS_PRIMARY: true } }
      );
    }
    
    return await this.create({
      ...kinData,
      customerId,
      CREATED_DT: new Date()
    });
  };

  // ========== INSTANCE METHODS ==========
  NextOfKin.prototype.getContactInfo = function() {
    return {
      name: this.NEXTOF_KIN_NM,
      relationship: this.RELATIONSHIP,
      phone: this.PHONE_NO,
      email: this.EMAIL,
      address: this.ADDRESS,
      isPrimary: this.IS_PRIMARY
    };
  };

  NextOfKin.prototype.setAsPrimary = async function() {
    // Update other next of kin to not primary
    await NextOfKin.update(
      { IS_PRIMARY: false },
      { 
        where: { 
          customerId: this.customerId,
          id: { [DataTypes.Op.ne]: this.id }
        }
      }
    );
    
    // Set this one as primary
    this.IS_PRIMARY = true;
    return await this.save();
  };

  return NextOfKin;
};