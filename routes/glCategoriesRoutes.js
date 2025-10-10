// In your routes file
import express from 'express';
import { 
  initializeBaseCategories, 
  initializeParentCategories,
  createGLCategory,
    getGLCategories
} from '../controllers/GLAccountCategoryController.js';

const router = express.Router();

router.post('/initialize-base', initializeBaseCategories);
router.post('/initialize-parents', initializeParentCategories); // Add this line
router.post('/create', createGLCategory);


// Get all GL account categories for a department
router.get('/', getGLCategories);

export default router;