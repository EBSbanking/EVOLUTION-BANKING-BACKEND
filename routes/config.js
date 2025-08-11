import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js'; // ✅ Correct named import
import User from '../models/User.js'; // ✅ User model
import UserRole from '../models/UserRole.js'; // ✅ Permission source

const router = express.Router();

// GET /api/config/user — fetch user system config
router.get('/user', authenticate, async (req, res) => {
  try {
    const { id } = req.user;

    // 1. Fetch user
    const user = await User.findById(id).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 2. Fetch permissions based on role
    const roleData = await UserRole.findOne({ role: user.primary_business_role }).lean();
    const activities = roleData?.permissions || [];

    // 3. Construct config
    const userConfig = {
      id: user._id,
      username: user.user_name,
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      email: user.email,
      role: user.primary_business_role || 'User',
      businessUnit: user.main_business_unit,
      jobTitle: user.job_title,
      isSupervisor: user.is_supervisor,
      isMainBU: user.is_main_BU,
      status: user.status,
      activities, // role-based permissions
      systemParameters: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: 'en-NG',
        environment: process.env.NODE_ENV || 'development',
        multiSession: user.enable_multi_session,
        ipValidation: user.validate_ip_address,
      }
    };

    res.json(userConfig);
  } catch (error) {
    console.error('Failed to fetch user config:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

export default router;
