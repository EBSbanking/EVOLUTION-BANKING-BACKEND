const mongoose = require('mongoose');
const Account = require('../models/Account');
const Customer = require('../models/Customer');
const BusinessUnit = require('../models/BusinessUnit');

async function migrateData() {
    try {
        // Connect to the MongoDB database
        await mongoose.connect('mongodb+srv://PCO_LIVE:Gimaro1234@cluster0.zpuy3.mongodb.net/', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log('MongoDB connected...');

        // Example: Migrate accounts data (modify this as per your structure)
        const accounts = await Account.find();
        
        for (let account of accounts) {
            // Update or migrate fields as necessary
            account.created_dt = new Date(); // Example update
            account.opened_date = new Date(); // Add opened_date if needed
            // Add more fields here as needed based on your schema
            await account.save();
        }

        console.log('Migration completed successfully.');

    } catch (error) {
        console.error('Migration error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('MongoDB disconnected.');
    }
}

migrateData();
