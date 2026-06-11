// utils/initBanks.js
import { Op } from 'sequelize';
import Bank from '../models/Banks.js';
import axios from 'axios';
import logger from './logger.js';

// Prembly API configuration
const PREMBLY_API_KEY = process.env.PREMBLY_API_KEY || 'test_sk_9b1c2bafe7c3466fb0e433daab2ac87c';
const PREMBLY_APP_ID = process.env.PREMBLY_APP_ID;

/**
 * Fetch banks from Prembly API
 */
async function fetchBanksFromPrembly() {
  if (!PREMBLY_APP_ID) {
    console.warn('⚠️ Prembly App ID not configured. Skipping bank sync.');
    return null;
  }

  try {
    console.log('📡 Fetching banks from Prembly API...');
    
    const response = await axios.get(
      'https://api.prembly.com/verification/bank_account/bank_code',
      {
        headers: {
          'x-api-key': PREMBLY_API_KEY,
          'app-id': PREMBLY_APP_ID
        },
        timeout: 30000
      }
    );

    if (response.data.status === true && response.data.data) {
      console.log(`✅ Fetched ${response.data.data.length} banks from Prembly`);
      return response.data.data;
    } else {
      throw new Error(response.data.message || 'Failed to fetch banks');
    }
  } catch (error) {
    console.error('❌ Error fetching banks from Prembly:', error.message);
    if (error.response?.status === 401) {
      console.error('   Authentication failed. Please check your Prembly API key and App ID.');
    }
    return null;
  }
}

/**
 * Sync banks to database
 */
async function syncBanksToDatabase(banks) {
  if (!banks || banks.length === 0) {
    console.log('⚠️ No banks to sync');
    return { created: 0, updated: 0, total: 0 };
  }
  
  console.log(`🔄 Syncing ${banks.length} banks to database...`);
  
  let created = 0;
  let updated = 0;
  let skipped = 0;
  
  for (const premblyBank of banks) {
    try {
      // Check if bank already exists
      const existingBank = await Bank.findOne({
        where: {
          [Op.or]: [
            { code: premblyBank.code },
            { prembly_id: premblyBank.id }
          ]
        }
      });
      
      const bankData = {
        name: premblyBank.name,
        code: premblyBank.code,
        long_code: premblyBank.longcode || premblyBank.code,
        country: premblyBank.country || 'NG',
        currency: premblyBank.currency || 'NGN',
        status: premblyBank.active ? 'ACTIVE' : 'INACTIVE',
        slug: premblyBank.slug,
        type: premblyBank.type || 'nuban',
        gateway: premblyBank.gateway || null,
        pay_with_bank: premblyBank.pay_with_bank || false,
        supports_transfer: premblyBank.supports_transfer !== undefined ? premblyBank.supports_transfer : true,
        available_for_direct_debit: premblyBank.available_for_direct_debit || false,
        prembly_id: premblyBank.id,
        updated_at: new Date()
      };
      
      if (existingBank) {
        // Update existing bank
        await Bank.update(bankData, {
          where: { id: existingBank.id }
        });
        updated++;
        if (process.env.NODE_ENV !== 'production') {
          console.log(`🔄 Updated bank: ${premblyBank.name} (${premblyBank.code})`);
        }
      } else {
        // Create new bank
        const lastBank = await Bank.findOne({ order: [['id', 'DESC']] });
        const nextId = lastBank ? lastBank.id + 1 : 1;
        
        await Bank.create({
          id: nextId,
          ...bankData,
          created_at: new Date()
        });
        created++;
        console.log(`✅ Created bank: ${premblyBank.name} (${premblyBank.code})`);
      }
    } catch (bankError) {
      console.error(`❌ Error syncing bank ${premblyBank.name}:`, bankError.message);
      skipped++;
    }
  }
  
  console.log(`✅ Sync complete: ${created} created, ${updated} updated, ${skipped} skipped (${banks.length} total)`);
  
  return { created, updated, skipped, total: banks.length };
}

/**
 * Get active banks from database
 */
async function getActiveBanks() {
  try {
    const banks = await Bank.findAll({
      where: { status: 'ACTIVE' },
      order: [['name', 'ASC']],
      attributes: ['id', 'name', 'code', 'long_code', 'currency', 'type'],
      raw: true
    });
    return banks;
  } catch (error) {
    console.error('Error getting active banks:', error.message);
    return [];
  }
}

/**
 * Get last update time
 */
async function getLastUpdateTime() {
  try {
    const lastBank = await Bank.findOne({
      order: [['updated_at', 'DESC']],
      attributes: ['updated_at']
    });
    return lastBank ? lastBank.updated_at : null;
  } catch (error) {
    console.error('Error getting last update time:', error.message);
    return null;
  }
}

/**
 * Initialize banks on server startup
 */
export async function initializeBanks() {
  try {
    console.log('🏦 Checking bank data...');
    
    if (!PREMBLY_APP_ID) {
      console.warn('⚠️ PREMBLY_APP_ID not configured in environment variables.');
      console.warn('   Bank sync will be skipped. Set PREMBLY_APP_ID to enable bank sync.');
      return { success: false, message: 'Prembly not configured' };
    }
    
    const activeBanks = await getActiveBanks();
    
    if (activeBanks.length === 0) {
      console.log('📡 No banks found in database. Syncing from Prembly...');
      const premblyBanks = await fetchBanksFromPrembly();
      if (premblyBanks) {
        const result = await syncBanksToDatabase(premblyBanks);
        console.log(`✅ Bank initialization complete: ${result.created} created, ${result.updated} updated`);
        return result;
      } else {
        console.log('⚠️ Could not fetch banks from Prembly. Database remains empty.');
        return { success: false, message: 'Failed to fetch banks' };
      }
    } else {
      console.log(`✅ ${activeBanks.length} banks already in database`);
      
      // Check if we need to update (once a day)
      const lastUpdate = await getLastUpdateTime();
      const hoursSinceUpdate = lastUpdate ? (Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60) : 24;
      
      if (hoursSinceUpdate > 24) {
        console.log(`🔄 Banks data is ${Math.floor(hoursSinceUpdate)} hours old. Syncing updates...`);
        const premblyBanks = await fetchBanksFromPrembly();
        if (premblyBanks) {
          const result = await syncBanksToDatabase(premblyBanks);
          console.log(`✅ Bank sync complete: ${result.created} created, ${result.updated} updated`);
          return result;
        }
      } else {
        console.log(`✅ Banks data is current (${Math.floor(hoursSinceUpdate)} hours old). No sync needed.`);
      }
      
      return { success: true, message: 'Banks already initialized', count: activeBanks.length };
    }
  } catch (error) {
    console.error('❌ Failed to initialize banks:', error.message);
    // Don't throw - allow server to start even if bank sync fails
    return { success: false, message: error.message };
  }
}

// Export individual functions for use in routes
export default {
  initializeBanks,
  fetchBanksFromPrembly,
  syncBanksToDatabase,
  getActiveBanks,
  getLastUpdateTime
};