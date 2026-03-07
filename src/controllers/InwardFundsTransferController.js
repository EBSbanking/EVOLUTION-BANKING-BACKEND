// controllers/inwardFundsTransferController.js - COMPLETE FIXED VERSION
// ================================================================
// This controller handles all inward funds transfer operations
// including creation, retrieval, reversal, and balance tracking
// ================================================================

console.log('🔴🔴🔴 [CONTROLLER] LOADING NEW CONTROLLER VERSION - FEB 27 2026');
console.log('🔴🔴🔴 [CONTROLLER] Starting to load inwardFundsTransferController.js');
console.log('🔴 [CONTROLLER] Current directory:', process.cwd());
console.log('🔴 [CONTROLLER] File path:', import.meta.url);

import { Sequelize } from 'sequelize';
import InwardFundsTransfer, { 
  RECORD_STATUS, 
  REPAIR_FLAG, 
  FOREIGN_IFT_FLAG 
} from '../models/InwardFundsTransfer.js';
import CustomerAccount from '../models/CustomerAccount.js';
import PendingGLTransaction from '../models/PendingGLTransaction.js';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';
import { ValidationError, NotFoundError, BusinessError } from '../utils/errors.js';

console.log('🔴 [CONTROLLER] All imports completed successfully');

class InwardFundsTransferController {
  
  constructor() {
    console.log('🔴 [CONTROLLER] Constructor called - creating instance');
    this.controllerName = 'InwardFundsTransferController';
    this.version = '1.0.0';
  }

  /**
   * Helper method to extract account number from various formats
   */
  extractAccountNumber(data) {
    // Check direct fields
    if (data.BENEFICIARY_ACCT) return data.BENEFICIARY_ACCT;
    if (data.beneficiaryAccount) return data.beneficiaryAccount;
    if (data.beneficiary_account) return data.beneficiary_account;
    
    // Check beneficiary object
    if (data.beneficiary) {
      if (data.beneficiary.account) return data.beneficiary.account;
      if (data.beneficiary.account_number) return data.beneficiary.account_number;
      if (data.beneficiary.accountNo) return data.beneficiary.accountNo;
    }
    
    // Check flattened fields
    if (data.beneficiaryAccountNumber) return data.beneficiaryAccountNumber;
    if (data.beneficiary_account_number) return data.beneficiary_account_number;
    
    return null;
  }

  /**
   * Helper method to extract beneficiary name from various formats
   */
  extractBeneficiaryName(data) {
    if (data.BENEFICIARY_NM) return data.BENEFICIARY_NM;
    if (data.beneficiaryName) return data.beneficiaryName;
    if (data.beneficiary_name) return data.beneficiary_name;
    if (data.beneficiary?.name) return data.beneficiary.name;
    return null;
  }

  /**
   * Helper method to extract remitter name from various formats
   */
  extractRemitterName(data) {
    if (data.REMITTER_NM) return data.REMITTER_NM;
    if (data.remitterName) return data.remitterName;
    if (data.remitter_name) return data.remitter_name;
    if (data.remitter?.name) return data.remitter.name;
    return null;
  }

  /**
   * Helper method to extract remitter account from various formats
   */
  extractRemitterAccount(data) {
    if (data.REMITTER_ACCT_NO) return data.REMITTER_ACCT_NO;
    if (data.remitterAccount) return data.remitterAccount;
    if (data.remitter_account) return data.remitter_account;
    if (data.remitterAccountNo) return data.remitterAccountNo;
    if (data.remitter?.accountNo) return data.remitter.accountNo;
    if (data.remitter?.account) return data.remitter.account;
    return null;
  }

  /**
   * Helper method to extract beneficiary BIC from various formats
   */
  extractBeneficiaryBic(data) {
    if (data.BENEFICIARY_BIC_ID) return data.BENEFICIARY_BIC_ID;
    if (data.beneficiaryBicId) return data.beneficiaryBicId;
    if (data.beneficiaryBIC) return data.beneficiaryBIC;
    if (data.beneficiaryBicCode) return data.beneficiaryBicCode;
    if (data.beneficiary?.bicId) return data.beneficiary.bicId;
    if (data.beneficiary?.bic) return data.beneficiary.bic;
    if (data.beneficiary?.bicCode) return data.beneficiary.bicCode;
    return null;
  }

  /**
   * Helper method to extract beneficiary bank name from various formats
   */
  extractBeneficiaryBankName(data) {
    if (data.BENEFICIARY_BANK_NM) return data.BENEFICIARY_BANK_NM;
    if (data.beneficiaryBankName) return data.beneficiaryBankName;
    if (data.beneficiaryBank) return data.beneficiaryBank;
    if (data.beneficiary?.bankName) return data.beneficiary.bankName;
    if (data.beneficiary?.bank) return data.beneficiary.bank;
    return null;
  }

