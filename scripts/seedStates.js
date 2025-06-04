import dotenv from 'dotenv';
dotenv.config(); // Load environment variables

import mongoose from 'mongoose';
import State from '../models/State.js';
import { nigeriaStates } from './data/nigeriaStates.js';

// Check if MONGO_URI is loaded correctly
console.log('Mongo URI:', process.env.MONGO_URI);

// Function to connect to MongoDB
const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('Mongo URI is not defined in the environment variables.');
    }
    
    await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('MongoDB connected');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1); // Exit on error
  }
};

// Function to seed the states data
const seedStates = async () => {
  try {
    await State.deleteMany(); // Optional: clear previous states
    await State.insertMany(nigeriaStates); // Insert new states
    console.log('States seeded successfully');
    process.exit(0); // Exit gracefully
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1); // Exit with error if seeding fails
  }
};

// Main function to execute the script
const main = async () => {
  await connectDB(); // Connect to DB
  await seedStates(); // Seed states data
};

// Run the script
main();
