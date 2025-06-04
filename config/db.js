import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// MongoDB URI from environment variables
const mongoURI = process.env.MONGODB_URI;

const connectDB = async () => {
  try {
    // Establish MongoDB connection using the URI from environment variables
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1); // Exit the process with failure in case of connection error
  }
};

export default connectDB;
