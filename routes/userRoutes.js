import express from 'express';
import {
  registerUser,
  updateUser,
  deactivateUser,
  getUserByEmployerNumber,
  getAllUsers,
  resetPassword,
  // login
} from '../controllers/userController.js';

import verifyToken from '../middlewares/verifyToken.js'; // JWT auth middleware

const router = express.Router();

// 🔐 Protected route using JWT middleware
router.get('/users/protected-route', verifyToken, (req, res) => {
  const { userId, user_name, businessUnit, role } = req.user;

  res.json({
    message: 'Access granted to protected route',
    user: {
      userId,
      user_name,
      businessUnit,
      role
    }
  });
});

// 🔐 Authentication routes
router.post('/users/register', registerUser);       // Register new user
// router.post('/users/login', login);                 // Login & get token (changed from loginUser to login)
router.post('/users/reset-password', resetPassword);// Reset password

// 👤 User management
router.put('/users/:userId', updateUser);           // Update user
router.patch('/users/deactivate/:userId', deactivateUser); // Deactivate user
router.get('/users/by-employer/:employer_number', getUserByEmployerNumber); // Get by employer #
router.get('/users', getAllUsers);                  // Get all users

export default router;