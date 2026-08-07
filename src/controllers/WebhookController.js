// src/controllers/WebhookController.js
import InwardFundsTransfer, { RECORD_STATUS } from '../models/InwardFundsTransfer.js';
import CustomerAccount from '../models/CustomerAccount.js';
import PendingGLTransaction from '../models/PendingGLTransaction.js';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';

/**
 * Webhook Controller
 * Handles incoming webhooks from various sources (JSON, XML, NIP, Paystack)
 */
class WebhookController {
  constructor() {
    // Don't initialize NIPWebhook here - do it lazily
    this.nipWebhook = null;
  }

  /**
   * Lazy initialize NIP webhook to avoid circular dependency
   */
  async getNIPWebhook() {
    if (!this.nipWebhook) {
      // Dynamic import to break circular dependency
      const { default: NIPWebhook } = await import('../../webhooks/nipWebhook.js');
      this.nipWebhook = new NIPWebhook();
    }
    return this.nipWebhook;
  }

  /**
   * Generic webhook handler - routes to appropriate handler based on gateway
   */
  handleWebhook = async (req, res) => {
    const gateway = req.body?.gateway || req.query?.gateway || 'json';
    
    logger.info(`Webhook received from ${gateway}`, {
      gateway,
      clientIp: req.clientIp || req.ip,
      headers: req.headers
    });

    try {
      switch (gateway.toLowerCase()) {
        case 'json':
          return await this.handleJsonWebhook(req, res);
        
        case 'nip':
        case 'nip_fund_transfer':
          return await this.handleNIPFundsTransfer(req, res);
        
        case 'nip_name_enquiry':
          return await this.handleNIPNameEnquiry(req, res);
        
        case 'nip_status_enquiry':
          return await this.handleNIPStatusEnquiry(req, res);
        
        case 'nip_reversal':
          return await this.handleNIPReversal(req, res);
        
        case 'nip_institution_list': {
          const nipWebhook = await this.getNIPWebhook();
          return await nipWebhook.handleFinancialInstitutionList(req, res);
        }
        
        case 'paystack':
          return await this.handlePaystackWebhook(req, res);
        
        case 'xml':
          return await this.handleXmlWebhook(req, res);
        
        case 'csv':
          return await this.handleCsvWebhook(req, res);
        
        default:
          logger.warn(`Unknown gateway type: ${gateway}`);
          return res.status(400).json({
            success: false,
            message: `Unsupported gateway: ${gateway}`
          });
      }
    } catch (error) {
      logger.error(`Error processing ${gateway} webhook:`, error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error processing webhook',
        error: error.message
      });
    }
  };

  /**
   * Handle Paystack Webhook - External Bank Transfers
   * Delegates to PaystackController for processing
   */
  handlePaystackWebhook = async (req, res) => {
    try {
      // Log that we're processing a Paystack external bank transfer
      logger.info('📥 Processing Paystack external bank transfer webhook', {
        event: req.body?.event,
        reference: req.body?.data?.reference,
        amount: req.body?.data?.amount ? req.body.data.amount / 100 : null,
        gateway: 'paystack'
      });

      // Dynamically import PaystackController to avoid circular dependency
      const PaystackController = (await import('./PaystackController.js')).default;
      
      // Delegate to PaystackController's handleWebhook method
      return await PaystackController.handleWebhook(req, res);
      
    } catch (error) {
      logger.error('❌ Paystack external bank webhook handling failed:', {
        error: error.message,
        stack: error.stack,
        body: req.body
      });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to process Paystack external bank webhook',
        error: error.message
      });
    }
  };

  /**
   * Handle NIP Funds Transfer
   * Business Rules:
   * 1. InwardFundsTransfer: Status = ACTIVE ('A')
   * 2. CustomerAccount: Update all balances, Status = ACTIVE
   * 3. PendingGLTransaction: Status = PENDING (for OS processing)
   */
  handleNIPFundsTransfer = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const payload = req.body;
      logger.info('📥 Processing NIP funds transfer:', payload);

      // Extract NIP specific fields
      const sessionId = payload.SessionID || payload.sessionId;
      const destinationInstitution = payload.DestinationInstitutionCode || payload.destinationInstitution;
      const channelCode = payload.ChannelCode || payload.channelCode;
      const transactionFee = payload.TransactionFee || payload.transactionFee || 0;
      const transactionLocation = payload.TransactionLocation || payload.transactionLocation;

      // Map webhook data to InwardFundsTransfer format
      const transferData = {
        // NIP Session ID for tracking
        NIP_SESSION_ID: sessionId,
        NIP_CHANNEL_CODE: channelCode,
        NIP_DESTINATION_INSTITUTION: destinationInstitution,
        NIP_TRANSACTION_FEE: transactionFee,
        NIP_TRANSACTION_LOCATION: transactionLocation,
        
        // Core transfer data
        XFER_REF: payload.Reference || payload.xferRef || `NIP-${sessionId || Date.now()}`,
        XFER_AMT: parseFloat(payload.Amount || payload.xferAmt || 0),
        XFER_CRNCY_ID: 1, // Default to NGN
        PAY_CRNCY_ID: 1,
        PAY_EXCH_RATE: 1,
        VALUE_DT: new Date(),
        PRIORITY_LEVEL_CD: 'NORMAL',
        
        // Beneficiary details
        BENEFICIARY_NM: payload.BeneficiaryName || payload.beneficiaryName,
        BENEFICIARY_ACCT: payload.BeneficiaryAccountNumber || payload.beneficiaryAccount,
        BENEFICIARY_BANK_NM: payload.BeneficiaryBankName || payload.beneficiaryBankName,
        BENEFICIARY_BANK_CNTRY_ID: 1,
        BENEFICIARY_BVN: payload.BeneficiaryBVN || payload.beneficiaryBvn,
        
        // Remitter details
        REMITTER_NM: payload.OriginatorName || payload.remitterName,
        REMITTER_ACCT_NO: payload.OriginatorAccountNumber || payload.remitterAccountNo,
        ORIGINATOR_BVN: payload.OriginatorBVN || payload.originatorBvn,
        
        // Remitter bank details
        REMITTER_BIC_ID: payload.OriginatorBankCode || payload.remitterBankCode,
        REMITTER_BANK_NM: payload.OriginatorBankName || payload.remitterBankName,
        REMITTER_BANK_CNTRY_ID: 1,
        
        // Charges
        SENDING_BANK_CHRG: transactionFee,
        RECIEVING_BANK_CHRG: 0,
        
        // Payment method
        PAYMENT_MTD_CD: 'NIP',
        PAY_DETAILS: payload.Narration || payload.payDetails,
        ADDTL_INSTRUCTION1: payload.Narration || null,
        
        // Status - Set to ACTIVE immediately
        REC_ST: RECORD_STATUS.ACTIVE,
        USER_ID: 'NIP_WEBHOOK',
        CREATED_BY: 'NIP_WEBHOOK',
        VERSION_NO: 1,
        ROW_TS: new Date(),
        CREATE_DT: new Date(),
        SYS_CREATE_TS: new Date(),
        REPAIR_FG: 'N',
        FOREIGN_IFT_FG: 'N',
        IS_REVERSAL: false
      };

      // Calculate totals
      transferData.TOTAL_CHRG = (transferData.SENDING_BANK_CHRG || 0) + (transferData.RECIEVING_BANK_CHRG || 0);
      transferData.NET_AMT_XFERED = transferData.XFER_AMT - transferData.TOTAL_CHRG;

      // Validate required fields
      if (!transferData.BENEFICIARY_ACCT) {
        throw new Error('Beneficiary account number is required');
      }
      if (!transferData.XFER_REF) {
        throw new Error('Transfer reference is required');
      }

      // Find customer account
      const customerAccount = await CustomerAccount.findOne({
        where: { account_number: transferData.BENEFICIARY_ACCT },
        transaction
      });

      if (!customerAccount) {
        throw new Error(`Customer account not found: ${transferData.BENEFICIARY_ACCT}`);
      }

      // Capture previous balances
      const previousBalances = {
        current: parseFloat(customerAccount.current_balance) || 0,
        ledger: parseFloat(customerAccount.ledger_balance) || 0,
        cleared: parseFloat(customerAccount.cleared_balance) || 0,
        available: parseFloat(customerAccount.available_balance) || 0
      };

      const transferAmount = transferData.XFER_AMT;

      // STEP 1: Create Inward Funds Transfer (ACTIVE)
      const inwardTransfer = await InwardFundsTransfer.create(transferData, { 
        transaction,
        returning: true 
      });

      logger.info(`✅ Created inward transfer: ${inwardTransfer.INWD_FUNDS_XFER_ID} (Status: ACTIVE)`);

      // STEP 2: Update Customer Account (ACTIVE with new balances)
      await customerAccount.update({
        current_balance: sequelize.literal(`current_balance + ${transferAmount}`),
        ledger_balance: sequelize.literal(`ledger_balance + ${transferAmount}`),
        cleared_balance: sequelize.literal(`cleared_balance + ${transferAmount}`),
        available_balance: sequelize.literal(`available_balance + ${transferAmount}`),
        last_transaction_date: new Date(),
        status: 'ACTIVE'
      }, { transaction });

      logger.info(`✅ Updated customer account: ${customerAccount.account_number}`);

      // STEP 3: Create Pending GL Transaction (PENDING - for OS to process)
      const pendingGLTransaction = await PendingGLTransaction.create({
        JOURNAL_ID: `NIP-${inwardTransfer.INWD_FUNDS_XFER_ID}-${Date.now()}`,
        TRANSACTION_ID: `GL-NIP-${inwardTransfer.INWD_FUNDS_XFER_ID}-${Date.now()}`,
        GL_ACCT_NO: customerAccount.gl_account_number || customerAccount.account_number,
        TRANSACTION_TYPE: 'CR',
        AMOUNT: transferAmount,
        CREATED_BY: 'NIP_WEBHOOK',
        SUB_LEDGER_NO: '000',
        SEG_NO: 1,
        ACCT_DESC: `NIP Credit: ${transferData.REMITTER_NM || 'Unknown'} - ${transferData.XFER_REF}`,
        BAL_CD: '01',
        GL_ACCT_CAT: 'LIABILITY',
        CURRENCY_CODE: 'NGN',
        EXCHANGE_RATE: 1,
        REFERENCE_ID: transferData.XFER_REF,
        STATUS: 'PENDING', // Critical: Set to PENDING for OS processing
        
        // Balance tracking
        PREVIOUS_BALANCE: previousBalances.current,
        PREVIOUS_LEDGER_BALANCE: previousBalances.ledger,
        PREVIOUS_CLEARED_BALANCE: previousBalances.cleared,
        PREVIOUS_AVAILABLE_BALANCE: previousBalances.available,
        
        BALANCE_AFTER: previousBalances.current + transferAmount,
        LEDGER_BALANCE_AFTER: previousBalances.ledger + transferAmount,
        CLEARED_BALANCE_AFTER: previousBalances.cleared + transferAmount,
        AVAILABLE_BALANCE_AFTER: previousBalances.available + transferAmount,
        
        // References
        INWD_FUNDS_XFER_ID: inwardTransfer.INWD_FUNDS_XFER_ID,
        NIP_SESSION_ID: sessionId,
        XFER_REF: transferData.XFER_REF,
        NARRATION: payload.Narration || `NIP Credit from ${transferData.REMITTER_NM || 'Unknown'}`,
        IS_REVERSAL: false,
        
        // Balance impact summary for audit
        BALANCE_IMPACT: JSON.stringify({
          previous: previousBalances,
          after: {
            current: previousBalances.current + transferAmount,
            ledger: previousBalances.ledger + transferAmount,
            cleared: previousBalances.cleared + transferAmount,
            available: previousBalances.available + transferAmount
          },
          change: {
            current: transferAmount,
            ledger: transferAmount,
            cleared: transferAmount,
            available: transferAmount
          },
          transaction_type: 'CR',
          source: 'NIP_INWARD',
          session_id: sessionId,
          channel_code: channelCode,
          destination_institution: destinationInstitution,
          transaction_fee: transactionFee
        })
      }, { transaction });

      logger.info(`✅ Created Pending GL Transaction: ${pendingGLTransaction.TRANSACTION_ID} (Status: PENDING)`);

      // Commit transaction
      await transaction.commit();

      // Return success response
      return res.status(201).json({
        success: true,
        message: 'NIP funds transfer processed successfully',
        data: {
          inwardTransfer: {
            id: inwardTransfer.INWD_FUNDS_XFER_ID,
            reference: inwardTransfer.XFER_REF,
            amount: inwardTransfer.XFER_AMT,
            status: inwardTransfer.REC_ST,
            sessionId: inwardTransfer.NIP_SESSION_ID
          },
          customerAccount: {
            accountNumber: customerAccount.account_number,
            accountName: customerAccount.account_name,
            balances: {
              previous: previousBalances,
              current: {
                current: previousBalances.current + transferAmount,
                ledger: previousBalances.ledger + transferAmount,
                cleared: previousBalances.cleared + transferAmount,
                available: previousBalances.available + transferAmount
              }
            }
          },
          pendingGLTransaction: {
            transactionId: pendingGLTransaction.TRANSACTION_ID,
            status: pendingGLTransaction.STATUS,
            amount: pendingGLTransaction.AMOUNT,
            type: pendingGLTransaction.TRANSACTION_TYPE,
            account: pendingGLTransaction.GL_ACCT_NO
          }
        }
      });

    } catch (error) {
      await transaction.rollback();
      
      logger.error('❌ NIP funds transfer failed:', {
        message: error.message,
        stack: error.stack,
        payload: req.body
      });

      // NIP expected error response format
      return res.status(400).json({
        success: false,
        message: error.message || 'NIP funds transfer failed',
        error: {
          code: error.code || 'TRANSACTION_FAILED',
          description: error.message
        }
      });
    }
  };

  /**
   * Handle NIP Name Enquiry
   */
  handleNIPNameEnquiry = async (req, res) => {
    try {
      const { AccountNumber, DestinationInstitutionCode } = req.body;
      
      logger.info('Processing NIP name enquiry:', { AccountNumber, DestinationInstitutionCode });

      const customerAccount = await CustomerAccount.findOne({
        where: { account_number: AccountNumber }
      });

      if (!customerAccount) {
        return res.status(404).json({
          success: false,
          message: 'Account not found',
          code: 'ACCOUNT_NOT_FOUND'
        });
      }

      return res.json({
        success: true,
        AccountName: customerAccount.account_name,
        AccountNumber: customerAccount.account_number,
        BVN: customerAccount.bvn || null,
        KYCLevel: 3 // Default KYC level
      });

    } catch (error) {
      logger.error('NIP name enquiry failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'SERVER_ERROR'
      });
    }
  };

  /**
   * Handle NIP Status Enquiry
   */
  handleNIPStatusEnquiry = async (req, res) => {
    try {
      const { SessionID, TransactionReference } = req.body;
      
      logger.info('Processing NIP status enquiry:', { SessionID, TransactionReference });

      const transfer = await InwardFundsTransfer.findOne({
        where: {
          [sequelize.Op.or]: [
            { NIP_SESSION_ID: SessionID },
            { XFER_REF: TransactionReference }
          ]
        }
      });

      if (!transfer) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found',
          code: 'TRANSACTION_NOT_FOUND'
        });
      }

      // Map our status to NIP expected status
      let nipStatus;
      switch (transfer.REC_ST) {
        case 'A':
          nipStatus = 'Successful';
          break;
        case 'P':
          nipStatus = 'Pending';
          break;
        case 'R':
          nipStatus = 'Failed';
          break;
        default:
          nipStatus = 'Unknown';
      }

      return res.json({
        success: true,
        SessionID: transfer.NIP_SESSION_ID,
        TransactionReference: transfer.XFER_REF,
        Amount: transfer.XFER_AMT,
        Status: nipStatus,
        ResponseCode: '00',
        ResponseDescription: 'Successful'
      });

    } catch (error) {
      logger.error('NIP status enquiry failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'SERVER_ERROR'
      });
    }
  };

  /**
   * Handle NIP Reversal
   */
  handleNIPReversal = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { SessionID, TransactionReference, Amount, Reason } = req.body;
      
      logger.info('Processing NIP reversal:', { SessionID, TransactionReference, Amount, Reason });

      // Find original transaction
      const originalTransfer = await InwardFundsTransfer.findOne({
        where: {
          [sequelize.Op.or]: [
            { NIP_SESSION_ID: SessionID },
            { XFER_REF: TransactionReference }
          ]
        },
        transaction
      });

      if (!originalTransfer) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Original transaction not found',
          code: 'ORIGINAL_TRANSACTION_NOT_FOUND'
        });
      }

      // Check if already reversed
      if (originalTransfer.IS_REVERSAL || originalTransfer.ORIGINAL_XFER_REF) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Transaction already reversed',
          code: 'ALREADY_REVERSED'
        });
      }

      // Find customer account
      const customerAccount = await CustomerAccount.findOne({
        where: { account_number: originalTransfer.BENEFICIARY_ACCT },
        transaction
      });

      if (!customerAccount) {
        await transaction.rollback();
        throw new Error(`Customer account not found: ${originalTransfer.BENEFICIARY_ACCT}`);
      }

      // Check if account has sufficient balance for reversal
      if (parseFloat(customerAccount.available_balance) < originalTransfer.XFER_AMT) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance for reversal',
          code: 'INSUFFICIENT_BALANCE'
        });
      }

      // Capture previous balances
      const previousBalances = {
        current: parseFloat(customerAccount.current_balance) || 0,
        ledger: parseFloat(customerAccount.ledger_balance) || 0,
        cleared: parseFloat(customerAccount.cleared_balance) || 0,
        available: parseFloat(customerAccount.available_balance) || 0
      };

      const reversalAmount = originalTransfer.XFER_AMT;

      // STEP 1: Create reversal Inward Funds Transfer
      const reversalData = {
        ...originalTransfer.toJSON(),
        INWD_FUNDS_XFER_ID: undefined, // Let auto-increment generate new ID
        XFER_REF: `REV-${originalTransfer.XFER_REF}`,
        REC_ST: RECORD_STATUS.ACTIVE,
        IS_REVERSAL: true,
        ORIGINAL_XFER_REF: originalTransfer.XFER_REF,
        REVERSAL_REASON: Reason || 'NIP Reversal',
        REVERSAL_DATE: new Date(),
        REVERSED_BY: 'NIP_SYSTEM',
        NIP_SESSION_ID: `${originalTransfer.NIP_SESSION_ID}-REV`,
        CREATED_BY: 'NIP_REVERSAL',
        USER_ID: 'NIP_REVERSAL',
        ROW_TS: new Date(),
        CREATE_DT: new Date(),
        SYS_CREATE_TS: new Date()
      };

      const reversalTransfer = await InwardFundsTransfer.create(reversalData, { transaction });

      // STEP 2: Reverse Customer Account balances (debit)
      await customerAccount.update({
        current_balance: sequelize.literal(`current_balance - ${reversalAmount}`),
        ledger_balance: sequelize.literal(`ledger_balance - ${reversalAmount}`),
        cleared_balance: sequelize.literal(`cleared_balance - ${reversalAmount}`),
        available_balance: sequelize.literal(`available_balance - ${reversalAmount}`),
        last_transaction_date: new Date()
      }, { transaction });

      // STEP 3: Create reversal Pending GL Transaction (PENDING)
      const pendingGLTransaction = await PendingGLTransaction.create({
        JOURNAL_ID: `NIP-REV-${reversalTransfer.INWD_FUNDS_XFER_ID}`,
        TRANSACTION_ID: `GL-REV-${reversalTransfer.INWD_FUNDS_XFER_ID}`,
        GL_ACCT_NO: customerAccount.gl_account_number || customerAccount.account_number,
        TRANSACTION_TYPE: 'DR', // Debit for reversal
        AMOUNT: reversalAmount,
        CREATED_BY: 'NIP_REVERSAL',
        SUB_LEDGER_NO: '000',
        SEG_NO: 1,
        ACCT_DESC: `NIP Reversal: ${Reason || 'Reversal'} - Original: ${originalTransfer.XFER_REF}`,
        BAL_CD: '01',
        GL_ACCT_CAT: 'LIABILITY',
        CURRENCY_CODE: 'NGN',
        EXCHANGE_RATE: 1,
        REFERENCE_ID: reversalTransfer.XFER_REF,
        STATUS: 'PENDING', // PENDING for OS processing
        
        // Balance tracking
        PREVIOUS_BALANCE: previousBalances.current,
        PREVIOUS_LEDGER_BALANCE: previousBalances.ledger,
        PREVIOUS_CLEARED_BALANCE: previousBalances.cleared,
        PREVIOUS_AVAILABLE_BALANCE: previousBalances.available,
        
        BALANCE_AFTER: previousBalances.current - reversalAmount,
        LEDGER_BALANCE_AFTER: previousBalances.ledger - reversalAmount,
        CLEARED_BALANCE_AFTER: previousBalances.cleared - reversalAmount,
        AVAILABLE_BALANCE_AFTER: previousBalances.available - reversalAmount,
        
        // References
        INWD_FUNDS_XFER_ID: reversalTransfer.INWD_FUNDS_XFER_ID,
        NIP_SESSION_ID: reversalTransfer.NIP_SESSION_ID,
        XFER_REF: reversalTransfer.XFER_REF,
        NARRATION: `NIP Reversal: ${Reason || 'Reversal'}`,
        IS_REVERSAL: true,
        ORIGINAL_TRANSACTION_ID: originalTransfer.XFER_REF,
        
        BALANCE_IMPACT: JSON.stringify({
          previous: previousBalances,
          after: {
            current: previousBalances.current - reversalAmount,
            ledger: previousBalances.ledger - reversalAmount,
            cleared: previousBalances.cleared - reversalAmount,
            available: previousBalances.available - reversalAmount
          },
          change: {
            current: -reversalAmount,
            ledger: -reversalAmount,
            cleared: -reversalAmount,
            available: -reversalAmount
          },
          transaction_type: 'DR',
          source: 'NIP_REVERSAL',
          original_session_id: originalTransfer.NIP_SESSION_ID,
          reason: Reason
        })
      }, { transaction });

      // Mark original as reversed
      await originalTransfer.update({
        IS_REVERSAL: true,
        REVERSAL_REASON: Reason,
        REVERSAL_DATE: new Date(),
        REVERSED_BY: 'NIP_SYSTEM'
      }, { transaction });

      await transaction.commit();

      return res.json({
        success: true,
        message: 'Reversal processed successfully',
        data: {
          reversalReference: reversalTransfer.XFER_REF,
          originalReference: originalTransfer.XFER_REF,
          amount: reversalAmount,
          status: 'SUCCESSFUL'
        }
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('NIP reversal failed:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Reversal failed',
        code: 'REVERSAL_FAILED'
      });
    }
  };

  /**
   * Handle JSON webhook transfers
   */
  handleJsonWebhook = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const payload = req.body;
      
      // Handle single transfer or batch
      const transfers = Array.isArray(payload) ? payload : [payload];
      
      logger.info(`Processing ${transfers.length} transfers from json`, {
        gateway: 'json'
      });

      const results = [];

      for (const transferData of transfers) {
        try {
          // Prepare the data object with EXACT column names matching the database
          const recordData = {
            // Required fields (no defaults in DB)
            XFER_REF: transferData.xferRef || transferData.reference || `TRF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            BENEFICIARY_ACCT: transferData.beneficiary?.account || transferData.beneficiaryAccount,
            
            // Amount fields
            XFER_AMT: Number(transferData.xferAmt || transferData.amount || 0),
            SENDING_BANK_CHRG: Number(transferData.sendingBankChrg || transferData.sendingBankCharge || 0),
            RECIEVING_BANK_CHRG: Number(transferData.receivingBankChrg || transferData.receivingBankCharge || 0),
            
            // Currency and exchange
            XFER_CRNCY_ID: Number(transferData.xferCrncyId || transferData.currencyId || 1),
            PAY_CRNCY_ID: Number(transferData.payCrncyId || transferData.paymentCurrencyId || 1),
            PAY_EXCH_RATE: Number(transferData.payExchRate || transferData.exchangeRate || 1.0000),
            
            // Dates
            VALUE_DT: transferData.valueDt ? new Date(transferData.valueDt) : new Date(),
            
            // Priority
            PRIORITY_LEVEL_CD: transferData.priorityLevelCd || transferData.priority || 'NORMAL',
            
            // Beneficiary details
            BENEFICIARY_NM: transferData.beneficiary?.name || transferData.beneficiaryName || null,
            BENEFICIARY_BIC_ID: transferData.beneficiary?.bicId ? Number(transferData.beneficiary.bicId) : 
                                (transferData.beneficiaryBicId ? Number(transferData.beneficiaryBicId) : null),
            BENEFICIARY_BANK_NM: transferData.beneficiary?.bankName || transferData.beneficiaryBankName || null,
            BENEFICIARY_BANK_CNTRY_ID: transferData.beneficiary?.bankCntryId ? Number(transferData.beneficiary.bankCntryId) : 
                                       (transferData.beneficiaryBankCntryId ? Number(transferData.beneficiaryBankCntryId) : 1),
            BENEFICIARY_ADDR_LINE1: transferData.beneficiary?.addressLine1 || transferData.beneficiaryAddressLine1 || null,
            BENEFICIARY_TEL_NO: transferData.beneficiary?.telephone || transferData.beneficiaryTelephone || null,
            BENEFICIARY_BVN: transferData.beneficiary?.bvn || transferData.beneficiaryBvn || null,
            
            // Remitter details
            REMITTER_NM: transferData.remitter?.name || transferData.remitterName || null,
            REMITTER_ACCT_NO: transferData.remitter?.accountNo || transferData.remitterAccountNo || null,
            REMITTER_BIC_ID: transferData.remitter?.bicId ? Number(transferData.remitter.bicId) : 
                            (transferData.remitterBicId ? Number(transferData.remitterBicId) : null),
            REMITTER_BANK_NM: transferData.remitter?.bankName || transferData.remitterBankName || null,
            ORIGINATOR_BVN: transferData.remitter?.bvn || transferData.originatorBvn || null,
            
            // Payment details
            PAYMENT_MTD_CD: transferData.paymentMtdCd || transferData.paymentMethod || 'GENERIC',
            PAY_DETAILS: transferData.payDetails || JSON.stringify(transferData),
            
            // Additional instructions
            ADDTL_INSTRUCTION1: transferData.additionalInstruction1 || transferData.narration || null,
            ADDTL_INSTRUCTION2: transferData.additionalInstruction2 || null,
            ADDTL_INSTRUCTION3: transferData.additionalInstruction3 || null,
            ADDTL_INSTRUCTION4: transferData.additionalInstruction4 || null,
            
            // NIP specific fields (if present)
            NIP_SESSION_ID: transferData.nipSessionId || transferData.SessionID || null,
            NIP_CHANNEL_CODE: transferData.nipChannelCode || transferData.ChannelCode || null,
            NIP_DESTINATION_INSTITUTION: transferData.nipDestinationInstitution || transferData.DestinationInstitutionCode || null,
            NIP_TRANSACTION_FEE: transferData.nipTransactionFee ? Number(transferData.nipTransactionFee) : 
                                (transferData.TransactionFee ? Number(transferData.TransactionFee) : null),
            NIP_TRANSACTION_LOCATION: transferData.nipTransactionLocation || transferData.TransactionLocation || null,
            NIP_RESPONSE_CODE: transferData.nipResponseCode || null,
            
            // Metadata - Set to ACTIVE for JSON webhooks
            REC_ST: RECORD_STATUS.ACTIVE,
            USER_ID: transferData.userId || transferData.user || 'WEBHOOK_JSON',
            CREATED_BY: transferData.createdBy || 'WEBHOOK_JSON',
            
            // Reversal fields
            IS_REVERSAL: transferData.isReversal || transferData.isReversal === true ? 1 : 0,
            ORIGINAL_XFER_REF: transferData.originalXferRef || transferData.originalReference || null,
            REVERSAL_REASON: transferData.reversalReason || null,
            REVERSAL_DATE: transferData.reversalDate ? new Date(transferData.reversalDate) : null,
            REVERSED_BY: transferData.reversedBy || null,
            
            // Batch processing
            BATCH_ID: transferData.batchId || null,
            
            // Auto-set fields
            VERSION_NO: 1,
            ROW_TS: new Date(),
            CREATE_DT: new Date(),
            SYS_CREATE_TS: new Date(),
            REPAIR_FG: 'N',
            FOREIGN_IFT_FG: transferData.foreignIftFg || transferData.isForeign || 'N'
          };

          // Calculate charges and net amount
          const sendingCharges = recordData.SENDING_BANK_CHRG || 0;
          const receivingCharges = recordData.RECIEVING_BANK_CHRG || 0;
          recordData.TOTAL_CHRG = sendingCharges + receivingCharges;
          recordData.NET_AMT_XFERED = recordData.XFER_AMT - recordData.TOTAL_CHRG;

          // Validate required fields
          if (!recordData.XFER_REF) {
            throw new Error("XFER_REF is required");
          }
          if (!recordData.BENEFICIARY_ACCT) {
            throw new Error("Beneficiary account is required");
          }

          // Find customer account
          const customerAccount = await CustomerAccount.findOne({
            where: { account_number: recordData.BENEFICIARY_ACCT },
            transaction
          });

          if (!customerAccount) {
            throw new Error(`Customer account not found: ${recordData.BENEFICIARY_ACCT}`);
          }

          // Capture previous balances
          const previousBalances = {
            current: parseFloat(customerAccount.current_balance) || 0,
            ledger: parseFloat(customerAccount.ledger_balance) || 0,
            cleared: parseFloat(customerAccount.cleared_balance) || 0,
            available: parseFloat(customerAccount.available_balance) || 0
          };

          const transferAmount = recordData.XFER_AMT;

          // Create the inward transfer record (ACTIVE)
          const created = await InwardFundsTransfer.create(recordData, {
            transaction,
            fields: Object.keys(recordData),
            returning: true
          });

          // Update customer account balances
          await customerAccount.update({
            current_balance: sequelize.literal(`current_balance + ${transferAmount}`),
            ledger_balance: sequelize.literal(`ledger_balance + ${transferAmount}`),
            cleared_balance: sequelize.literal(`cleared_balance + ${transferAmount}`),
            available_balance: sequelize.literal(`available_balance + ${transferAmount}`),
            last_transaction_date: new Date(),
            status: 'ACTIVE'
          }, { transaction });

          // Create Pending GL Transaction (PENDING)
          await PendingGLTransaction.create({
            JOURNAL_ID: `JNL-${created.INWD_FUNDS_XFER_ID}`,
            TRANSACTION_ID: `GL-${created.INWD_FUNDS_XFER_ID}`,
            GL_ACCT_NO: customerAccount.gl_account_number || customerAccount.account_number,
            TRANSACTION_TYPE: 'CR',
            AMOUNT: transferAmount,
            CREATED_BY: 'WEBHOOK_JSON',
            SUB_LEDGER_NO: '000',
            SEG_NO: 1,
            ACCT_DESC: `Credit: ${recordData.REMITTER_NM || 'Unknown'} - ${recordData.XFER_REF}`,
            BAL_CD: '01',
            GL_ACCT_CAT: 'LIABILITY',
            CURRENCY_CODE: 'NGN',
            EXCHANGE_RATE: 1,
            REFERENCE_ID: recordData.XFER_REF,
            STATUS: 'PENDING',
            PREVIOUS_BALANCE: previousBalances.current,
            PREVIOUS_LEDGER_BALANCE: previousBalances.ledger,
            PREVIOUS_CLEARED_BALANCE: previousBalances.cleared,
            PREVIOUS_AVAILABLE_BALANCE: previousBalances.available,
            BALANCE_AFTER: previousBalances.current + transferAmount,
            LEDGER_BALANCE_AFTER: previousBalances.ledger + transferAmount,
            CLEARED_BALANCE_AFTER: previousBalances.cleared + transferAmount,
            AVAILABLE_BALANCE_AFTER: previousBalances.available + transferAmount,
            INWD_FUNDS_XFER_ID: created.INWD_FUNDS_XFER_ID,
            XFER_REF: recordData.XFER_REF,
            NARRATION: recordData.ADDTL_INSTRUCTION1 || `Credit from ${recordData.REMITTER_NM || 'Unknown'}`,
            IS_REVERSAL: false,
            BALANCE_IMPACT: JSON.stringify({
              previous: previousBalances,
              after: {
                current: previousBalances.current + transferAmount,
                ledger: previousBalances.ledger + transferAmount,
                cleared: previousBalances.cleared + transferAmount,
                available: previousBalances.available + transferAmount
              },
              change: {
                current: transferAmount,
                ledger: transferAmount,
                cleared: transferAmount,
                available: transferAmount
              },
              transaction_type: 'CR',
              source: 'JSON_WEBHOOK'
            })
          }, { transaction });

          logger.info('Successfully created transfer', {
            id: created.INWD_FUNDS_XFER_ID,
            ref: created.XFER_REF,
            amount: created.XFER_AMT
          });

          results.push({
            success: true,
            transferId: created.INWD_FUNDS_XFER_ID,
            reference: created.XFER_REF,
            status: created.REC_ST
          });

        } catch (transferError) {
          logger.error('Failed to process individual transfer', {
            error: transferError.message,
            transferData: transferData
          });

          results.push({
            success: false,
            reference: transferData.xferRef || transferData.reference || 'unknown',
            error: transferError.message
          });
        }
      }

      // Check if all transfers failed
      const allFailed = results.every(r => !r.success);
      
      if (allFailed) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'All transfers failed',
          results
        });
      }

      await transaction.commit();

      return res.status(201).json({
        success: true,
        message: `Processed ${results.length} transfers`,
        results
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Failed to process JSON webhook transfer', {
        error: error.message,
        transferData: req.body
      });
      
      return res.status(400).json({
        success: false,
        message: 'Failed to process transfer',
        error: error.message
      });
    }
  };

  /**
   * Handle XML webhook transfers
   */
  handleXmlWebhook = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const xmlData = req.body; // Assuming XML has been parsed by middleware
      
      logger.info('Processing XML webhook transfer');
      
      // Convert XML to the same format as JSON handler
      // This assumes your XML has been parsed into a similar structure
      const transferData = this.xmlToTransferData(xmlData);
      
      // Reuse the JSON handler logic
      req.body = transferData;
      return await this.handleJsonWebhook(req, res);

    } catch (error) {
      await transaction.rollback();
      logger.error('Failed to process XML webhook', error);
      
      return res.status(400).json({
        success: false,
        message: 'Failed to process XML transfer',
        error: error.message
      });
    }
  };

  /**
   * Handle CSV webhook transfers
   */
  handleCsvWebhook = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const csvData = req.body; // Assuming CSV has been parsed by middleware
      
      logger.info('Processing CSV webhook transfer');
      
      // Convert CSV to the same format as JSON handler
      // This assumes your CSV has been parsed into an array of objects
      const transfers = Array.isArray(csvData) ? csvData : [csvData];
      
      // Reuse the JSON handler logic
      req.body = transfers;
      return await this.handleJsonWebhook(req, res);

    } catch (error) {
      await transaction.rollback();
      logger.error('Failed to process CSV webhook', error);
      
      return res.status(400).json({
        success: false,
        message: 'Failed to process CSV transfer',
        error: error.message
      });
    }
  };

  /**
   * Convert XML data to transfer data format
   */
  xmlToTransferData(xmlData) {
    // Implement XML parsing logic here
    // This is a placeholder - you'll need to adapt based on your XML structure
    return {
      xferRef: xmlData.Transfer?.Reference,
      xferAmt: parseFloat(xmlData.Transfer?.Amount),
      beneficiary: {
        name: xmlData.Beneficiary?.Name,
        account: xmlData.Beneficiary?.AccountNumber
      },
      remitter: {
        name: xmlData.Remitter?.Name,
        accountNo: xmlData.Remitter?.AccountNumber
      }
      // Map other fields as needed
    };
  }

  /**
   * Simple webhook endpoint for backward compatibility
   */
  simpleWebhook = async (req, res) => {
    try {
      const payload = req.body;
      
      // Use the static mapper method if it exists
      const recordData = InwardFundsTransfer.mapWebhookData ? 
        InwardFundsTransfer.mapWebhookData(payload) : 
        this.mapLegacyWebhookData(payload);
      
      logger.debug('Creating transfer with data:', recordData);
      
      const transfer = await InwardFundsTransfer.create(recordData, {
        logging: (sql) => logger.debug(sql)
      });
      
      logger.info('Created transfer:', { 
        transferId: transfer.INWD_FUNDS_XFER_ID,
        reference: transfer.XFER_REF 
      });
      
      res.status(201).json({
        success: true,
        transferId: transfer.INWD_FUNDS_XFER_ID,
        reference: transfer.XFER_REF
      });
      
    } catch (error) {
      logger.error('Error creating transfer:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  };

  /**
   * Legacy webhook data mapper (if static method doesn't exist)
   */
  mapLegacyWebhookData(payload) {
    return {
      XFER_REF: payload.reference || payload.xferRef || `TRF_${Date.now()}`,
      XFER_AMT: parseFloat(payload.amount || payload.xferAmt || 0),
      XFER_CRNCY_ID: parseInt(payload.currencyId || payload.xferCrncyId || 1),
      PAY_CRNCY_ID: parseInt(payload.paymentCurrencyId || payload.payCrncyId || 1),
      PAY_EXCH_RATE: parseFloat(payload.exchangeRate || payload.payExchRate || 1),
      VALUE_DT: payload.valueDate ? new Date(payload.valueDate) : new Date(),
      PRIORITY_LEVEL_CD: payload.priority || payload.priorityLevelCd || 'NORMAL',
      BENEFICIARY_NM: payload.beneficiaryName || payload.beneficiary?.name,
      BENEFICIARY_ACCT: payload.beneficiaryAccount || payload.beneficiary?.account,
      BENEFICIARY_BANK_NM: payload.beneficiaryBank || payload.beneficiary?.bankName,
      REMITTER_NM: payload.remitterName || payload.remitter?.name,
      REC_ST: 'A',
      CREATED_BY: 'WEBHOOK',
      USER_ID: 'WEBHOOK',
      VERSION_NO: 1,
      ROW_TS: new Date(),
      CREATE_DT: new Date(),
      SYS_CREATE_TS: new Date(),
      REPAIR_FG: 'N',
      FOREIGN_IFT_FG: 'N',
      IS_REVERSAL: false
    };
  }

  /**
   * Health check endpoint
   */
  healthCheck = async (req, res) => {
    res.json({
      status: 'healthy',
      service: 'webhook-controller',
      timestamp: new Date().toISOString(),
      supportedGateways: ['json', 'xml', 'csv', 'nip', 'nip_name_enquiry', 'nip_status_enquiry', 'nip_reversal', 'paystack']
    });
  };
}

// Create and export a singleton instance
const webhookController = new WebhookController();
export default webhookController;