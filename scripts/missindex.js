// scripts/addMissingRateIndexes.js
import mongoose from 'mongoose';
import RateIndex from '../models/RateIndex.js';

async function addMissingRateIndexes() {
  const missingIndexes = [
    {
      INDEX_RATE_ID: 305,
      INDEX_CD: "PL",
      INDEX_RATE: 18.5, // Personal loan rate - typically higher
      INDEX_NM: "PERSONAL LOAN",
      INDEX_DESC: "Rate for personal loans",
      CRNCY_ID: "NGN",
      PRECISION: 2,
      EFFECTIVE_DT: new Date(),
      DAY_COUNT_CONVENTION: "ACTUAL/365",
      IS_DEFAULT: false,
      REC_ST: "A",
      CREATED_BY: "system"
    },
    {
      INDEX_RATE_ID: 300,
      INDEX_CD: "BL",
      INDEX_RATE: 14.0,
      INDEX_NM: "BUSINESS LOAN",
      INDEX_DESC: "Rate for business term loans",
      CRNCY_ID: "NGN",
      PRECISION: 2,
      EFFECTIVE_DT: new Date(),
      DAY_COUNT_CONVENTION: "ACTUAL/365",
      IS_DEFAULT: false,
      REC_ST: "A",
      CREATED_BY: "system"
    }
  ];

  for (const index of missingIndexes) {
    const existing = await RateIndex.findOne({ INDEX_RATE_ID: index.INDEX_RATE_ID });
    if (!existing) {
      await RateIndex.create(index);
      console.log(`✓ Created rate index: ${index.INDEX_RATE_ID} - ${index.INDEX_NM}`);
    } else {
      console.log(`✓ Rate index already exists: ${index.INDEX_RATE_ID}`);
    }
  }
  
  console.log('Missing rate indexes added successfully');
}

// Run the script
addMissingRateIndexes()
  .then(() => {
    console.log('Setup completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Setup failed:', error);
    process.exit(1);
  });