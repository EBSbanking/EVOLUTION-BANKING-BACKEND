import mongoose from 'mongoose';
import 'dotenv/config';

// Use environment variable for connection string
const DB_URI = process.env.MONGODB_URI || 'mongodb+srv://Administrator:password@cluster0.zpuy3.mongodb.net/yourdbname?retryWrites=true&w=majority';

async function auditApplication(appId) {
  try {
    // Connect to MongoDB (removed deprecated options)
    await mongoose.connect(DB_URI);
    
    const conn = mongoose.connection;
    
    // Get collection list first
    const collections = await conn.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    const results = {
      // Check main collection
      creditApplications: await conn.db.collection('creditapplications')
        .findOne({ APPL_ID: appId }),
      
      // Modern way to check indexes (replaces system.indexes query)
      indexes: await conn.db.collection('creditapplications')
        .indexes(),
      
      // Check all collections for this APPL_ID
      allCollections: {}
    };

    // Check all collections for the application ID
    for (const name of collectionNames) {
      try {
        results.allCollections[name] = await conn.db
          .collection(name)
          .findOne({ APPL_ID: appId });
      } catch (err) {
        results.allCollections[name] = { error: err.message };
      }
    }

    console.log('Audit results:', JSON.stringify(results, null, 2));
    return results;
  } catch (err) {
    console.error('Audit error:', err);
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

// Get application ID from command line or use default
const appId = process.argv[2] || "CRAPP/0074";
auditApplication(appId)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));