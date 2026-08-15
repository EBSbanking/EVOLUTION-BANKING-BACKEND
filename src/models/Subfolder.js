import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class Subfolder extends Model {
  // Static method to find by parent ID
  static async findByParentId(parentId) {
    return await this.findAll({
      where: { parentId },
      order: [['name', 'ASC']]
    });
  }

  // Static method to find root folders
  static async findRootFolders() {
    return await this.findAll({
      where: { 
        isRoot: true,
        parentId: null
      },
      order: [['name', 'ASC']]
    });
  }

  // Static method to find by creator
  static async findByCreator(createdBy) {
    return await this.findAll({
      where: { createdBy: createdBy.toUpperCase() },
      order: [['createdAt', 'DESC']]
    });
  }

  // Static method to find by ledger number
  static async findByLedger(ledgerNo) {
    return await this.findAll({
      where: { ledgerNo },
      order: [['name', 'ASC']]
    });
  }

  // Instance method to get folder path
  async getFolderPath() {
    const path = [this.name];
    let currentFolder = this;
    
    while (currentFolder.parentId) {
      const parent = await Subfolder.findByPk(currentFolder.parentId);
      if (parent) {
        path.unshift(parent.name);
        currentFolder = parent;
      } else {
        break;
      }
    }
    
    return path.join('/');
  }

  // Instance method to get all children recursively
  async getAllChildren() {
    const children = [];
    const directChildren = await Subfolder.findAll({
      where: { parentId: this.subfolderId }
    });
    
    for (const child of directChildren) {
      children.push(child);
      const grandChildren = await child.getAllChildren();
      children.push(...grandChildren);
    }
    
    return children;
  }

  // Instance method to check if folder is empty
  async isEmpty() {
    const childrenCount = await Subfolder.count({
      where: { parentId: this.subfolderId }
    });
    return childrenCount === 0;
  }
}

Subfolder.init({
  subfolderId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
    unique: true,
    comment: 'Unique identifier for subfolder'
  },
  parentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
    comment: 'Parent folder ID, null for root folders'
  },
  createdBy: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'User who created the folder',
    validate: {
      notEmpty: {
        msg: 'Created by cannot be empty'
      }
    },
    set(value) {
      // Always store in uppercase
      this.setDataValue('createdBy', value ? value.toUpperCase() : value);
    }
  },
  ledgerNo: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Ledger number associated with the folder',
    validate: {
      notEmpty: {
        msg: 'Ledger number cannot be empty'
      }
    },
    set(value) {
      // Trim whitespace
      this.setDataValue('ledgerNo', value ? value.trim() : value);
    }
  },
  isRoot: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether this is a root folder'
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Folder name',
    validate: {
      notEmpty: {
        msg: 'Folder name cannot be empty'
      },
      len: {
        args: [1, 255],
        msg: 'Folder name must be between 1 and 255 characters'
      }
    },
    set(value) {
      // Trim whitespace
      this.setDataValue('name', value ? value.trim() : value);
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '',
    comment: 'Folder description',
    set(value) {
      // Trim whitespace
      this.setDataValue('description', value ? value.trim() : value);
    }
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: 'Folder creation timestamp'
  }
}, {
  sequelize,
  modelName: 'Subfolder',
  tableName: 'subfolders',
  timestamps: true, // This will add createdAt and updatedAt
  updatedAt: 'updatedAt',
  createdAt: 'createdAt',
  comment: 'Subfolders table for organizing documents',
  
  hooks: {
    beforeValidate: (subfolder, options) => {
      // Ensure createdBy is uppercase
      if (subfolder.createdBy) {
        subfolder.createdBy = subfolder.createdBy.toUpperCase();
      }
      
      // Trim string fields
      if (subfolder.ledgerNo) subfolder.ledgerNo = subfolder.ledgerNo.trim();
      if (subfolder.name) subfolder.name = subfolder.name.trim();
      if (subfolder.description) subfolder.description = subfolder.description.trim();
      
      // Validate root folder constraints
      if (subfolder.isRoot && subfolder.parentId !== null) {
        throw new Error('Root folders cannot have a parent ID');
      }
      
      if (!subfolder.isRoot && subfolder.parentId === null) {
        throw new Error('Non-root folders must have a parent ID');
      }
    },
    
    beforeCreate: (subfolder, options) => {
      // Set createdAt if not provided
      if (!subfolder.createdAt) {
        subfolder.createdAt = new Date();
      }
      
      // Auto-set isRoot based on parentId
      if (subfolder.parentId === null && subfolder.isRoot !== true) {
        subfolder.isRoot = true;
      }
      
      if (subfolder.parentId !== null && subfolder.isRoot === true) {
        subfolder.isRoot = false;
      }
    },
    
    beforeUpdate: (subfolder, options) => {
      // Prevent changing parentId for root folders
      if (subfolder.changed('parentId') && subfolder.isRoot && subfolder.parentId !== null) {
        throw new Error('Cannot assign parent to a root folder');
      }
      
      // Update isRoot if parentId changes
      if (subfolder.changed('parentId')) {
        subfolder.isRoot = (subfolder.parentId === null);
      }
    },
    
    afterCreate: async (subfolder, options) => {
      console.log(`Subfolder "${subfolder.name}" (ID: ${subfolder.subfolderId}) created by ${subfolder.createdBy}`);
    },
    
    afterUpdate: (subfolder, options) => {
      console.log(`Subfolder "${subfolder.name}" (ID: ${subfolder.subfolderId}) updated`);
    }
  }
});

export default Subfolder;
