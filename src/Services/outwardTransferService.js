// services/outwardTransferService.js
import axios from 'axios';
import { feeCalculator } from '../controllers/transferFeeController.js';
import OutwardFundsTransfer from '../models/OutwardFundsTransfer.js';
import logger from '../utils/logger.js';

class OutwardTransferService {
  constructor() {
    this.nipConfig = {
      institutionCode: process.env.NIP_INSTITUTION_CODE,
      nipEndpoint: process.env.NIP_OUTWARD_ENDPOINT,
      username: process.env.NIP_USERNAME,
      password: process.env.NIP_PASSWORD
    };
  }

  /**
   * Initiate an outward transfer
   */
  async initiateTransfer(transferData) {
    const transaction = await sequelize.transaction();
    
    try {
      // 1. Calculate fees using the fee calculator
      const feeResult = await feeCalculator.calculateTransferFees(
        transferData.amount,
        transferData.transferType || 'NIP',
        transferData.channel || 'API',
        {
          currencyId: transferData.currencyId,
          customerTier: transferData.customerTier
        }
      );

      if (!feeResult.success) {
        throw new Error(`Fee calculation failed: ${feeResult.error}`);
      }

      // 2. Create outward transfer record
      const outwardTransfer = await OutwardFundsTransfer.create({
        XFER_REF: this.generateReference(),
        XFER_AMT: transferData.amount,
        XFER_CRNCY_ID: transferData.currencyId || 1,
        BENEFICIARY_NM: transferData.beneficiary.name,
        BENEFICIARY_ACCT: transferData.beneficiary.account,
        BENEFICIARY_BANK_NM: transferData.beneficiary.bankName,
        BENEFICIARY_BANK_CODE: transferData.beneficiary.bankCode,
        REMITTER_NM: transferData.remitter.name,
        REMITTER_ACCT_NO: transferData.remitter.account,
        SENDING_BANK_CHRG: feeResult.data.totals.senderFees,
        TOTAL_CHRG: feeResult.data.totals.grandTotal,
        NET_AMT_XFERED: transferData.amount - feeResult.data.totals.receiverFees,
        TRANSACTION_STATUS: 'INITIATED',
        CREATED_BY: transferData.userId || 'SYSTEM',
        ...transferData.metadata
      }, { transaction });

      // 3. Send to NIP
      const nipResponse = await this.sendToNIP(outwardTransfer, feeResult);

      // 4. Update status based on response
      if (nipResponse.success) {
        outwardTransfer.TRANSACTION_STATUS = 'PROCESSING';
        outwardTransfer.NIP_SESSION_ID = nipResponse.sessionId;
        outwardTransfer.NIP_RESPONSE_CODE = nipResponse.responseCode;
        await outwardTransfer.save({ transaction });
      }

      await transaction.commit();

      return {
        success: true,
        data: outwardTransfer,
        fees: feeResult.data,
        nipResponse
      };

    } catch (error) {
      await transaction.rollback();
      logger.error('Outward transfer failed:', error);
      throw error;
    }
  }

  /**
   * Send transfer request to NIP
   */
  async sendToNIP(transfer, feeResult) {
    try {
      // Construct NIP request payload
      const nipPayload = {
        SessionID: this.generateSessionId(),
        DestinationInstitutionCode: transfer.BENEFICIARY_BANK_CODE,
        ChannelCode: 'API',
        BeneficiaryAccountName: transfer.BENEFICIARY_NM,
        BeneficiaryAccountNumber: transfer.BENEFICIARY_ACCT,
        OriginatorAccountName: transfer.REMITTER_NM,
        OriginatorAccountNumber: transfer.REMITTER_ACCT_NO,
        Amount: transfer.XFER_AMT.toString(),
        TransactionFee: feeResult.data.totals.senderFees.toString(),
        Narration: transfer.PAY_DETAILS || 'Funds transfer',
        PaymentReference: transfer.XFER_REF,
        OriginatorInstitutionCode: this.nipConfig.institutionCode
      };

      // Send to NIP endpoint
      const response = await axios.post(
        this.nipConfig.nipEndpoint,
        nipPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': this.getAuthHeader()
          }
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
      logger.error('NIP outward request failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

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