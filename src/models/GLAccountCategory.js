// models/GLAccountCategory.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';
import { logger } from '../utils/logger.js';

class GLAccountCategory extends Model {
  // Method to get full category path
  async getFullPath() {
    try {
      const path = [this.categoryName];
      let current = this;
      let depth = 0;
      const maxDepth = 10; // Prevent infinite loops

      while (current.parentCode && depth < maxDepth) {
        current = await GLAccountCategory.findOne({
          where: {
            categoryCode: current.parentCode,
            organizationName: this.organizationName,
            branchName: this.branchName
          }
        });

        if (current) {
          path.unshift(current.categoryName);
          depth++;
        } else {
          break;
        }
      }

      // Check for potential infinite loop
      if (depth >= maxDepth) {
        logger.warn(`Possible infinite loop detected in GLAccountCategory hierarchy for category: ${this.categoryCode}`);
      }

      return path.join(' - ');
    } catch (error) {
      logger.error(`Error getting full path for category ${this.categoryCode}:`, error);
      return this.categoryName; // Fallback to just the current name
    }
  }

  // Method to get all child categories
  async getChildren() {
    try {
      return await GLAccountCategory.findAll({
        where: {
          parentCode: this.categoryCode,
          organizationName: this.organizationName,
          branchName: this.branchName
        },
        order: [['categoryCode', 'ASC']]
      });
    } catch (error) {
      logger.error(`Error getting children for category ${this.categoryCode}:`, error);
      return [];
    }
  }

  // Method to get all descendants (recursive)
  async getDescendants() {
    try {
      const descendants = [];
      const stack = [this.categoryCode];
      
      while (stack.length > 0) {
        const currentCode = stack.pop();
        const children = await GLAccountCategory.findAll({
          where: {
            parentCode: currentCode,
            organizationName: this.organizationName,
            branchName: this.branchName
          }
        });

        for (const child of children) {
          descendants.push(child);
          stack.push(child.categoryCode);
        }
      }

      return descendants;
    } catch (error) {
      logger.error(`Error getting descendants for category ${this.categoryCode}:`, error);
      return [];
    }
  }

  // Method to get parent category
  async getParent() {
    if (!this.parentCode) return null;
    
    try {
      return await GLAccountCategory.findOne({
        where: {
          categoryCode: this.parentCode,
          organizationName: this.organizationName,
          branchName: this.branchName
        }
      });
    } catch (error) {
      logger.error(`Error getting parent for category ${this.categoryCode}:`, error);
      return null;
    }
  }

  // Method to check if category is leaf (has no children)
  async isLeaf() {
    try {
      const count = await GLAccountCategory.count({
        where: {
          parentCode: this.categoryCode,
          organizationName: this.organizationName,
          branchName: this.branchName
        }
      });
      return count === 0;
    } catch (error) {
      logger.error(`Error checking if category ${this.categoryCode} is leaf:`, error);
      return true; // Assume it's a leaf on error
    }
  }

  // Method to check if category is root
  get isRoot() {
    return !this.parentCode;
  }

  // Method to move category to new parent
  async moveToParent(newParentCode) {
    try {
      // Validate new parent exists if provided
      if (newParentCode) {
        const newParent = await GLAccountCategory.findOne({
          where: {
            categoryCode: newParentCode,
            organizationName: this.organizationName,
            branchName: this.branchName
          }
        });

        if (!newParent) {
          throw new Error(`Parent category with code ${newParentCode} not found`);
        }

        // Check for circular reference
        if (await this.wouldCauseCircularReference(newParentCode)) {
          throw new Error('Moving category would create a circular reference');
        }

        // Update level based on new parent
        this.level = newParent.level + 1;
      } else {
        this.level = 1; // Root level
      }

      this.parentCode = newParentCode || null;
      await this.save();
      
      // Update levels for all descendants
      await this.updateDescendantLevels();
      
      return true;
    } catch (error) {
      logger.error(`Error moving category ${this.categoryCode} to parent ${newParentCode}:`, error);
      throw error;
    }
  }

  // Helper method to check for circular references
  async wouldCauseCircularReference(newParentCode) {
    if (newParentCode === this.categoryCode) {
      return true; // Can't be parent of itself
    }

    const visited = new Set([this.categoryCode]);
    let currentCode = newParentCode;
    
    while (currentCode) {
      if (visited.has(currentCode)) {
        return true; // Circular reference detected
      }
      
      visited.add(currentCode);
      const parent = await GLAccountCategory.findOne({
        where: {
          categoryCode: currentCode,
          organizationName: this.organizationName,
          branchName: this.branchName
        },
        attributes: ['parentCode']
      });
      
      currentCode = parent ? parent.parentCode : null;
    }
    
    return false;
  }

