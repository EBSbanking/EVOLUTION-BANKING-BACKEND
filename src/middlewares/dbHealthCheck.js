// middleware/dbHealthCheck.js
import sequelize from '../../config/db.js';

export const dbHealthCheck = async (req, res, next) => {
  try {
    await sequelize.authenticate();
    next();
  } catch (error) {
    console.error('Database connection failed:', error.message);
    return res.status(503).json({
      success: false,
      message: 'Database service is temporarily unavailable',
      error: 'Service Unavailable'
    });
  }
};