// scripts/permission.js
import { initializeModels } from '../src/models/index.js';
import { syncPermissionsWithValidation } from '../src/constants/roleMapping.js';
import { PERMISSIONS, getAllPermissions } from '../src/constants/permissions.js';

async function syncAllPermissions() {
  try {
    console.log('Starting permission sync...');
    
    // Initialize models first
    console.log('Initializing models...');
    await initializeModels();
    console.log('Models initialized successfully');
    
    // Log available permission modules for debugging
    console.log('Available permission modules:', Object.keys(PERMISSIONS));
    
    // Log total permissions count
    const allPermissions = getAllPermissions();
    console.log(`Total permissions defined: ${allPermissions.length}`);
    
    // Now sync permissions
    await syncPermissionsWithValidation();
    console.log('Permission sync completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Permission sync failed:', error);
    process.exit(1);
  }
}

syncAllPermissions();