  /**
   * Helper method to extract beneficiary country from various formats
   */
  extractBeneficiaryCountry(data) {
    if (data.BENEFICIARY_BANK_CNTRY_ID) return data.BENEFICIARY_BANK_CNTRY_ID;
    if (data.beneficiaryCountryId) return data.beneficiaryCountryId;
    if (data.beneficiaryCountry) return data.beneficiaryCountry;
    if (data.beneficiaryBankCountry) return data.beneficiaryBankCountry;
    if (data.beneficiary?.bankCntryId) return data.beneficiary.bankCntryId;
    if (data.beneficiary?.countryId) return data.beneficiary.countryId;
    if (data.beneficiary?.bankCountry) return data.beneficiary.bankCountry;
    if (data.beneficiary?.country) return data.beneficiary.country;
    return 1; // Default to Nigeria (ID 1)
  }

  /**
   * Create and automatically process a new inward funds transfer
   * @route POST /api/inwardfunds
   */
  async create(req, res, next) {
    console.log('🔴 [CONTROLLER] create() method called');
    console.log('🔴 [CONTROLLER] Request body:', JSON.stringify(req.body, null, 2));
    
    const transaction = await sequelize.transaction();
    
    try {
      const transferData = req.body;
      const userId = req.user?.id || 'SYSTEM';
      
      // Extract account number using helper
      const accountNumber = this.extractAccountNumber(transferData);
      
      console.log('🔴 [CONTROLLER] Processing transfer data:', {
        reference: transferData.XFER_REF || transferData.xferRef || transferData.reference,
        amount: transferData.XFER_AMT || transferData.xferAmt || transferData.amount,
        beneficiaryAccount: accountNumber,
        beneficiaryName: this.extractBeneficiaryName(transferData),
        remitterName: this.extractRemitterName(transferData)
      });

      // Pre-validate the beneficiary account exists and is active
      if (!accountNumber) {
        throw new ValidationError('Beneficiary account number is required');
      }

      const account = await CustomerAccount.findOne({
        where: { 
          account_number: accountNumber
        }
      });
      
      if (!account) {
        throw new NotFoundError(`Beneficiary account ${accountNumber} not found`);
      }
      
      if (account.status !== 'ACTIVE') {
        throw new BusinessError(`Beneficiary account is not active (status: ${account.status})`);
      }
      
      if (!account.allow_credit) {
        throw new BusinessError(`Beneficiary account is not allowed to receive credits`);
      }
      
      // Map all fields from various possible formats
      const mappedTransferData = {
        // Core transfer fields
        XFER_REF: transferData.XFER_REF || transferData.xferRef || transferData.reference,
        XFER_AMT: parseFloat(transferData.XFER_AMT || transferData.xferAmt || transferData.amount || 0),
        XFER_CRNCY_ID: parseInt(transferData.XFER_CRNCY_ID || transferData.xferCrncyId || transferData.currencyId || 1),
        PAY_CRNCY_ID: parseInt(transferData.PAY_CRNCY_ID || transferData.payCrncyId || transferData.paymentCurrencyId || 1),
        PAY_EXCH_RATE: parseFloat(transferData.PAY_EXCH_RATE || transferData.payExchRate || transferData.exchangeRate || 1),
        VALUE_DT: transferData.VALUE_DT || transferData.valueDt ? new Date(transferData.VALUE_DT || transferData.valueDt) : new Date(),
        PRIORITY_LEVEL_CD: transferData.PRIORITY_LEVEL_CD || transferData.priorityLevelCd || transferData.priority || 'NORMAL',
        
        // Beneficiary fields
        BENEFICIARY_NM: this.extractBeneficiaryName(transferData),
        BENEFICIARY_ACCT: accountNumber,
        BENEFICIARY_BIC_ID: this.extractBeneficiaryBic(transferData),
        BENEFICIARY_BANK_NM: this.extractBeneficiaryBankName(transferData),
        BENEFICIARY_BANK_CNTRY_ID: this.extractBeneficiaryCountry(transferData),
        
        // Remitter fields
        REMITTER_NM: this.extractRemitterName(transferData),
        REMITTER_ACCT_NO: this.extractRemitterAccount(transferData),
        
        // Charges
        SENDING_BANK_CHRG: parseFloat(transferData.SENDING_BANK_CHRG || transferData.sendingBankChrg || transferData.sendingCharge || 0),
        RECIEVING_BANK_CHRG: parseFloat(transferData.RECIEVING_BANK_CHRG || transferData.receivingBankChrg || transferData.receivingCharge || 0),
        
        // Payment method
        PAYMENT_MTD_CD: transferData.PAYMENT_MTD_CD || transferData.paymentMtdCd || transferData.paymentMethod || 'GENERIC',
        
        // System fields
        CREATED_BY: userId,
        USER_ID: userId,
        REC_ST: RECORD_STATUS.ACTIVE,
        
        // Store original payload for reference
        PAY_DETAILS: transferData.payDetails || JSON.stringify(transferData)
      };
      
      console.log('🔴 [CONTROLLER] Mapped transfer data:', JSON.stringify(mappedTransferData, null, 2));

      // Create transfer instance
      const transfer = new InwardFundsTransfer(mappedTransferData);
      
      // Log the transfer instance right after creation
      console.log('🔴 [CONTROLLER] Transfer instance after creation:', {
        xferRef: transfer.xferRef,
        xferCrncyId: transfer.xferCrncyId,
        beneficiary: transfer.beneficiary
      });
      
      // Validate the transfer
      const validation = transfer.validate();
      if (!validation.isValid) {
        console.error('🔴 [CONTROLLER] Validation errors:', validation.errors);
        throw new ValidationError('Transfer validation failed', validation.errors);
      }
      
      // Calculate charges and equivalents
      transfer.calculateCharges();
      transfer.calculateLcyEquivalent();
      
      console.log('🔴 [CONTROLLER] Saving transfer to database...');

      // Get database data
      const dbData = transfer.toDatabase();
      
      // CRITICAL DEBUG - Log EVERYTHING
      console.log('🔴 [CONTROLLER] ===== FULL DATABASE DATA =====');
      console.log('🔴 [CONTROLLER] Number of fields:', Object.keys(dbData).length);
      console.log('🔴 [CONTROLLER] Field names:', Object.keys(dbData));
      console.log('🔴 [CONTROLLER] XFER_REF value:', dbData.XFER_REF);
      console.log('🔴 [CONTROLLER] XFER_REF type:', typeof dbData.XFER_REF);
      console.log('🔴 [CONTROLLER] XFER_REF exists:', !!dbData.XFER_REF);
      console.log('🔴 [CONTROLLER] First 10 fields with values:', Object.entries(dbData).slice(0, 10).map(([k, v]) => `${k}=${v}`));

      // Check if XFER_REF is present
      if (!dbData.XFER_REF) {
        console.error('🔴 [CONTROLLER] CRITICAL: XFER_REF is missing or falsy!');
        console.error('🔴 [CONTROLLER] Current transfer.xferRef:', transfer.xferRef);
        console.error('🔴 [CONTROLLER] Current transfer object:', JSON.stringify(transfer, null, 2));
      }

      // Check if required fields are present
      const requiredFields = [
        'XFER_REF', 'XFER_CRNCY_ID', 'PAY_CRNCY_ID', 'PAY_EXCH_RATE', 
        'VALUE_DT', 'PRIORITY_LEVEL_CD', 'BENEFICIARY_ACCT', 'BENEFICIARY_BIC_ID',
        'BENEFICIARY_BANK_NM', 'BENEFICIARY_BANK_CNTRY_ID', 'REMITTER_NM',
        'USER_ID', 'CREATED_BY'
      ];

      const missingFields = requiredFields.filter(field => !dbData[field] && dbData[field] !== 0);
      if (missingFields.length > 0) {
        console.log('🔴 [CONTROLLER] MISSING REQUIRED FIELDS:', missingFields);
        throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
      } else {
        console.log('🔴 [CONTROLLER] All required fields are present ✓');
      }

      // FIX: Create a new model instance with build() and explicitly set ALL fields
      console.log('🔴 [CONTROLLER] Creating new transfer instance with build()...');
      const newTransfer = InwardFundsTransfer.build();

      // Explicitly set ALL fields from dbData
      Object.keys(dbData).forEach(key => {
        newTransfer.setDataValue(key, dbData[key]);
      });

      // Log what fields are set on the new instance
      console.log('🔴 [CONTROLLER] New transfer instance has', Object.keys(newTransfer.dataValues).length, 'fields');
      console.log('🔴 [CONTROLLER] First 10 fields on instance:', Object.keys(newTransfer.dataValues).slice(0, 10));

      // Now save with all fields explicitly included
      console.log('🔴 [CONTROLLER] Saving with fields:', Object.keys(dbData));
      await newTransfer.save({ 
        transaction,
        fields: Object.keys(dbData) // Tell Sequelize to include ALL these fields
      });

      // Refresh to get the auto-generated ID and any default values
      await newTransfer.reload({ transaction });

      const savedTransfer = newTransfer;
      
      console.log('🔴 [CONTROLLER] Transfer saved with ID:', savedTransfer.INWD_FUNDS_XFER_ID);
      
      // Get balance impact
      const balanceImpact = savedTransfer.getBalanceImpact ? 
                           savedTransfer.getBalanceImpact() : 
                           { netCredit: savedTransfer.NET_AMT_XFERED };
      
      // Fetch updated account with new balances
      const updatedAccount = await CustomerAccount.findOne({
        where: { account_number: savedTransfer.BENEFICIARY_ACCT },
        transaction
      });
      
      await transaction.commit();
      
      logger.info(`Inward funds transfer created and processed automatically`, {
        transferId: savedTransfer.INWD_FUNDS_XFER_ID,
        reference: savedTransfer.XFER_REF,
        amount: savedTransfer.XFER_AMT,
        beneficiaryAccount: savedTransfer.BENEFICIARY_ACCT,
        netAmount: savedTransfer.NET_AMT_XFERED
      });
      
      res.status(201).json({
        success: true,
        data: {
          transfer: savedTransfer,
          account: {
            accountNumber: updatedAccount.account_number,
            accountName: updatedAccount.account_name,
            balances: {
              current: updatedAccount.current_balance,
              ledger: updatedAccount.ledger_balance,
              cleared: updatedAccount.cleared_balance,
              available: updatedAccount.available_balance
            }
          },
          balanceImpact
        },
        message: 'Inward funds transfer processed successfully'
      });
      
    } catch (error) {
      await transaction.rollback();
      console.error('🔴 [CONTROLLER] Error in create():', error.message);
      console.error('🔴 [CONTROLLER] Error stack:', error.stack);
      next(error);
    }
  }


