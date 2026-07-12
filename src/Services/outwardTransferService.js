// services/outwardTransferService.js
import axios from 'axios';
import { feeCalculator } from '../controllers/TransferFeeController.js';
import OutwardFundsTransfer from '../models/OutwardFundsTransfer.js';
import Transaction from '../models/Transaction.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import CustomerAccount from '../models/CustomerAccount.js';
import Customer from '../models/Customer.js';
import FeeTransaction from '../models/FeeTransaction.js';
import Charge from '../models/Charge.js';
import ChargeTier from '../models/ChargeTier.js';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';

class OutwardTransferService {
  constructor() {
    this.nipConfig = {
      institutionCode: process.env.NIP_INSTITUTION_CODE,
      nipEndpoint: process.env.NIP_OUTWARD_ENDPOINT,
      username: process.env.NIP_USERNAME,
      password: process.env.NIP_PASSWORD
    };
    this.paystackConfig = {
      secretKey: process.env.PAYSTACK_TEST_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY,
      apiUrl: process.env.PAYSTACK_WEBHOOK_URL || 'https://api.paystack.co',
    };
    this.glAccounts = {
      remitterDebit: process.env.GL_ACCOUNT_REMITTER || '1001',
      clearingCredit: process.env.GL_ACCOUNT_CLEARING || '2001',
    };
  }

  // ==================== Manual fee calculation ====================
  async getTransferFee(amount) {
    const charge = await Charge.findOne({
      where: {
        CHRG_TY: 'TRANSFER_FEE',
        REC_ST: 'A'
      },
      include: [
        {
          model: ChargeTier,
          as: 'tiers'
        }
      ]
    });

    if (!charge || !charge.tiers || charge.tiers.length === 0) {
      return 0;
    }

    const sortedTiers = charge.tiers.sort((a, b) => a.min_amount - b.min_amount);

    for (const tier of sortedTiers) {
      const min = parseFloat(tier.min_amount);
      const max = tier.max_amount !== null ? parseFloat(tier.max_amount) : Infinity;
      if (amount >= min && amount <= max) {
        if (tier.fee_type === 'FIXED') {
          return parseFloat(tier.fee_amount) || 0;
        } else if (tier.fee_type === 'PERCENTAGE') {
          return (amount * (parseFloat(tier.fee_percentage) || 0)) / 100;
        }
      }
    }
    return 0;
  }

