import mongoose from 'mongoose';
import { ObjectId } from 'mongodb';

// Replace 'yourDatabaseName' with your actual database name
const DB_URI = 'mongodb+srv://Administrator:Fo$th3DR$=083@cluster0.zpuy3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// Function to update GL_ACCT_ID
const updateGLAccounts = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB.');

    // Perform the update
    const result = await mongoose.connection.collection('glaccounts').updateMany(
      { GL_ACCT_ID: null },
      { $set: { GL_ACCT_ID: new ObjectId().toString() } }
    );

    console.log(`${result.modifiedCount} documents updated.`);
  } catch (error) {
    console.error('Error updating GL_ACCT_ID:', error.message);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
};

// Call the function
updateGLAccounts();
