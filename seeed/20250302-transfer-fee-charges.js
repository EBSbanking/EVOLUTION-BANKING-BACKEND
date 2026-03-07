// seeds/20250302-transfer-fee-charges.js
import TransferFeeCharge, { 
  FEE_TYPE, 
  CHARGE_BEARER, 
  FEE_STATUS,
  FEE_FREQUENCY 
} from '../src/models/TransferFeeCharge.js';
import sequelize from '../config/db.js';

const sampleFees = [
  {
    FEE_CODE: 'NIP_TRANSFER_FEE',
    FEE_NAME: 'NIP Transfer Fee',
    FEE_DESCRIPTION: 'Standard fee for NIP transfers via web',
    FEE_TYPE: FEE_TYPE.FIXED,
    FIXED_AMOUNT: 52.50,
    TRANSFER_TYPE: 'NIP',
    CHANNEL: 'WEB',
    CHARGE_BEARER: CHARGE_BEARER.SENDER,
    VAT_APPLICABLE: true,
    VAT_RATE: 7.5,
    PRIORITY: 1,
    FEE_FREQUENCY: FEE_FREQUENCY.PER_TRANSACTION,
    EFFECTIVE_FROM: new Date(),
    FEE_STATUS: FEE_STATUS.ACTIVE,
    CREATED_BY: 'SYSTEM'
  },
  {
    FEE_CODE: 'NIP_MOBILE_FEE',
    FEE_NAME: 'NIP Mobile Transfer Fee',
    FEE_DESCRIPTION: 'Fee for NIP transfers via mobile app',
    FEE_TYPE: FEE_TYPE.FIXED,
    FIXED_AMOUNT: 26.25,
    TRANSFER_TYPE: 'NIP',
    CHANNEL: 'MOBILE',
    CHARGE_BEARER: CHARGE_BEARER.SENDER,
    VAT_APPLICABLE: true,
    VAT_RATE: 7.5,
    PRIORITY: 1,
    FEE_FREQUENCY: FEE_FREQUENCY.PER_TRANSACTION,
    EFFECTIVE_FROM: new Date(),
    FEE_STATUS: FEE_STATUS.ACTIVE,
    CREATED_BY: 'SYSTEM'
  },
  {
    FEE_CODE: 'LOCAL_TRANSFER_PERCENTAGE',
    FEE_NAME: 'Local Transfer Fee',
    FEE_DESCRIPTION: 'Percentage-based fee for local transfers',
    FEE_TYPE: FEE_TYPE.PERCENTAGE,
    PERCENTAGE_RATE: 0.5,
    MIN_FEE: 50,
    MAX_FEE: 1000,
    TRANSFER_TYPE: 'LOCAL',
    CHANNEL: 'MOBILE',
    CHARGE_BEARER: CHARGE_BEARER.SENDER,
    VAT_APPLICABLE: true,
    VAT_RATE: 7.5,
    PRIORITY: 2,
    FEE_FREQUENCY: FEE_FREQUENCY.PER_TRANSACTION,
    EFFECTIVE_FROM: new Date(),
    FEE_STATUS: FEE_STATUS.ACTIVE,
    CREATED_BY: 'SYSTEM'
  },
  {
    FEE_CODE: 'INTERNATIONAL_TRANSFER',
    FEE_NAME: 'International Transfer Fee',
    FEE_DESCRIPTION: 'Tiered fee structure for international transfers',
    FEE_TYPE: FEE_TYPE.TIERED,
    TIER_CONFIG: JSON.stringify([
      { minAmount: 0, maxAmount: 1000, type: 'FIXED', amount: 10 },
      { minAmount: 1000.01, maxAmount: 5000, type: 'PERCENTAGE', rate: 1, minFee: 20, maxFee: 100 },
      { minAmount: 5000.01, maxAmount: 1000000, type: 'PERCENTAGE', rate: 0.5, minFee: 50, maxFee: 500 }
    ]),
    TRANSFER_TYPE: 'INTERNATIONAL',
    CHANNEL: 'BRANCH',
    CHARGE_BEARER: CHARGE_BEARER.SHARED,
    VAT_APPLICABLE: true,
    VAT_RATE: 7.5,
    PRIORITY: 1,
    FEE_FREQUENCY: FEE_FREQUENCY.PER_TRANSACTION,
    EFFECTIVE_FROM: new Date(),
    FEE_STATUS: FEE_STATUS.ACTIVE,
    CREATED_BY: 'SYSTEM'
  },
  {
    FEE_CODE: 'USSD_TRANSFER',
    FEE_NAME: 'USSD Transfer Fee',
    FEE_DESCRIPTION: 'Slab-based fee for USSD transfers',
    FEE_TYPE: FEE_TYPE.SLAB,
    SLAB_CONFIG: JSON.stringify([
      { minAmount: 0, maxAmount: 5000, fee: 25 },
      { minAmount: 5000.01, maxAmount: 20000, fee: 50 },
      { minAmount: 20000.01, maxAmount: 50000, fee: 75 },
      { minAmount: 50000.01, maxAmount: 1000000, fee: 100 }
    ]),
    TRANSFER_TYPE: 'LOCAL',
    CHANNEL: 'USSD',
    CHARGE_BEARER: CHARGE_BEARER.SENDER,
    VAT_APPLICABLE: true,
    VAT_RATE: 7.5,
    PRIORITY: 3,
    FEE_FREQUENCY: FEE_FREQUENCY.PER_TRANSACTION,
    EFFECTIVE_FROM: new Date(),
    FEE_STATUS: FEE_STATUS.ACTIVE,
    CREATED_BY: 'SYSTEM'
  },
  {
    FEE_CODE: 'NIP_BRANCH_FEE',
    FEE_NAME: 'NIP Branch Transfer Fee',
    FEE_DESCRIPTION: 'Fee for NIP transfers at branch',
    FEE_TYPE: FEE_TYPE.FIXED,
    FIXED_AMOUNT: 105.00,
    TRANSFER_TYPE: 'NIP',
    CHANNEL: 'BRANCH',
    CHARGE_BEARER: CHARGE_BEARER.SENDER,
    VAT_APPLICABLE: true,
    VAT_RATE: 7.5,
    PRIORITY: 1,
    FEE_FREQUENCY: FEE_FREQUENCY.PER_TRANSACTION,
    EFFECTIVE_FROM: new Date(),
    FEE_STATUS: FEE_STATUS.ACTIVE,
    CREATED_BY: 'SYSTEM'
  },
  {
    FEE_CODE: 'LOCAL_API_FEE',
    FEE_NAME: 'Local API Transfer Fee',
    FEE_DESCRIPTION: 'Fee for local transfers via API',
    FEE_TYPE: FEE_TYPE.FIXED,
    FIXED_AMOUNT: 10.50,
    TRANSFER_TYPE: 'LOCAL',
    CHANNEL: 'API',
    CHARGE_BEARER: CHARGE_BEARER.SENDER,
    VAT_APPLICABLE: true,
    VAT_RATE: 7.5,
    PRIORITY: 1,
    FEE_FREQUENCY: FEE_FREQUENCY.PER_TRANSACTION,
    EFFECTIVE_FROM: new Date(),
    FEE_STATUS: FEE_STATUS.ACTIVE,
    CREATED_BY: 'SYSTEM'
  }
];

export async function up() {
  const transaction = await sequelize.transaction();
  
  try {
    console.log('🌱 Seeding transfer fee configurations...');
    
    for (const fee of sampleFees) {
      await TransferFeeCharge.findOrCreate({
        where: { FEE_CODE: fee.FEE_CODE },
        defaults: {
          ...fee,
          CREATED_DATE: new Date()
        },
        transaction
      });
    }
    
    await transaction.commit();
    console.log('✅ Transfer fee seeding completed successfully');
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error seeding transfer fees:', error);
    throw error;
  }
}

export async function down() {
  const transaction = await sequelize.transaction();
  
  try {
    console.log('🗑️  Removing seeded transfer fees...');
    
    const feeCodes = sampleFees.map(fee => fee.FEE_CODE);
    await TransferFeeCharge.destroy({
      where: { FEE_CODE: feeCodes },
      transaction
    });
    
    await transaction.commit();
    console.log('✅ Transfer fees removed successfully');
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error removing transfer fees:', error);
    throw error;
  }
}
