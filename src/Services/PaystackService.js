// src/services/PaystackService.js
import axios from 'axios';
import logger from '../utils/logger.js';

class PaystackService {
  constructor() {
    this.secretKey = process.env.PAYSTACK_SECRET_KEY;
    this.publicKey = process.env.PAYSTACK_PUBLIC_KEY;
    this.baseURL = 'https://api.paystack.co';
    
    if (!this.secretKey) {
      logger.warn('⚠️ PAYSTACK_SECRET_KEY not set in environment variables');
    }
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Resolve/Verify account number - Validates receiver name
   * @param {string} accountNumber - The account number to verify
   * @param {string} bankCode - The bank code for the account
   */
  async resolveAccountNumber(accountNumber, bankCode) {
    try {
      if (!this.secretKey) {
        return {
          success: false,
          verified: false,
          message: 'Paystack secret key not configured'
        };
      }

      const response = await this.client.get('/bank/resolve', {
        params: {
          account_number: accountNumber,
          bank_code: bankCode,
        }
      });
      
      if (response.data.status) {
        const accountData = response.data.data;
        return {
          success: true,
          verified: true,
          accountNumber: accountData.account_number,
          accountName: accountData.account_name,
          bankCode: accountData.bank_code,
          bankName: accountData.bank_name,
          message: 'Account verified successfully'
        };
      }
      
      return {
        success: false,
        verified: false,
        message: response.data.message || 'Account verification failed'
      };
    } catch (error) {
      logger.error('Error resolving account:', error.response?.data || error.message);
      
      const errorMessage = error.response?.data?.message || 'Account verification failed';
      
      if (errorMessage.includes('Invalid account number')) {
        return {
          success: false,
          verified: false,
          message: 'Invalid account number. Please check and try again.'
        };
      }
      
      if (errorMessage.includes('Invalid bank code')) {
        return {
          success: false,
          verified: false,
          message: 'Invalid bank selected. Please select a valid bank.'
        };
      }
      
      return {
        success: false,
        verified: false,
        message: errorMessage
      };
    }
  }

 /**
 * Get Banks List
 * GET /api/transfers/banks
 */
async getBanks(req, res) {
  try {
    const { currency = 'NGN' } = req.query;
    
    if (!PAYSTACK_SECRET_KEY) {
      return res.status(400).json({
        success: false,
        message: 'Paystack secret key not configured. Please add PAYSTACK_SECRET_KEY to your .env file.',
        hint: 'Get your secret key from https://dashboard.paystack.com/#/settings/developer'
      });
    }

    console.log(`🔍 Fetching banks for currency: ${currency}`);
    
    const response = await axios.get(`${PAYSTACK_BASE_URL}/bank`, {
      params: { currency },
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000
    });
    
    if (response.data.status) {
      console.log(`✅ Retrieved ${response.data.data.length} banks`);
      return res.status(200).json({
        success: true,
        banks: response.data.data,
        message: `Retrieved ${response.data.data.length} banks`
      });
    }
    
    return res.status(400).json({
      success: false,
      message: response.data.message || 'Failed to fetch banks'
    });
  } catch (error) {
    console.error('❌ Error fetching banks:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Paystack secret key. Please check your configuration.'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: error.response?.data?.message || 'Failed to fetch banks'
    });
  }
}
}

// Export singleton instance
export default new PaystackService();