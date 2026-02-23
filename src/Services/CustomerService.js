// src/services/CustomerService.js
import Customer from '../models/Customer.js';
import LoanAccount from '../models/LoanAccount.js';

export class CustomerService {
  
  // Get customer with BVN
  static async getCustomerWithBVN(customerId) {
    try {
      const customer = await Customer.findByPk(customerId, {
        attributes: ['id', 'CUST_ID', 'FIRST_NAME', 'LAST_NAME', 'BVN', 'BVN_VERIFIED', 'PHONE_NO', 'EMAIL_ADDRESS']
      });
      
      if (!customer) {
        throw new Error('Customer not found');
      }
      
      return {
        success: true,
        data: customer
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get loan with customer details
  static async getLoanWithCustomerDetails(loanId) {
    try {
      const loan = await LoanAccount.findByPk(loanId, {
        include: [{
          model: Customer,
          as: 'customer',
          attributes: ['id', 'CUST_ID', 'FIRST_NAME', 'LAST_NAME', 'BVN', 'BVN_VERIFIED', 'PHONE_NO']
        }]
      });
      
      if (!loan) {
        throw new Error('Loan not found');
      }
      
      return {
        success: true,
        data: loan
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Check if customer has active loan
  static async hasActiveLoan(customerId) {
    try {
      const activeLoan = await LoanAccount.findOne({
        where: {
          customer_id: customerId,
          status: 'ACTIVE'
        }
      });
      
      return {
        success: true,
        hasActiveLoan: !!activeLoan,
        loanDetails: activeLoan || null
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default CustomerService;