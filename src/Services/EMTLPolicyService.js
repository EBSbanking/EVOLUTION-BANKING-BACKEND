// Services/EMTLPolicyService.js

import sequelize from '../../config/db.js';
import { QueryTypes } from 'sequelize';

class EMTLPolicyService {
  static async calculateEMTL(params) {
    const { amount, transactionType, customerSegment, sourceCustomer, destinationCustomer } = params;
    
    try {
      console.log(`🔍 Calculating EMTL for amount: ₦${amount}`);
      
      // Get active EMTL policies from emtl_policies table
      const policies = await sequelize.query(`
        SELECT * FROM emtl_policies
        WHERE is_active = TRUE
          AND min_amount <= :amount
          AND max_amount >= :amount
        ORDER BY min_amount ASC
        LIMIT 1
      `, {
        replacements: { amount },
        type: QueryTypes.SELECT
      });

      console.log(`📋 Found ${policies.length} EMTL policies for amount ${amount}`);

      if (policies.length === 0) {
        return {
          amount: 0,
          applicable: false,
          reason: 'No EMTL policy applies to this amount'
        };
      }

      const policy = policies[0];
      let levyAmount = 0;
      let applicable = false;

      if (policy.levy_type === 'FLAT') {
        levyAmount = parseFloat(policy.levy_value);
        applicable = true;
      } else if (policy.levy_type === 'PERCENTAGE') {
        levyAmount = (amount * parseFloat(policy.levy_value)) / 100;
        applicable = true;
      }

      const result = {
        amount: levyAmount,
        applicable: applicable,
        reason: `${policy.name}: ${policy.description}`,
        glAccount: '2401000001',
        beneficiary: 'FGN',
        policy: policy
      };

      console.log(`💰 EMTL Calculation result: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      console.error('❌ Error calculating EMTL:', error.message);
      return {
        amount: 0,
        applicable: false,
        reason: 'EMTL calculation error',
        error: error.message
      };
    }
  }

  static async getActivePolicies() {
    try {
      const policies = await sequelize.query(`
        SELECT * FROM emtl_policies
        WHERE is_active = TRUE
        ORDER BY min_amount ASC
      `, {
        type: QueryTypes.SELECT
      });
      return policies;
    } catch (error) {
      console.error('Error getting active policies:', error.message);
      return [];
    }
  }

  static async getPolicyByAmount(amount) {
    try {
      const [policy] = await sequelize.query(`
        SELECT * FROM emtl_policies
        WHERE is_active = TRUE
          AND min_amount <= :amount
          AND max_amount >= :amount
        ORDER BY min_amount ASC
        LIMIT 1
      `, {
        replacements: { amount },
        type: QueryTypes.SELECT
      });
      return policy;
    } catch (error) {
      console.error('Error getting policy by amount:', error.message);
      return null;
    }
  }
}

export default EMTLPolicyService;