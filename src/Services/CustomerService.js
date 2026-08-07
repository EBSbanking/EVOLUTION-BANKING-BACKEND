// src/services/CustomerService.js
import Customer from '../models/Customer.js';
import LoanAccount from '../models/LoanAccount.js';
import { Op } from 'sequelize';

export class CustomerService {
  
  // Get all customers with filtering
  static async getAllCustomers(filters = {}) {
    try {
      const whereClause = {};
      
      // Handle customerType filter - using the correct column name
      if (filters.customerType) {
        whereClause.customer_type = filters.customerType;
      }
      
      if (filters.status) {
        whereClause.status = filters.status;
      }
      
      if (filters.search) {
        whereClause[Op.or] = [
          { FIRST_NAME: { [Op.like]: `%${filters.search}%` } },
          { LAST_NAME: { [Op.like]: `%${filters.search}%` } },
          { CUST_ID: { [Op.like]: `%${filters.search}%` } },
          { BVN: { [Op.like]: `%${filters.search}%` } },
          { PHONE_NO: { [Op.like]: `%${filters.search}%` } }
        ];
      }
      
      const customers = await Customer.findAll({
        where: whereClause,
        attributes: [
          'id', 'CUST_ID', 'CUST_NO', 'FIRST_NAME', 'MIDDLE_NAME', 'LAST_NAME',
          'CUST_NM', 'EMAIL_ADDRESS', 'PHONE_NO', 'BVN', 'BVN_VERIFIED',
          'customer_type', // This is the correct column name
          'status', 'REC_ST', 'OPENED_DT', 'CREATE_DT',
          'HOME_ADDRESS', 'COUNTRY_NM', 'STATE', 'LOCAL_GOV',
          'GENDER_TY', 'BIRTH_DT', 'MARITAL_ST', 'NIN',
          'KYC_LEVEL', 'IS_PEP', 'SANCTION_SCORE',
          'created_at', 'updated_at'
        ],
        order: [['created_at', 'DESC']]
      });
      
      return {
        success: true,
        data: customers,
        count: customers.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get customer by ID
  static async getCustomerById(customerId) {
    try {
      const customer = await Customer.findByPk(customerId, {
        attributes: [
          'id', 'CUST_ID', 'CUST_NO', 'FIRST_NAME', 'MIDDLE_NAME', 'LAST_NAME',
          'CUST_NM', 'EMAIL_ADDRESS', 'PHONE_NO', 'BVN', 'BVN_VERIFIED',
          'customer_type', 'status', 'REC_ST', 'OPENED_DT', 'CREATE_DT',
          'HOME_ADDRESS', 'COUNTRY_NM', 'STATE', 'LOCAL_GOV',
          'GENDER_TY', 'BIRTH_DT', 'MARITAL_ST', 'NIN',
          'KYC_LEVEL', 'IS_PEP', 'SANCTION_SCORE'
        ]
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

  // Get customers by type
  static async getCustomersByType(customerType) {
    try {
      const customers = await Customer.findAll({
        where: {
          customer_type: customerType // Using correct column name
        },
        attributes: [
          'id', 'CUST_ID', 'CUST_NM', 'FIRST_NAME', 'LAST_NAME',
          'EMAIL_ADDRESS', 'PHONE_NO', 'customer_type', 'status'
        ]
      });
      
      return {
        success: true,
        data: customers,
        count: customers.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get customers by status
  static async getCustomersByStatus(status) {
    try {
      const customers = await Customer.findAll({
        where: {
          status: status
        },
        attributes: [
          'id', 'CUST_ID', 'CUST_NM', 'FIRST_NAME', 'LAST_NAME',
          'EMAIL_ADDRESS', 'PHONE_NO', 'customer_type', 'status'
        ]
      });
      
      return {
        success: true,
        data: customers,
        count: customers.length
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
          attributes: ['id', 'CUST_ID', 'FIRST_NAME', 'LAST_NAME', 'BVN', 'BVN_VERIFIED', 'PHONE_NO', 'customer_type']
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

  // Update customer type
  static async updateCustomerType(customerId, newType) {
    try {
      const customer = await Customer.findByPk(customerId);
      
      if (!customer) {
        throw new Error('Customer not found');
      }
      
      await customer.update({
        customer_type: newType
      });
      
      return {
        success: true,
        message: 'Customer type updated successfully',
        data: customer
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get customer statistics
  static async getCustomerStatistics() {
    try {
      const total = await Customer.count();
      
      const byType = await Customer.findAll({
        attributes: [
          'customer_type',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['customer_type']
      });
      
      const byStatus = await Customer.findAll({
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['status']
      });
      
      const bvnVerified = await Customer.count({
        where: { BVN_VERIFIED: 1 }
      });
      
      return {
        success: true,
        data: {
          total,
          byType,
          byStatus,
          bvnVerified,
          bvnUnverified: total - bvnVerified
        }
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