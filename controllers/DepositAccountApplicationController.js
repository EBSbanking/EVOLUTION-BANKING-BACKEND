import mongoose from 'mongoose';
import fs from 'fs';
import { v2 as cloudinaryV2 } from 'cloudinary';
import dotenv from 'dotenv';
import DepositAccountApplication from '../models/DepositAccountApplication.js';
import CustomerAccount from '../models/CustomerAccount.js';
import AuditTrail from '../models/AuditTrail.js';
import { generateAccountIdentifiers } from '../utils/generateAccountNumber.js';
import WF_WORK_ITEMController from '../controllers/WF_WORK_ITEMController.js';
import NotificationService from '../services/NotificationService.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import { generateNumber } from '../utils/generateNumber.js';
import { generateWorkflowIdentifiers } from '../utils/generateWorkflowIdentifiers.js';

// Load environment variables
dotenv.config();

// Configure Cloudinary
cloudinaryV2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Valid account types and record states
const VALID_ACCOUNT_TYPES = ['SAVINGS', 'CURRENT', 'FIXED_DEPOSIT'];

// Controller for Deposit Account Application actions
const DepositAccountApplicationController = {
  createApplication: async (req, res) => {
    try {
      console.log('Request body:', req.body);
      const USER_ID = req.body.USER_ID || req.headers['x-user-id'];
      if (!USER_ID) return res.status(400).json({ message: 'USER_ID is required to create workflow item' });

      const {
        CUST_ID, ACCT_NM, CRNCY_ID, PROD_ID, BU_ID,
        AVAIL_DT, OPENED_DT, NATIONALITY_NO,
        CREATED_BY, BVN_NO, DOCUMENT_TYPE,
        DOCUMENT_NUMBER, CREATED_AT, STATUS
      } = req.body;

      if (!/^\d{11}$/.test(BVN_NO)) return res.status(400).json({ message: 'BVN_NO must be exactly 11 digits.' });
      if (await DepositAccountApplication.findOne({ BVN_NO })) return res.status(400).json({ message: 'BVN_NO has already been used.' });
      if (NATIONALITY_NO && await DepositAccountApplication.findOne({ NATIONALITY_NO, CUST_ID: { $ne: CUST_ID } })) {
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

      const { ACCT_ID, ACCT_NO } = generateAccountIdentifiers();

      const newApp = new DepositAccountApplication({
        CUST_ID, ACCT_ID, ACCT_NO, ACCT_NM, CRNCY_ID, PROD_ID, BU_ID,
        AVAIL_DT, OPENED_DT, NATIONALITY_NO, CREATED_BY,
        USER_ID, BVN_NO, DOCUMENT_TYPE, DOCUMENT_NUMBER,
        CREATED_AT: CREATED_AT || Date.now(),
        IMAGE, DOCUMENT, BANK_MANDATE,
        STATUS: 'Pending' // Force default
      });
      const saved = await newApp.save();

      // Workflow & notification
      const { WORK_ITEM_ID, QUEUE_ID, SUB_PROC_ID, BUS_PROC_ID } = generateWorkflowIdentifiers();
      const workflowItem = new WF_WORK_ITEM({
        WORK_ITEM_ID, ITEM_VALUE: ACCT_NO, ITEM_DESC: `Deposit Account Application for ${ACCT_NM}`,
        ITEM_CLASS_NM:'DepositAccount', ITEM_TYPE:'DepositAccount', EVENT_ID: generateNumber(7),
        CUST_ID, REC_ST:'Pending', VERSION:1, USER_ID, BU_ID, CREATE_DT:new Date(),
        WAIT_ST:'Pending', ITEM_ID:generateNumber(4), ITEM_REF_NO:generateNumber(4),
        ORIGINATOR_USER_ROLE_ID:USER_ID, QUEUE_ID, SUB_PROC_ID, BUS_PROC_ID,
        TARGET_USER_ROLE_ID:'Manager'
      });
      await workflowItem.save();

      await NotificationService.send({
        ROLE_ID: 'Manager',
        message: `New deposit account for ${ACCT_NM} requires approval`,
        WORK_ITEM_ID, CUST_ID
      });

      // Create customer account
      // Customer Account - set REC_ST to Pending
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

      const savedAcct = await acct.save();

      await AuditTrail.create({
        event_id: Date.now(), user_id: USER_ID, event_type: 'CustomerAccount',
        action: 'Create Account', old_value: null, new_value: savedAcct,
        ip_address: req.ip || 'unknown', timestamp: new Date()
      });

      return res.status(201).json({
        message: 'Application created and sent for approval',
        data: { application: saved, customerAccount: savedAcct },
        workflowItem,
        approvalUrl: `/api/deposit-account-application/approve/${ACCT_ID}`
      });
    } catch (error) {
      console.error('Unexpected error:', error);
      return res.status(500).json({ message: 'Unexpected error occurred', error: error.message });
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
        return res.status(400).json({ message: 'Account number (ACCT_NO) is required when approving by customer ID' });
      }

      // Find the application
      const application = await DepositAccountApplication.findOne({ CUST_ID, ACCT_NO }).session(session);
      if (!application) {
        return res.status(404).json({ message: 'Application not found for this customer and account number' });
      }

      // Check current status
      const alreadyApproved = application.STATUS === 'Approved';
      const alreadyActive = application.REC_ST === 'Active';

      // Determine new status
      if (!status) {
        status = approvedBy ? 'Approved' : rejectedBy ? 'Rejected' : null;
      }
      if (!status) {
        return res.status(400).json({ 
          message: 'Status could not be determined. Provide approvedBy or rejectedBy or status field.' 
        });
      }

      const normalizedStatus = status.trim().charAt(0).toUpperCase() + status.trim().slice(1).toLowerCase();
      const isApproval = normalizedStatus === 'Approved';

      // Update application
      application.STATUS = normalizedStatus;
      application.REC_ST = isApproval ? 'Active' : 'Rejected';
      application.COMMENTS = comments || '';

      if (isApproval) {
        if (!approvedBy) {
          return res.status(400).json({ message: 'Approver user ID (approvedBy) is required' });
        }
        application.APPROVED_BY = approvedBy;
        application.APPROVAL_DATE = new Date();
      } else {
        if (!rejectedBy) {
          return res.status(400).json({ message: 'Rejector user ID (rejectedBy) is required' });
        }
        application.REJECTED_BY = rejectedBy;
        application.REJECTION_DATE = new Date();
      }

      const updatedApplication = await application.save({ session });

      // Update associated account if approved
      if (isApproval) {
        const existingAccount = await CustomerAccount.findOneAndUpdate(
          { ACCT_NO: application.ACCT_NO },
          {
            $set: {
              REC_ST: 'ACTIVE',
              OPENING_DATE: application.OPENED_DT,
              CREATED_BY: application.CREATED_BY,
            }
          },
          { new: true, session }
        );

        if (!existingAccount) {
          await session.abortTransaction();
          return res.status(404).json({ message: 'Customer account not found for this application.' });
        }
      }

      // Find and update related workflow items
      const updateConditions = {
        ITEM_VALUE: application.ACCT_NO.toString(),
        ITEM_TYPE: 'DepositAccount',
        REC_ST: 'Pending'
      };

      const updateFields = {
        REC_ST: isApproval ? 'Completed' : 'Rejected',
        WAIT_ST: isApproval ? 'Approved' : 'Rejected',
        [isApproval ? 'APPROVED_BY' : 'REJECTED_BY']: isApproval ? approvedBy : rejectedBy,
        [isApproval ? 'APPROVAL_DATE' : 'REJECTION_DATE']: new Date(),
        COMPLETED_DT: new Date(),
        COMMENTS: comments || ''
      };

      const updateResult = await WF_WORK_ITEM.updateMany(
        updateConditions,
        { $set: updateFields }
      ).session(session);

      // Get affected workflow items for notification
      const affectedItems = await WF_WORK_ITEM.find(updateConditions).session(session);
      
      // Archive workflow items
      for (const item of affectedItems) {
        await WF_WORK_ITEM.findByIdAndDelete(item._id, { session });
      }

      // Create new workflow item if none exists (only for approvals)
      let workItemId;
      if (isApproval && affectedItems.length === 0) {
        const { WORK_ITEM_ID } = generateWorkflowIdentifiers();
        workItemId = WORK_ITEM_ID;
        
        const workflowItem = new WF_WORK_ITEM({
          WORK_ITEM_ID,
          ITEM_VALUE: application.ACCT_NO.toString(),
          ITEM_DESC: `Auto-created: Deposit Account Application for ${application.ACCT_NM}`,
          ITEM_CLASS_NM: 'DepositAccount',
          ITEM_TYPE: 'DepositAccount',
          EVENT_ID: generateNumber(7),
          CUST_ID: application.CUST_ID,
          REC_ST: 'Completed',
          VERSION: 1,
          USER_ID: approvedBy,
          BU_ID: application.BU_ID,
          CREATE_DT: new Date(),
          WAIT_ST: 'Approved',
          ITEM_ID: generateNumber(4),
          ITEM_REF_NO: generateNumber(4),
          ORIGINATOR_USER_ROLE_ID: approvedBy,
          QUEUE_ID: generateNumber(4),
          SUB_PROC_ID: generateNumber(4),
          BUS_PROC_ID: generateNumber(4),
          TARGET_USER_ROLE_ID: 'Customer',
          APPROVED_BY: approvedBy,
          APPROVAL_DATE: new Date(),
          COMMENTS: comments || ''
        });
        await workflowItem.save({ session });
      } else {
        workItemId = affectedItems[0]?.WORK_ITEM_ID || generateNumber(6);
      }

      // Send Notification with guaranteed numeric WORK_ITEM_ID
      await NotificationService.send({
        ROLE_ID: isApproval ? 'Customer' : application.ORIGINATOR_USER_ROLE_ID || 'System',
        CUST_ID: application.CUST_ID,
        message: isApproval 
          ? `Your account ${application.ACCT_NO} has been approved` 
          : `Your application for account ${application.ACCT_NO} has been rejected`,
        WORK_ITEM_ID: workItemId
      });

      // Log audit trail
      await AuditTrail.create([{
        event_id: Date.now(),
        user_id: isApproval ? approvedBy : rejectedBy,
        event_type: isApproval ? 'DepositAccountApproval' : 'DepositAccountRejection',
        action: isApproval ? 'Approve Application' : 'Reject Application',
        old_value: { status: application.STATUS },
        new_value: { status: normalizedStatus },
        ip_address: req.ip || 'unknown',
        timestamp: new Date()
      }], { session });

      await session.commitTransaction();

      return res.status(200).json({
        message: alreadyApproved && alreadyActive
          ? 'Application already approved previously. Status re-confirmed and workflow archived.'
          : isApproval 
            ? 'Application approved successfully.' 
            : 'Application rejected successfully.',
        application: updatedApplication,
        workItemsUpdated: updateResult.modifiedCount
      });

    } catch (error) {
      await session.abortTransaction();
      console.error('Approval error:', {
        error: error.message,
        stack: error.stack,
        body: req.body,
        params: req.params
      });
      
      // Specific error handling for WORK_ITEM_ID casting
      if (error.message.includes('Cast to Number failed')) {
        return res.status(400).json({ 
          message: 'Invalid workflow item ID format',
          error: 'WORK_ITEM_ID must be a number'
        });
      }
      
      return res.status(500).json({ 
        message: 'Error processing application', 
        error: error.message 
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

      const application = await DepositAccountApplication.findOne({ CUST_ID });

      if (!application) {
        return res.status(404).json({ message: 'Application not found for this customer ID.' });
      }

      // You can extract only necessary document fields if desired:
      const { IMAGE, DOCUMENT, BANK_MANDATE, DOCUMENT_TYPE, DOCUMENT_NUMBER } = application;

      res.status(200).json({
        message: 'Application documents fetched successfully',
        data: {
          IMAGE,
          DOCUMENT,
          BANK_MANDATE,
          DOCUMENT_TYPE,
          DOCUMENT_NUMBER,
          application // Optional: include full application if frontend needs more fields
        }
      });
    } catch (error) {
      console.error('Error fetching application by CUST_ID:', error);
      res.status(500).json({ message: 'Error fetching application by CUST_ID', error: error.message });
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