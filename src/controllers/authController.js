const User = require('../../models/User'); // Ensure this path is correct
 // Updated import path
const bcrypt = require('bcrypt'); // Import bcrypt for hashing

exports.login = async (req, res) => {
    const { username, password } = req.body;
    // Find the user by username
    const user = await User.findOne({ username });
    
    // Check if user exists and verify password
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.userId = user._id; // Store user ID in session
        return res.redirect('/dashboard'); // Redirect to dashboard on successful login
    }
    res.render('index', { error: 'Invalid credentials' }); // Render index with error message
};

exports.logout = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/dashboard'); // Redirect to dashboard on error
        }
        res.redirect('/'); // Redirect to home after successful logout
    });
};
