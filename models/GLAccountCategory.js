import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';
import Branch from '../models/Branch.js';

const GLAccountCategorySchema = new mongoose.Schema({
  categoryCode: {
    type: String,
    required: [true, 'categoryCode is required'],
    trim: true,
    validate: {
      validator: function (value) {
        // Allow alphanumeric codes with optional hyphens (e.g., '1', '01-205', '01-01-206')
        const isValid = /^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/.test(value);
        if (!isValid) {
          logger.error('Invalid categoryCode format', { categoryCode: value });
        }
        return isValid;
      },
      message: 'categoryCode must be alphanumeric with optional hyphens (e.g., "1", "01-205", "01-01-206")'
    }
  },
  categoryName: {
    type: String,
    required: [true, 'categoryName is required'],
    trim: true
  },
  parentCode: {
    type: String,
    default: null,
    validate: {
      validator: async function (value) {
        if (!value) return true; // Top-level categories have null parentCode
        const parent = await mongoose.model('GLAccountCategory').findOne({
          categoryCode: value,
          organizationName: this.organizationName,
          branchName: this.branchName,
          branchCode: this.branchCode,
          _id: { $ne: this._id }
        });
        if (!parent) {
          logger.error('parentCode does not exist in database', {
            parentCode: value,
            organizationName: this.organizationName,
            branchName: this.branchName,
            branchCode: this.branchCode
          });
          return false;
        }
        return true;
      },
      message: 'parentCode must reference an existing categoryCode in the same organization, branch, and branch code'
    }
  },
  level: {
    type: Number,
    required: [true, 'level is required'],
    min: [1, 'level must be at least 1'],
    validate: {
      validator: async function (value) {
        if (!this.parentCode) return value === 1; // Top-level must be level 1
        const parent = await mongoose.model('GLAccountCategory').findOne({
          categoryCode: this.parentCode,
          organizationName: this.organizationName,
          branchName: this.branchName,
          branchCode: this.branchCode
        });
        if (!parent) {
          logger.error('Parent not found for level validation', {
            parentCode: this.parentCode,
            organizationName: this.organizationName,
            branchName: this.branchName,
            branchCode: this.branchCode
          });
          return false;
        }
        const isValid = value === parent.level + 1;
        if (!isValid) {
          logger.error('Invalid level for parent', {
            level: value,
            parentLevel: parent.level,
            parentCode: this.parentCode,
            organizationName: this.organizationName,
            branchName: this.branchName,
            branchCode: this.branchCode
          });
        }
        return isValid;
      },
      message: 'level must be parent.level + 1 or 1 for top-level categories'
    }
  },
  organizationName: {
    type: String,
    required: [true, 'organizationName is required'],
    trim: true
  },
  branchName: {
    type: String,
    required: [true, 'branchName is required'],
    trim: true,
    validate: {
      validator: async function (value) {
        const branch = await Branch.findOne({
          organizationName: this.organizationName,
          branchName: value,
          branchCode: this.branchCode
        });
        if (!branch) {
          logger.error('Branch does not exist', {
            organizationName: this.organizationName,
            branchName: value,
            branchCode: this.branchCode
          });
          return false;
        }
        return true;
      },
      message: 'branchName and branchCode must reference an existing branch in the same organization'
    }
  },
  branchCode: {
    type: String,
    required: [true, 'branchCode is required'],
    trim: true,
    validate: {
      validator: async function (value) {
        const branch = await Branch.findOne({
          organizationName: this.organizationName,
          branchName: this.branchName,
          branchCode: value
        });
        if (!branch) {
          logger.error('Branch does not exist', {
            organizationName: this.organizationName,
            branchName: this.branchName,
            branchCode: value
          });
          return false;
        }
        return true;
      },
      message: 'branchCode and branchName must reference an existing branch in the same organization'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: 'gl_account_categories',
  timestamps: true,
  versionKey: false
});

// Add compound index for efficient queries
GLAccountCategorySchema.index({ categoryCode: 1, organizationName: 1, branchName: 1, branchCode: 1 });

// Method to get the full path of a category
GLAccountCategorySchema.methods.getFullPath = async function () {
  let path = [`${this.categoryCode} - ${this.categoryName}`];
  let current = this;
  while (current.parentCode) {
    const parent = await mongoose.model('GLAccountCategory').findOne({
      categoryCode: current.parentCode,
      organizationName: current.organizationName,
      branchName: current.branchName,
      branchCode: current.branchCode
    });
    if (parent) {
      path.unshift(`${parent.categoryCode} - ${parent.categoryName}`);
      current = parent;
    } else {
      break; // Prevent infinite loop if parentCode is invalid
    }
  }
  return path.join(' / ');
};

export default mongoose.model('GLAccountCategory', GLAccountCategorySchema);