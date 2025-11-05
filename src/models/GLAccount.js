import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

const GLAccountSchema = new mongoose.Schema({
  GL_ACCT_NO: {
    type: String,
    required: [true, 'GL_ACCT_NO is required'],
    unique: true,
    validate: {
      validator: async function (value) {
        // Support 6-segment (01-002-111-105-102-100) and 5-segment (01-100-105-000-102) formats
        const regexPadded = /^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}-\d{3}$/;
        const regexShort = /^\d{1,2}-\d{1,3}-\d{1,3}-\d{1,3}-\d{1,3}-\d{1,3}$/;
        const regexFiveSegments = /^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/;

        const isValidFormat = regexPadded.test(value) || regexShort.test(value) || regexFiveSegments.test(value);
        if (!isValidFormat) {
          logger.error('GL_ACCT_NO format validation failed', { value });
          return false;
        }

        const segments = value.split('-');
        const numSegments = segments.length;
        if (numSegments !== 5 && numSegments !== 6) {
          logger.error('GL_ACCT_NO does not have 5 or 6 segments', { value, segments });
          return false;
        }

        // Extract categoryCode from GL_ACCT_NO (segment 3 for 6 segments, segment 2 for 5 segments)
        const categoryCode = (numSegments === 6 ? segments[3] : segments[2]).replace(/^0+/, '') || '0';
        if (this.categoryCode !== categoryCode) {
          logger.error('GL_ACCT_NO categoryCode does not match embedded categoryCode', {
            GL_ACCT_NO: value,
            categoryCode,
            embeddedCategoryCode: this.categoryCode
          });
          return false;
        }

        // Validate categoryCode exists in GLAccountCategory collection
        const category = await mongoose.model('GLAccountCategory').findOne({
          categoryCode: this.categoryCode,
          organizationName: this.organizationName,
          branchName: this.branchName
        });
        if (!category) {
          logger.error('categoryCode does not exist in GLAccountCategory collection', {
            categoryCode: this.categoryCode,
            organizationName: this.organizationName,
            branchName: this.branchName
          });
          return false;
        }

        // Validate branch code against Branches collection
        const branchCode = numSegments === 6 ? segments[1] : segments[0];
        const branch = await mongoose.model('Branch').findOne({
          organizationName: this.organizationName,
          branchCode: branchCode
        });
        if (!branch || branch.branchName !== this.branchName) {
          logger.error('Branch code in GL_ACCT_NO does not match branchName or is invalid', {
            GL_ACCT_NO: value,
            branchCode,
            branchName: this.branchName,
            organizationName: this.organizationName
          });
          return false;
        }

        return true;
      },
      message: 'GL_ACCT_NO must match format: 01-002-111-105-102-100 (6 segments) OR 01-100-105-000-102 (5 segments), with segment matching categoryCode and branch code, and categoryCode must exist in GLAccountCategory'
    }
  },
  GL_ACCT_ID: {
    type: String,
    required: [true, 'GL_ACCT_ID is required'],
    unique: true
  },
  CREATED_BY: {
    type: String,
    required: [true, 'CREATED_BY is required']
  },
  categoryCode: {
    type: String,
    required: [true, 'categoryCode is required'],
    trim: true,
    validate: {
      validator: async function (value) {
        // Validate format: alphanumeric with optional hyphens
        const isValidFormat = /^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/.test(value);
        if (!isValidFormat) {
          logger.error('Invalid categoryCode format', { categoryCode: value });
          return false;
        }
        // Validate existence in GLAccountCategory collection
        const category = await mongoose.model('GLAccountCategory').findOne({
          categoryCode: value,
          organizationName: this.organizationName,
          branchName: this.branchName
        });
        if (!category) {
          logger.error('categoryCode does not exist in GLAccountCategory collection', {
            categoryCode: value,
            organizationName: this.organizationName,
            branchName: this.branchName
          });
          return false;
        }
        return true;
      },
      message: 'categoryCode must be alphanumeric with optional hyphens and exist in GLAccountCategory collection for the same organization and branch'
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
        if (!value) return true; // Top-level accounts have null parentCode
        const parent = await mongoose.model('GLAccountCategory').findOne({
          categoryCode: value,
          organizationName: this.organizationName,
          branchName: this.branchName
        });
        if (!parent) {
          logger.error('parentCode does not exist in GLAccountCategory collection', {
            parentCode: value,
            organizationName: this.organizationName,
            branchName: this.branchName
          });
          return false;
        }
        return true;
      },
      message: 'parentCode must reference an existing categoryCode in the same organization and branch in GLAccountCategory'
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
          branchName: this.branchName
        });
        if (!parent) {
          logger.error('Parent not found for level validation', {
            parentCode: this.parentCode,
            organizationName: this.organizationName,
            branchName: this.branchName
          });
          return false;
        }
        return value === parent.level + 1;
      },
      message: 'level must be parent.level + 1 or 1 for top-level categories'
    }
  },
  organizationName: {
    type: String,
    required: [true, 'organizationName is required'],
    trim: true,
    validate: {
      validator: async function (value) {
        const org = await mongoose.model('Organization').findOne({ organizationName: value });
        if (!org) {
          logger.error('organizationName does not exist in Organizations collection', { organizationName: value });
          return false;
        }
        return true;
      },
      message: 'organizationName must reference an existing organization in the Organizations collection'
    }
  },
  branchName: {
    type: String,
    required: [true, 'branchName is required'],
    trim: true,
    validate: {
      validator: async function (value) {
        const branch = await mongoose.model('Branch').findOne({
          organizationName: this.organizationName,
          branchName: value
        });
        if (!branch) {
          logger.error('branchName does not exist in Branches collection', {
            branchName: value,
            organizationName: this.organizationName
          });
          return false;
        }
        return true;
      },
      message: 'branchName must reference an existing branch in the Branches collection for the given organization'
    }
  },
  LEDGER_NO: {
    type: Number,
    required: [true, 'LEDGER_NO is required']
  },
  PARENT_ID: {
    type: String,
    required: [true, 'PARENT_ID is required']
  },
  subfolderId: {
    type: String,
    required: [true, 'subfolderId is required']
  },
  BAL_CD: {
    type: String,
    required: [true, 'BAL_CD is required'],
    validate: {
      validator: function (value) {
        const validBALCDs = ['10', '20', '30', '40', '50', '60', '70']; // Based on ASSET, LIABILITY, etc.
        return validBALCDs.includes(value);
      },
      message: 'BAL_CD must be one of 10, 20, 30, 40, 50, 60, 70'
    }
  },
  SUB_LEDGER_NO: {
    type: String,
    required: [true, 'SUB_LEDGER_NO is required']
  },
  BU_ID: {
    type: String,
    required: [true, 'BU_ID is required']
  },
  SEG_NO: {
    type: Number,
    required: [true, 'SEG_NO is required']
  },
  CHART_OF_ACCT_ID: {
    type: String,
    required: [true, 'CHART_OF_ACCT_ID is required']
  },
  ACCT_DESC: {
    type: String,
    required: [true, 'ACCT_DESC is required']
  },
 GL_ACCT_CAT: {
  type: String,
  required: [true, 'GL_ACCT_CAT is required'],
  validate: {
    validator: async function (value) {
      if (value === this.categoryCode) return true;
      const category = await mongoose.model('GLAccountCategory').findOne({
        categoryCode: value,
        organizationName: this.organizationName,
        branchName: this.branchName
      });
      if (!category) {
        logger.error('GL_ACCT_CAT does not exist in GLAccountCategory collection', {
          GL_ACCT_CAT: value,
          organizationName: this.organizationName,
          branchName: this.branchName
        });
        return false;
      }
      return true;
    },
    message: 'GL_ACCT_CAT must match an existing categoryCode in GLAccountCategory collection or the document\'s own categoryCode'
  }
},
  JOURNAL_ID: {
    type: String
  },
  TRANSACTION_TYPE: {
    type: String,
    required: [true, 'TRANSACTION_TYPE is required'],
    enum: ['Asset Balance', 'Liability Balance', 'Equity Balance', 'Income Balance', 'Expense Balance', 'Contingent Asset Balance', 'Contingent Liability Balance'],
    default: 'Asset Balance'
  },
  CR_ALLOWED: {
    type: Boolean,
    default: true
  },
  DR_ALLOWED: {
    type: Boolean,
    default: true
  },
  REC_ST: {
    type: String,
    enum: ['Active', 'Inactive', 'Pending'],
    default: 'Active'
  },
  POST_ALLOW: {
    type: Boolean,
    default: true
  },
  POST_FG: {
    type: Boolean,
    default: false
  },
  CONTROL_ACCT_FG: {
    type: Boolean,
    default: false
  },
  SUSPENSE_ACCT_FG: {
    type: Boolean,
    default: false
  },
  ALLOW_BAL_SWING_FG: {
    type: Boolean,
    default: false
  },
  SEG_VALUE: {
    type: String,
    default: ''
  },
  SEG_DESC: {
    type: String,
    default: ''
  },
  SEG_TY_CD: {
    type: String,
    default: ''
  },
  SEG_PLACEHLDR_ID: {
    type: String,
    default: ''
  },
  DELAY_GL_POSTING: {
    type: Boolean,
    default: false
  },
  LEDGER_BALANCE: {
    type: Number,
    default: 0
  },
  CURRENCY_CODE: {
    type: String,
    default: 'NGN'
  },
  transactions: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GLAccountTransaction'
    }
  ],
  SETTLEMENT_GL_ACCT_NO: {
    type: String,
    required: [true, 'SETTLEMENT_GL_ACCT_NO is required'],
    validate: {
      validator: async function (value) {
        if (value === this.GL_ACCT_NO) return true; // Allow self-reference
        const account = await mongoose.model('GLAccount').findOne({
          GL_ACCT_NO: value,
          organizationName: this.organizationName,
          branchName: this.branchName
        });
        if (!account) {
          logger.error('SETTLEMENT_GL_ACCT_NO does not exist in database', {
            SETTLEMENT_GL_ACCT_NO: value,
            organizationName: this.organizationName,
            branchName: this.branchName
          });
          return false;
        }
        return true;
      },
      message: 'SETTLEMENT_GL_ACCT_NO must reference an existing GL_ACCT_NO in the same organization and branch or the document\'s own GL_ACCT_NO'
    }
  }
}, {
  collection: 'gl_accounts',
  timestamps: true,
  versionKey: false
});

GLAccountSchema.methods.getFullPath = async function () {
  let path = [`${this.categoryCode} - ${this.categoryName}`];
  let current = this;
  while (current.parentCode) {
    const parent = await mongoose.model('GLAccountCategory').findOne({
      categoryCode: current.parentCode,
      organizationName: current.organizationName,
      branchName: current.branchName
    });
    if (parent) {
      path.unshift(`${parent.categoryCode} - ${parent.categoryName}`);
      current = parent;
    } else {
      break;
    }
  }
  return path.join(' / ');
};

export default mongoose.model('GLAccount', GLAccountSchema);