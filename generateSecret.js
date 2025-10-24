// generateSecret.js
import crypto from 'crypto';

// Generate a random session secret
const sessionSecret = crypto.randomBytes(32).toString('hex');
console.log('Generated Session Secret:', sessionSecret);
