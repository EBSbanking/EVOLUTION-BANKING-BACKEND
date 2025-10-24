import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

// Cleanup sequences route
router.get('/cleanup-sequences', async (req, res) => {
  try {
    console.log('Starting database cleanup...');
    
    // Use the existing mongoose connection
    const db = mongoose.connection.db;
    const sequencesCollection = db.collection('sequences');

    // Count before cleanup
    const beforeCount = await sequencesCollection.countDocuments();
    console.log('Documents before cleanup:', beforeCount);

    // Show problematic documents
    const problematicDocs = await sequencesCollection.find({
      $or: [
        { targetCollection: null },
        { collection: null },
        { targetCollection: { $exists: false } },
        { collection: { $exists: false } }
      ]
    }).toArray();
    
    console.log('Found problematic documents:', problematicDocs.length);

    // Delete problematic documents
    const deleteResult = await sequencesCollection.deleteMany({
      $or: [
        { targetCollection: null },
        { collection: null },
        { targetCollection: { $exists: false } },
        { collection: { $exists: false } }
      ]
    });

    console.log('Deleted documents:', deleteResult.deletedCount);

    // Count after cleanup
    const afterCount = await sequencesCollection.countDocuments();
    console.log('Documents after cleanup:', afterCount);

    // Drop and recreate indexes
    const indexes = await sequencesCollection.indexes();
    console.log('Current indexes:', indexes);

    try {
      await sequencesCollection.dropIndex('collection_1');
      console.log('Dropped collection_1 index');
    } catch (e) {
      console.log('collection_1 index might not exist:', e.message);
    }

    try {
      await sequencesCollection.dropIndex('targetCollection_1');
      console.log('Dropped targetCollection_1 index');
    } catch (e) {
      console.log('targetCollection_1 index might not exist:', e.message);
    }

    // Create new indexes
    await sequencesCollection.createIndex({ collection: 1 }, { unique: true });
    await sequencesCollection.createIndex({ targetCollection: 1 }, { unique: true });
    console.log('Indexes recreated successfully');

    // Show remaining sequences
    const remainingSequences = await sequencesCollection.find().toArray();
    console.log('Remaining sequences count:', remainingSequences.length);

    res.json({
      success: true,
      message: `Cleanup completed. Deleted ${deleteResult.deletedCount} problematic documents.`,
      data: {
        beforeCount,
        afterCount,
        deletedCount: deleteResult.deletedCount,
        remainingSequences: remainingSequences.length
      }
    });

  } catch (error) {
    console.error('Cleanup failed:', error);
    res.status(500).json({
      success: false,
      message: 'Cleanup failed: ' + error.message,
      error: error.toString()
    });
  }
});

export default router;