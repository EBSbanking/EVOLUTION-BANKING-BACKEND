// db.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const connectDatabase = async () => { // Default export
  const mongoURI = process.env.MONGODB_URI;
  if (!mongoURI) {
    console.error('MongoDB URI is not defined. Please check your .env file.');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoURI, {
      socketTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    setTimeout(connectDatabase, 5000);
  }
};

export default connectDatabase; // Default export