  // Update levels for all descendants
  async updateDescendantLevels() {
    try {
      const stack = [{ categoryCode: this.categoryCode, level: this.level }];
      
      while (stack.length > 0) {
        const { categoryCode, level } = stack.pop();
        const children = await GLAccountCategory.findAll({
          where: {
            parentCode: categoryCode,
            organizationName: this.organizationName,
            branchName: this.branchName
          }
        });

        for (const child of children) {
          child.level = level + 1;
          await child.save();
          stack.push({ categoryCode: child.categoryCode, level: child.level });
        }
      }
    } catch (error) {
      logger.error(`Error updating descendant levels for category ${this.categoryCode}:`, error);
    }
  }

  // Static method to get category tree
  static async getCategoryTree(organizationName, branchName) {
    try {
      const categories = await this.findAll({
        where: {
          organizationName,
          branchName
        },
        order: [['level', 'ASC'], ['categoryCode', 'ASC']]
      });

      // Build tree structure
      const categoryMap = new Map();
      const rootCategories = [];

      // First pass: Create map
      categories.forEach(category => {
        categoryMap.set(category.categoryCode, {
          ...category.toJSON(),
          children: []
        });
      });

      // Second pass: Build tree
      categories.forEach(category => {
        const categoryNode = categoryMap.get(category.categoryCode);
        
        if (category.parentCode) {
          const parentNode = categoryMap.get(category.parentCode);
          if (parentNode) {
            parentNode.children.push(categoryNode);
          }
        } else {
          rootCategories.push(categoryNode);
        }
      });

      return rootCategories;
    } catch (error) {
      logger.error(`Error getting category tree for ${organizationName}/${branchName}:`, error);
      return [];
    }
  }

  // Static method to get all leaf categories
  static async getLeafCategories(organizationName, branchName) {
    try {
      const allCategories = await this.findAll({
        where: {
          organizationName,
          branchName
        }
      });

      const parentCodes = new Set();
      allCategories.forEach(cat => {
        if (cat.parentCode) {
          parentCodes.add(cat.parentCode);
        }
      });

      return allCategories.filter(cat => !parentCodes.has(cat.categoryCode));
    } catch (error) {
      logger.error(`Error getting leaf categories for ${organizationName}/${branchName}:`, error);
      return [];
    }
  }

  // Static method to validate category hierarchy
  static async validateHierarchy(organizationName, branchName) {
    try {
      const categories = await this.findAll({
        where: { organizationName, branchName }
      });

      const errors = [];
      const categoryMap = new Map(categories.map(cat => [cat.categoryCode, cat]));

      for (const category of categories) {
        if (category.parentCode && !categoryMap.has(category.parentCode)) {
          errors.push(`Category ${category.categoryCode} references non-existent parent ${category.parentCode}`);
        }

        if (await category.wouldCauseCircularReference(category.parentCode)) {
          errors.push(`Category ${category.categoryCode} creates circular reference`);
        }
      }

      return {
        isValid: errors.length === 0,
        errors
      };
    } catch (error) {
      logger.error(`Error validating hierarchy for ${organizationName}/${branchName}:`, error);
      return {
        isValid: false,
        errors: [`Validation error: ${error.message}`]
      };
    }
  }
}

GLAccountCategory.init({
  categoryCode: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false,
    unique: true,
    comment: 'Unique category code identifier'
  },
  categoryName: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Display name of the category'
  },
  organizationName: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Organization this category belongs to'
  },
  branchName: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Branch this category belongs to'
  },
  parentCode: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
    comment: 'Parent category code, null for root categories'
  },
  level: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    validate: {
      min: 1
    },
    comment: 'Hierarchy level (1 for root)'
  }
}, {
  sequelize,
  modelName: 'GLAccountCategory',
  tableName: 'gl_account_categories',
  timestamps: true, // Adds createdAt and updatedAt
  underscored: false,
  hooks: {
    beforeSave: async (category, options) => {
      // Set level based on parent
      if (category.parentCode) {
        const parent = await GLAccountCategory.findOne({
          where: {
            categoryCode: category.parentCode,
            organizationName: category.organizationName,
            branchName: category.branchName
          }
        });
        
        if (parent) {
          category.level = parent.level + 1;
        } else {
          category.level = 1; // Or throw error if parent must exist
        }
      } else {
        category.level = 1;
      }
    },
    beforeDestroy: async (category, options) => {
      // Prevent deletion if category has children
      const childCount = await GLAccountCategory.count({
        where: {
          parentCode: category.categoryCode,
          organizationName: category.organizationName,
          branchName: category.branchName
        }
      });

      if (childCount > 0) {
        throw new Error(`Cannot delete category ${category.categoryCode} because it has ${childCount} child categories. Delete children first or reassign them.`);
      }
    }
  },
  indexes: [
    {
      name: 'idx_gl_account_categories_code',
      fields: ['categoryCode'],
      unique: true
    },
    {
      name: 'idx_gl_account_categories_org_branch',
      fields: ['organizationName', 'branchName']
    },
    {
      name: 'idx_gl_account_categories_parent',
      fields: ['parentCode']
    },
    {
      name: 'idx_gl_account_categories_level',
      fields: ['level']
    },
    {
      name: 'idx_gl_account_categories_org_branch_parent',
      fields: ['organizationName', 'branchName', 'parentCode']
    }
  ]
});

export default GLAccountCategory;
