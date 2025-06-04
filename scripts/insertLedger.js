const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb+srv://Administrator:Fo$th3DR$=083@cluster0.zpuy3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));

// Define the Ledger model
const Ledger = mongoose.model('Ledger', new mongoose.Schema({
    GLAccountNumber: String,
    AccountName: String,
    Balance: Number
}));

// Insert multiple documents into the Ledger collection
async function insertLedgers() {
    const ledgers = [
        { GLAccountNumber: '1-0-011-2-202-02-86', AccountName: 'CASA SAVING GL', Balance: 10000 },
        { GLAccountNumber: '1-0-011-2-202-02-87', AccountName: 'LOAN PORTFOLIO GL', Balance: 13000 },
        { GLAccountNumber: '1-0-011-2-202-02-88', AccountName: 'INT EXPENSE GL', Balance: 12000 }
    ];

    try {
        // Insert all the ledger documents at once
        await Ledger.insertMany(ledgers);
        console.log('Ledger documents inserted successfully');
    } catch (error) {
        console.error('Error inserting ledgers:', error);
    }
}

insertLedgers();
