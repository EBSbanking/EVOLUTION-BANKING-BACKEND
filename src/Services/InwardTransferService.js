// src/services/InwardTransferService.js
import sequelize from '../../config/db.js';
import Customer from '../models/Customer.js';
import CustomerAccount from '../models/CustomerAccount.js';
import InwardFundsTransfer, { RECORD_STATUS } from '../models/InwardFundsTransfer.js';
import PendingInwardTransaction from '../models/PendingInwardTransaction.js';
import PaymentReference from '../models/PaymentReference.js';
import PendingTransfer from '../models/PendingTransfer.js';
import logger from '../utils/logger.js';

class InwardTransferService {

  /**
   * Process an inward transfer (from any source)
   * This is the SINGLE source of truth for processing inward transfers
   */
  async processInwardTransfer({
    source, // 'PAYSTACK', 'EXTERNAL_BANK', 'NIP', etc.
    transferRef,
    amount,
    beneficiaryAccount,
    beneficiaryName,
    remitterName,
    remitterAccount,
    remitterBank,
    narration,
    transactionRef,
    metadata = {},
    customerId = null, // Optional: if customer is already known
    autoMatch = true // Try to auto-match customer
  }) {
    const transaction = await sequelize.transaction();

    try {
      let customer = null;
      let matchedBy = null;

      // Step 1: Identify the customer
      if (customerId) {
        // Customer already identified
        customer = await Customer.findByPk(customerId);
        if (!customer) {
          throw new Error(`Customer ${customerId} not found`);
        }
        matchedBy = 'manual_match';
      } else if (autoMatch) {
        // Try to auto-match using various strategies
        const matchResult = await this.identifyCustomer({
          beneficiaryAccount,
          remitterName,
          remitterAccount,
          remitterBank,
          narration
        });
        
        if (matchResult) {
          customer = matchResult.customer;
          matchedBy = matchResult.matched_by;
        }
      }

      // Step 2: If customer found, credit their account
      if (customer) {
        const result = await this.creditCustomerAccount(
          customer,
          {
            sender_name: remitterName,
            sender_account: remitterAccount,
            sender_bank: remitterBank,
            beneficiary_account: beneficiaryAccount,
            amount,
            narration,
            transaction_ref: transactionRef,
            source,
            matched_by: matchedBy
          },
          transaction
        );

        await transaction.commit();

        logger.info(`✅ Inward transfer processed from ${source}`, {
          customer: customer.getFullName(),
          amount,
          account: beneficiaryAccount,
          matched_by: matchedBy
        });

        return {
          success: true,
          customer,
          customer_id: customer.id,
          customer_name: customer.getFullName(),
          evolution_account: customer.evolution_account_number,
          amount,
          new_balance: result.new_balance,
          matched_by: matchedBy,
          inward_transfer_id: result.inwardTransfer.INWD_FUNDS_XFER_ID,
          pending_inward_id: result.pendingInward.id
        };

      } else {
        // Step 3: No customer found - put in pending queue
        const pending = await PendingTransfer.create({
          sender_account: remitterAccount,
          sender_name: remitterName,
          sender_bank: remitterBank,
          beneficiary_account: beneficiaryAccount,
          amount,
          narration,
          transaction_ref: transactionRef,
          transaction_date: new Date(),
          status: 'PENDING_MATCHING',
          notes: `Auto-generated from ${source}`,
          source: source,
          metadata: metadata
        }, { transaction });

        await transaction.commit();

        logger.warn(`⚠️ Inward transfer pending matching from ${source}`, {
          pending_id: pending.id,
          amount,
          remitter: remitterName
        });

        return {
          success: false,
          pending_id: pending.id,
          message: 'Unable to identify customer. Transfer pending manual review.',
          amount,
          remitter_name: remitterName,
          remitter_bank: remitterBank,
          source: source
        };
      }

    } catch (error) {
      await transaction.rollback();
      logger.error(`❌ Error processing inward transfer from ${source}:`, {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Identify customer from transfer data
   */
  async identifyCustomer({
    beneficiaryAccount,
    remitterName,
    remitterAccount,
    remitterBank,
    narration
  }) {
    // Strategy 1: Customer code in narration (EVO-12345)
    if (narration) {
      const codeMatch = narration.match(/EVO-(\d+)/);
      if (codeMatch) {
        const customerCode = `EVO-${codeMatch[1]}`;
        const customer = await Customer.findOne({
          where: { customer_code: customerCode }
        });
        if (customer) {
          logger.info(`✅ Customer identified by customer_code: ${customerCode}`);
          return { customer, matched_by: 'customer_code' };
        }
      }

      // Strategy 2: Payment reference in narration (INV-2024-001)
      const refMatch = narration.match(/INV-(\d{4}-\d+)/);
      if (refMatch) {
        const refNumber = `INV-${refMatch[1]}`;
        const reference = await PaymentReference.findOne({
          where: { reference_number: refNumber, status: 'PENDING' }
        });
        if (reference) {
          const customer = await Customer.findByPk(reference.customer_id);
          if (customer) {
            logger.info(`✅ Customer identified by payment_reference: ${refNumber}`);
            return { customer, matched_by: 'payment_reference' };
          }
        }
      }
    }

    // Strategy 3: Match by Evolution account number
    if (beneficiaryAccount) {
      const customer = await Customer.findOne({
        where: { evolution_account_number: beneficiaryAccount }
      });
      if (customer) {
        logger.info(`✅ Customer identified by evolution_account: ${beneficiaryAccount}`);
        return { customer, matched_by: 'evolution_account' };
      }
    }

    // Strategy 4: Match by external account + bank
    if (remitterAccount && remitterBank) {
      const customer = await Customer.findOne({
        where: {
          external_account_number: remitterAccount,
          external_bank_name: remitterBank
        }
      });
      if (customer) {
        logger.info(`✅ Customer identified by external_account: ${remitterAccount}`);
        return { customer, matched_by: 'external_account' };
      }
    }

    // Strategy 5: Match by customer name (fallback)
    if (remitterName) {
      const customer = await Customer.findOne({
        where: {
          [sequelize.Op.or]: [
            { CUST_NM: remitterName },
            { FIRST_NAME: remitterName.split(' ')[0] },
            { LAST_NAME: remitterName.split(' ').slice(-1)[0] }
          ]
        }
      });
      if (customer) {
        logger.info(`✅ Customer identified by name_match: ${remitterName}`);
        return { customer, matched_by: 'name_match' };
      }
    }

    // No match
    return null;
  }

  /**
   * Credit customer's Evolution account
   */
  async creditCustomerAccount(customer, transferData, transaction) {
    // Find the customer's Evolution account
    const account = await CustomerAccount.findOne({
      where: { 
        CUST_ID: customer.CUST_ID 
      },
      transaction
    });

    if (!account) {
      throw new Error(`No Evolution account found for customer ${customer.CUST_ID}`);
    }

    const previousBalances = {
      current: parseFloat(account.current_balance) || 0,
      ledger: parseFloat(account.ledger_balance) || 0,
      cleared: parseFloat(account.cleared_balance) || 0,
      available: parseFloat(account.available_balance) || 0
    };

    const transferAmount = transferData.amount;

    // Update account balances
    await account.update({
      current_balance: parseFloat(account.current_balance) + transferAmount,
      ledger_balance: parseFloat(account.ledger_balance) + transferAmount,
      cleared_balance: parseFloat(account.cleared_balance) + transferAmount,
      available_balance: parseFloat(account.available_balance) + transferAmount,
      updated_at: new Date()
    }, { transaction });

    // Create Inward Funds Transfer record
    const inwardTransfer = await InwardFundsTransfer.create({
      XFER_REF: transferData.transaction_ref || `TRF-${Date.now()}`,
      XFER_AMT: transferAmount,
      XFER_CRNCY_ID: 1,
      PAY_CRNCY_ID: 1,
      PAY_EXCH_RATE: 1,
      VALUE_DT: new Date(),
      PRIORITY_LEVEL_CD: 'NORMAL',
      BENEFICIARY_NM: account.account_name,
      BENEFICIARY_ACCT: account.account_number,
      BENEFICIARY_BANK_NM: 'Evolution Banking',
      BENEFICIARY_BANK_CNTRY_ID: 1,
      REMITTER_NM: transferData.sender_name,
      REMITTER_ACCT_NO: transferData.sender_account,
      REMITTER_BANK_NM: transferData.sender_bank,
      REMITTER_BANK_CNTRY_ID: 1,
      PAYMENT_MTD_CD: transferData.source || 'BANK_TRANSFER',
      PAY_DETAILS: JSON.stringify({
        source: transferData.source,
        matched_by: transferData.matched_by,
        metadata: transferData.metadata
      }),
      ADDTL_INSTRUCTION1: transferData.narration,
      REC_ST: RECORD_STATUS.ACTIVE,
      USER_ID: transferData.source || 'SYSTEM',
      CREATED_BY: transferData.source || 'SYSTEM',
      VERSION_NO: 1,
      ROW_TS: new Date(),
      CREATE_DT: new Date(),
      SYS_CREATE_TS: new Date(),
      REPAIR_FG: 'N',
      FOREIGN_IFT_FG: 'N',
      IS_REVERSAL: false
    }, { transaction });

    // ✅ Create Pending Inward Transaction (for OS to process)
    const pendingInward = await PendingInwardTransaction.create({
      INWD_FUNDS_XFER_ID: inwardTransfer.INWD_FUNDS_XFER_ID,
      XFER_REF: inwardTransfer.XFER_REF,
      GL_ACCT_NO: account.account_number,
      TRANSACTION_TYPE: 'CREDIT',
      AMOUNT: transferAmount,
      CRNCY_ID: 1,
      TRANSACTION_DATE: new Date(),
      CREATED_BY: transferData.source || 'SYSTEM',
      JOURNAL_ID: null,
      STATUS: 'PENDING',
      processedAt: null,
      errorMessage: null
    }, { transaction });

    logger.info(`✅ Credited customer ${customer.CUST_ID} with ₦${transferAmount}`, {
      account: account.account_number,
      previous_balance: previousBalances.current,
      new_balance: account.current_balance + transferAmount,
      sender: transferData.sender_name,
      inward_transfer_id: inwardTransfer.INWD_FUNDS_XFER_ID,
      pending_inward_id: pendingInward.id
    });

    return {
      new_balance: account.current_balance + transferAmount,
      inwardTransfer,
      pendingInward,
      matched_by: transferData.matched_by || 'unknown'
    };
  }

  /**
   * Process a pending inward transaction (called by OS)
   * POST /api/internal/pending-inward/:id/process
   */
  async processPendingInward(pendingInwardId, processedBy = 'SYSTEM') {
    const transaction = await sequelize.transaction();

    try {
      const pending = await PendingInwardTransaction.findByPk(pendingInwardId, {
        transaction
      });

      if (!pending) {
        throw new Error(`Pending inward transaction ${pendingInwardId} not found`);
      }

      if (pending.STATUS !== 'PENDING') {
        throw new Error(`Pending inward transaction is already ${pending.STATUS}`);
      }

      // Find the inward transfer
      const inwardTransfer = await InwardFundsTransfer.findByPk(
        pending.INWD_FUNDS_XFER_ID,
        { transaction }
      );

      if (!inwardTransfer) {
        throw new Error(`Inward transfer ${pending.INWD_FUNDS_XFER_ID} not found`);
      }

      // Mark as processed
      await pending.update({
        STATUS: 'PROCESSED',
        processedAt: new Date(),
        JOURNAL_ID: `JNL-${Date.now()}`
      }, { transaction });

      await transaction.commit();

      logger.info(`✅ Pending inward transaction processed: ${pendingInwardId}`, {
        processed_by: processedBy,
        amount: pending.AMOUNT,
        reference: pending.XFER_REF
      });

      return {
        success: true,
        pendingInward: pending,
        inwardTransfer: inwardTransfer
      };

    } catch (error) {
      await transaction.rollback();
      logger.error(`❌ Error processing pending inward transaction:`, {
        error: error.message,
        pendingInwardId
      });
      throw error;
    }
  }

  /**
   * Get pending inward transactions (for OS)
   * GET /api/internal/pending-inward
   */
  async getPendingInwardTransactions(filters = {}) {
    try {
      const { status = 'PENDING', startDate, endDate, limit = 100, offset = 0 } = filters;

      const where = {};
      if (status) where.STATUS = status;
      
      if (startDate && endDate) {
        where.TRANSACTION_DATE = {
          [sequelize.Op.between]: [new Date(startDate), new Date(endDate)]
        };
      } else if (startDate) {
        where.TRANSACTION_DATE = { [sequelize.Op.gte]: new Date(startDate) };
      } else if (endDate) {
        where.TRANSACTION_DATE = { [sequelize.Op.lte]: new Date(endDate) };
      }

      const { count, rows } = await PendingInwardTransaction.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'ASC']]
      });

      return {
        success: true,
        data: rows,
        pagination: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(count / limit)
        }
      };

    } catch (error) {
      logger.error('Error fetching pending inward transactions:', error);
      throw error;
    }
  }

  /**
   * Get inward transfer by reference
   */
  async getInwardTransferByReference(reference) {
    try {
      const transfer = await InwardFundsTransfer.findOne({
        where: { XFER_REF: reference }
      });

      if (!transfer) {
        return null;
      }

      // Get pending inward transaction if exists
      const pending = await PendingInwardTransaction.findOne({
        where: { INWD_FUNDS_XFER_ID: transfer.INWD_FUNDS_XFER_ID }
      });

      return {
        transfer,
        pending
      };

    } catch (error) {
      logger.error('Error fetching inward transfer:', error);
      throw error;
    }
  }

  /**
   * Reject a pending inward transaction
   */
  async rejectPendingInward(pendingInwardId, reason, rejectedBy = 'SYSTEM') {
    const transaction = await sequelize.transaction();

    try {
      const pending = await PendingInwardTransaction.findByPk(pendingInwardId, {
        transaction
      });

      if (!pending) {
        throw new Error(`Pending inward transaction ${pendingInwardId} not found`);
      }

      if (pending.STATUS !== 'PENDING') {
        throw new Error(`Pending inward transaction is already ${pending.STATUS}`);
      }

      // Find the inward transfer
      const inwardTransfer = await InwardFundsTransfer.findByPk(
        pending.INWD_FUNDS_XFER_ID,
        { transaction }
      );

      if (inwardTransfer) {
        // Reverse the credit on the customer account
        const account = await CustomerAccount.findOne({
          where: { account_number: inwardTransfer.BENEFICIARY_ACCT },
          transaction
        });

        if (account) {
          await account.update({
            current_balance: account.current_balance - inwardTransfer.XFER_AMT,
            ledger_balance: account.ledger_balance - inwardTransfer.XFER_AMT,
            cleared_balance: account.cleared_balance - inwardTransfer.XFER_AMT,
            available_balance: account.available_balance - inwardTransfer.XFER_AMT,
            updated_at: new Date()
          }, { transaction });
        }

        // Update inward transfer status
        await inwardTransfer.update({
          REC_ST: 'R', // Reversed
          REVERSAL_REASON: reason,
          REVERSAL_DATE: new Date(),
          REVERSED_BY: rejectedBy
        }, { transaction });
      }

      // Mark pending as failed
      await pending.update({
        STATUS: 'FAILED',
        processedAt: new Date(),
        errorMessage: `Rejected: ${reason || 'No reason provided'}`
      }, { transaction });

      await transaction.commit();

      logger.info(`❌ Pending inward transaction rejected: ${pendingInwardId}`, {
        rejected_by: rejectedBy,
        reason: reason
      });

      return {
        success: true,
        pendingInward: pending,
        inwardTransfer: inwardTransfer
      };

    } catch (error) {
      await transaction.rollback();
      logger.error(`Error rejecting pending inward transaction:`, {
        error: error.message,
        pendingInwardId
      });
      throw error;
    }
  }
}

export default new InwardTransferService();