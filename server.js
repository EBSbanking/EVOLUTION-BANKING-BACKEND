import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import logger from './utils/logger.js';
import app from './app.js';
import initializeCounters from './scripts/initCounters.js';
import fileUpload from 'express-fileupload';

dotenv.config();

const PORT = process.env.PORT || 5000;

// Ensure MONGODB_URI is defined
if (!process.env.MONGODB_URI) {
  logger.error('Error: MONGODB_URI is not defined');
  process.exit(1);
}

// MongoDB connection with retry logic
const connectToDatabase = async () => {
  try {
    const MONGO_URI = process.env.MONGODB_URI;

    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      // useUnifiedTopology: true, // Removed as requested
    });

    logger.info('MongoDB connected successfully');

    // Initialize counters
    await initializeCounters();

    // Create indexes
    await createIndexes();

    // Start Express server after DB is connected
    app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
    });

  } catch (error) {
    logger.error('MongoDB connection error:', error);
    setTimeout(connectToDatabase, 5000); // Retry after 5 seconds
  }
};

// Index creation function
async function createIndexes() {
  try {
    const client = await MongoClient.connect(process.env.MONGODB_URI, {
      
      // useUnifiedTopology: true, // Removed for consistency
    });

    const db = client.db();
    const collection = db.collection('yourCollection'); // Replace with your actual collection name

    await collection.createIndexes([{ key: { field: 1 } }]);

    logger.info('Index created successfully');
    await client.close();
  } catch (error) {
    logger.error('Error creating index:', error);
  }
}

// Server time utilities
const getServerTimeAndDate = () => {
  const now = new Date();
  const serverDate = now.toLocaleDateString();
  const serverTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return { serverDate, serverTime };
};

// Middleware to log server time
app.use((req, res, next) => {
  const { serverDate, serverTime } = getServerTimeAndDate();
  logger.info(`Server Time: ${serverDate} ${serverTime}`);
  next();
});

// Route to return server time
app.get('/server-time', (req, res) => {
  const { serverDate, serverTime } = getServerTimeAndDate();
  res.json({ serverDate, serverTime });
});

// Initialize MongoDB connection
connectToDatabase();

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed');
  process.exit(0);
});
