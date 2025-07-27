// scripts/initHolidays.js

import mongoose from 'mongoose';
import Holiday from '../models/Holiday.js';

// Directly use MONGODB_URI here
const MONGODB_URI = 'mongodb+srv://Administrator:Fo$th3DR$=083@cluster0.zpuy3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// Holiday data
const holidays = [
  { date: new Date('2025-01-01'), name: "New Year's Day", recurring: true },
  { date: new Date('2025-12-25'), name: "Christmas Day", recurring: true },
  { date: new Date('2025-10-01'), name: "Independence Day", recurring: true }
];

// Initialize holidays
async function initializeHolidays() {
  try {
    // Connect directly using the URI
    await mongoose.connect(MONGODB_URI, {
      dbName: 'evolution_banking',
    });
    console.log('✅ MongoDB connected');

    for (const holiday of holidays) {
      await Holiday.updateOne(
        { date: holiday.date },
        { $setOnInsert: holiday },
        { upsert: true }
      );
    }

    console.log('✅ Holidays initialized successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error initializing holidays:', err);
    process.exit(1);
  }
}

initializeHolidays();