  // ==================== Initiate ====================
  async initiateTransfer(transferData) {
    const transaction = await sequelize.transaction();
    try {
      console.log('🔍 Calculating fees for amount:', transferData.amount);
      let feeResult = await feeCalculator.calculateTransferFees(
        transferData.amount,
        transferData.transferType || 'NIP',
        transferData.channel || 'API',
        {
          currencyId: transferData.currencyId,
          customerTier: transferData.customerTier
        }
      );
      console.log('✅ Fee result from calculator:', JSON.stringify(feeResult, null, 2));

      let totalFee = feeResult?.data?.totals?.grandTotal || 0;
      if (totalFee === 0) {
        console.log('⚠️ Fee calculator returned 0, using manual fallback...');
        totalFee = await this.getTransferFee(transferData.amount);
        console.log('✅ Manual fee:', totalFee);
        feeResult = {
          success: true,
          data: {
            amount: transferData.amount,
            transferType: transferData.transferType || 'NIP',
            channel: transferData.channel || 'API',
            fees: [
              {
                type: 'TRANSFER_FEE',
                amount: totalFee,
                bearer: 'SENDER'
              }
            ],
            totals: {
              senderFees: totalFee,
              receiverFees: 0,
              totalVat: 0,
              grandTotal: totalFee
            },
            summary: {
              senderPays: totalFee,
              receiverPays: 0,
              totalDebitAmount: transferData.amount + totalFee,
              totalCreditAmount: transferData.amount
            }
          }
        };
      }

      if (!feeResult.success) {
        throw new Error(`Fee calculation failed: ${feeResult.error}`);
      }

      const xferRef = this.generateReference();
      const currencyId = transferData.currencyId || 3;

      const remitterAcct = await CustomerAccount.findOne({
        where: { account_number: transferData.remitter.account }
      });
      if (!remitterAcct) {
        throw new Error(`Remitter account ${transferData.remitter.account} not found`);
      }

      const customerId = remitterAcct.customerId || remitterAcct.CUST_ID || remitterAcct.cust_id || remitterAcct.customer_id;
      if (!customerId) {
        throw new Error(`Customer ID not found on account ${transferData.remitter.account}`);
      }

      const customer = await Customer.findOne({ where: { CUST_ID: customerId } });
      if (!customer) {
        throw new Error(`Customer with CUST_ID ${customerId} not found`);
      }

      const acctId = remitterAcct.id;
      const acctNo = remitterAcct.account_number;
      const acctNm = remitterAcct.account_name;
      const custId = customer.id;
      const buId = customer.BU_ID || customer.bu_id || transferData.buId || null;

      const outwardTransfer = await OutwardFundsTransfer.create({
        xferRef: xferRef,
        xferAmt: transferData.amount,
        xferCrncyId: currencyId,
        payCrncyId: currencyId,
        valueDt: new Date(),
        beneficiaryNm: transferData.beneficiary.name,
        beneficiaryAcct: transferData.beneficiary.account,
        beneficiaryBankNm: transferData.beneficiary.bankName || transferData.beneficiary.bankCode,
        beneficiaryBankCode: transferData.beneficiary.bankCode,
        remitterNm: transferData.remitter.name,
        remitterAcctNo: transferData.remitter.account,
        sendingBankChrg: feeResult.data.totals.senderFees,
        receivingBankChrg: feeResult.data.totals.receiverFees,
        nipTransactionFee: feeResult.data.totals.grandTotal - feeResult.data.totals.senderFees - feeResult.data.totals.receiverFees,
        totalChrg: feeResult.data.totals.grandTotal,
        netAmtXfered: transferData.amount - feeResult.data.totals.receiverFees,
        transactionStatus: 'INITIATED',
        recSt: 'P',
        userId: transferData.userId || 'SYSTEM',
        createdBy: transferData.userId || 'SYSTEM',
        ...transferData.metadata
      }, { transaction });

      const transactionRecord = await Transaction.create({
        ACCT_NO: acctNo,
        ACCT_ID: acctId,
        BU_ID: buId,
        CUST_ID: custId,
        ACCT_NM: acctNm,
        AMOUNT: transferData.amount,
        transactionDirection: 'DEBIT',
        transaction_date: new Date(),
        TRANSACTION_TYPE: 'ONLINE_TRANSFER',
        TRANSACTION_IDENTIFIER: xferRef,
        transaction_id: `TXN${xferRef}`,
        EVENT_ID: xferRef,
        TRAN_JOURNAL_ID: `JRN${xferRef}`,
        REFERENCE: xferRef,
        description: `Outward transfer to ${transferData.beneficiary.name} (${transferData.beneficiary.account}) via ${transferData.transferType || 'PAYSTACK'}`,
        currency: 'NGN',
        createdBy: transferData.userId || 'SYSTEM',
        status: 'PENDING',
        metadata: JSON.stringify({
          outwardTransferId: outwardTransfer.id,
          beneficiary: transferData.beneficiary,
          transferType: transferData.transferType || 'PAYSTACK',
          fee: feeResult.data.totals.grandTotal
        }),
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction });

      await GLAccountTransaction.create({
        JOURNAL_ID: `JRN${xferRef}`,
        TRANSACTION_ID: `TXN${xferRef}`,
        DR_ACCT_NO: this.glAccounts.remitterDebit,
        CR_ACCT_NO: this.glAccounts.clearingCredit,
        AMOUNT: transferData.amount,
        NARRATION: `Outward transfer to ${transferData.beneficiary.name} (${transferData.beneficiary.account})`,
        CREATED_BY: transferData.userId || 'SYSTEM',
        TRANSACTION_TYPE: 'OUTWARD_TRANSFER',
        CURRENCY_CODE: 'NGN',
        STATUS: 'PENDING',
        TransactionId: transactionRecord.id,
        createdAt: new Date(),
        updatedAt: new Date()
      }, { transaction });

      let result;
      if (transferData.transferType === 'PAYSTACK') {
        result = await this.initiatePaystackTransfer(outwardTransfer, transferData, transaction);
      } else {
        result = await this.initiateNIPTransfer(outwardTransfer, feeResult, transaction);
      }

      outwardTransfer.transactionId = transactionRecord.id;
      await outwardTransfer.save({ transaction });

      await transaction.commit();
      return {
        success: true,
        data: result.transfer.toJSON(),
        fees: feeResult.data,
        paymentInstructions: result.paymentInstructions,
        nipResponse: result.nipResponse
      };
    } catch (error) {
      await transaction.rollback();
      logger.error('Outward transfer failed:', error.message);
      throw error;
    }
  }

