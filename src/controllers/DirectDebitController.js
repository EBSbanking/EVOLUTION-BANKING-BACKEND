// controllers/DirectDebitController.js
import DirectDebit from '../models/DirectDebit.js';
import CustomerAccount from '../models/CustomerAccount.js'; // Assuming you have this model
import LoanAccount from '../models/LoanAccount.js'; // Assuming you have this model
import { createTransaction } from '../Services/transactionService.js'; // Your transaction service
import { sendFailureNotification, sendErrorNotification } from '../Services/NotificationService.js';

// Create a new Direct Debit entry
export const createDirectDebit = async (req, res) => {
    const {
      DIRECT_DR_ID,
      FROM_DEPOSIT_ACCT_NO,
      TO_DEPOSIT_ACCT_NO,
      DIRECT_DR_DESC,
      DIRECT_DR_MANDATE_TY_CD,
      XFER_MTHD_CD,
      PAY_CRNCY_ID,
      PAY_AMT,
      MAX_PAY_AMT,
      SCHED_TY_CD,
      NEXT_PAY_DT,
      NO_OF_PAYMENTS,
      PAY_FREQ_CD,
      PAY_FREQ_VALUE,
      EXPIRY_DT,
      NON_BUS_DUE_DT_OPTN_CD,
      REF_TXT,
      SUPPLEMENTARY_REF_TXT,
      PAY_RSN_ID,
      SVCE_PROVIDER_ID,
      BENEFICIARY_ID,
      SUPPLEMENTARY_INSTRUCTION,
      REC_ST,
      VERSION_NO,
      ROW_TS,
      USER_ID,
      CREATE_DT,
      CREATED_BY,
      SYS_CREATE_TS,
      // Loan-specific fields
      LOAN_ACCOUNT_NO,
      LOAN_ID,
      REPAYMENT_TYPE,
      INSTALLMENT_NUMBER,
      TOTAL_INSTALLMENTS,
      PRINCIPAL_AMOUNT,
      INTEREST_AMOUNT,
      PENALTY_AMOUNT,
      LOAN_PRODUCT_CODE
    } = req.body;
  
    try {
      // Validate required fields
      const requiredFields = [
        'DIRECT_DR_ID', 'FROM_DEPOSIT_ACCT_NO', 'TO_DEPOSIT_ACCT_NO', 'DIRECT_DR_DESC',
        'DIRECT_DR_MANDATE_TY_CD', 'XFER_MTHD_CD', 'PAY_CRNCY_ID', 'PAY_AMT', 'MAX_PAY_AMT',
        'SCHED_TY_CD', 'NEXT_PAY_DT', 'NO_OF_PAYMENTS', 'PAY_FREQ_CD', 'PAY_FREQ_VALUE',
        'EXPIRY_DT', 'NON_BUS_DUE_DT_OPTN_CD', 'REF_TXT', 'SUPPLEMENTARY_REF_TXT',
        'PAY_RSN_ID', 'SVCE_PROVIDER_ID', 'BENEFICIARY_ID', 'SUPPLEMENTARY_INSTRUCTION',
        'REC_ST', 'VERSION_NO', 'ROW_TS', 'USER_ID', 'CREATE_DT', 'CREATED_BY', 'SYS_CREATE_TS'
      ];
      
      const missingFields = requiredFields.filter(field => !req.body[field]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({ 
          message: 'Missing required fields.', 
          missingFields 
        });
      }

      // Create a new Direct Debit entry
      const directDebitData = {
        DIRECT_DR_ID,
        FROM_DEPOSIT_ACCT_NO,
        TO_DEPOSIT_ACCT_NO,
        DIRECT_DR_DESC,
        DIRECT_DR_MANDATE_TY_CD,
        XFER_MTHD_CD,
        PAY_CRNCY_ID,
        PAY_AMT,
        MAX_PAY_AMT,
        SCHED_TY_CD,
        NEXT_PAY_DT: new Date(NEXT_PAY_DT),
        NO_OF_PAYMENTS,
        PAY_FREQ_CD,
        PAY_FREQ_VALUE,
        EXPIRY_DT: new Date(EXPIRY_DT),
        NON_BUS_DUE_DT_OPTN_CD,
        REF_TXT,
        SUPPLEMENTARY_REF_TXT,
        PAY_RSN_ID,
        SVCE_PROVIDER_ID,
        BENEFICIARY_ID,
        SUPPLEMENTARY_INSTRUCTION,
        REC_ST,
        VERSION_NO,
        ROW_TS: new Date(ROW_TS),
        USER_ID,
        CREATE_DT: new Date(CREATE_DT),
        CREATED_BY,
        SYS_CREATE_TS: new Date(SYS_CREATE_TS)
      };

      // Add loan-specific fields if provided
      if (LOAN_ACCOUNT_NO) directDebitData.LOAN_ACCOUNT_NO = LOAN_ACCOUNT_NO;
      if (LOAN_ID) directDebitData.LOAN_ID = LOAN_ID;
      if (REPAYMENT_TYPE) directDebitData.REPAYMENT_TYPE = REPAYMENT_TYPE;
      if (INSTALLMENT_NUMBER) directDebitData.INSTALLMENT_NUMBER = INSTALLMENT_NUMBER;
      if (TOTAL_INSTALLMENTS) directDebitData.TOTAL_INSTALLMENTS = TOTAL_INSTALLMENTS;
      if (PRINCIPAL_AMOUNT) directDebitData.PRINCIPAL_AMOUNT = PRINCIPAL_AMOUNT;
      if (INTEREST_AMOUNT) directDebitData.INTEREST_AMOUNT = INTEREST_AMOUNT;
      if (PENALTY_AMOUNT) directDebitData.PENALTY_AMOUNT = PENALTY_AMOUNT;
      if (LOAN_PRODUCT_CODE) directDebitData.LOAN_PRODUCT_CODE = LOAN_PRODUCT_CODE;

      // Save the new Direct Debit entry to the database
      const newDirectDebit = await DirectDebit.create(directDebitData);
  
      res.status(201).json({
        success: true,
        message: 'Direct Debit created successfully.',
        data: newDirectDebit
      });
    } catch (error) {
      console.error('Error creating Direct Debit:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error creating Direct Debit.', 
        error: error.message 
      });
    }
  };
  
  // Get all Direct Debit entries
  export const getAllDirectDebits = async (req, res) => {
    try {
      const { 
        page = 1, 
        limit = 20, 
        type, 
        status,
        startDate,
        endDate,
        search 
      } = req.query;
      
      const offset = (page - 1) * limit;
      
      const where = {};
      
      // Filter by type
      if (type === 'loan') {
        where.DIRECT_DR_MANDATE_TY_CD = 'LOAN_REPAYMENT';
      } else if (type === 'regular') {
        where.DIRECT_DR_MANDATE_TY_CD = { [Op.ne]: 'LOAN_REPAYMENT' };
      }
      
      // Filter by status
      if (status) {
        where.REC_ST = status;
      }
      
      // Filter by date range
      if (startDate || endDate) {
        where.CREATE_DT = {};
        if (startDate) where.CREATE_DT[Op.gte] = new Date(startDate);
        if (endDate) where.CREATE_DT[Op.lte] = new Date(endDate);
      }
      
      // Search functionality
      if (search) {
        where[Op.or] = [
          { DIRECT_DR_ID: { [Op.like]: `%${search}%` } },
          { FROM_DEPOSIT_ACCT_NO: { [Op.like]: `%${search}%` } },
          { TO_DEPOSIT_ACCT_NO: { [Op.like]: `%${search}%` } },
          { DIRECT_DR_DESC: { [Op.like]: `%${search}%` } }
        ];
      }
      
      const { count, rows } = await DirectDebit.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['CREATE_DT', 'DESC']]
      });
  
      res.status(200).json({
        success: true,
        data: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      console.error('Error fetching Direct Debits:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error fetching Direct Debits.', 
        error: error.message 
      });
    }
  };
  
  // Get a Direct Debit by its ID
  export const getDirectDebitById = async (req, res) => {
    const { id } = req.params;
  
    try {
      const directDebit = await DirectDebit.findByPk(id);
  
      if (directDebit) {
        res.status(200).json({
          success: true,
          data: directDebit
        });
      } else {
        res.status(404).json({ 
          success: false,
          message: 'Direct Debit not found.' 
        });
      }
    } catch (error) {
      console.error('Error fetching Direct Debit:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error fetching Direct Debit.', 
        error: error.message 
      });
    }
  };
  
  // Update a Direct Debit entry by its ID
  export const updateDirectDebit = async (req, res) => {
    const { id } = req.params;
    const updatedData = req.body;
  
    try {
      // Convert date fields if present
      if (updatedData.NEXT_PAY_DT) updatedData.NEXT_PAY_DT = new Date(updatedData.NEXT_PAY_DT);
      if (updatedData.EXPIRY_DT) updatedData.EXPIRY_DT = new Date(updatedData.EXPIRY_DT);
      if (updatedData.CREATE_DT) updatedData.CREATE_DT = new Date(updatedData.CREATE_DT);
      if (updatedData.ROW_TS) updatedData.ROW_TS = new Date(updatedData.ROW_TS);
      if (updatedData.SYS_CREATE_TS) updatedData.SYS_CREATE_TS = new Date(updatedData.SYS_CREATE_TS);
      
      const updatedDirectDebit = await DirectDebit.update(updatedData, {
        where: { id },
        returning: true
      });
  
      if (updatedDirectDebit[0] > 0) {
        const directDebit = await DirectDebit.findByPk(id);
        res.status(200).json({
          success: true,
          message: 'Direct Debit updated successfully.',
          data: directDebit
        });
      } else {
        res.status(404).json({ 
          success: false,
          message: 'Direct Debit not found.' 
        });
      }
    } catch (error) {
      console.error('Error updating Direct Debit:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error updating Direct Debit.', 
        error: error.message 
      });
    }
  };
  
  // Delete a Direct Debit entry by its ID
  export const deleteDirectDebit = async (req, res) => {
    const { id } = req.params;
  
    try {
      const deletedCount = await DirectDebit.destroy({
        where: { id }
      });
  
      if (deletedCount > 0) {
        res.status(200).json({
          success: true,
          message: 'Direct Debit deleted successfully.'
        });
      } else {
        res.status(404).json({ 
          success: false,
          message: 'Direct Debit not found.' 
        });
      }
    } catch (error) {
      console.error('Error deleting Direct Debit:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error deleting Direct Debit.', 
        error: error.message 
      });
    }
  };

  // ========== LOAN REPAYMENT SPECIFIC CONTROLLERS ==========

  // Create loan repayment direct debit
  export const createLoanRepaymentDirectDebit = async (req, res) => {
    try {
      const { loanData, customerData } = req.body;
      
      // Validate required loan data
      const requiredLoanFields = ['loanId', 'loanAccount', 'principalAmount', 'interestAmount', 
                                 'nextPaymentDate', 'remainingInstallments', 'repaymentFrequency', 
                                 'loanMaturityDate', 'currency'];
      const missingLoanFields = requiredLoanFields.filter(field => !loanData[field]);
      
      if (missingLoanFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Missing required loan data.',
          missingFields: missingLoanFields
        });
      }
      
      // Validate required customer data
      const requiredCustomerFields = ['customerId', 'savingsAccount'];
      const missingCustomerFields = requiredCustomerFields.filter(field => !customerData[field]);
      
      if (missingCustomerFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Missing required customer data.',
          missingFields: missingCustomerFields
        });
      }
      
      const result = await DirectDebit.createLoanRepaymentDirectDebit(loanData, customerData);
      
      res.status(201).json({
        success: true,
        message: 'Loan repayment direct debit created successfully.',
        data: result
      });
      
    } catch (error) {
      console.error('Error creating loan repayment direct debit:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating loan repayment direct debit.',
        error: error.message
      });
    }
  };

  // Get loan repayment direct debits
  export const getLoanRepayments = async (req, res) => {
    try {
      const { loanId, customerId, page = 1, limit = 20 } = req.query;
      
      const offset = (page - 1) * limit;
      
      const where = {
        DIRECT_DR_MANDATE_TY_CD: 'LOAN_REPAYMENT'
      };
      
      if (loanId) where.LOAN_ID = loanId;
      if (customerId) where.BENEFICIARY_ID = customerId;
      
      const { count, rows } = await DirectDebit.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['NEXT_PAY_DT', 'ASC']]
      });
      
      res.status(200).json({
        success: true,
        data: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      });
      
    } catch (error) {
      console.error('Error fetching loan repayments:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching loan repayments.',
        error: error.message
      });
    }
  };

  // Get loan installment summary
  export const getLoanInstallmentSummary = async (req, res) => {
    try {
      const { loanId } = req.params;
      
      if (!loanId) {
        return res.status(400).json({
          success: false,
          message: 'Loan ID is required.'
        });
      }
      
      const summary = await DirectDebit.getLoanInstallmentSummary(loanId);
      
      res.status(200).json({
        success: true,
        data: summary
      });
      
    } catch (error) {
      console.error('Error fetching loan installment summary:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching loan installment summary.',
        error: error.message
      });
    }
  };

  // Process EOD loan repayments (Admin/System endpoint)
  export const processEODLoanRepayments = async (req, res) => {
    try {
      // Check if user has admin privileges
      if (req.user.role !== 'ADMIN' && req.user.role !== 'SYSTEM') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized. Admin or System access required.'
        });
      }
      
      const { batchDate } = req.body;
      const processingDate = batchDate ? new Date(batchDate) : new Date();
      
      const results = await DirectDebit.processEODLoanRepayments(processingDate);
      
      res.status(200).json({
        success: true,
        message: 'EOD loan repayment processing completed.',
        data: results
      });
      
    } catch (error) {
      console.error('Error processing EOD loan repayments:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing EOD loan repayments.',
        error: error.message
      });
    }
  };

  // Get due loan repayments for dashboard
  export const getDueLoanRepayments = async (req, res) => {
    try {
      const { days = 7 } = req.query;
      
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + parseInt(days));
      
      const dueRepayments = await DirectDebit.findAll({
        where: {
          DIRECT_DR_MANDATE_TY_CD: 'LOAN_REPAYMENT',
          REC_ST: 'Y',
          NEXT_PAY_DT: {
            [Op.lte]: targetDate
          },
          EXPIRY_DT: {
            [Op.gt]: new Date()
          }
        },
        order: [['NEXT_PAY_DT', 'ASC']],
        limit: 50
      });
      
      // Calculate total amount due
      const totalAmountDue = dueRepayments.reduce((sum, repayment) => {
        return sum + parseFloat(repayment.PAY_AMT || 0);
      }, 0);
      
      res.status(200).json({
        success: true,
        data: {
          repayments: dueRepayments,
          summary: {
            count: dueRepayments.length,
            totalAmountDue,
            next7Days: parseInt(days)
          }
        }
      });
      
    } catch (error) {
      console.error('Error fetching due loan repayments:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching due loan repayments.',
        error: error.message
      });
    }
  };

  // Get direct debit statistics
  export const getDirectDebitStatistics = async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      const where = {};
      
      if (startDate || endDate) {
        where.CREATE_DT = {};
        if (startDate) where.CREATE_DT[Op.gte] = new Date(startDate);
        if (endDate) where.CREATE_DT[Op.lte] = new Date(endDate);
      }
      
      // Get total direct debits
      const totalCount = await DirectDebit.count({ where });
      
      // Get active direct debits
      const activeCount = await DirectDebit.count({
        where: { ...where, REC_ST: 'Y' }
      });
      
      // Get loan repayment direct debits
      const loanRepaymentCount = await DirectDebit.count({
        where: { ...where, DIRECT_DR_MANDATE_TY_CD: 'LOAN_REPAYMENT' }
      });
      
      // Get total amount
      const totalAmountResult = await DirectDebit.sum('PAY_AMT', { where });
      const totalAmount = parseFloat(totalAmountResult || 0);
      
      // Get monthly breakdown
      const monthlyData = await DirectDebit.findAll({
        attributes: [
          [sequelize.fn('DATE_TRUNC', 'month', sequelize.col('CREATE_DT')), 'month'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('PAY_AMT')), 'totalAmount']
        ],
        where,
        group: [sequelize.fn('DATE_TRUNC', 'month', sequelize.col('CREATE_DT'))],
        order: [[sequelize.fn('DATE_TRUNC', 'month', sequelize.col('CREATE_DT')), 'DESC']],
        raw: true
      });
      
      res.status(200).json({
        success: true,
        data: {
          totals: {
            all: totalCount,
            active: activeCount,
            loanRepayments: loanRepaymentCount,
            totalAmount
          },
          monthlyBreakdown: monthlyData,
          dateRange: {
            startDate: startDate || 'All time',
            endDate: endDate || 'Now'
          }
        }
      });
      
    } catch (error) {
      console.error('Error fetching direct debit statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching direct debit statistics.',
        error: error.message
      });
    }
  };

  // ========== HELPER FUNCTIONS ==========

  // Helper function to check account balance
  async function checkAccountBalance(accountNumber, requiredAmount) {
    try {
      const account = await CustomerAccount.findOne({ 
        where: { ACCOUNT_NO: accountNumber } 
      });
      
      if (!account) {
        throw new Error(`Account ${accountNumber} not found`);
      }
      
      const currentBalance = parseFloat(account.LEDGER_BAL || 0);
      const hasSufficientBalance = currentBalance >= requiredAmount;
      
      return {
        hasSufficientBalance,
        currentBalance,
        requiredAmount,
        account
      };
    } catch (error) {
      console.error('Error checking account balance:', error);
      throw error;
    }
  }

  // Helper function to process loan repayment transaction
  async function processLoanRepaymentTransaction(paymentData, transaction) {
    try {
      // 1. Create debit transaction from savings account
      const debitTransaction = await createTransaction({
        accountNumber: paymentData.fromAccount,
        amount: paymentData.amount,
        transactionType: 'LOAN_REPAYMENT_DEBIT',
        description: `Loan Repayment - ${paymentData.loanId} - Installment ${paymentData.installmentNumber}`,
        reference: `LOAN_REPAY_${paymentData.loanId}_INST_${paymentData.installmentNumber}`,
        userId: 'SYSTEM',
        transaction
      });
      
      // 2. Update loan balance (you need to implement this based on your Loan model)
      await updateLoanBalance({
        loanId: paymentData.loanId,
        principalAmount: paymentData.principalAmount,
        interestAmount: paymentData.interestAmount,
        penaltyAmount: paymentData.penaltyAmount,
        transactionRef: debitTransaction.transactionId,
        transaction
      });
      
      // 3. Create loan repayment record (if you have a separate LoanRepayment model)
      await createLoanRepaymentRecord({
        loanId: paymentData.loanId,
        installmentNumber: paymentData.installmentNumber,
        repaymentDate: new Date(),
        principalAmount: paymentData.principalAmount,
        interestAmount: paymentData.interestAmount,
        penaltyAmount: paymentData.penaltyAmount,
        totalAmount: paymentData.amount,
        paymentMethod: 'AUTO_DEBIT',
        reference: paymentData.directDebitId,
        status: 'COMPLETED',
        transaction
      });
      
      return debitTransaction.transactionId;
      
    } catch (error) {
      console.error('Error processing loan repayment transaction:', error);
      throw error;
    }
  }

  // Helper function to update loan balance
  async function updateLoanBalance(repaymentData, transaction) {
    // Implement based on your Loan model structure
    const loan = await Loan.findOne({
      where: { LOAN_ID: repaymentData.loanId },
      transaction
    });
    
    if (!loan) {
      throw new Error(`Loan ${repaymentData.loanId} not found`);
    }
    
    // Update loan balances
    const currentPrincipal = parseFloat(loan.OUTSTANDING_PRINCIPAL || 0);
    const currentInterest = parseFloat(loan.ACCRUED_INTEREST || 0);
    const currentPenalty = parseFloat(loan.PENALTY_AMOUNT || 0);
    
    const newPrincipal = currentPrincipal - repaymentData.principalAmount;
    const newInterest = currentInterest - repaymentData.interestAmount;
    const newPenalty = currentPenalty - repaymentData.penaltyAmount;
    
    await loan.update({
      OUTSTANDING_PRINCIPAL: newPrincipal >= 0 ? newPrincipal : 0,
      ACCRUED_INTEREST: newInterest >= 0 ? newInterest : 0,
      PENALTY_AMOUNT: newPenalty >= 0 ? newPenalty : 0,
      LAST_REPAYMENT_DATE: new Date(),
      LAST_REPAYMENT_AMOUNT: repaymentData.totalAmount,
      STATUS: newPrincipal <= 0 ? 'PAID' : loan.STATUS
    }, { transaction });
    
    // Create repayment history record
    await LoanRepaymentHistory.create({
      LOAN_ID: repaymentData.loanId,
      REPAYMENT_DATE: new Date(),
      PRINCIPAL_AMOUNT: repaymentData.principalAmount,
      INTEREST_AMOUNT: repaymentData.interestAmount,
      PENALTY_AMOUNT: repaymentData.penaltyAmount,
      TOTAL_AMOUNT: repaymentData.totalAmount,
      TRANSACTION_REF: repaymentData.transactionRef,
      PAYMENT_METHOD: 'AUTO_DEBIT',
      CREATED_BY: 'SYSTEM'
    }, { transaction });
  }

  // Helper function to create loan repayment record
  async function createLoanRepaymentRecord(repaymentData, transaction) {
    // If you have a LoanRepayment model
    // await LoanRepayment.create({ ...repaymentData }, { transaction });
    
    // For now, we'll log it
    console.log('Loan repayment record created:', repaymentData);
  }

  // Export helper functions if needed elsewhere
  export {
    checkAccountBalance,
    processLoanRepaymentTransaction,
    updateLoanBalance,
    createLoanRepaymentRecord
  };