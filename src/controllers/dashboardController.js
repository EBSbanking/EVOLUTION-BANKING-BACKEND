// controllers/dashboardController.js
const User = require('../../models/User'); // Corrected path to User model

// Function to format the server date and time
const formatServerDate = () => {
    const date = new Date();
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

exports.getDashboard = async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.redirect('/');
        }

        // Fetch user details from the database
        const user = await User.findById(req.session.userId);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Prepare data for the dashboard
        const dashboardData = {
            bankName: "PCO Banking",  // Static for now
            businessUnit: user.business_branch || 'Not Assigned',  // Business Unit (e.g., IT)
            userId: user._id,
            firstName: user.first_name,
            lastName: user.last_name,
            processingDate: formatServerDate(),  // Current server date and time
            userRole: user.business_role || 'Not Assigned',  // User Role (e.g., Manager)
            systemDate: new Date().toLocaleString()  // This will be the system date from the client
        };

        // Render the dashboard view with the data
        res.render('dashboard', { dashboardData });
    } catch (error) {
        console.error("Error fetching dashboard:", error);
        res.status(500).json({ message: "An error occurred" });
    }
};

// Function for Cash Depot action
exports.handleCashDepot = (req, res) => {
    // Logic for Cash Depot action
    res.send('Cash Depot action performed.');
};

// Function for Clearing Cheque Enquiry
exports.handleClearingChequeEnquiry = (req, res) => {
    // Logic for Clearing Cheque Enquiry
    res.send('Clearing Cheque Enquiry performed.');
};

// Function for Currency Denomination Exchange
exports.handleCurrencyDenominationExchange = (req, res) => {
    // Logic for Currency Denomination Exchange
    res.send('Currency Denomination Exchange performed.');
};

// Function to fetch transactions
exports.getTransactions = async (req, res) => {
    try {
        // Fetch transactions logic here (example)
        const transactions = await Transaction.find({ userId: req.session.userId }); // Assuming you have a Transaction model
        res.status(200).json(transactions);
    } catch (error) {
        console.error("Error fetching transactions:", error);
        res.status(500).json({ message: "An error occurred while fetching transactions." });
    }
};

// Function to update settings (only for admin)
exports.updateSettings = (req, res) => {
    // Logic for updating settings
    res.send('Settings updated.');
};
