// middleware/checkPasswordExpiry.js
export const checkPasswordExpiry = async (req, res, next) => {
  // Exclude password change routes
  const excludePaths = [
    '/api/users/change-password',
    '/api/users/force-password-change',
    '/api/login/password-status',
  ];
  if (excludePaths.some(path => req.originalUrl.startsWith(path))) {
    return next();
  }

  const userId = req.user?.id || req.body.user_id;
  if (!userId) return next();

  try {
    const User = (await import('../models/User.js')).default;
    const user = await User.scope('withSensitiveData').findByPk(userId);
    if (!user) return next();

    if (user.requiresPasswordChange()) {
      return res.status(403).json({
        success: false,
        message: user.is_first_login
          ? 'First login: you must change your password before continuing.'
          : 'Your password has expired. Please change it to continue.',
        errorCode: 'PASSWORD_CHANGE_REQUIRED',
        requiresPasswordChange: true,
        redirectTo: '/change-password',
        daysOverdue: user.isPasswordExpired()
          ? Math.abs(user.daysUntilPasswordExpiry())
          : 0,
      });
    }

    // Optional: add warning header if expiring within 7 days
    const daysLeft = user.daysUntilPasswordExpiry();
    if (daysLeft !== null && daysLeft <= 7 && daysLeft > 0) {
      res.setHeader('X-Password-Expiring-Soon', 'true');
      res.setHeader('X-Password-Days-Left', daysLeft);
    }

    next();
  } catch (error) {
    console.error('Password expiry check error:', error);
    next();
  }
};