  /**
   * Get transfer with balance impact details
   * @route GET /api/inwardfunds/:id
   */
  async getById(req, res, next) {
    console.log('🔴 [CONTROLLER] getById() method called with ID:', req.params.id);
    try {
      const { id } = req.params;
      
      const transfer = await InwardFundsTransfer.findByPk(id);
      
      if (!transfer) {
        throw new NotFoundError(`Transfer with ID ${id} not found`);
      }
      
      // Get associated account balances
      const account = await CustomerAccount.findOne({
        where: { account_number: transfer.BENEFICIARY_ACCT }
      });
      
      // Get balance impact
      const transferInstance = new InwardFundsTransfer(transfer.toJSON());
      const summary = transferInstance.getSummary();
      const balanceImpact = transferInstance.getBalanceImpact ? 
                           transferInstance.getBalanceImpact() : null;
      
      // Get related GL transactions
      const glTransactions = await PendingGLTransaction.findAll({
        where: { INWD_FUNDS_XFER_ID: id }
      });
      
      res.json({
        success: true,
        data: {
          transfer: transfer.toJSON(),
          summary,
          balanceImpact,
          accountBalances: account ? {
            accountNumber: account.account_number,
            accountName: account.account_name,
            beforeTransfer: balanceImpact ? {
              current: account.current_balance - (balanceImpact.netCredit || 0),
              ledger: account.ledger_balance - (balanceImpact.netCredit || 0),
              cleared: account.cleared_balance - (balanceImpact.netCredit || 0),
              available: account.available_balance - (balanceImpact.netCredit || 0)
            } : null,
            afterTransfer: {
              current: account.current_balance,
              ledger: account.ledger_balance,
              cleared: account.cleared_balance,
              available: account.available_balance
            }
          } : null,
          glTransactions
        }
      });
      
    } catch (error) {
      console.error('🔴 [CONTROLLER] Error in getById():', error.message);
      next(error);
    }
  }

