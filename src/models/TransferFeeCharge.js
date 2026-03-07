// src/models/TransferFeeCharge.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

export const FEE_TYPE = {
  FIXED: 'FIXED',
  PERCENTAGE: 'PERCENTAGE',
  TIERED: 'TIERED',
  SLAB: 'SLAB'
};

export const FEE_APPLICATION = {
  SENDER: 'SENDER',
  RECEIVER: 'RECEIVER',
  BOTH: 'BOTH',
  SHARED: 'SHARED'
};

export const CHARGE_BEARER = {
  SENDER: 'SENDER',
  RECEIVER: 'RECEIVER',
  SHARED: 'SHARED'
};

export const FEE_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  PENDING: 'PENDING'
};

export const FEE_FREQUENCY = {
  PER_TRANSACTION: 'PER_TRANSACTION',
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY'
};

class TransferFeeCharge extends Model {
  // Calculate fee based on amount and fee configuration
  calculateFee(amount, transferType = null, channel = null) {
    const feeAmount = parseFloat(amount) || 0;
    
    // Check if fee is active
    if (this.FEE_STATUS !== FEE_STATUS.ACTIVE) {
      return { fee: 0, message: 'Fee is not active' };
    }
    
    // Check if fee applies to this transfer type
    if (this.TRANSFER_TYPE && transferType && this.TRANSFER_TYPE !== transferType) {
      return { fee: 0, message: 'Fee does not apply to this transfer type' };
    }
    
    // Check if fee applies to this channel
    if (this.CHANNEL && channel && this.CHANNEL !== channel) {
      return { fee: 0, message: 'Fee does not apply to this channel' };
    }
    
    // Check minimum and maximum amount constraints
    if (this.MIN_AMOUNT && feeAmount < parseFloat(this.MIN_AMOUNT)) {
      return { fee: 0, message: 'Amount below minimum threshold' };
    }
    
    if (this.MAX_AMOUNT && feeAmount > parseFloat(this.MAX_AMOUNT)) {
      return { fee: 0, message: 'Amount above maximum threshold' };
    }
    
    let calculatedFee = 0;
    
    switch (this.FEE_TYPE) {
      case FEE_TYPE.FIXED:
        calculatedFee = parseFloat(this.FIXED_AMOUNT) || 0;
        break;
        
      case FEE_TYPE.PERCENTAGE:
        calculatedFee = (feeAmount * (parseFloat(this.PERCENTAGE_RATE) || 0)) / 100;
        
        // Apply min and max fee caps
        if (this.MIN_FEE && calculatedFee < parseFloat(this.MIN_FEE)) {
          calculatedFee = parseFloat(this.MIN_FEE);
        }
        if (this.MAX_FEE && calculatedFee > parseFloat(this.MAX_FEE)) {
          calculatedFee = parseFloat(this.MAX_FEE);
        }
        break;
        
      case FEE_TYPE.TIERED:
        calculatedFee = this.calculateTieredFee(feeAmount);
        break;
        
      case FEE_TYPE.SLAB:
        calculatedFee = this.calculateSlabFee(feeAmount);
        break;
        
      default:
        calculatedFee = 0;
    }
    
    // Apply cap if exists
    if (this.CAP_AMOUNT && calculatedFee > parseFloat(this.CAP_AMOUNT)) {
      calculatedFee = parseFloat(this.CAP_AMOUNT);
    }
    
    // Apply floor if exists
    if (this.FLOOR_AMOUNT && calculatedFee < parseFloat(this.FLOOR_AMOUNT)) {
      calculatedFee = parseFloat(this.FLOOR_AMOUNT);
    }
    
    // Apply rounding
    if (this.ROUNDING_DECIMALS !== null && this.ROUNDING_DECIMALS !== undefined) {
      calculatedFee = Number(calculatedFee.toFixed(this.ROUNDING_DECIMALS));
    }
    
    return {
      fee: calculatedFee,
      feeId: this.FEE_ID,
      feeCode: this.FEE_CODE,
      feeName: this.FEE_NAME,
      feeType: this.FEE_TYPE,
      chargeBearer: this.CHARGE_BEARER,
      vatApplicable: this.VAT_APPLICABLE,
      vatRate: this.VAT_RATE,
      breakdown: this.getFeeBreakdown(calculatedFee, feeAmount)
    };
  }
  
  // Calculate tiered fee (different rates for different tiers)
  calculateTieredFee(amount) {
    if (!this.TIER_CONFIG) return 0;
    
    try {
      const tiers = typeof this.TIER_CONFIG === 'string' 
        ? JSON.parse(this.TIER_CONFIG) 
        : this.TIER_CONFIG;
      
      if (!Array.isArray(tiers)) return 0;
      
      // Sort tiers by minAmount
      const sortedTiers = tiers.sort((a, b) => a.minAmount - b.minAmount);
      
      for (const tier of sortedTiers) {
        if (amount >= tier.minAmount && amount <= tier.maxAmount) {
          if (tier.type === 'FIXED') {
            return tier.amount;
          } else if (tier.type === 'PERCENTAGE') {
            const fee = (amount * tier.rate) / 100;
            return Math.min(Math.max(fee, tier.minFee || 0), tier.maxFee || Infinity);
          }
        }
      }
      
      // Default to last tier
      const lastTier = sortedTiers[sortedTiers.length - 1];
      if (lastTier && amount > lastTier.maxAmount) {
        if (lastTier.type === 'FIXED') {
          return lastTier.amount;
        } else if (lastTier.type === 'PERCENTAGE') {
          const fee = (amount * lastTier.rate) / 100;
          return Math.min(Math.max(fee, lastTier.minFee || 0), lastTier.maxFee || Infinity);
        }
      }
      
      return 0;
    } catch (error) {
      console.error('Error calculating tiered fee:', error);
      return 0;
    }
  }
  
