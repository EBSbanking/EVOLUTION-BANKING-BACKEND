import mongoose from 'mongoose';
import cron from 'node-cron';

// Function to reset counters
async function resetCounters() {
    try {
        const db = mongoose.connection;

        // Update counters (Reset them to starting values)
        await db.collection('counters').updateOne(
            { _id: "customer_id" },
            { $set: { seq: 0 } },
            { upsert: true }
        );

        await db.collection('counters').updateOne(
            { _id: "customer_no" },
            { $set: { seq: 10 } },
            { upsert: true }
        );

        await db.collection('counters').updateOne(
            { _id: "refer_customer_no" },
            { $set: { seq: 1 } },
            { upsert: true }
        );

        console.log('Counters reset successfully');
    } catch (error) {
        console.error('Error resetting counters:', error);
    }
}

// MongoDB connection string (update with your own credentials)
const dbURI = 'mongodb+srv://Administrator:Fo$th3DR$=083@cluster0.zpuy3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// Connect to MongoDB
mongoose.connect(dbURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
        console.log('MongoDB connected');
        
        // Immediately reset counters after connection
        resetCounters();
    })
    .catch(err => {
        console.error('Error connecting to MongoDB:', err);
    });

// Schedule resetCounters to run daily at midnight
cron.schedule('0 0 * * *', () => {
    console.log('Resetting counters at midnight...');
    resetCounters();
});
