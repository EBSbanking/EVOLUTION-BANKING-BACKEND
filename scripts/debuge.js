// scripts/debugModels.js
import { initializeModels, getRole, getPermissions } from '../src/models/index.js';

async function debugModels() {
  try {
    console.log('Initializing models...');
    await initializeModels();
    
    // Try to get models using the getter functions
    const Role = getRole();
    const Permission = getPermissions(); // Note: plural, not singular
    
    console.log('Role model:', Role ? '✅ Available' : '❌ Not available');
    console.log('Permission model:', Permission ? '✅ Available' : '❌ Not available');
    
    if (Role) {
      console.log('Role methods:', Object.keys(Role).filter(key => typeof Role[key] === 'function'));
    }
    
    if (Permission) {
      console.log('Permission methods:', Object.keys(Permission).filter(key => typeof Permission[key] === 'function'));
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Debug failed:', error);
    process.exit(1);
  }
}

debugModels();