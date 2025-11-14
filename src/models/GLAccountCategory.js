import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';
import Branch from '../models/Branch.js';
// GLAccountCategory Schema
const GLAccountCategorySchema = new mongoose.Schema({
  categoryCode: { type: String, required: true, unique: true },
  categoryName: { type: String, required: true },
  organizationName: { type: String, required: true },
  branchName: { type: String, required: true },
  parentCode: { type: String, default: null },
  level: { type: Number, default: 1 },
  // Add more fields for hierarchy if needed
}, {
  timestamps: true,
  collection: 'gl_account_categories',
});

// Add getFullPath method to GLAccountCategorySchema (assuming recursive parent lookup)
GLAccountCategorySchema.methods.getFullPath = async function () {
  let current = this;
  const path = [current.categoryName];
  while (current.parentCode) {
    current = await GLAccountCategory.findOne({
      categoryCode: current.parentCode,
      organizationName: this.organizationName,
      branchName: this.branchName
    });
    if (current) {
      path.unshift(current.categoryName);
    } else {
      break;
    }
  }
  return path.join(' - ');
};

const GLAccountCategory = mongoose.model('GLAccountCategory', GLAccountCategorySchema);

export default GLAccountCategory;