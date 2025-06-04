// middleware/auth.js
import jwt from 'jsonwebtoken';

const secretKey = process.env.JWT_SECRET_KEY; // Ensure you have a secret key set in your .env file

const auth = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized: No token provided' });
    }

    // Verify token logic
    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Forbidden: Invalid token' });
        }
        req.user = decoded; // Attach decoded data to req.user
        next();
    });
};

export default auth;
