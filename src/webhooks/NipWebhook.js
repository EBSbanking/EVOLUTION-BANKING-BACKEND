// webhooks/NipWebhook.js - CORRECTED VERSION
import crypto from 'crypto';
import { Sequelize, Op } from 'sequelize';
import InwardFundsTransfer, { RECORD_STATUS } from '../../src/models/InwardFundsTransfer.js';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';
import axios from 'axios';
import https from 'https';
import fs from 'fs';
import path from 'path';

// ✅ Import webhookController
import webhookController from '../controllers/WebhookController.js';

/**
 * NIP (Nigeria Inter-Bank Settlement) Webhook Handler
 * Handles incoming NIP transactions from other banks
 */
class NIPWebhook {
  constructor(config = {}) {
    this.nipConfig = {
      institutionCode: config.institutionCode || process.env.NIP_INSTITUTION_CODE,
      nipEndpoint: config.nipEndpoint || process.env.NIP_ENDPOINT,
      nipUsername: config.nipUsername || process.env.NIP_USERNAME,
      nipPassword: config.nipPassword || process.env.NIP_PASSWORD,
      privateKey: config.privateKey || process.env.NIP_PRIVATE_KEY,
      publicKey: config.publicKey || process.env.NIP_PUBLIC_KEY,
      // NIP Standard codes
      responseCodes: {
        SUCCESS: '00',
        PENDING: '09',
        DUPLICATE: '94',
        INVALID_ACCOUNT: '96',
        SYSTEM_ERROR: '96'
      }
    };
    
    // Your own backend API configuration
    this.backendApi = {
      baseURL: process.env.BACKEND_API_URL || 'http://localhost:3002/api',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BACKEND_API_KEY}`
      }
    };

    // Create HTTPS agent for NIP only if certificates are provided and exist
    this.httpsAgent = null;
    
    if (process.env.NIP_CERT_PATH && process.env.NIP_KEY_PATH) {
      // Check if certificate paths are valid (not placeholder values)
      const certPath = process.env.NIP_CERT_PATH;
      const keyPath = process.env.NIP_KEY_PATH;
      
      // Skip if paths contain placeholder text like 'your_cert_path' or '/path/to/'
      const isPlaceholder = 
        certPath.includes('your_cert') || 
        certPath.includes('/path/to/') || 
        keyPath.includes('your_key') || 
        keyPath.includes('/path/to/') ||
        certPath === '' || 
        keyPath === '';
      
      if (!isPlaceholder) {
        try {
          // Check if files exist before attempting to read
          if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
            this.httpsAgent = new https.Agent({
              cert: fs.readFileSync(certPath),
              key: fs.readFileSync(keyPath),
              rejectUnauthorized: process.env.NODE_ENV === 'production'
            });
            logger.info('✅ HTTPS Agent created with SSL certificates', { certPath, keyPath });
          } else {
            logger.warn('⚠️ SSL certificate files not found, using regular HTTP agent', { 
              certExists: fs.existsSync(certPath),
              keyExists: fs.existsSync(keyPath),
              certPath,
              keyPath
            });
          }
        } catch (error) {
          logger.error('❌ Failed to load SSL certificates, using regular HTTP agent', { 
            error: error.message,
            certPath,
            keyPath
          });
        }
      } else {
        logger.info('ℹ️ Using regular HTTP agent (no valid SSL certificates configured)');
      }
    } else {
      logger.info('ℹ️ Using regular HTTP agent (SSL certificates not configured)');
    }
  }

  /**
   * Call NIP SOAP Service
   */
  async callNIPService(operation, payload) {
    try {
      // Construct SOAP envelope
      const soapEnvelope = `
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:nip="http://core.nip.nibss/">
          <soapenv:Header/>
          <soapenv:Body>
            <nip:${operation}>
              ${this.buildNIPPayload(payload)}
            </nip:${operation}>
          </soapenv:Body>
        </soapenv:Envelope>
      `;

      const config = {
        method: 'POST',
        url: this.nipConfig.nipEndpoint,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': `"http://core.nip.nibss/${operation}"`
        },
        data: soapEnvelope
      };

      if (this.httpsAgent) {
        config.httpsAgent = this.httpsAgent;
      }

      const response = await axios(config);
      return this.parseNIPResponse(response.data, operation);
    } catch (error) {
      logger.error('NIP service call failed', {
        operation,
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Build NIP XML payload
   */
  buildNIPPayload(data) {
    // Convert data object to XML elements
    return Object.entries(data)
      .map(([key, value]) => `<${key}>${value}</${key}>`)
      .join('');
  }

  /**
   * Parse NIP SOAP Response
   */
  parseNIPResponse(xml, operation) {
    // Simple regex extraction - consider using xml2js in production
    const responseRegex = new RegExp(`<${operation}Response>([\\s\\S]*?)</${operation}Response>`);
    const returnRegex = /<return>([\s\S]*?)<\/return>/;
    
    const responseMatch = xml.match(responseRegex);
    if (responseMatch) {
      const returnMatch = responseMatch[1].match(returnRegex);
      if (returnMatch) {
        return returnMatch[1];
      }
    }
    return null;
  }

  /**
   * Verify NIP signature
   */
  verifyNIPSignature(payload, signature) {
    try {
      // NIP uses specific signing mechanism - implement based on NIP spec
      const sign = crypto.createSign('SHA256');
      sign.update(JSON.stringify(payload));
      sign.end();
      
      const verified = sign.verify(this.nipConfig.publicKey || this.nipConfig.privateKey, signature, 'base64');
      return verified;
    } catch (error) {
      logger.error('NIP signature verification failed', { error: error.message });
      return false;
    }
  }

  /**
   * Generate NIP response signature
   */
  generateResponseSignature(response) {
    try {
      const sign = crypto.createSign('SHA256');
      sign.update(JSON.stringify(response));
      sign.end();
      
      return sign.sign(this.nipConfig.privateKey, 'base64');
    } catch (error) {
      logger.error('NIP signature generation failed', { error: error.message });
      return null;
    }
  }

  /**
   * Call your own backend API
   */
  async callBackendApi(endpoint, method, data = null, params = null) {
    try {
      const config = {
        ...this.backendApi,
        method,
        url: `${this.backendApi.baseURL}${endpoint}`
      };
      
      if (data) config.data = data;
      if (params) config.params = params;
      
      const response = await axios(config);
      return response.data;
    } catch (error) {
      logger.error('Backend API call failed', {
        endpoint,
        method,
        error: error.response?.data || error.message
      });
      throw error;
    }
  }

  /**
   * Lookup account in your system
   */
  async lookupAccount(accountNumber) {
    try {
      // Call your account lookup endpoint
      const response = await this.callBackendApi(
        '/accounts/lookup',
        'GET',
        null,
        { accountNumber }
      );
      
      return {
        success: response.success,
        accountName: response.data?.accountName,
        bvn: response.data?.bvn,
        kycLevel: response.data?.kycLevel,
        bankName: response.data?.bankName
      };
    } catch (error) {
      logger.error('Account lookup failed', { accountNumber, error: error.message });
      return { success: false };
    }
  }

  /**
   * Get account details
   */
  async getAccountDetails(accountNumber) {
    try {
      // Call your account details endpoint
      const response = await this.callBackendApi(
        '/accounts/details',
        'POST',
        { accountNumber }
      );
      
      return {
        success: response.success,
        accountName: response.data?.accountName,
        bvn: response.data?.bvn,
        kycLevel: response.data?.kycLevel,
        bankName: response.data?.bankName,
        accountType: response.data?.accountType,
        currency: response.data?.currency
      };
    } catch (error) {
      logger.error('Get account details failed', { accountNumber, error: error.message });
      return { success: false };
    }
  }

  /**
   * Process reversal in your system
   */
  async processReversal(reversalData) {
    try {
      // Call your reversal endpoint
      const response = await this.callBackendApi(
        '/transactions/reversal',
        'POST',
        reversalData
      );
      
      return {
        success: response.success,
        message: response.message
      };
    } catch (error) {
      logger.error('Reversal processing failed', { reversalData, error: error.message });
      return { success: false };
    }
  }

  /**
   * Convert NIP payload to webhook controller format
   */
  convertNIPToWebhookFormat(nipPayload) {
    const {
      SessionID,
      DestinationInstitutionCode,
      ChannelCode,
      BeneficiaryAccountName,
      BeneficiaryAccountNumber,
      BeneficiaryBankVerificationNumber,
      BeneficiaryKYCLevel,
      OriginatorAccountName,
      OriginatorAccountNumber,
      OriginatorBankVerificationNumber,
      OriginatorKYCLevel,
      TransactionLocation,
      Narration,
      PaymentReference,
      Amount,
      TransactionFee,
      OriginatorInstitutionCode
    } = nipPayload;

    return {
      gateway: 'nip',
      xferRef: PaymentReference,
      xferAmt: parseFloat(Amount) || 0,
      xferCrncyId: 1, // NGN
      payCrncyId: 1,
      payExchRate: 1.0000,
      valueDt: new Date().toISOString(),
      priorityLevelCd: 'NORMAL',
      
      // Beneficiary details
      beneficiary: {
        name: BeneficiaryAccountName,
        account: BeneficiaryAccountNumber,
        bvn: BeneficiaryBankVerificationNumber,
        kycLevel: BeneficiaryKYCLevel,
        bankName: 'Our Bank',
        bankCntryId: 1
      },
      
      // Remitter details
      remitter: {
        name: OriginatorAccountName || 'NIP Transfer',
        accountNo: OriginatorAccountNumber,
        bvn: OriginatorBankVerificationNumber,
        kycLevel: OriginatorKYCLevel,
        institutionCode: OriginatorInstitutionCode
      },
      
      // NIP specific fields
      nipSessionId: SessionID,
      nipChannelCode: ChannelCode,
      nipDestinationInstitution: DestinationInstitutionCode,
      nipTransactionFee: parseFloat(TransactionFee) || 0,
      nipTransactionLocation: TransactionLocation,
      
      // Additional info
      narration: Narration,
      paymentReference: PaymentReference,
      
      // Metadata
      userId: 'NIP',
      createdBy: 'NIP',
      recSt: 'A'
    };
  }

  /**
   * Handle NIP funds transfer notification (fundtransfersingleitem_dc)
   * This is called when another bank sends funds to one of our customers
   */
  async handleNIPFundsTransfer(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const payload = req.body;
      const signature = req.headers['x-nip-signature'];
      
      logger.info('NIP funds transfer received', {
        sessionId: payload?.SessionID,
        reference: payload?.PaymentReference
      });

      // Verify NIP signature
      if (!this.verifyNIPSignature(payload, signature)) {
        logger.warn('Invalid NIP signature', { sessionId: payload?.SessionID });
        return res.status(401).json({
          SessionID: payload?.SessionID,
          DestinationInstitutionCode: this.nipConfig.institutionCode,
          ResponseCode: '96',
          ResponseDescription: 'Invalid signature'
        });
      }

      // Extract NIP fields
      const {
        SessionID,
        DestinationInstitutionCode,
        ChannelCode,
        BeneficiaryAccountNumber,
        PaymentReference
      } = payload;

      // Check if transfer already exists
      const existingTransfer = await InwardFundsTransfer.findOne({
        where: { 
          [Op.or]: [
            { XFER_REF: PaymentReference },
            { NIP_SESSION_ID: SessionID }
          ]
        },
        transaction
      });

      if (existingTransfer) {
        await transaction.rollback();
        logger.info('Duplicate NIP transaction', { sessionId: SessionID, reference: PaymentReference });
        return res.json({
          SessionID,
          DestinationInstitutionCode: this.nipConfig.institutionCode,
          ChannelCode,
          ResponseCode: '94',
          ResponseDescription: 'Duplicate transaction'
        });
      }

      // First, lookup the account in your system
      const accountLookup = await this.lookupAccount(BeneficiaryAccountNumber);

      if (!accountLookup || !accountLookup.success) {
        await transaction.rollback();
        logger.warn('Invalid beneficiary account', { 
          sessionId: SessionID, 
          account: BeneficiaryAccountNumber 
        });
        return res.json({
          SessionID,
          DestinationInstitutionCode: this.nipConfig.institutionCode,
          ChannelCode,
          ResponseCode: '96',
          ResponseDescription: 'Invalid beneficiary account'
        });
      }

      // Convert NIP payload to webhook controller format
      const webhookFormatData = this.convertNIPToWebhookFormat(payload);
      
      // Add account lookup results to the data
      if (accountLookup) {
        webhookFormatData.beneficiary.name = webhookFormatData.beneficiary.name || accountLookup.accountName;
        webhookFormatData.beneficiary.bvn = webhookFormatData.beneficiary.bvn || accountLookup.bvn;
        webhookFormatData.beneficiary.kycLevel = webhookFormatData.beneficiary.kycLevel || accountLookup.kycLevel;
      }

      // Use webhookController to process the transfer
      // Create a modified request object for the controller
      const controllerReq = {
        ...req,
        body: webhookFormatData
      };

      const controllerRes = {
        ...res,
        status: (code) => ({
          json: (data) => {
            if (code >= 400) {
              // If controller returns error, format as NIP error response
              return res.status(200).json({
                SessionID,
                DestinationInstitutionCode: this.nipConfig.institutionCode,
                ChannelCode,
                ResponseCode: '96',
                ResponseDescription: data.message || 'Processing failed',
                PaymentReference
              });
            } else {
              // Success - format as NIP success response
              const nipResponse = {
                SessionID,
                DestinationInstitutionCode: this.nipConfig.institutionCode,
                ChannelCode,
                ResponseCode: '00',
                ResponseDescription: 'Successful',
                BeneficiaryAccountName: accountLookup?.accountName || payload.BeneficiaryAccountName,
                BeneficiaryAccountNumber,
                BeneficiaryBVN: accountLookup?.bvn || payload.BeneficiaryBankVerificationNumber,
                TransactionFee: payload.TransactionFee || '0',
                PaymentReference,
                Amount: payload.Amount,
                Narration: payload.Narration
              };

              // Add signature
              const responseSignature = this.generateResponseSignature(nipResponse);
              if (responseSignature) {
                res.set('X-NIP-Signature', responseSignature);
              }
              
              return res.status(200).json(nipResponse);
            }
          }
        })
      };

      // Let webhookController handle the actual creation
      await webhookController.handleJsonWebhook(controllerReq, controllerRes);

      await transaction.commit();

    } catch (error) {
      await transaction.rollback();
      
      logger.error('NIP transfer processing failed', {
        error: error.message,
        stack: error.stack,
        sessionId: req.body?.SessionID
      });

      // Return NIP error response
      res.status(200).json({
        SessionID: req.body?.SessionID,
        DestinationInstitutionCode: this.nipConfig.institutionCode,
        ChannelCode: req.body?.ChannelCode,
        ResponseCode: '96',
        ResponseDescription: 'System error',
        PaymentReference: req.body?.PaymentReference
      });
    }
  }

  /**
   * Handle NIP name enquiry (nameenquirysingleitem)
   */
  async handleNIPNameEnquiry(req, res) {
    try {
      const { 
        SessionID, 
        DestinationInstitutionCode, 
        AccountNumber,
        ChannelCode
      } = req.body;

      logger.info('NIP name enquiry received', {
        sessionId: SessionID,
        accountNumber: AccountNumber
      });

      // Lookup account in your system
      const accountDetails = await this.lookupAccount(AccountNumber);

      if (!accountDetails || !accountDetails.success) {
        return res.json({
          SessionID,
          DestinationInstitutionCode: this.nipConfig.institutionCode,
          ChannelCode,
          ResponseCode: '96',
          ResponseDescription: 'Account not found'
        });
      }

      // Get full account details
      const fullDetails = await this.getAccountDetails(AccountNumber);

      const response = {
        SessionID,
        DestinationInstitutionCode: this.nipConfig.institutionCode,
        ChannelCode,
        ResponseCode: '00',
        ResponseDescription: 'Successful',
        AccountName: fullDetails?.accountName || accountDetails?.accountName,
        AccountNumber,
        BVN: fullDetails?.bvn || '',
        KYCLevel: fullDetails?.kycLevel || '1'
      };

      const signature = this.generateResponseSignature(response);
      
      if (signature) {
        res.set('X-NIP-Signature', signature);
      }
      res.status(200).json(response);

    } catch (error) {
      logger.error('NIP name enquiry failed', {
        error: error.message,
        sessionId: req.body?.SessionID
      });

      res.status(200).json({
        SessionID: req.body?.SessionID,
        DestinationInstitutionCode: this.nipConfig.institutionCode,
        ChannelCode: req.body?.ChannelCode,
        ResponseCode: '96',
        ResponseDescription: 'System error'
      });
    }
  }

  /**
   * Handle NIP transaction status enquiry (txnstatusquerysingleitem)
   */
  async handleNIPStatusEnquiry(req, res) {
    try {
      const { 
        SessionID, 
        DestinationInstitutionCode,
        ChannelCode,
        OriginalSessionID,
        OriginalPaymentReference 
      } = req.body;

      logger.info('NIP status enquiry received', {
        sessionId: SessionID,
        originalSessionId: OriginalSessionID,
        originalReference: OriginalPaymentReference
      });

      // Find the original transaction
      const transfer = await InwardFundsTransfer.findOne({
        where: {
          [Op.or]: [
            { NIP_SESSION_ID: OriginalSessionID },
            { XFER_REF: OriginalPaymentReference }
          ]
        }
      });

      if (!transfer) {
        return res.json({
          SessionID,
          DestinationInstitutionCode: this.nipConfig.institutionCode,
          ChannelCode,
          ResponseCode: '96',
          ResponseDescription: 'Transaction not found'
        });
      }

      // Map our status to NIP status codes
      const statusMap = {
        [RECORD_STATUS.ACTIVE]: '00', // Successful
        [RECORD_STATUS.PENDING]: '09', // Pending
        [RECORD_STATUS.INACTIVE]: '01' // Reversed
      };

      const response = {
        SessionID,
        DestinationInstitutionCode: this.nipConfig.institutionCode,
        ChannelCode,
        ResponseCode: statusMap[transfer.REC_ST] || '09',
        ResponseDescription: transfer.REC_ST === RECORD_STATUS.ACTIVE ? 'Successful' : 
                            transfer.REC_ST === RECORD_STATUS.INACTIVE ? 'Reversed' : 'Pending',
        OriginalSessionID: transfer.NIP_SESSION_ID || '',
        OriginalPaymentReference: transfer.XFER_REF,
        Amount: transfer.XFER_AMT?.toString() || '0',
        TransactionDateTime: transfer.VALUE_DT?.toISOString() || new Date().toISOString(),
        SettlementDate: transfer.SETTLEMENT_DATE?.toISOString() || transfer.VALUE_DT?.toISOString()
      };

      const signature = this.generateResponseSignature(response);
      
      if (signature) {
        res.set('X-NIP-Signature', signature);
      }
      res.status(200).json(response);

    } catch (error) {
      logger.error('NIP status enquiry failed', { 
        error: error.message,
        sessionId: req.body?.SessionID 
      });
      
      res.status(200).json({
        SessionID: req.body?.SessionID,
        DestinationInstitutionCode: this.nipConfig.institutionCode,
        ChannelCode: req.body?.ChannelCode,
        ResponseCode: '96',
        ResponseDescription: 'System error'
      });
    }
  }

  /**
   * Handle NIP funds transfer reversal (fundtransfersingleitem_dc reversal)
   */
  async handleNIPReversal(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const {
        SessionID,
        DestinationInstitutionCode,
        ChannelCode,
        OriginalSessionID,
        OriginalPaymentReference,
        ReversalAmount,
        ReversalReason
      } = req.body;

      logger.info('NIP reversal received', {
        sessionId: SessionID,
        originalSessionId: OriginalSessionID,
        originalReference: OriginalPaymentReference
      });

      // Find original transaction
      const originalTransfer = await InwardFundsTransfer.findOne({
        where: {
          [Op.or]: [
            { NIP_SESSION_ID: OriginalSessionID },
            { XFER_REF: OriginalPaymentReference }
          ]
        },
        transaction
      });

      if (!originalTransfer) {
        await transaction.rollback();
        return res.json({
          SessionID,
          DestinationInstitutionCode: this.nipConfig.institutionCode,
          ChannelCode,
          ResponseCode: '96',
          ResponseDescription: 'Original transaction not found'
        });
      }

      // Check if already reversed
      if (originalTransfer.REC_ST === RECORD_STATUS.INACTIVE) {
        await transaction.rollback();
        return res.json({
          SessionID,
          DestinationInstitutionCode: this.nipConfig.institutionCode,
          ChannelCode,
          ResponseCode: '94',
          ResponseDescription: 'Transaction already reversed'
        });
      }

      // Process reversal in your system
      const reversalResult = await this.processReversal({
        originalReference: originalTransfer.XFER_REF,
        nipSessionId: OriginalSessionID,
        reversalReason: ReversalReason,
        amount: parseFloat(ReversalAmount) || originalTransfer.XFER_AMT,
        beneficiaryAccount: originalTransfer.BENEFICIARY_ACCT
      });

      if (reversalResult && reversalResult.success) {
        // Update original transfer
        originalTransfer.REC_ST = RECORD_STATUS.INACTIVE;
        originalTransfer.REVERSAL_REASON = ReversalReason;
        originalTransfer.REVERSAL_DATE = new Date();
        originalTransfer.REVERSED_BY = 'NIP';
        await originalTransfer.save({ transaction });

        // Create reversal record using webhookController format
        const reversalWebhookData = {
          gateway: 'nip',
          xferRef: `REV-${originalTransfer.XFER_REF}`,
          xferAmt: -Math.abs(parseFloat(ReversalAmount) || originalTransfer.XFER_AMT),
          xferCrncyId: originalTransfer.XFER_CRNCY_ID,
          payCrncyId: originalTransfer.PAY_CRNCY_ID,
          payExchRate: originalTransfer.PAY_EXCH_RATE,
          valueDt: new Date().toISOString(),
          beneficiary: {
            account: originalTransfer.BENEFICIARY_ACCT,
            name: originalTransfer.BENEFICIARY_NM,
            bankName: originalTransfer.BENEFICIARY_BANK_NM,
            bankCntryId: originalTransfer.BENEFICIARY_BANK_CNTRY_ID
          },
          remitter: {
            name: originalTransfer.REMITTER_NM
          },
          isReversal: true,
          originalXferRef: originalTransfer.XFER_REF,
          reversalReason: ReversalReason,
          reversalDate: new Date().toISOString(),
          reversedBy: 'NIP',
          nipSessionId: SessionID,
          userId: 'NIP_REVERSAL',
          createdBy: 'NIP_REVERSAL',
          recSt: 'A'
        };

        // Create the reversal using webhookController
        const controllerReq = {
          body: reversalWebhookData
        };

        await webhookController.handleJsonWebhook(controllerReq, {
          status: () => ({ json: () => {} })
        });
      }

      await transaction.commit();

      const response = {
        SessionID,
        DestinationInstitutionCode: this.nipConfig.institutionCode,
        ChannelCode,
        ResponseCode: reversalResult?.success ? '00' : '96',
        ResponseDescription: reversalResult?.success ? 'Reversal successful' : 'Reversal failed',
        OriginalSessionID,
        OriginalPaymentReference,
        ReversalAmount: ReversalAmount || originalTransfer.XFER_AMT?.toString()
      };

      const signature = this.generateResponseSignature(response);
      
      if (signature) {
        res.set('X-NIP-Signature', signature);
      }
      res.status(200).json(response);

    } catch (error) {
      await transaction.rollback();
      
      logger.error('NIP reversal failed', {
        error: error.message,
        sessionId: req.body?.SessionID
      });

      res.status(200).json({
        SessionID: req.body?.SessionID,
        DestinationInstitutionCode: this.nipConfig.institutionCode,
        ChannelCode: req.body?.ChannelCode,
        ResponseCode: '96',
        ResponseDescription: 'System error'
      });
    }
  }

  /**
   * Get BIC ID from institution code
   */
  getBICIdFromInstitution(institutionCode) {
    // Map NIP institution codes to your internal BIC IDs
    const institutionMap = {
      '000001': 1001, // Example bank
      '000002': 1002,
      // Add more mappings based on your database
    };
    return institutionMap[institutionCode] || null;
  }

  /**
   * Handle financial institution list request
   */
  async handleFinancialInstitutionList(req, res) {
    try {
      const { SessionID, DestinationInstitutionCode, ChannelCode } = req.body;

      logger.info('NIP institution list requested', { sessionId: SessionID });

      // Get list of institutions from your database or configuration
      const institutions = [
        { InstitutionCode: '000001', InstitutionName: 'Bank A' },
        { InstitutionCode: '000002', InstitutionName: 'Bank B' },
        { InstitutionCode: '000003', InstitutionName: 'Bank C' },
        { InstitutionCode: '000004', InstitutionName: 'Bank D' },
        { InstitutionCode: '000005', InstitutionName: 'Bank E' }
      ];

      const response = {
        SessionID,
        DestinationInstitutionCode: this.nipConfig.institutionCode,
        ChannelCode,
        ResponseCode: '00',
        ResponseDescription: 'Successful',
        InstitutionList: institutions.map(inst => 
          `<Institution><InstitutionCode>${inst.InstitutionCode}</InstitutionCode><InstitutionName>${inst.InstitutionName}</InstitutionName></Institution>`
        ).join('')
      };

      const signature = this.generateResponseSignature(response);
      
      if (signature) {
        res.set('X-NIP-Signature', signature);
      }
      res.status(200).json(response);

    } catch (error) {
      logger.error('Financial institution list request failed', { error: error.message });
      res.status(200).json({
        SessionID: req.body?.SessionID,
        DestinationInstitutionCode: this.nipConfig.institutionCode,
        ChannelCode: req.body?.ChannelCode,
        ResponseCode: '96',
        ResponseDescription: 'System error'
      });
    }
  }

  /**
   * Simple webhook handler for backward compatibility
   */
  async handleWebhook(req, res) {
    try {
      const payload = req.body;
      
      // Convert to webhook controller format if needed
      const webhookData = payload.gateway === 'nip' ? 
        this.convertNIPToWebhookFormat(payload) : payload;
      
      // Use webhookController to handle the request
      const controllerReq = {
        ...req,
        body: webhookData
      };

      await webhookController.handleJsonWebhook(controllerReq, res);

    } catch (error) {
      logger.error('Error in webhook handler:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get supported gateways list
   */
  getSupportedGatewaysList() {
    return ['nip', 'nip_fund_transfer', 'nip_name_enquiry', 'nip_status_enquiry', 'nip_reversal'];
  }

  /**
   * Validate NIP payload
   */
  validatePayload(payload) {
    const errors = [];
    const requiredFields = ['SessionID', 'DestinationInstitutionCode'];
    
    if (payload.fundtransfer) {
      requiredFields.push('BeneficiaryAccountNumber', 'Amount', 'PaymentReference');
    } else if (payload.nameenquiry) {
      requiredFields.push('AccountNumber');
    }

    for (const field of requiredFields) {
      if (!payload[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      requiredFields
    };
  }

  /**
   * Get metrics (for monitoring)
   * ✅ FIXED: Removed CREATED_BY - using status and other existing columns
   */
  async getMetrics() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // ✅ FIXED: Use existing columns instead of CREATED_BY
      const metrics = {
        // Total transactions - count all records
        totalTransactions: await InwardFundsTransfer.count(),
        
        // Today's transactions - using created_at
        todayTransactions: await InwardFundsTransfer.count({ 
          where: { 
            created_at: { [Op.gte]: today }
          } 
        }),
        
        // Successful transactions - using status
        successfulTransactions: await InwardFundsTransfer.count({ 
          where: { 
            status: 'COMPLETED'
          } 
        }),
        
        // Pending transactions - using status
        pendingTransactions: await InwardFundsTransfer.count({ 
          where: { 
            status: 'PENDING'
          } 
        }),
        
        // Failed transactions - using status
        failedTransactions: await InwardFundsTransfer.count({ 
          where: { 
            status: 'FAILED'
          } 
        }),
        
        // Reversed transactions - using status
        reversedTransactions: await InwardFundsTransfer.count({ 
          where: { 
            status: 'REVERSED'
          } 
        }),
        
        // Inward transactions - using direction
        inwardTransactions: await InwardFundsTransfer.count({ 
          where: { 
            direction: 'INWARD'
          } 
        }),
        
        // Outward transactions - using direction
        outwardTransactions: await InwardFundsTransfer.count({ 
          where: { 
            direction: 'OUTWARD'
          } 
        }),
        
        timestamp: new Date().toISOString()
      };

      return metrics;
    } catch (error) {
      logger.error('Failed to get NIP metrics', { error: error.message });
      return null;
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(req, res) {
    const metrics = await this.getMetrics();
    
    res.json({
      status: 'healthy',
      service: 'nip-webhook',
      timestamp: new Date().toISOString(),
      config: {
        institutionCode: this.nipConfig.institutionCode,
        nipEndpoint: this.nipConfig.nipEndpoint,
        backendApi: !!this.backendApi.baseURL,
        sslEnabled: !!this.httpsAgent
      },
      metrics: metrics || { status: 'Metrics unavailable' }
    });
  }
}

export default NIPWebhook;