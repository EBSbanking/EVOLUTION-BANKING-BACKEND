// services/BankSyncService.js
import axios from 'axios';
import Bank from '../models/Banks.js';
import logger from '../utils/logger.js';

class BankSyncService {
  constructor() {
    this.baseURL = 'https://api.prembly.com';
    this.apiKey = process.env.PREMBLY_API_KEY || 'test_sk_9b1c2bafe7c3466fb0e433daab2ac87c';
    this.appId = process.env.PREMBLY_APP_ID; // You need to add your App ID to .env
  }

  /**
   * Fetch banks from Prembly API
   */
  async fetchBanksFromPrembly() {
    try {
      console.log('📡 Fetching banks from Prembly API...');
      
      const response = await axios.get(
        `${this.baseURL}/verification/bank_account/bank_code`,
        {
          headers: {
            'x-api-key': this.apiKey,
            'app-id': this.appId
          }
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
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Sync banks to database
   */
  async syncBanksToDatabase(banks = null) {
    let banksToSync = banks;
    
    if (!banksToSync) {
      banksToSync = await this.fetchBanksFromPrembly();
    }
    
    if (!banksToSync || banksToSync.length === 0) {
      console.log('⚠️ No banks to sync');
      return { created: 0, updated: 0, total: 0 };
    }
    
    console.log(`🔄 Syncing ${banksToSync.length} banks to database...`);
    
    let created = 0;
    let updated = 0;
    
    for (const premblyBank of banksToSync) {
      try {
        // Check if bank already exists
        const existingBank = await Bank.findOne({
          where: {
            [Op.or]: [
              { code: premblyBank.code },
              { long_code: premblyBank.longcode || premblyBank.code }
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
          console.log(`🔄 Updated bank: ${premblyBank.name} (${premblyBank.code})`);
        } else {
          // Get next ID
          const lastBank = await Bank.findOne({ order: [['id', 'DESC']] });
          const nextId = lastBank ? lastBank.id + 1 : 1;
          
          // Create new bank
          await Bank.create({
            id: nextId,
            ...bankData,
            created_at: new Date()
          });
          created++;
          console.log(`✅ Created bank: ${premblyBank.name} (${premblyBank.code})`);
        }
      } catch (error) {
        console.error(`❌ Error syncing bank ${premblyBank.name}:`, error.message);
      }
    }
    
    console.log(`✅ Sync complete: ${created} created, ${updated} updated, ${banksToSync.length} total`);
    
    return { created, updated, total: banksToSync.length };
  }

  /**
   * Get bank by code
   */
  async getBankByCode(code) {
    try {
      const bank = await Bank.findOne({
        where: { 
          code: code.toUpperCase(),
          status: 'ACTIVE'
        }
      });
      
      return bank;
    } catch (error) {
      console.error('Error getting bank by code:', error.message);
      return null;
    }
  }

  /**
   * Get bank by name
   */
  async getBankByName(name) {
    try {
      const bank = await Bank.findOne({
        where: { 
          name: { [Op.like]: `%${name}%` },
          status: 'ACTIVE'
        }
      });
      
      return bank;
    } catch (error) {
      console.error('Error getting bank by name:', error.message);
      return null;
    }
  }

  /**
   * Get all active banks
   */
  async getActiveBanks() {
    try {
      const banks = await Bank.findAll({
        where: { status: 'ACTIVE' },
        order: [['name', 'ASC']]
      });
      
      return banks;
    } catch (error) {
      console.error('Error getting active banks:', error.message);
      return [];
    }
  }

  /**
   * Validate bank code
   */
  async validateBankCode(code) {
    try {
      const bank = await Bank.findOne({
        where: { 
          code: code.toUpperCase(),
          status: 'ACTIVE'
        }
      });
      
      return {
        valid: !!bank,
        bank: bank
      };
    } catch (error) {
      console.error('Error validating bank code:', error.message);
      return { valid: false, bank: null };
    }
  }
}

export default new BankSyncService();