  /**
   * Get transfer by reference number
   * @route GET /api/inwardfunds/reference/:reference
   */
  async getByReference(req, res, next) {
    console.log('🔴 [CONTROLLER] getByReference() method called with reference:', req.params.reference);
    try {
      const { reference } = req.params;
      
      const transfer = await InwardFundsTransfer.findOne({
        where: { XFER_REF: reference }
      });
      
      if (!transfer) {
        throw new NotFoundError(`Transfer with reference ${reference} not found`);
      }
      
      res.json({
        success: true,
        data: transfer
      });
      
    } catch (error) {
      console.error('🔴 [CONTROLLER] Error in getByReference():', error.message);
      next(error);
    }
  }

  /**
   * Get transfers by beneficiary account
   * @route GET /api/inwardfunds/beneficiary/:accountNo
   */
  async getByBeneficiaryAccount(req, res, next) {
    console.log('🔴 [CONTROLLER] getByBeneficiaryAccount() called for account:', req.params.accountNo);
    try {
      const { accountNo } = req.params;
      const { page = 1, limit = 10, fromDate, toDate } = req.query;
      
      const offset = (page - 1) * limit;
      
      const where = { BENEFICIARY_ACCT: accountNo };
      
      // Add date range filter if provided
      if (fromDate || toDate) {
        where.VALUE_DT = {};
        if (fromDate) where.VALUE_DT[Sequelize.Op.gte] = new Date(fromDate);
        if (toDate) where.VALUE_DT[Sequelize.Op.lte] = new Date(toDate);
      }
      
      const transfers = await InwardFundsTransfer.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['VALUE_DT', 'DESC'], ['CREATE_DT', 'DESC']]
      });
      
      // Calculate totals
      const totals = await InwardFundsTransfer.findAll({
        where,
        attributes: [
          [sequelize.fn('SUM', sequelize.col('XFER_AMT')), 'totalAmount'],
          [sequelize.fn('COUNT', sequelize.col('INWD_FUNDS_XFER_ID')), 'totalCount']
        ],
        raw: true
      });
      
      res.json({
        success: true,
        data: transfers.rows,
        summary: {
          totalAmount: totals[0]?.totalAmount || 0,
          totalCount: totals[0]?.totalCount || 0
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: transfers.count,
          pages: Math.ceil(transfers.count / limit)
        }
      });
      
    } catch (error) {
      console.error('🔴 [CONTROLLER] Error in getByBeneficiaryAccount():', error.message);
      next(error);
    }
  }

  /**
   * Get today's transfers
   * @route GET /api/inwardfunds/reports/today
   */
  async getTodayTransfers(req, res, next) {
    console.log('🔴 [CONTROLLER] getTodayTransfers() called');
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      
      const transfers = await InwardFundsTransfer.findByDateRange(startOfDay, endOfDay);
      
      const transferInstances = transfers.map(t => new InwardFundsTransfer(t.toJSON()));
      const summaries = transferInstances.map(t => t.getSummary());
      
      const totalAmount = transfers.reduce((sum, t) => sum + parseFloat(t.XFER_AMT || 0), 0);
      const totalNetAmount = transfers.reduce((sum, t) => sum + parseFloat(t.NET_AMT_XFERED || 0), 0);
      
      res.json({
        success: true,
        data: summaries,
        summary: {
          count: transfers.length,
          totalAmount,
          totalNetAmount,
          date: new Date().toISOString().split('T')[0]
        }
      });
      
    } catch (error) {
      console.error('🔴 [CONTROLLER] Error in getTodayTransfers():', error.message);
      next(error);
    }
  }

  /**
   * Get transfer statistics
   * @route GET /api/inwardfunds/reports/statistics
   */
  async getStatistics(req, res, next) {
    console.log('🔴 [CONTROLLER] getStatistics() called');
    try {
      const { fromDate, toDate } = req.query;
      
      const startDate = fromDate ? new Date(fromDate) : new Date(new Date().setDate(new Date().getDate() - 30));
      const endDate = toDate ? new Date(toDate) : new Date();
      
      const statistics = await InwardFundsTransfer.getStatistics(startDate, endDate);
      
      // Get currency breakdown
      const currencyStats = await InwardFundsTransfer.findAll({
        where: {
          VALUE_DT: {
            [Sequelize.Op.between]: [startDate, endDate]
          }
        },
        attributes: [
          'XFER_CRNCY_ID',
          [sequelize.fn('COUNT', sequelize.col('INWD_FUNDS_XFER_ID')), 'count'],
          [sequelize.fn('SUM', sequelize.col('XFER_AMT')), 'totalAmount'],
          [sequelize.fn('AVG', sequelize.col('XFER_AMT')), 'averageAmount']
        ],
        group: ['XFER_CRNCY_ID'],
        raw: true
      });
      
      res.json({
        success: true,
        data: {
          period: {
            from: startDate,
            to: endDate
          },
          byStatus: statistics,
          byCurrency: currencyStats,
          totalTransfers: Object.values(statistics).reduce(
            (sum, s) => sum + s.domestic.count + s.foreign.count, 0
          ),
          totalAmount: Object.values(statistics).reduce(
            (sum, s) => sum + s.domestic.amount + s.foreign.amount, 0
          )
        }
      });
      
    } catch (error) {
      console.error('🔴 [CONTROLLER] Error in getStatistics():', error.message);
      next(error);
    }
  }

  /**
   * Get dashboard summary
   * @route GET /api/inwardfunds/reports/dashboard
   */
  async getDashboardSummary(req, res, next) {
    console.log('🔴 [CONTROLLER] getDashboardSummary() called');
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      // Today's transfers
      const todayTransfers = await InwardFundsTransfer.findAll({
        where: {
          VALUE_DT: {
            [Sequelize.Op.gte]: today
          }
        }
      });
      
      // Weekly statistics
      const weeklyStats = await InwardFundsTransfer.getStatistics(weekAgo, new Date());
      
      // Top beneficiaries
      const topBeneficiaries = await InwardFundsTransfer.findAll({
        where: {
          VALUE_DT: {
            [Sequelize.Op.gte]: weekAgo
          }
        },
        attributes: [
          'BENEFICIARY_ACCT',
          'BENEFICIARY_NM',
          [sequelize.fn('COUNT', sequelize.col('INWD_FUNDS_XFER_ID')), 'transactionCount'],
          [sequelize.fn('SUM', sequelize.col('XFER_AMT')), 'totalAmount']
        ],
        group: ['BENEFICIARY_ACCT', 'BENEFICIARY_NM'],
        order: [[sequelize.literal('totalAmount'), 'DESC']],
        limit: 10,
        raw: true
      });
      
      // Recent large transactions
      const largeTransactions = await InwardFundsTransfer.findAll({
        where: {
          XFER_AMT: {
            [Sequelize.Op.gte]: 10000 // Transactions over 10,000
          },
          VALUE_DT: {
            [Sequelize.Op.gte]: weekAgo
          }
        },
        order: [['XFER_AMT', 'DESC']],
        limit: 10
      });
      
      res.json({
        success: true,
        data: {
          today: {
            count: todayTransfers.length,
            amount: todayTransfers.reduce((sum, t) => sum + parseFloat(t.XFER_AMT || 0), 0),
            netAmount: todayTransfers.reduce((sum, t) => sum + parseFloat(t.NET_AMT_XFERED || 0), 0)
          },
          weekly: weeklyStats,
          topBeneficiaries,
          largeTransactions
        }
      });
      
    } catch (error) {
      console.error('🔴 [CONTROLLER] Error in getDashboardSummary():', error.message);
      next(error);
    }
  }

  /**
   * Search transfers
   * @route GET /api/inwardfunds/search
   */
  async search(req, res, next) {
    console.log('🔴 [CONTROLLER] search() called with query:', req.query);
    try {
      const {
        reference,
        beneficiaryName,
        beneficiaryAccount,
        remitterName,
        amountFrom,
        amountTo,
        dateFrom,
        dateTo,
        currencyId,
        isForeign,
        page = 1,
        limit = 10
      } = req.query;
      
      const offset = (page - 1) * limit;
      const where = {};
      
      if (reference) {
        where.XFER_REF = { [Sequelize.Op.like]: `%${reference}%` };
      }
      
      if (beneficiaryName) {
        where.BENEFICIARY_NM = { [Sequelize.Op.like]: `%${beneficiaryName}%` };
      }
      
      if (beneficiaryAccount) {
        where.BENEFICIARY_ACCT = beneficiaryAccount;
      }
      
      if (remitterName) {
        where.REMITTER_NM = { [Sequelize.Op.like]: `%${remitterName}%` };
      }
      
      if (amountFrom || amountTo) {
        where.XFER_AMT = {};
        if (amountFrom) where.XFER_AMT[Sequelize.Op.gte] = amountFrom;
        if (amountTo) where.XFER_AMT[Sequelize.Op.lte] = amountTo;
      }
      
      if (dateFrom || dateTo) {
        where.VALUE_DT = {};
        if (dateFrom) where.VALUE_DT[Sequelize.Op.gte] = new Date(dateFrom);
        if (dateTo) where.VALUE_DT[Sequelize.Op.lte] = new Date(dateTo);
      }
      
      if (currencyId) {
        where.XFER_CRNCY_ID = currencyId;
      }
      
      if (isForeign !== undefined) {
        where.FOREIGN_IFT_FG = isForeign === 'true' ? FOREIGN_IFT_FLAG.YES : FOREIGN_IFT_FLAG.NO;
      }
      
      const transfers = await InwardFundsTransfer.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['VALUE_DT', 'DESC'], ['CREATE_DT', 'DESC']]
      });
      
      res.json({
        success: true,
        data: transfers.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: transfers.count,
          pages: Math.ceil(transfers.count / limit)
        }
      });
      
    } catch (error) {
      console.error('🔴 [CONTROLLER] Error in search():', error.message);
      next(error);
    }
  }

  /**
   * Get account balance history with inward transfers
   * @route GET /api/inwardfunds/account/:accountNumber/history
   */
  async getAccountBalanceHistory(req, res, next) {
    console.log('🔴 [CONTROLLER] getAccountBalanceHistory() called for account:', req.params.accountNumber);
    try {
      const { accountNumber } = req.params;
      const { fromDate, toDate, limit = 50 } = req.query;
      
      const account = await CustomerAccount.findOne({
        where: { account_number: accountNumber }
      });
      
      if (!account) {
        throw new NotFoundError(`Account ${accountNumber} not found`);
      }
      
      // Build date filter
      const dateFilter = {};
      if (fromDate || toDate) {
        dateFilter.VALUE_DT = {};
        if (fromDate) dateFilter.VALUE_DT[Sequelize.Op.gte] = new Date(fromDate);
        if (toDate) dateFilter.VALUE_DT[Sequelize.Op.lte] = new Date(toDate);
      }
      
      // Get inward transfers for this account
      const transfers = await InwardFundsTransfer.findAll({
        where: {
          BENEFICIARY_ACCT: accountNumber,
          ...dateFilter,
          REC_ST: RECORD_STATUS.ACTIVE
        },
        order: [['VALUE_DT', 'DESC'], ['CREATE_DT', 'DESC']],
        limit: parseInt(limit)
      });
      
      // Calculate running balance
      let runningBalance = account.opening_balance || 0;
      const balanceHistory = [];
      
      // Sort ascending for running balance calculation
      const sortedTransfers = [...transfers].sort((a, b) => 
        new Date(a.VALUE_DT) - new Date(b.VALUE_DT)
      );
      
      for (const transfer of sortedTransfers) {
        const netAmount = parseFloat(transfer.NET_AMT_XFERED || transfer.XFER_AMT || 0);
        runningBalance += netAmount;
        
        balanceHistory.push({
          date: transfer.VALUE_DT,
          reference: transfer.XFER_REF,
          amount: transfer.XFER_AMT,
          netAmount,
          charges: transfer.TOTAL_CHRG,
          runningBalance,
          type: 'INWARD',
          transferId: transfer.INWD_FUNDS_XFER_ID
        });
      }
      
      res.json({
        success: true,
        data: {
          account: {
            number: account.account_number,
            name: account.account_name,
            currentBalances: {
              current: account.current_balance,
              ledger: account.ledger_balance,
              cleared: account.cleared_balance,
              available: account.available_balance
            }
          },
          balanceHistory,
          summary: {
            totalTransfers: transfers.length,
            totalAmount: transfers.reduce((sum, t) => sum + parseFloat(t.XFER_AMT || 0), 0),
            totalNetAmount: transfers.reduce((sum, t) => sum + parseFloat(t.NET_AMT_XFERED || 0), 0),
            periodStart: fromDate || 'All time',
            periodEnd: toDate || 'Present'
          }
        }
      });
      
    } catch (error) {
      console.error('🔴 [CONTROLLER] Error in getAccountBalanceHistory():', error.message);
      next(error);
    }
  }

  /**
   * Reverse a transfer and adjust balances
   * @route POST /api/inwardfunds/:id/reverse
   */
  async reverseTransfer(req, res, next) {
    console.log('🔴 [CONTROLLER] reverseTransfer() called for ID:', req.params.id);
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.user?.id || 'SYSTEM';
      
      // Find original transfer
      const originalTransfer = await InwardFundsTransfer.findByPk(id, { transaction });
      
      if (!originalTransfer) {
        throw new NotFoundError(`Transfer with ID ${id} not found`);
      }
      
      if (originalTransfer.REC_ST !== RECORD_STATUS.ACTIVE) {
        throw new BusinessError(`Cannot reverse transfer with status: ${originalTransfer.REC_ST}`);
      }
      
      // Find customer account
      const account = await CustomerAccount.findOne({
        where: { account_number: originalTransfer.BENEFICIARY_ACCT },
        transaction
      });
      
      if (!account) {
        throw new NotFoundError(`Beneficiary account not found`);
      }
      
      // Calculate amount to reverse
      const reverseAmount = parseFloat(originalTransfer.NET_AMT_XFERED || originalTransfer.XFER_AMT);
      
      // Check if account has sufficient balance for reversal
      if (parseFloat(account.current_balance) < reverseAmount) {
        throw new BusinessError(`Insufficient balance for reversal. Required: ${reverseAmount}, Available: ${account.current_balance}`);
      }
      
      // Store previous balances for logging
      const previousBalances = {
        current: account.current_balance,
        ledger: account.ledger_balance,
        cleared: account.cleared_balance,
        available: account.available_balance
      };
      
      // Reverse balances (subtract the amount)
      account.current_balance = parseFloat(account.current_balance) - reverseAmount;
      account.ledger_balance = parseFloat(account.ledger_balance) - reverseAmount;
      account.cleared_balance = parseFloat(account.cleared_balance) - reverseAmount;
      account.available_balance = parseFloat(account.available_balance) - reverseAmount;
      account.last_transaction_date = new Date();
      
      await account.save({ transaction });
      
      // Mark original transfer as reversed
      originalTransfer.REC_ST = RECORD_STATUS.INACTIVE;
      originalTransfer.reversal_reason = reason;
      originalTransfer.reversal_date = new Date();
      originalTransfer.reversed_by = userId;
      await originalTransfer.save({ transaction });
      
      // Create reversal transfer record
      const reversalTransfer = new InwardFundsTransfer({
        XFER_REF: `REV-${originalTransfer.XFER_REF}`,
        XFER_AMT: -originalTransfer.XFER_AMT,
        XFER_CRNCY_ID: originalTransfer.XFER_CRNCY_ID,
        BENEFICIARY_ACCT: originalTransfer.BENEFICIARY_ACCT,
        BENEFICIARY_NM: originalTransfer.BENEFICIARY_NM,
        REMITTER_NM: originalTransfer.REMITTER_NM,
        VALUE_DT: new Date(),
        REC_ST: RECORD_STATUS.ACTIVE,
        is_reversal: true,
        original_xfer_ref: originalTransfer.XFER_REF,
        NET_AMT_XFERED: -reverseAmount,
        CREATED_BY: userId,
        USER_ID: userId,
        reversal_reason: reason
      });
      
      const savedReversal = await InwardFundsTransfer.create(
        reversalTransfer.toDatabase(),
        { transaction }
      );
      
      // Create GL transaction for reversal
      const reversalGL = await PendingGLTransaction.create({
        INWD_FUNDS_XFER_ID: savedReversal.INWD_FUNDS_XFER_ID,
        XFER_REF: savedReversal.XFER_REF,
        GL_ACCT_NO: originalTransfer.BENEFICIARY_ACCT,
        TRANSACTION_TYPE: 'REVERSAL',
        AMOUNT: -reverseAmount,
        CRNCY_ID: originalTransfer.XFER_CRNCY_ID,
        TRANSACTION_DATE: new Date(),
        CREATED_BY: userId,
        JOURNAL_ID: savedReversal.INWD_FUNDS_XFER_ID,
        STATUS: 'COMPLETED',
        BALANCE_AFTER: account.current_balance,
        LEDGER_BALANCE_AFTER: account.ledger_balance,
        CLEARED_BALANCE_AFTER: account.cleared_balance,
        AVAILABLE_BALANCE_AFTER: account.available_balance,
        PREVIOUS_BALANCE: previousBalances.current,
        PREVIOUS_LEDGER_BALANCE: previousBalances.ledger,
        PREVIOUS_CLEARED_BALANCE: previousBalances.cleared,
        PREVIOUS_AVAILABLE_BALANCE: previousBalances.available,
        NARRATION: `Reversal of transfer ${originalTransfer.XFER_REF}: ${reason}`
      }, { transaction });
      
      await transaction.commit();
      
      logger.info(`Transfer reversed successfully`, {
        originalTransferId: id,
        reversalTransferId: savedReversal.INWD_FUNDS_XFER_ID,
        amount: reverseAmount,
        accountNumber: account.account_number,
        previousBalances,
        newBalances: {
          current: account.current_balance,
          ledger: account.ledger_balance,
          cleared: account.cleared_balance,
          available: account.available_balance
        },
        reason,
        userId
      });
      
      res.json({
        success: true,
        data: {
          originalTransfer: originalTransfer.toJSON(),
          reversalTransfer: savedReversal.toJSON(),
          reversalGL,
          account: {
            accountNumber: account.account_number,
            accountName: account.account_name,
            previousBalances,
            newBalances: {
              current: account.current_balance,
              ledger: account.ledger_balance,
              cleared: account.cleared_balance,
              available: account.available_balance
            }
          }
        },
        message: 'Transfer reversed successfully'
      });
      
    } catch (error) {
      await transaction.rollback();
      console.error('🔴 [CONTROLLER] Error in reverseTransfer():', error.message);
      next(error);
    }
  }

  /**
   * Get account balance summary including all four balance types
   * @route GET /api/inwardfunds/account/:accountNumber/summary
   */
  async getAccountBalanceSummary(req, res, next) {
    console.log('🔴 [CONTROLLER] getAccountBalanceSummary() called for account:', req.params.accountNumber);
    try {
      const { accountNumber } = req.params;
      
      const account = await CustomerAccount.findOne({
        where: { account_number: accountNumber }
      });
      
      if (!account) {
        throw new NotFoundError(`Account ${accountNumber} not found`);
      }
      
      // Get recent transactions affecting balance
      const recentTransfers = await InwardFundsTransfer.findAll({
        where: { 
          BENEFICIARY_ACCT: accountNumber,
          REC_ST: RECORD_STATUS.ACTIVE
        },
        order: [['VALUE_DT', 'DESC']],
        limit: 10
      });
      
      // Calculate balance composition
      const balanceComposition = {
        ledgerBalance: account.ledger_balance,
        clearedBalance: account.cleared_balance,
        unclearedBalance: (parseFloat(account.ledger_balance) - parseFloat(account.cleared_balance)).toFixed(2),
        availableBalance: account.available_balance,
        unavailableBalance: (parseFloat(account.cleared_balance) - parseFloat(account.available_balance)).toFixed(2),
        currentBalance: account.current_balance
      };
      
      res.json({
        success: true,
        data: {
          account: {
            number: account.account_number,
            name: account.account_name,
            type: account.account_type,
            status: account.status
          },
          balances: {
            current: account.current_balance,
            ledger: account.ledger_balance,
            cleared: account.cleared_balance,
            available: account.available_balance
          },
          composition: balanceComposition,
          recentActivity: recentTransfers.map(t => ({
            date: t.VALUE_DT,
            reference: t.XFER_REF,
            amount: t.XFER_AMT,
            netAmount: t.NET_AMT_XFERED,
            remitter: t.REMITTER_NM
          })),
          lastUpdated: account.updated_at
        }
      });
      
    } catch (error) {
      console.error('🔴 [CONTROLLER] Error in getAccountBalanceSummary():', error.message);
      next(error);
    }
  }

  /**
   * Health check for controller
   * @route GET /api/inwardfunds/health
   */
  async healthCheck(req, res) {
    console.log('🔴 [CONTROLLER] healthCheck() called');
    res.json({
      status: 'healthy',
      controller: this.controllerName,
      version: this.version,
      timestamp: new Date().toISOString(),
      methods: Object.getOwnPropertyNames(Object.getPrototypeOf(this)).filter(name => name !== 'constructor')
    });
  }
}

console.log('🔴 [CONTROLLER] Creating controller instance...');
const controller = new InwardFundsTransferController();
console.log('🔴 [CONTROLLER] Controller instance created successfully');
console.log('🔴 [CONTROLLER] Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(controller)).filter(name => name !== 'constructor'));

export default controller;