// scripts/setupAssociations.js - CORRECTED VERSION
console.log('🔗 Starting setupAssociations.js...');

// First, let's debug the import
try {
  // Use dynamic import to see the exact error
  console.log('📦 Trying to import from ../src/models/index.js...');
  const modelsModule = await import('../src/models/index.js');
  console.log('✅ Import successful!');
  
  const { initializeModels, getSequelize } = modelsModule;
  
  console.log('🔄 Initializing models...');
  const models = await initializeModels();
  
  if (!models) {
    throw new Error('Failed to initialize models');
  }
  
  console.log('✅ Models initialized');
  
  const sequelize = getSequelize();
  if (!sequelize) {
    throw new Error('Sequelize instance not available');
  }
  
  // Test connection
  await sequelize.authenticate();
  console.log('✅ Database connection verified');
  
  // Sync all models
  console.log('🔄 Syncing models with database...');
  await sequelize.sync({ alter: true });
  console.log('✅ All models synced');
  
  console.log('\n🎉 Setup complete!');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('Stack:', error.stack);
}