  // ==================== Approval (IDEMPOTENT) ====================
  async approveTransfer(reference, approverId) {
    let transaction = await sequelize.transaction();
    let committed = false;
    try {
      const transfer = await OutwardFundsTransfer.findOne({
        where: { xferRef: reference },
        attributes: [
          'id', 'xferRef', 'xferAmt', 'remitterAcctNo', 'transactionStatus',
          'totalChrg', 'xferCrncyId', 'payCrncyId',
          'valueDt', 'beneficiaryNm', 'beneficiaryAcct', 'beneficiaryBankNm',
          'beneficiaryBankCode', 'remitterNm', 'sendingBankChrg',
          'receivingBankChrg', 'nipTransactionFee', 'netAmtXfered',
          'recSt', 'userId', 'createdBy', 'createDt', 'rowTs'
        ],
        transaction
      });
      if (!transfer) {
        throw new Error('Transfer not found');
      }
      
      // ✅ If already processed, return success without doing anything
      if (transfer.transactionStatus === 'PROCESSED' || transfer.transactionStatus === 'COMPLETED') {
        await transaction.rollback(); // no changes needed
        return { success: true, transfer, message: 'Transfer already processed' };
      }

      if (!['INITIATED', 'PENDING_PAYMENT', 'PAYMENT_RECEIVED'].includes(transfer.transactionStatus)) {
        throw new Error(`Transfer cannot be approved; current status: ${transfer.transactionStatus}`);
      }

      const remitterAcct = await CustomerAccount.findOne({
        where: { account_number: transfer.remitterAcctNo },
        transaction
      });
      if (!remitterAcct) {
        throw new Error(`Remitter account ${transfer.remitterAcctNo} not found`);
      }
      console.log(`🔍 Balance check: available_balance=${remitterAcct.available_balance}, transferAmount=${transfer.xferAmt}`);
      if (remitterAcct.available_balance < transfer.xferAmt) {
        throw new Error('Insufficient balance');
      }

      await OutwardFundsTransfer.update(
        {
          transactionStatus: 'PROCESSED',
          approvedBy: approverId,
          approvedAt: new Date()
        },
        {
          where: { id: transfer.id },
          fields: ['transactionStatus', 'approvedBy', 'approvedAt'],
          transaction
        }
      );

      await remitterAcct.decrement({
        current_balance: transfer.xferAmt,
        available_balance: transfer.xferAmt,
        ledger_balance: transfer.xferAmt,
        cleared_balance: transfer.xferAmt
      }, { transaction });

      if (transfer.totalChrg > 0) {
        await FeeTransaction.create({
          transfer_id: transfer.id,
          amount: transfer.totalChrg,
          fee_type: 'TRANSFER_FEE',
          currency: 'NGN',
          created_at: new Date()
        }, { transaction });
      }

      await Transaction.update(
        { status: 'COMPLETED', updated_at: new Date() },
        { where: { TRANSACTION_IDENTIFIER: transfer.xferRef }, transaction }
      );
      await GLAccountTransaction.update(
        { STATUS: 'POSTED', updatedAt: new Date() },
        { where: { TRANSACTION_ID: `TXN${transfer.xferRef}` }, transaction }
      );

      await transaction.commit();
      committed = true;

      const updatedTransfer = await OutwardFundsTransfer.findOne({
        where: { id: transfer.id },
        attributes: ['id', 'xferRef', 'transactionStatus', 'approvedBy', 'approvedAt']
      });
      return { success: true, transfer: updatedTransfer };
    } catch (error) {
      if (!committed && transaction && transaction.finished !== true) {
        await transaction.rollback();
      }
      throw error;
    }
  }

  // ==================== Rejection (SAFE TRANSACTION) ====================
  async rejectTransfer(reference, approverId, reason) {
    let transaction = await sequelize.transaction();
    let committed = false;
    try {
      const transfer = await OutwardFundsTransfer.findOne({
        where: { xferRef: reference },
        attributes: ['id', 'xferRef', 'transactionStatus', 'remitterAcctNo'],
        transaction
      });
      if (!transfer) {
        throw new Error('Transfer not found');
      }
      if (!['INITIATED', 'PENDING_PAYMENT'].includes(transfer.transactionStatus)) {
        throw new Error(`Transfer cannot be rejected; current status: ${transfer.transactionStatus}`);
      }

      await OutwardFundsTransfer.update(
        {
          transactionStatus: 'REJECTED',
          rejectedBy: approverId,
          rejectionReason: reason,
          rejectedAt: new Date()
        },
        {
          where: { id: transfer.id },
          fields: ['transactionStatus', 'rejectedBy', 'rejectionReason', 'rejectedAt'],
          transaction
        }
      );

      await Transaction.update(
        { status: 'FAILED', updated_at: new Date() },
        { where: { TRANSACTION_IDENTIFIER: transfer.xferRef }, transaction }
      );
      await GLAccountTransaction.update(
        { STATUS: 'REVERSED', updatedAt: new Date() },
        { where: { TRANSACTION_ID: `TXN${transfer.xferRef}` }, transaction }
      );

      await transaction.commit();
      committed = true;
      return { success: true, transfer };
    } catch (error) {
      if (!committed && transaction && transaction.finished !== true) {
        await transaction.rollback();
      }
      throw error;
    }
  }

