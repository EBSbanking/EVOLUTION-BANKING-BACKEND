// migrations/fixAccountStatuses.js
import mongoose from 'mongoose';
import CustomerAccount from '../models/CustomerAccount.js';
import dotenv from 'dotenv';

dotenv.config();

// Connection URI
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://Administrator:Fo$th3DR$=083@cluster0.zpuy3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Mongoose options
const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 60000,
  serverSelectionTimeoutMS: 30000,
  retryWrites: true,
  w: 'majority'
};

// MongoDB connection events
mongoose.connection.on('error', err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

mongoose.connection.on('connected', () => {
  console.log('✅ Connected to MongoDB');
});

const fixInvalidStatuses = async () => {
  try {
    console.log('⏳ Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, mongooseOptions);

    const validStatuses = CustomerAccount.schema.path('REC_ST').enumValues;

    console.log('🔍 Searching for customer accounts with invalid or missing REC_ST values...');

    const invalidAccounts = await CustomerAccount.aggregate([
      {
        $match: {
          $or: [
            { REC_ST: { $exists: false } },
            { REC_ST: null },
            { REC_ST: { $nin: validStatuses } }
          ]
        }
      },
      { $project: { _id: 1 } }
    ]);

    const totalCount = invalidAccounts.length;

    if (totalCount === 0) {
      console.log('✅ All accounts have valid statuses. No updates needed.');
    } else {
      console.log(`⚠️ Found ${totalCount} accounts with invalid REC_ST. Starting update...`);

      const batchSize = 500;
      for (let i = 0; i < totalCount; i += batchSize) {
        const batch = invalidAccounts.slice(i, i + batchSize);
        const bulkOps = batch.map(acc => ({
          updateOne: {
            filter: { _id: acc._id },
            update: { $set: { REC_ST: 'ACTIVE' } }
          }
        }));

        await CustomerAccount.bulkWrite(bulkOps);
        console.log(`🔧 Updated ${Math.min(i + batchSize, totalCount)}/${totalCount} accounts`);
      }

      console.log(`✅ Successfully updated ${totalCount} accounts with REC_ST = 'ACTIVE'`);
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

// Run the script
fixInvalidStatuses().catch(() => process.exit(1));
