import mongoose from 'mongoose';
import fs from 'fs';
import { v2 as cloudinaryV2 } from 'cloudinary';
import dotenv from 'dotenv';
import DepositAccountApplication from '../models/DepositAccountApplication.js';
import CustomerAccount from '../models/CustomerAccount.js';
import AuditTrail from '../models/AuditTrail.js';
import DepositTransaction from '../models/DepositTransaction.js';
import { generateAccountIdentifiersFromCounter, generateNUBAN } from '../utils/generateAccountNumber.js';
import WF_WORK_ITEMController from '../controllers/WF_WORK_ITEMController.js';
import NotificationService from '../services/NotificationService.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import { generateWorkflowIdentifiers } from '../utils/generateWorkflowIdentifiers.js';
import { generateNumber } from '../utils/generateNumber.js';
import { generateLoanAccountNumberByProdId } from '../utils/generateLoanAccountId.js';
import { getProductTypeByProdId } from '../controllers/ProductTypeMappingController.js';

dotenv.config();

const VALID_ACCOUNT_TYPES = ['SAVINGS', 'CURRENT', 'FIXED_DEPOSIT'];

const DepositAccountApplicationController = {
  createApplication: async (req, res) => {
    try {
      const USER_ID = req.body.USER_ID || req.headers['x-user-id'];
      if (!USER_ID) return res.status(400).json({ message: 'USER_ID is required to create workflow item' });

      const {
        CUST_ID, ACCT_NM, CRNCY_ID, PROD_ID, BU_ID,
        AVAIL_DT, OPENED_DT, NATIONALITY_NO,
        CREATED_BY, BVN_NO, DOCUMENT_TYPE,
        DOCUMENT_NUMBER, CREATED_AT, TRANSACTION_DATE
      } = req.body;

      if (!/^\d{11}$/.test(BVN_NO)) {
        return res.status(400).json({ message: 'BVN_NO must be exactly 11 digits.' });
      }

      const existingBvn = await DepositAccountApplication.findOne({ BVN_NO });
      if (existingBvn) return res.status(400).json({ message: 'BVN_NO has already been used.' });

      if (NATIONALITY_NO &&
        await DepositAccountApplication.findOne({ NATIONALITY_NO, CUST_ID: { $ne: CUST_ID } })) {
        return res.status(400).json({ message: 'NATIONALITY_NO has already been used.' });
      }

      if (!req.files?.IMAGE || !req.files.DOCUMENT || !req.files.BANK_MANDATE) {
        return res.status(400).json({ error: 'IMAGE, DOCUMENT, and BANK_MANDATE files are required.' });
      }

      const upload = async (file, folder) => {
        const result = await cloudinaryV2.uploader.upload(file.tempFilePath, { folder });
        return result.secure_url;
      };

      const [IMAGE, DOCUMENT, BANK_MANDATE] = await Promise.all([
        upload(req.files.IMAGE, 'IMAGE'),
        upload(req.files.DOCUMENT, 'DOCUMENT'),
        upload(req.files.BANK_MANDATE, 'DOCUMENT')
      ]);

      // 🔁 Conditionally generate account number
      let ACCT_NO, ACCT_ID;
      const productType = await getProductTypeByProdId(PROD_ID);

      if (['INDIVIDUAL_LOAN', 'TERM_DEPOSIT', 'SAVINGS'].includes(productType)) {
        ACCT_NO = await generateLoanAccountNumberByProdId(PROD_ID);
        ACCT_ID = generateNumber(8);
      } else {
        const identifiers = await generateAccountIdentifiersFromCounter('S');
        ACCT_NO = identifiers.ACCT_NO;
        ACCT_ID = identifiers.ACCT_ID;
      }

      const newApp = new DepositAccountApplication({
        CUST_ID, ACCT_ID, ACCT_NO, ACCT_NM, CRNCY_ID, PROD_ID, BU_ID,
        AVAIL_DT, OPENED_DT, NATIONALITY_NO, CREATED_BY,
        USER_ID, BVN_NO, DOCUMENT_TYPE, DOCUMENT_NUMBER,
        CREATED_AT: CREATED_AT || Date.now(),
        IMAGE, DOCUMENT, BANK_MANDATE,
        STATUS: 'Pending'
      });

      const savedApplication = await newApp.save();

      const wfResponse = await WF_WORK_ITEMController.submitTransaction({
        body: {
          ITEM_VALUE: ACCT_NO,
          ITEM_DESC: `Deposit Account Application for ${ACCT_NM}`,
          ITEM_CLASS_NM: 'DepositAccountApplication',
          ITEM_TYPE: 'DepositAccountApplication',
          CUST_ID,
          USER_ID,
          BU_ID,
          CREATE_DT: new Date(),
          REC_ST: 'Pending',
          WAIT_ST: 'Pending',
          VERSION: 1,
          TARGET_USER_ROLE_ID: 'Manager',
          ORIGINATOR_USER_ROLE_ID: 'Teller',
          ITEM_ID: savedApplication._id
        }
      });

      if (!wfResponse.success) {
        console.error('❌ Workflow error:', wfResponse.error);
        return res.status(500).json({ message: 'Workflow submission failed', error: wfResponse.error });
      }

      const acct = new CustomerAccount({
        ACCT_ID,
        ACCT_NO,
        ACCT_NM,
        BU_ID,
        GL_ACCT_NO: ACCT_NO,
        LEDGER_BAL: 0,
        CLEARED_BAL: 0,
        AVAILABLE_BALANCE: 0,
        ACCOUNT_TYPE: VALID_ACCOUNT_TYPES.includes(PROD_ID) ? PROD_ID : 'SAVINGS',
        PRODUCT_DESC: `${PROD_ID} Account`,
        REC_ST: 'Pending',
        CUST_ID
      });

      const savedAccount = await acct.save();

      let depositTransaction = null;
      if (AMOUNT && DEPOSITOR_NAME) {
        depositTransaction = new DepositTransaction({
          ACCT_ID,
          ACCT_NO,
          ACCT_NM,
          GL_ACCT_NO: ACCT_NO,
          TRANSACTION_TYPE: 'Deposit',
          AMOUNT: Number(AMOUNT),
          DEPOSITOR_NAME,
          TRANSACTION_DATE: TRANSACTION_DATE ? new Date(TRANSACTION_DATE) : new Date(),
          VALUE_DATE: new Date(),
          REC_ST: 'Pending',
          CUST_ID,
          USER_ID
        });
        await depositTransaction.save();
      }

      await AuditTrail.create({
        event_id: Date.now(),
        user_id: USER_ID,
        event_type: 'CustomerAccount',
        action: 'Create Account',
        old_value: null,
        new_value: savedAccount,
        ip_address: req.ip || 'unknown',
        timestamp: new Date()
      });

      return res.status(201).json({
        message: 'Application created and sent for approval',
        data: {
          application: savedApplication,
          customerAccount: savedAccount,
          depositTransaction,
          workflowItem: wfResponse.data
        },
        approvalUrl: `/api/deposit-account-application/approve/${ACCT_ID}`
      });

    } catch (error) {
      console.error('❌ Unexpected error:', error);
      return res.status(500).json({
        message: 'Unexpected error occurred',
        error: error.message
      });
    }
  },


approveApplicationByCustomerId: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { CUST_ID } = req.params;
        let { approvedBy, rejectedBy, comments, ACCT_NO, status } = req.body;

        // Validate required fields
        if (!ACCT_NO) {
            await session.abortTransaction();
            return res.status(400).json({ 
                message: 'Account number (ACCT_NO) is required when approving by customer ID',
                code: 'MISSING_ACCOUNT_NUMBER'
            });
        }

        // Find and validate the application
        const application = await DepositAccountApplication.findOne({ 
            CUST_ID, 
            ACCT_NO 
        }).session(session);
        
        if (!application) {
            await session.abortTransaction();
            return res.status(404).json({ 
                message: 'Application not found for this customer and account number',
                code: 'APPLICATION_NOT_FOUND'
            });
        }

        // Check current status
        const alreadyApproved = application.STATUS === 'Approved';
        const alreadyActive = application.REC_ST === 'Active';
        const alreadyRejected = application.STATUS === 'Rejected';

        // Determine new status
        if (!status) {
            status = approvedBy ? 'Approved' : rejectedBy ? 'Rejected' : null;
        }
        
        if (!status) {
            await session.abortTransaction();
            return res.status(400).json({ 
                message: 'Status could not be determined. Provide approvedBy, rejectedBy, or status field.',
                code: 'STATUS_UNDETERMINED'
            });
        }

        const normalizedStatus = status.trim().charAt(0).toUpperCase() + status.trim().slice(1).toLowerCase();
        const isApproval = normalizedStatus === 'Approved';

        // Prevent duplicate approvals/rejections
        if ((isApproval && alreadyApproved) || (!isApproval && alreadyRejected)) {
            await session.abortTransaction();
            return res.status(400).json({ 
                message: `Application already ${normalizedStatus}`,
                code: 'DUPLICATE_ACTION'
            });
        }

        // Update application
        application.STATUS = normalizedStatus;
        application.REC_ST = isApproval ? 'Active' : 'Rejected';
        application.COMMENTS = comments || '';
        application.LAST_UPDATED = new Date();

        if (isApproval) {
            if (!approvedBy) {
                await session.abortTransaction();
                return res.status(400).json({ 
                    message: 'Approver user ID (approvedBy) is required',
                    code: 'MISSING_APPROVER'
                });
            }
            application.APPROVED_BY = approvedBy;
            application.APPROVAL_DATE = new Date();
            application.REJECTED_BY = null;
            application.REJECTION_DATE = null;
        } else {
            if (!rejectedBy) {
                await session.abortTransaction();
                return res.status(400).json({ 
                    message: 'Rejector user ID (rejectedBy) is required',
                    code: 'MISSING_REJECTOR'
                });
            }
            application.REJECTED_BY = rejectedBy;
            application.REJECTION_DATE = new Date();
            application.APPROVED_BY = null;
            application.APPROVAL_DATE = null;
        }

        const updatedApplication = await application.save({ session });

        // Handle account activation for approvals
        let existingAccount = null;
        if (isApproval && !alreadyActive) {
            // Check if customer account already exists
            existingAccount = await CustomerAccount.findOne({
                CUST_ID: application.CUST_ID,
                $or: [
                    { ACCT_NO: application.ACCT_NO.toString() },
                    { ACCT_NO: Number(application.ACCT_NO) }
                ]
            }).session(session);

            if (existingAccount) {
                await session.abortTransaction();
                return res.status(400).json({ 
                    success: false,
                    message: 'Customer account already exists',
                    code: 'ACCOUNT_ALREADY_EXISTS',
                    existingAccount: {
                        ACCT_NO: existingAccount.ACCT_NO,
                        CUST_ID: existingAccount.CUST_ID,
                        ACCT_NM: existingAccount.ACCT_NM,
                        STATUS: existingAccount.STATUS
                    }
                });
            }

            // Create new account since it doesn't exist
            const newAccount = new CustomerAccount({
                CUST_ID: application.CUST_ID,
                ACCT_ID: application.ACCT_ID || Math.floor(100000 + Math.random() * 900000),
                ACCT_NO: application.ACCT_NO,
                ACCT_NM: application.ACCT_NM,
                CRNCY_ID: application.CRNCY_ID || 'NGN',
                PROD_ID: application.PROD_ID || '300',
                BU_ID: application.BU_ID || '103',
                AVAIL_DT: application.AVAIL_DT || new Date(),
                OPENED_DT: application.OPENED_DT || new Date(),
                NATIONALITY_NO: application.NATIONALITY_NO,
                CREATED_BY: application.CREATED_BY || 'System',
                USER_ID: application.USER_ID || 'System',
                BVN_NO: application.BVN_NO,
                REC_ST: 'Active',
                STATUS: 'Active',
                CREATED_AT: new Date(),
                LAST_UPDATED: new Date(),
                PRODUCT_DESC: application.PRODUCT_DESC || 'Savings Account',
                ACCOUNT_TYPE: application.ACCOUNT_TYPE || 'SAVINGS',
                LEDGER_BAL: application.LEDGER_BAL || 0,
                CLEARED_BAL: application.CLEARED_BAL || 0,
                AVAILABLE_BALANCE: application.AVAILABLE_BALANCE || 0,
                GL_ACCT_NO: application.GL_ACCT_NO || 'GL' + Math.floor(10000000 + Math.random() * 90000000)
            });

            await newAccount.save({ session });
        }

        // ... rest of your existing workflow and notification code ...

        await session.commitTransaction();

        return res.status(200).json({
            success: true,
            message: isApproval 
                ? 'Application approved and account created successfully.' 
                : 'Application rejected successfully.',
            application: updatedApplication,
            accountCreated: isApproval && !existingAccount,
            timestamp: new Date()
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('Approval processing error:', error);
        return res.status(500).json({ 
            success: false,
            message: 'Error processing application', 
            error: error.message,
            code: 'PROCESSING_ERROR',
            timestamp: new Date()
        });
    } finally {
        session.endSession();
    }
},

  rejectApplicationByCustomerId: async (req, res) => {
    try {
      const { CUST_ID } = req.params;
      const { rejectedBy, comments, ACCT_NO } = req.body;

      req.body.status = 'rejected';
      return DepositAccountApplicationController.approveApplicationByCustomerId(req, res);
    } catch (error) {
      res.status(500).json({ message: 'Error rejecting application', error: error.message });
    }
  },

  updateApplicationStatus: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { id } = req.params;
      const { status, updatedBy, comments } = req.body;

      const application = await DepositAccountApplication.findByIdAndUpdate(
        id,
        {
          STATUS: status,
          UPDATED_BY: updatedBy,
          UPDATE_DATE: new Date(),
          COMMENTS: comments || ''
        },
        { new: true, session }
      );

      if (!application) {
        await session.abortTransaction();
        return res.status(404).json({ message: 'Application not found' });
      }

      if (application.STATUS === 'pending' && status !== 'pending') {
        await WF_WORK_ITEM.findOneAndUpdate(
          { ITEM_VALUE: application.ACCT_NO },
          {
            $set: {
              REC_ST: 'Completed',
              WAIT_ST: status === 'approved' ? 'Approved' : 'Rejected',
              [status === 'approved' ? 'APPROVED_BY' : 'REJECTED_BY']: updatedBy,
              [status === 'approved' ? 'APPROVAL_DATE' : 'REJECTION_DATE']: new Date(),
              COMMENTS: comments || ''
            }
          },
          { new: true, session }
        );
      }

      await AuditTrail.create([{
        event_id: Date.now(),
        user_id: updatedBy,
        event_type: `DepositAccount${status.charAt(0).toUpperCase() + status.slice(1)}`,
        action: `${status.charAt(0).toUpperCase() + status.slice(1)} Application`,
        old_value: { status: application.STATUS },
        new_value: { status },
        ip_address: req.ip || 'unknown',
        timestamp: new Date()
      }], { session });

      await session.commitTransaction();
      res.status(200).json(application);

    } catch (error) {
      await session.abortTransaction();
      res.status(500).json({
        message: 'Error updating application status',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  },

getApplicationByCustId: async (req, res) => {
  try {
    const { CUST_ID } = req.params;

    // Fetch application by customer ID
    const application = await DepositAccountApplication.findOne({ CUST_ID });

    if (!application) {
      return res.status(404).json({ message: 'Application not found for this customer ID.' });
    }

    // Return raw application document (same as getApplicationByACCT_NO)
    res.status(200).json({ data: application });

  } catch (error) {
    console.error('❌ Error in getApplicationByCustId:', error);
    res.status(500).json({
      message: 'Error fetching application by CUST_ID',
      error: error.message,
    });
  }
},

  updateApplication: async (req, res) => {
    try {
      const { CUST_ID } = req.params; // Now using CUST_ID from URL params
      const updates = req.body;

      // Remove any file-related fields from updates to prevent direct modification
      const { IMAGE, DOCUMENT, BANK_MANDATE, ...safeUpdates } = updates;

      // Add validation for critical fields
      if (safeUpdates.BVN_NO && !/^\d{11}$/.test(safeUpdates.BVN_NO)) {
        return res.status(400).json({ message: 'BVN must be exactly 11 digits.' });
      }

      // Check for duplicate BVN if being updated
      if (safeUpdates.BVN_NO) {
        const existingWithBVN = await DepositAccountApplication.findOne({ 
          BVN_NO: safeUpdates.BVN_NO,
          CUST_ID: { $ne: CUST_ID } // Exclude current customer
        });
        if (existingWithBVN) {
          return res.status(400).json({ message: 'BVN already exists for another customer.' });
        }
      }

      // Update by CUST_ID instead of _id
      const updatedApplication = await DepositAccountApplication.findOneAndUpdate(
        { CUST_ID: CUST_ID },
        safeUpdates,
        { new: true }
      );

      if (!updatedApplication) {
        return res.status(404).json({ message: 'Application not found for the given CUST_ID.' });
      }

      res.status(200).json({
        message: 'Application details updated successfully',
        data: updatedApplication,
      });
    } catch (error) {
      console.error('Error updating application:', error);
      res.status(500).json({ 
        message: 'Error updating application details',
        error: error.message 
      });
    }
  },

  deleteApplication: async (req, res) => {
    try {
      const { id } = req.params;

      const deletedApplication = await DepositAccountApplication.findByIdAndDelete(id);

      if (!deletedApplication) {
        return res.status(404).json({ message: 'Application not found.' });
      }

      res.status(200).json({
        message: 'Application deleted successfully',
        data: deletedApplication,
      });
    } catch (error) {
      console.error('Error deleting application:', error);
      res.status(500).json({ message: 'Error deleting application', error: error.message });
    }
  },

  getApplicationByACCT_NO: async (req, res) => {
    try {
      const { ACCT_NO } = req.params;

      const application = await DepositAccountApplication.findOne({ ACCT_NO });

      if (!application) {
        return res.status(404).json({ message: 'Application not found.' });
      }

      res.status(200).json({ data: application });
    } catch (error) {
      console.error('Error fetching application by ACCT_NO:', error);
      res.status(500).json({ message: 'Error fetching application by ACCT_NO', error: error.message });
    }
  },

  uploadFileAndUpdateStatus: async (req, res) => {
    try {
      const { CUST_NO, STATUS } = req.body;
  
      // Ensure files are provided
      if (!req.files || !req.files.IMAGE || !req.files.DOCUMENT || !req.files.BANK_MANDATE) {
        return res.status(400).json({ error: 'Both IMAGE, DOCUMENT, and BANK_MANDATE files are required.' });
      }
  
      // Extract files from the request
      const imageFile = req.files.IMAGE;
      const documentFile = req.files.DOCUMENT;
      const bankmandateFile = req.files.BANK_MANDATE;
  
      // Check file sizes (max 10MB)
      if (imageFile.size > 10 * 1024 * 1024 || documentFile.size > 10 * 1024 * 1024 || bankmandateFile.size > 10 * 1024 * 1024) {
        return res.status(400).json({ error: 'File size exceeds 10 MB limit.' });
      }
  
      // Upload files to Cloudinary
      let imageResult, documentResult, bankmandateResult;
      try {
        imageResult = await cloudinaryV2.uploader.upload(imageFile.tempFilePath, {
          folder: 'PEOPLE CHOICE BANKING DOCUMENT/IMAGE',
        });
        console.log('Image upload result:', imageResult);
      } catch (error) {
        console.error('Error uploading image:', error);
      }
      
      try {
        documentResult = await cloudinaryV2.uploader.upload(documentFile.tempFilePath, {
          folder: 'PEOPLE CHOICE BANKING DOCUMENT/DOCUMENT',
        });
        console.log('Document upload result:', documentResult);
      } catch (error) {
        console.error('Error uploading document:', error);
      }
      
      try {
        bankmandateResult = await cloudinaryV2.uploader.upload(bankmandateFile.tempFilePath, {
          folder: 'PEOPLE CHOICE BANKING DOCUMENT/DOCUMENT',
        });
        console.log('Bank mandate upload result:', bankmandateResult);
      } catch (error) {
        console.error('Error uploading bank mandate:', error);
      }
      
      // Update application status and file URLs
      const updatedApplication = await DepositAccountApplication.findOneAndUpdate(
        { CUST_ID: CUST_NO },
        {
          IMAGE: imageResult.secure_url,
          DOCUMENT: documentResult.secure_url,
          BANK_MANDATE: bankmandateResult.secure_url,
          STATUS: STATUS === 'APPROVED' ? 'Active' : 'pending',
        },
        { new: true }
      );
  
      // If no application is found
      if (!updatedApplication) {
        return res.status(404).json({ message: 'Application not found.' });
      }
  
      res.status(200).json({
        message: 'Application updated successfully',
        data: updatedApplication,
      });
    } catch (error) {
      console.error('Error uploading file and updating status:', error);
      res.status(500).json({ message: 'Error uploading file and updating status', error: error.message });
    }
  },


};

export default DepositAccountApplicationController;