  // Calculate slab fee (flat fee for amount slabs)
  calculateSlabFee(amount) {
    if (!this.SLAB_CONFIG) return 0;
    
    try {
      const slabs = typeof this.SLAB_CONFIG === 'string' 
        ? JSON.parse(this.SLAB_CONFIG) 
        : this.SLAB_CONFIG;
      
      if (!Array.isArray(slabs)) return 0;
      
      // Sort slabs by minAmount
      const sortedSlabs = slabs.sort((a, b) => a.minAmount - b.minAmount);
      
      for (const slab of sortedSlabs) {
        if (amount >= slab.minAmount && amount <= slab.maxAmount) {
          return slab.fee;
        }
      }
      
      // Default to last slab
      const lastSlab = sortedSlabs[sortedSlabs.length - 1];
      if (lastSlab && amount > lastSlab.maxAmount) {
        return lastSlab.fee;
      }
      
      return 0;
    } catch (error) {
      console.error('Error calculating slab fee:', error);
      return 0;
    }
  }
  
  // Get fee breakdown (including VAT if applicable)
  getFeeBreakdown(fee, amount) {
    const breakdown = {
      baseFee: fee,
      vat: 0,
      total: fee
    };
    
    if (this.VAT_APPLICABLE && this.VAT_RATE) {
      breakdown.vat = (fee * parseFloat(this.VAT_RATE)) / 100;
      breakdown.total = fee + breakdown.vat;
    }
    
    return breakdown;
  }
  
  // Get fee summary
  getSummary() {
    return {
      feeId: this.FEE_ID,
      feeCode: this.FEE_CODE,
      feeName: this.FEE_NAME,
      feeType: this.FEE_TYPE,
      chargeBearer: this.CHARGE_BEARER,
      minAmount: this.MIN_AMOUNT,
      maxAmount: this.MAX_AMOUNT,
      minFee: this.MIN_FEE,
      maxFee: this.MAX_FEE,
      capAmount: this.CAP_AMOUNT,
      floorAmount: this.FLOOR_AMOUNT,
      vatApplicable: this.VAT_APPLICABLE,
      vatRate: this.VAT_RATE,
      status: this.FEE_STATUS,
      frequency: this.FEE_FREQUENCY
    };
  }
  
  // Static method to find applicable fee
  static async findApplicableFee(amount, transferType, channel, currencyId = null, customerTier = null) {
    const whereClause = {
      FEE_STATUS: FEE_STATUS.ACTIVE
    };
    
    // Add optional filters
    if (transferType) whereClause.TRANSFER_TYPE = transferType;
    if (channel) whereClause.CHANNEL = channel;
    if (currencyId) whereClause.CURRENCY_ID = currencyId;
    if (customerTier) whereClause.CUSTOMER_TIER = customerTier;
    
    // Find all applicable fees
    const fees = await this.findAll({
      where: whereClause,
      order: [['PRIORITY', 'ASC']]
    });
    
    // Calculate and return the first applicable fee
    for (const fee of fees) {
      const result = fee.calculateFee(amount, transferType, channel);
      if (result.fee > 0) {
        return result;
      }
    }
    
    return { fee: 0, message: 'No applicable fee found' };
  }
  
  // Static method to find multiple applicable fees (for combined charges)
  static async findAllApplicableFees(amount, transferType, channel, currencyId = null, customerTier = null) {
    const whereClause = {
      FEE_STATUS: FEE_STATUS.ACTIVE
    };
    
    if (transferType) whereClause.TRANSFER_TYPE = transferType;
    if (channel) whereClause.CHANNEL = channel;
    if (currencyId) whereClause.CURRENCY_ID = currencyId;
    if (customerTier) whereClause.CUSTOMER_TIER = customerTier;
    
    const fees = await this.findAll({
      where: whereClause,
      order: [['PRIORITY', 'ASC']]
    });
    
    const results = [];
    for (const fee of fees) {
      const result = fee.calculateFee(amount, transferType, channel);
      if (result.fee > 0) {
        results.push(result);
      }
    }
    
    return results;
  }
}

