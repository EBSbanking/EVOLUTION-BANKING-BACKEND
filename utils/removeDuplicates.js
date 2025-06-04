import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Deposit from './models/Deposit.js';

dotenv.config();

const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.once('open', async () => {
  console.log('Connected to MongoDB');

  try {
    const duplicates = await Deposit.aggregate([
      {
        $group: {
          _id: "$ACCT_ID",
          duplicateIds: { $push: "$_id" },
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    for (const doc of duplicates) {
      const [mostRecentId, ...duplicateIds] = doc.duplicateIds.reverse();
      await Deposit.deleteMany({ _id: { $in: duplicateIds } });
    }

    console.log('Duplicate records removed successfully');
  } catch (error) {
    console.error('Error removing duplicates:', error);
  } finally {
    mongoose.connection.close();
  }
});
