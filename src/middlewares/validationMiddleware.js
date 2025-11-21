import { body, validationResult } from 'express-validator';

export const validateGLAccount = [
  body('organizationName').notEmpty().withMessage('Organization name is required'),
  body('organizationCode').isNumeric().withMessage('Organization code must be numeric'),
  body('branchName').notEmpty().withMessage('Branch name is required'),
  body('branchCode').notEmpty().withMessage('Branch code is required'),
  body('ACCT_DESC').notEmpty().withMessage('Account description is required'),
  body('CREATED_BY').notEmpty().withMessage('Created by field is required'),
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