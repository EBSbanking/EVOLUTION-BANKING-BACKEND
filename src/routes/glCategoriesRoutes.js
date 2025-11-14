import express from 'express';
import {
  getAllGLAccountCategories,
  getGLAccountCategoryById,
  createGLAccountCategory,
  updateGLAccountCategory,
  deleteGLAccountCategory,
} from '../controllers/GLAccountCategoryController.js'; // Adjust path as needed

const router = express.Router();

// GET /api/gl-account-categories - Get all GL Account Categories
router.get('/', getAllGLAccountCategories);

// GET /api/gl-account-categories/:id - Get GL Account Category by ID
router.get('/:id', getGLAccountCategoryById);

// POST /api/gl-account-categories - Create a new GL Account Category
router.post('/', createGLAccountCategory);

// PUT /api/gl-account-categories/:id - Update GL Account Category by ID
router.put('/:id', updateGLAccountCategory);

// DELETE /api/gl-account-categories/:id - Delete GL Account Category by ID
router.delete('/:id', deleteGLAccountCategory);

export default router;