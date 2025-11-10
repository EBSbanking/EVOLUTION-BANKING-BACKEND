// middleware/validationMiddleware.js
import { body, validationResult } from 'express-validator';

export const validateBank = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Bank name is required')
    .isLength({ min: 2, max: 255 })
    .withMessage('Bank name must be between 2 and 255 characters'),
  
  body('code')
    .trim()
    .notEmpty()
    .withMessage('Bank code is required')
    .isLength({ min: 3, max: 20 })
    .withMessage('Bank code must be between 3 and 20 characters')
    .isAlphanumeric()
    .withMessage('Bank code must be alphanumeric'),
  
  body('long_code')
    .trim()
    .notEmpty()
    .withMessage('Long code is required')
    .isLength({ min: 3, max: 20 })
    .withMessage('Long code must be between 3 and 20 characters')
    .isAlphanumeric()
    .withMessage('Long code must be alphanumeric'),
  
  body('country')
    .optional()
    .isLength({ min: 2, max: 3 })
    .withMessage('Country code must be 2-3 characters'),
  
  body('website')
    .optional()
    .isURL()
    .withMessage('Please provide a valid website URL'),
  
  body('contact_email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email address'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];