// seedCounters.js
import mongoose from 'mongoose';
import Counter from '../models/Counter.js';

const dbURI = 'mongodb+srv://Administrator:Fo$th3DR$=083@cluster0.zpuy3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

await mongoose.connect(dbURI);

// New counters with ACCT_ prefix
const counters = [
  { _id: 'ACCT_LOAN', seq: 0 },               // Will generate 3000000000+
  { _id: 'ACCT_TERM_DEPOSIT', seq: 0 },      // Will generate 2000000000+
  { _id: 'ACCT_SAVINGS', seq: 0 }            // Will generate 1000000000+
];

// 1. First migrate any existing LOAN_* counters to ACCT_* format
const counterMappings = [
  { oldId: 'LOAN_LOAN', newId: 'ACCT_LOAN' },
  { oldId: 'LOAN_TERM_DEPOSIT', newId: 'ACCT_TERM_DEPOSIT' },
  { oldId: 'LOAN_SAVINGS', newId: 'ACCT_SAVINGS' }
];

for (const mapping of counterMappings) {
  const oldCounter = await Counter.findById(mapping.oldId);
  if (oldCounter) {
    // Check if new counter already exists
    const existingNewCounter = await Counter.findById(mapping.newId);
    
    if (!existingNewCounter) {
      // Create new counter with migrated sequence
      await Counter.create({
        _id: mapping.newId,
        seq: oldCounter.seq
      });
      console.log(`Migrated counter: ${mapping.oldId} → ${mapping.newId} (seq: ${oldCounter.seq})`);
    } else {
      console.log(`New counter ${mapping.newId} already exists, skipping migration`);
    }
    
    // Remove old counter
    await Counter.deleteOne({ _id: mapping.oldId });
  }
}

// 2. Seed new counters if they don't exist
for (const counter of counters) {
  const existing = await Counter.findById(counter._id);
  if (!existing) {
    await Counter.create(counter);
    console.log(`Inserted counter: ${counter._id}`);
  } else {
    console.log(`Counter already exists: ${counter._id} (seq: ${existing.seq})`);
  }
}

await mongoose.disconnect();
console.log('Seeding completed!');