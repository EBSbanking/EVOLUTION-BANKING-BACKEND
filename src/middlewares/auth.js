// middleware/auth.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js'; // Adjust path if needed
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Function to get JWT secret key
export const getSecretKey = () => {
  const secret = process.env.JWT_SECRET_KEY || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET_KEY or JWT_SECRET is not defined in .env');
  }
  return secret;
};

const authenticate = async (req, res, next) => {
  try {
    // 1. Get token from headers
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1]; // Handle "Bearer <token>" format

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        resolution: 'Include valid JWT token in Authorization header',
      });
    }

    // 2. Verify token
    const decoded = jwt.verify(token, getSecretKey());

    // 3. Verify user still exists
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User account not found',
        resolution: 'Token might be for a deleted account',
      });
    }

    // 4. Attach user to request
    req.user = user;
    next();
  } catch (error) {
    // Handle different error cases
    let status = 401;
    let message = 'Authentication failed';

    if (error.name === 'TokenExpiredError') {
      status = 403;
      message = 'Session expired';
    } else if (error.name === 'JsonWebTokenError') {
      status = 403;
      message = 'Invalid token';
    }

    res.status(status).json({
      success: false,
      message,
      error: error.message,
    });
  }
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access',
        resolution: `Requires ${roles.join(' or ')} privileges`,
      });
    }
    next();
  };
};

export default { authenticate, authorize, getSecretKey };