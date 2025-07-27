const checkAdminRole = (req, res, next) => {
  // Enhanced debug logging
  console.log('Admin Check - User Details:', {
    userId: req.user?.userId,
    username: req.user?.user_name,
    allRoles: req.user?.roles || [],
    effectiveRole: req.user?.role_nm,
    isAdminFlag: req.user?.isAdmin
  });

  // Check multiple possible admin indicators
  const isAdmin = (
    req.user?.isAdmin === true ||
    req.user?.role_nm === 'Administrator' ||
    req.user?.role === 'Administrator' ||
    (req.user?.roles && req.user.roles.includes('Administrator'))
  );

  if (!req.user || !isAdmin) {
    console.warn('Admin access denied for user:', req.user?.user_name);
    return res.status(403).json({ 
      message: 'Only Administrators can create BusinessRoles.',
      userDetails: {
        userId: req.user?.userId,
        username: req.user?.user_name,
        allRoles: req.user?.roles || [],
        effectiveRole: req.user?.role_nm,
        isAdminFlag: req.user?.isAdmin
      },
      required: {
        role: 'Administrator',
        orFlag: 'isAdmin: true'
      }
    });
  }

  console.log('Admin access granted to:', req.user.user_name);
  next();
};

export default checkAdminRole;