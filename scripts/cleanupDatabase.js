import mongoose from 'mongoose';

async function fullRepairAndCleanup() {
  try {
    console.log('🔧 Starting full repair and cleanup...');
    
    // Connect to your database (removed deprecated options)
    await mongoose.connect('mongodb+srv://Administrator:Fo%24th3DR%24%3D083@cluster0.zpuy3.mongodb.net/evolution_banking?retryWrites=true&w=majority&appName=Cluster0');

    console.log('✅ Connected to database');

    const db = mongoose.connection.db;
    const sequencesCollection = db.collection('sequences');

    // Phase 1: Delete problematic documents
    console.log('\n🗑️  PHASE 1: Deleting problematic documents');
    const problematicQuery = {
      $or: [
        { targetCollection: null },
        { collection: null },
        { targetCollection: { $exists: false } },
        { collection: { $exists: false } },
        { targetCollection: { $type: 'string', $eq: 'null' } },
        { targetCollection: { $eq: '' } },
        { collection: { $type: 'string', $eq: 'null' } },
        { collection: { $eq: '' } }
      ]
    };

    const problematicCount = await sequencesCollection.countDocuments(problematicQuery);
    console.log(`Found ${problematicCount} problematic documents`);

    if (problematicCount > 0) {
      const deleteResult = await sequencesCollection.deleteMany(problematicQuery);
      console.log(`Deleted ${deleteResult.deletedCount} problematic documents`);
    }

    // Phase 2: Drop problematic indexes
    console.log('\n📉 PHASE 2: Dropping problematic indexes');
    const indexes = await sequencesCollection.indexes();
    console.log('Current indexes:', indexes.map(i => i.name).join(', '));

    const indexesToDrop = ['collection_1', 'targetCollection_1'];
    for (const idx of indexesToDrop) {
      try {
        await sequencesCollection.dropIndex(idx);
        console.log(`Dropped index: ${idx}`);
      } catch (e) {
        if (e.codeName !== 'IndexNotFound') {
          console.error(`Error dropping ${idx}:`, e.message);
        } else {
          console.log(`Index ${idx} does not exist`);
        }
      }
    }

    // Phase 3: Recreate clean index only on targetCollection
    console.log('\n📈 PHASE 3: Recreating index on targetCollection');
    await sequencesCollection.createIndex(
      { targetCollection: 1 },
      { unique: true }
    );
    console.log('✅ Created unique index on targetCollection');

    // Phase 4: Repair required sequences with safe values
    console.log('\n🔄 PHASE 4: Repairing required sequences');
    
    const requiredSequences = [
      { targetCollection: 'transactions' },
      { targetCollection: 'wfworkitems' },
      { targetCollection: 'audit_trail_events' },
      { targetCollection: 'loan_accounts' },
      { targetCollection: 'customers' },
      { targetCollection: 'workflows' }
    ];

    let repairedCount = 0;

    for (const seq of requiredSequences) {
      // Calculate safe next value
      const targetColl = db.collection(seq.targetCollection);
      let maxId = 0;
      try {
        const maxResult = await targetColl.aggregate([
          { $group: { _id: null, maxId: { $max: '$id' } } }, // Adjust '$id' if your custom ID field is named differently
          { $project: { maxId: { $ifNull: ['$maxId', 0] } } }
        ]).toArray();
        maxId = maxResult[0]?.maxId || 0;
      } catch (aggError) {
        console.log(`   ⚠️  Could not aggregate max ID for ${seq.targetCollection}: ${aggError.message}. Using 1.`);
        maxId = 0;
      }

      const nextValue = maxId + 1;
      console.log(`   📈 ${seq.targetCollection}: Max existing ID = ${maxId}, Next sequence value = ${nextValue}`);

      // Upsert sequence (ensures no 'collection' field is set)
      const result = await sequencesCollection.updateOne(
        { targetCollection: seq.targetCollection },
        {
          $setOnInsert: {
            createdAt: new Date(),
          },
          $set: {
            value: nextValue,
            updatedAt: new Date()
          },
          $unset: { collection: '' } // Remove any lingering 'collection' field
        },
        { upsert: true }
      );

      if (result.upsertedCount > 0 || result.modifiedCount > 0) {
        console.log(`   ✅ Repaired/Updated sequence: ${seq.targetCollection}`);
        repairedCount++;
      } else {
        console.log(`   ℹ️  Sequence already good: ${seq.targetCollection}`);
      }
    }

    console.log(`\n✨ Full repair completed! Repaired ${repairedCount} sequences.`);
    console.log('Now try starting your server.');

    // Optional: List final sequences
    const finalSequences = await sequencesCollection.find().sort({ targetCollection: 1 }).toArray();
    console.log('\nFinal sequences:');
    finalSequences.forEach(seq => {
      console.log(`   ✅ ${seq.targetCollection}: value = ${seq.value}`);
    });

  } catch (error) {
    console.error('❌ Full repair failed:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log('🔌 Database connection closed');
    }
    process.exit(0);
  }
}

fullRepairAndCleanup();