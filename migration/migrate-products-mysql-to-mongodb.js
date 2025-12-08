// cleanup-and-create-products.js
import mongoose from 'mongoose';
import Product from '../models/Product.js'; // Adjust path

const MONGODB_URI = 'mongodb://localhost:27017/your-database-name';

async function cleanupAndCreateProducts() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // 1. Delete all incomplete products
    console.log('🧹 Deleting incomplete products...');
    const deleteResult = await Product.deleteMany({
      $or: [
        { PROD_ID: { $exists: false } },
        { productCode: { $exists: false } },
        { name: { $exists: false } }
      ]
    });
    console.log(`✅ Deleted ${deleteResult.deletedCount} incomplete products`);
    
    // 2. Delete ALL products (uncomment if you want fresh start)
    // console.log('🧹 Deleting ALL products...');
    // await Product.deleteMany({});
    
    // 3. Create the 3 essential products
    console.log('📝 Creating essential products...');
    
    const essentialProducts = [
      {
        PROD_ID: 301,
        productCode: "IL301",
        PROD_CD: "IL301",
        name: "Individual Loan",
        PRODUCT_SHORT_NAME: "INDIVIDUAL",
        description: "Individual Loan Products",
        PRODUCT_TYPE: "INDIVIDUAL_LOAN",
        REPAYMENT_TYPE: "MONTHLY",
        CRNCY_ID: "NGN",
        allowedCurrencies: ["NGN"],
        BU_ID: Array.from({length: 29}, (_, i) => i + 1),
        isGlobalProduct: true,
        accessibleBUs: [1],
        visibility: "GLOBAL",
        minAmount: 100000.00,
        maxAmount: 1000000.00,
        minTerm: 1,
        maxTerm: 10,
        TERM_CD: "M",
        PAYMENT_FREQUENCY: "MONTHLY",
        MIN_LOAN_TERM_MONTHS: 1,
        MAX_LOAN_TERM_MONTHS: 10,
        MIN_DURATION_DAYS: 1,
        MIN_DURATION_WEEKS: 0,
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      },
      {
        PROD_ID: 310,
        productCode: "GLN310",
        PROD_CD: "GLN310",
        name: "Group Loan",
        PRODUCT_SHORT_NAME: "GROUPLOAN",
        description: "WLN- GROUP LOAN",
        PRODUCT_TYPE: "GROUP_LOAN",
        REPAYMENT_TYPE: "MONTHLY",
        CRNCY_ID: "NGN",
        allowedCurrencies: ["NGN"],
        BU_ID: Array.from({length: 29}, (_, i) => i + 1),
        isGlobalProduct: true,
        accessibleBUs: [1],
        visibility: "GLOBAL",
        minAmount: 500000.00,
        maxAmount: 1000000.00,
        minTerm: 1,
        maxTerm: 4,
        TERM_CD: "W",
        PAYMENT_FREQUENCY: "MONTHLY",
        MIN_LOAN_TERM_MONTHS: 1,
        MAX_LOAN_TERM_MONTHS: 4,
        MIN_DURATION_DAYS: 1,
        MIN_DURATION_WEEKS: 0,
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      },
      {
        PROD_ID: 313,
        productCode: "RCL313",
        PROD_CD: "RCL313",
        name: "Rapid Cash Loan",
        PRODUCT_SHORT_NAME: "RAPIDCASHL",
        description: "Rapid Cash for quick Loan",
        PRODUCT_TYPE: "RAPID_CASH_LOAN",
        REPAYMENT_TYPE: "MONTHLY",
        CRNCY_ID: "NGN",
        allowedCurrencies: ["NGN"],
        BU_ID: Array.from({length: 29}, (_, i) => i + 1),
        isGlobalProduct: true,
        accessibleBUs: [1],
        visibility: "GLOBAL",
        minAmount: 50000.00,
        maxAmount: 200000.00,
        minTerm: 1,
        maxTerm: 1,
        TERM_CD: "M",
        PAYMENT_FREQUENCY: "MONTHLY",
        MIN_LOAN_TERM_MONTHS: 1,
        MAX_LOAN_TERM_MONTHS: 1,
        MIN_DURATION_DAYS: 1,
        MIN_DURATION_WEEKS: 0,
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      }
    ];
    
    let createdCount = 0;
    for (const productData of essentialProducts) {
      try {
        // Check if product already exists
        const existing = await Product.findOne({ 
          $or: [
            { PROD_ID: productData.PROD_ID },
            { productCode: productData.productCode }
          ]
        });
        
        if (existing) {
          console.log(`⚠️ Product ${productData.productCode} already exists, updating...`);
          await Product.findByIdAndUpdate(existing._id, productData);
        } else {
          const product = new Product(productData);
          await product.save();
          createdCount++;
        }
        
        console.log(`✅ Processed: ${productData.name} (${productData.productCode})`);
      } catch (error) {
        console.error(`❌ Error with ${productData.productCode}:`, error.message);
      }
    }
    
    console.log(`\n📊 Created/Updated ${createdCount} products`);
    
    // 4. Verify
    const totalProducts = await Product.countDocuments();
    console.log(`📋 Total products in database: ${totalProducts}`);
    
    console.log('\n✅ Cleanup and product creation completed!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

cleanupAndCreateProducts();