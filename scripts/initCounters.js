import mongoose from 'mongoose';
import Counter from '../models/Counter.js';  // Ensure the correct path

// Initialize counters for customer_id and customer_no
const initializeCounters = async () => {
    try {
        // Create or initialize the customer_id counter if it doesn't exist
        await Counter.findByIdAndUpdate(
            { _id: 'customer_id' },
            { $setOnInsert: { seq: 1 } },  // Starting value for customer_id
            { upsert: true }
        );

        // Create or initialize the customer_no counter if it doesn't exist
        await Counter.findByIdAndUpdate(
            { _id: 'customer_no' },
            { $setOnInsert: { seq: 10000001 } },  // Starting value for customer_no
            { upsert: true }
        );

        console.log('Counters initialized');
    } catch (error) {
        console.error('Error initializing counters:', error);
    }
};

// Export the function as the default export
export default initializeCounters;
