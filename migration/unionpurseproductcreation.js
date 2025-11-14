// unionpurseproductcreation.js - Seed script for default SavingsProducts
import mongoose from 'mongoose';
import SavingsProduct from '../src/models/SavingsProduct.js'; // Adjust path as needed based on your project structure

// MongoDB connection string - replace with your actual URI if needed
const MONGODB_URI = 'mongodb+srv://Administrator:Fo%24th3DR%24%3D083@cluster0.zpuy3.mongodb.net/evolution_banking?retryWrites=true&w=majority&appName=Cluster0';

// Ensure graceful shutdown on SIGINT
process.on('SIGINT', async () => {
  console.log('\n🛑 SIGINT received, closing MongoDB connection...');
  await mongoose.connection.close();
  process.exit(0);
});

async function seedSavingsProducts() {
  try {
    // Connect to MongoDB (removed deprecated options)
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // ✅ CLEANUP: Remove existing documents with null/undefined PROD_ID to avoid duplicates
    const nullDocs = await SavingsProduct.deleteMany({ PROD_ID: { $in: [null, undefined] } });
    console.log(`🧹 Cleaned up ${nullDocs.deletedCount} documents with invalid PROD_ID`);

    const products = [
      { 
        productCode: 'UNION_PURSE', 
        productName: 'Union Purse', 
        productDescription: 'Default Union Purse product for group savings',
        productType: 'SAVINGS'
      },
      {
        productCode: 'EMERGENCY_FUND',
        productName: 'Emergency Fund',
        productDescription: 'Default Emergency Fund product for group savings',
        productType: 'SAVINGS'
      },
      {
        productCode: 'PROJECT_FUND',
        productName: 'Project Fund',
        productDescription: 'Default Project Fund product for group savings',
        productType: 'SAVINGS'
      },
      {
        productCode: 'GENERAL_SAVINGS',
        productName: 'General Savings',
        productDescription: 'Default General Savings product for group savings',
        productType: 'SAVINGS'
      },
      {
        productCode: 'PROJECT_SAVINGS',
        productName: 'Project Savings',
        productDescription: 'Default Project Savings product for group savings',
        productType: 'SAVINGS'
      }
    ];

    for (const p of products) {
      try {
        // ✅ EXPLICITLY GENERATE AND SET PROD_ID BEFORE UPSERT TO BYPASS PRE-SAVE ISSUES
        let PROD_ID = await SavingsProduct.getNextProdId();
        if (!Number.isInteger(PROD_ID) || PROD_ID <= 0 || isNaN(PROD_ID)) {
          console.warn(`⚠️ Invalid PROD_ID for ${p.productCode}: ${PROD_ID}, using fallback 1000 + index`);
          PROD_ID = 1000 + products.indexOf(p) + 1;
        }

        const updateData = { 
          ...p, 
          PROD_ID: Number(PROD_ID),  // Explicitly set valid Number
          // Ensure required fields with defaults if missing
          CRNCY_ID: p.CRNCY_ID || 'NGN',
          BU_ID: p.BU_ID || ['100'],
          REC_ST: p.REC_ST || 'A',
          CREATED_BY: p.CREATED_BY || 'seed_script',
          interestRate: p.interestRate || mongoose.Types.Decimal128.fromString("0.00"),
          minimumBalance: p.minimumBalance || mongoose.Types.Decimal128.fromString("0.00")
        };

        const result = await SavingsProduct.findOneAndUpdate(
          { productCode: p.productCode }, 
          updateData,
          { upsert: true, new: true }
        );
        console.log(`✅ Upserted SavingsProduct: ${result.productCode} (PROD_ID: ${result.PROD_ID})`);
      } catch (upsertError) {
        console.error(`❌ Error upserting ${p.productCode}:`, upsertError);
      }
    }

    console.log('🎉 Seeding completed successfully');
  } catch (error) {
    console.error('❌ Error during seeding:', error);
  } finally {
    // Close connection
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
}

// Run the script
seedSavingsProducts();