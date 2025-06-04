import jwt from 'jsonwebtoken'; // Use import instead of require

const checkAuth = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1]; // Get the token from the Authorization header

    if (!token) {
        return res.status(403).json({ message: 'No token provided' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        req.user = decoded; // Save decoded token data to request object
        next(); // Proceed to the next middleware or route handler
    });
};

// Export the checkAuth middleware
export default checkAuth;