  // ==================== NIP ====================
  async initiateNIPTransfer(transfer, feeResult, transaction) {
    const nipResponse = await this.sendToNIP(transfer, feeResult);
    if (nipResponse.success) {
      transfer.transactionStatus = 'PROCESSING';
      transfer.nipSessionId = nipResponse.sessionId;
      transfer.nipResponseCode = nipResponse.responseCode;
    } else {
      transfer.transactionStatus = 'FAILED';
      transfer.failureReason = nipResponse.error || 'NIP rejection';
    }
    await transfer.save({ transaction });
    return {
      transfer,
      nipResponse,
      paymentInstructions: null
    };
  }

  async sendToNIP(transfer, feeResult) {
    try {
      const nipPayload = {
        SessionID: this.generateSessionId(),
        DestinationInstitutionCode: transfer.beneficiaryBankCode,
        ChannelCode: 'API',
        BeneficiaryAccountName: transfer.beneficiaryNm,
        BeneficiaryAccountNumber: transfer.beneficiaryAcct,
        OriginatorAccountName: transfer.remitterNm,
        OriginatorAccountNumber: transfer.remitterAcctNo,
        Amount: transfer.xferAmt.toString(),
        TransactionFee: feeResult.data.totals.senderFees.toString(),
        Narration: transfer.payDetails || 'Funds transfer',
        PaymentReference: transfer.xferRef,
        OriginatorInstitutionCode: this.nipConfig.institutionCode
      };
      const response = await axios.post(
        this.nipConfig.nipEndpoint,
        nipPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': this.getAuthHeader()
          },
          timeout: 15000
        }
      );
      return {
        success: response.data.ResponseCode === '00',
        sessionId: response.data.SessionID,
        responseCode: response.data.ResponseCode,
        message: response.data.ResponseDescription,
        data: response.data
      };
    } catch (error) {
      logger.error('NIP outward request failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ==================== Paystack ====================
  async initiatePaystackTransfer(transfer, originalData, transaction) {
    const { remitter, amount } = originalData;
    const paystackPayload = {
      email: remitter.email || `${remitter.account}@example.com`,
      amount: Math.round(amount * 100),
      bank_transfer: {
        account_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      reference: transfer.xferRef,
      metadata: {
        outwardTransferId: transfer.id,
        beneficiary: JSON.stringify(originalData.beneficiary),
        remitter: JSON.stringify(remitter),
        userId: originalData.userId,
        ...originalData.metadata,
      },
    };

    try {
      const response = await axios.post(
        `${this.paystackConfig.apiUrl}/charge`,
        paystackPayload,
        {
          headers: {
            Authorization: `Bearer ${this.paystackConfig.secretKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const paystackData = response.data;
      if (!paystackData.status) {
        throw new Error(paystackData.message || 'Paystack charge initiation failed');
      }

      const chargeData = paystackData.data;
      if (chargeData.status === 'pending_bank_transfer') {
        transfer.transactionStatus = 'PENDING_PAYMENT';
        transfer.paystackReference = chargeData.reference;
        transfer.paystackVirtualAccount = chargeData.account_number;
        transfer.paystackVirtualAccountName = chargeData.account_name;
        transfer.paystackBankName = chargeData.bank.name;
        transfer.paystackBankSlug = chargeData.bank.slug;
        transfer.paystackExpiresAt = chargeData.account_expires_at;
        transfer.paystackResponse = JSON.stringify(chargeData);
        await transfer.save({ transaction });

        return {
          transfer,
          paymentInstructions: {
            account_number: chargeData.account_number,
            account_name: chargeData.account_name,
            bank_name: chargeData.bank.name,
            amount: originalData.amount,
            expires_at: chargeData.account_expires_at,
            reference: transfer.xferRef,
          },
          nipResponse: null,
        };
      } else {
        transfer.transactionStatus = 'FAILED';
        transfer.failureReason = `Paystack returned status: ${chargeData.status}`;
        await transfer.save({ transaction });
        throw new Error(`Unexpected Paystack status: ${chargeData.status}`);
      }
    } catch (error) {
      transfer.transactionStatus = 'FAILED';
      transfer.failureReason = error.message;
      await transfer.save({ transaction });
      throw error;
    }
  }

  // ==================== Webhook ====================
  async handlePaystackWebhook(payload, signature) {
    const crypto = await import('crypto');
    const hash = crypto
      .createHmac('sha512', this.paystackConfig.secretKey)
      .update(JSON.stringify(payload))
      .digest('hex');
    if (hash !== signature) {
      throw new Error('Invalid Paystack signature');
    }

    const event = payload.event;
    const data = payload.data;

    const webhookTransaction = await sequelize.transaction();

    try {
      if (event === 'charge.success') {
        const paystackReference = data.reference;
        const transfer = await OutwardFundsTransfer.findOne({
          where: { xferRef: paystackReference },
          transaction: webhookTransaction
        });
        if (!transfer) {
          logger.warn(`Transfer not found for Paystack reference: ${paystackReference}`);
          await webhookTransaction.rollback();
          return { status: 'ignored', reason: 'transfer not found' };
        }

        if (transfer.transactionStatus === 'COMPLETED' || transfer.transactionStatus === 'PROCESSED') {
          await webhookTransaction.rollback();
          return { status: 'already_processed', transferId: transfer.id };
        }

        transfer.transactionStatus = 'PAYMENT_RECEIVED';
        transfer.paystackReference = data.reference;
        transfer.paystackResponse = JSON.stringify(data);
        transfer.amountReceived = data.amount / 100;
        transfer.paystackFee = (data.fees || 0) / 100;
        transfer.paystackVirtualAccount = data.authorization?.sender_bank_account_number;
        transfer.paystackBankName = data.authorization?.sender_bank;
        await transfer.save({ transaction: webhookTransaction });

        if (transfer.transactionId) {
          await Transaction.update(
            { updated_at: new Date() },
            { where: { id: transfer.transactionId }, transaction: webhookTransaction }
          );
        }

        await webhookTransaction.commit();
        logger.info(`Paystack charge successful for reference ${paystackReference}, fee = ₦${transfer.paystackFee}`);
        return { status: 'success', transferId: transfer.id };
      }

      if (event === 'bank.transfer.rejected') {
        const rejectedData = data.bank_transfer;
        const message = rejectedData.message;
        const messageType = rejectedData.message_type;
        let transfer = await OutwardFundsTransfer.findOne({
          where: { xferRef: data.metadata?.reference || data.reference },
          transaction: webhookTransaction
        });
        if (!transfer) {
          transfer = await OutwardFundsTransfer.findOne({
            where: {
              remitterEmail: data.customer?.email,
              transactionStatus: 'PENDING_PAYMENT',
              xferAmt: rejectedData.amount
            },
            order: [['createDt', 'DESC']],
            transaction: webhookTransaction
          });
        }
        if (transfer) {
          transfer.transactionStatus = 'FAILED';
          transfer.failureReason = `Paystack: ${messageType} - ${message}`;
          transfer.paystackResponse = JSON.stringify(data);
          await transfer.save({ transaction: webhookTransaction });

          if (transfer.transactionId) {
            await Transaction.update(
              { status: 'FAILED', updated_at: new Date() },
              { where: { id: transfer.transactionId }, transaction: webhookTransaction }
            );
            await GLAccountTransaction.update(
              { STATUS: 'REVERSED', updatedAt: new Date() },
              { where: { TRANSACTION_ID: `TXN${transfer.xferRef}` }, transaction: webhookTransaction }
            );
          }
          logger.warn(`Paystack transfer rejected for ${transfer.xferRef}: ${message}`);
          await webhookTransaction.commit();
        } else {
          logger.warn(`Paystack rejection event received but no matching transfer found: ${JSON.stringify(rejectedData)}`);
          await webhookTransaction.rollback();
        }
        return { status: 'ignored', reason: 'rejection processed' };
      }

      await webhookTransaction.rollback();
      logger.info(`Unhandled Paystack event: ${event}`);
      return { status: 'ignored', event };
    } catch (error) {
      await webhookTransaction.rollback();
      logger.error('Webhook processing error:', error);
      throw error;
    }
  }

  // ==================== Utilities ====================
  generateReference() {
    return `OUT${Date.now()}${Math.floor(Math.random() * 1000)}`;
  }

  generateSessionId() {
    return `${this.nipConfig.institutionCode}${Date.now()}`;
  }

  getAuthHeader() {
    return `Bearer ${Buffer.from(`${this.nipConfig.username}:${this.nipConfig.password}`).toString('base64')}`;
  }
}

export default new OutwardTransferService();