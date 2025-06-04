import express from 'express';
import { registerUser, updateUser, deactivateUser, getAllUsers } from '../controllers/userController.js'; // Import the controllers

const router = express.Router();

// POST route for user registration
router.post('/users/register', registerUser);

// PUT route for updating user details
router.put('/users/:userId', updateUser);

// PATCH route for deactivating a user
router.patch('/users/deactivate/:userId', deactivateUser);

// GET route for fetching all users
router.get('/users', getAllUsers);

export default router;