TransferFeeCharge.init({
  FEE_ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    field: 'f_e_e__i_d'
  },
  FEE_CODE: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'f_e_e__c_o_d_e'
  },
  FEE_NAME: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'f_e_e__n_a_m_e'
  },
  FEE_DESCRIPTION: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'f_e_e__d_e_s_c_r_i_p_t_i_o_n'
  },
  FEE_TYPE: {
    type: DataTypes.ENUM(Object.values(FEE_TYPE)),
    allowNull: false,
    field: 'f_e_e__t_y_p_e'
  },
  FIXED_AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'f_i_x_e_d__a_m_o_u_n_t'
  },
  PERCENTAGE_RATE: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: true,
    field: 'p_e_r_c_e_n_t_a_g_e__r_a_t_e'
  },
  MIN_AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'm_i_n__a_m_o_u_n_t',
    comment: 'Minimum transaction amount for this fee to apply'
  },
  MAX_AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'm_a_x__a_m_o_u_n_t',
    comment: 'Maximum transaction amount for this fee to apply'
  },
  MIN_FEE: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'm_i_n__f_e_e',
    comment: 'Minimum fee amount (for percentage fees)'
  },
  MAX_FEE: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'm_a_x__f_e_e',
    comment: 'Maximum fee amount (for percentage fees)'
  },
  CAP_AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'c_a_p__a_m_o_u_n_t',
    comment: 'Absolute cap on fee amount'
  },
  FLOOR_AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'f_l_o_o_r__a_m_o_u_n_t',
    comment: 'Absolute floor on fee amount'
  },
  ROUNDING_DECIMALS: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 2,
    field: 'r_o_u_n_d_i_n_g__d_e_c_i_m_a_l_s'
  },
  TIER_CONFIG: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 't_i_e_r__c_o_n_f_i_g',
    comment: 'JSON configuration for tiered fees'
  },
  SLAB_CONFIG: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 's_l_a_b__c_o_n_f_i_g',
    comment: 'JSON configuration for slab fees'
  },
  CHARGE_BEARER: {
    type: DataTypes.ENUM(Object.values(CHARGE_BEARER)),
    allowNull: false,
    defaultValue: CHARGE_BEARER.SENDER,
    field: 'c_h_a_r_g_e__b_e_a_r_e_r'
  },
  FEE_APPLICATION: {
    type: DataTypes.ENUM(Object.values(FEE_APPLICATION)),
    allowNull: false,
    defaultValue: FEE_APPLICATION.SENDER,
    field: 'f_e_e__a_p_p_l_i_c_a_t_i_o_n'
  },
  VAT_APPLICABLE: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'v_a_t__a_p_p_l_i_c_a_b_l_e'
  },
  VAT_RATE: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'v_a_t__r_a_t_e'
  },
  TRANSFER_TYPE: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 't_r_a_n_s_f_e_r__t_y_p_e',
    comment: 'e.g., LOCAL, INTERNATIONAL, NIP, SWIFT'
  },
  CHANNEL: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'c_h_a_n_n_e_l',
    comment: 'e.g., WEB, MOBILE, USSD, BRANCH, API'
  },
  CURRENCY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'c_u_r_r_e_n_c_y__i_d'
  },
  CUSTOMER_TIER: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'c_u_s_t_o_m_e_r__t_i_e_r',
    comment: 'e.g., BASIC, PREMIUM, CORPORATE'
  },
  PRIORITY: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'p_r_i_o_r_i_t_y',
    comment: 'Lower number = higher priority'
  },
  FEE_FREQUENCY: {
    type: DataTypes.ENUM(Object.values(FEE_FREQUENCY)),
    allowNull: false,
    defaultValue: FEE_FREQUENCY.PER_TRANSACTION,
    field: 'f_e_e__f_r_e_q_u_e_n_c_y'
  },
  DAILY_LIMIT: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'd_a_i_l_y__l_i_m_i_t'
  },
  WEEKLY_LIMIT: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'w_e_e_k_l_y__l_i_m_i_t'
  },
  MONTHLY_LIMIT: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'm_o_n_t_h_l_y__l_i_m_i_t'
  },
  EFFECTIVE_FROM: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'e_f_f_e_c_t_i_v_e__f_r_o_m'
  },
  EFFECTIVE_TO: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'e_f_f_e_c_t_i_v_e__t_o'
  },
  FEE_STATUS: {
    type: DataTypes.ENUM(Object.values(FEE_STATUS)),
    allowNull: false,
    defaultValue: FEE_STATUS.ACTIVE,
    field: 'f_e_e__s_t_a_t_u_s'
  },
  CREATED_BY: {
    type: DataTypes.STRING(24),
    allowNull: false,
    field: 'c_r_e_a_t_e_d__b_y'
  },
  CREATED_DATE: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'c_r_e_a_t_e_d__d_a_t_e'
  },
  MODIFIED_BY: {
    type: DataTypes.STRING(24),
    allowNull: true,
    field: 'm_o_d_i_f_i_e_d__b_y'
  },
  MODIFIED_DATE: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'm_o_d_i_f_i_e_d__d_a_t_e'
  }
}, {
  sequelize,
  modelName: 'TransferFeeCharge',
  tableName: 'TRANSFER_FEE_CHARGES',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['FEE_CODE']
    },
    {
      fields: ['FEE_STATUS']
    },
    {
      fields: ['TRANSFER_TYPE', 'CHANNEL', 'CURRENCY_ID']
    }
  ]
});

export default TransferFeeCharge;