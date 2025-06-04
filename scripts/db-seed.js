import mongoose from 'mongoose';
import Counter from './models/Counter.js';  // Ensure the path is correct

// Initialize counters for customer_id and customer_no
async function initializeCounters() {
    try {
        // Update or insert the counter for customer_id
        await Counter.findByIdAndUpdate(
            { _id: 'customer_id' },
            { $setOnInsert: { seq: 1 } },
            { upsert: true }
        );

        // Update or insert the counter for customer_no
        await Counter.findByIdAndUpdate(
            { _id: 'customer_no' },
            { $setOnInsert: { seq: 1 } },
            { upsert: true }
        );

        console.log('Counters initialized');
    } catch (error) {
        console.error('Error initializing counters:', error);
    }
}

// Function to connect to MongoDB and initialize counters
export async function connectDatabase() {
    try {
        // MongoDB connection string (adjust for your environment)
        await mongoose.connect('mongodb+srv://Administrator:Fo$th3DR$=083@cluster0.zpuy3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
        console.log('MongoDB connected successfully');

        // Initialize counters after DB connection
        await initializeCounters();
    } catch (err) {
        console.error('MongoDB connection error:', err);
    }
}
