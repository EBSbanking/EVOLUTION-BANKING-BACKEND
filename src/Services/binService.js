// services/binService.js
import { sequelize } from '../../config/db.js';
import BINMapping from '../models/BINMapping.js';
import { getModel } from '../models/index.js';

class BINService {
  /**
   * Get BIN mapping by BIN
   */
  async getBINMapping(bin, transaction = null) {
    try {
      // Try exact match first
      let mapping = await BINMapping.findOne({
        where: { bin: bin, is_active: true },
        transaction
      });

      // If not found, try by bank_bin or prepaid_bin
      if (!mapping) {
        mapping = await BINMapping.findOne({
          where: {
            [sequelize.Op.or]: [
              { bank_bin: bin },
              { prepaid_bin: bin }
            ],
            is_active: true
          },
          transaction
        });
      }

      return mapping;
    } catch (error) {
      console.error('Error getting BIN mapping:', error);
      throw error;
    }
  }

  /**
   * Get BIN mapping with fallback (for card generation)
   */
  async getBINMappingWithFallback(binInput, transaction = null) {
    try {
      const mapping = await this.getBINMapping(binInput, transaction);
      
      if (mapping) return mapping;

      // Try to extract BIN from card number
      const extractedBin = this.extractBINFromCardNumber(binInput);
      if (extractedBin && extractedBin !== binInput) {
        return await this.getBINMapping(extractedBin, transaction);
      }

      // Return default mapping if configured
      return await this.getDefaultBINMapping(transaction);
    } catch (error) {
      console.error('Error getting BIN mapping with fallback:', error);
      return null;
    }
  }

  /**
   * Extract BIN from card number (first 6 digits)
   */
  extractBINFromCardNumber(cardNumber) {
    if (!cardNumber) return null;
    const clean = cardNumber.replace(/\s/g, '');
    return clean.substring(0, 6);
  }

  /**
   * Get default BIN mapping
   */
  async getDefaultBINMapping(transaction = null) {
    try {
      return await BINMapping.findOne({
        where: { is_default: true, is_active: true },
        transaction
      });
    } catch (error) {
      console.error('Error getting default BIN mapping:', error);
      return null;
    }
  }

  /**
   * Validate card with BIN
   */
  async validateCardWithBIN(cardNumber, amount = 0, transaction = null) {
    try {
      const bin = this.extractBINFromCardNumber(cardNumber);
      if (!bin) {
        return { valid: false, error: 'Invalid card number' };
      }

      const mapping = await this.getBINMappingWithFallback(bin, transaction);
      
      if (!mapping) {
        return { 
          valid: false, 
          error: 'BIN not supported',
          bin: bin 
        };
      }

      return {
        valid: true,
        mapping: mapping,
        bin: bin,
        bank_name: mapping.bank_name,
        card_scheme: mapping.card_scheme,
        card_type: mapping.card_type,
        is_prepaid: mapping.is_prepaid,
        bank_bin: mapping.bank_bin,
        prepaid_bin: mapping.prepaid_bin
      };
    } catch (error) {
      console.error('Error validating card with BIN:', error);
      return { valid: false, error: error.message };
    }
  }

  /**
   * Create or update BIN mapping
   */
  async upsertBINMapping(data, transaction = null) {
    try {
      // Check if BIN exists
      const existing = await BINMapping.findOne({
        where: { bin: data.bin },
        transaction
      });

      if (existing) {
        // Update existing
        await existing.update(data, { transaction });
        return existing;
      } else {
        // Create new
        return await BINMapping.create(data, { transaction });
      }
    } catch (error) {
      console.error('Error upserting BIN mapping:', error);
      throw error;
    }
  }

  /**
   * Get all active BINs
   */
  async getAllActiveBINs(transaction = null) {
    try {
      return await BINMapping.findAll({
        where: { is_active: true },
        order: [['bank_name', 'ASC']],
        transaction
      });
    } catch (error) {
      console.error('Error getting active BINs:', error);
      throw error;
    }
  }

  /**
   * Get BINs by bank name
   */
  async getBINsByBank(bankName, transaction = null) {
    try {
      return await BINMapping.findAll({
        where: { 
          bank_name: {
            [sequelize.Op.iLike]: `%${bankName}%`
          },
          is_active: true 
        },
        transaction
      });
    } catch (error) {
      console.error('Error getting BINs by bank:', error);
      throw error;
    }
  }

  /**
   * Get BINs by card scheme
   */
  async getBINsByScheme(scheme, transaction = null) {
    try {
      return await BINMapping.findAll({
        where: { 
          card_scheme: scheme.toUpperCase(),
          is_active: true 
        },
        transaction
      });
    } catch (error) {
      console.error('Error getting BINs by scheme:', error);
      throw error;
    }
  }

  /**
   * Get prepaid BINs
   */
  async getPrepaidBINs(transaction = null) {
    try {
      return await BINMapping.findAll({
        where: { 
          is_prepaid: true,
          is_active: true 
        },
        transaction
      });
    } catch (error) {
      console.error('Error getting prepaid BINs:', error);
      throw error;
    }
  }

  /**
   * Check if BIN is prepaid
   */
  async isPrepaidBIN(bin, transaction = null) {
    try {
      const mapping = await this.getBINMapping(bin, transaction);
      return mapping ? mapping.is_prepaid : false;
    } catch (error) {
      console.error('Error checking prepaid BIN:', error);
      return false;
    }
  }
}

export default new BINService();