import express from 'express';
import { login } from '../controllers/LoginController.js';
import verifyToken from '../middlewares/verifyToken.js';

const router = express.Router();

// ✅ Public route: Login
router.post('/login', login);

// ✅ Example protected route
router.get('/me', verifyToken, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Authenticated user details',
    user: req.user
  });
});

export default router;
