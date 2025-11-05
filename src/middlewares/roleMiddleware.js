// middleware/authorizeRoles.js
const authorizeRoles = (roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).send('Forbidden: No user role found');
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).send('Forbidden: You do not have access');
    }

    next();
  };
};

export default authorizeRoles;
