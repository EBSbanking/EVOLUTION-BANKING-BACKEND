import jwt from 'jsonwebtoken';

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  
  // Validate authorization header
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false,
      message: 'Authorization header missing or malformed',
      solution: 'Include a valid Bearer token in Authorization header'
    });
  }

  const token = authHeader.split(' ')[1];

  // Verify token
  jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key', (err, decoded) => {
    if (err) {
      const errorMessage = err.name === 'TokenExpiredError' 
        ? 'Session expired. Please log in again'
        : 'Invalid authentication token';
      
      return res.status(403).json({ 
        success: false,
        message: errorMessage,
        errorType: err.name,
        solution: 'Request a new token by logging in again'
      });
    }

    // Build comprehensive user object
    req.user = {
      userId: decoded.userId,
      user_name: decoded.user_name,
      email: decoded.email,
      role: decoded.role || 'Unknown',
      isAdmin: decoded.isAdmin || decoded.role === 'Administrator',
      businessUnit: decoded.businessUnit,
      permissions: decoded.permissions || [],
      accessibleBusinessUnits: decoded.accessibleBusinessUnits || [],
      tokenIssuedAt: new Date(decoded.iat * 1000),
      tokenExpiresAt: new Date(decoded.exp * 1000)
    };

    // Audit logging
    console.log('Authenticated request:', {
      timestamp: new Date().toISOString(),
      endpoint: req.originalUrl,
      user: {
        id: req.user.userId,
        name: req.user.user_name,
        role: req.user.role,
        isAdmin: req.user.isAdmin,
        businessUnit: req.user.businessUnit
      },
      token: {
        issuedAt: req.user.tokenIssuedAt,
        expiresAt: req.user.tokenExpiresAt,
        lifetime: `${(req.user.tokenExpiresAt - req.user.tokenIssuedAt) / (1000 * 60)} minutes`
      }
    });

    next();
  });
};

export default verifyToken;