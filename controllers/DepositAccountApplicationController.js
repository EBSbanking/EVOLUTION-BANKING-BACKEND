import mongoose from 'mongoose';
import fs from 'fs';
import { v2 as cloudinaryV2 } from 'cloudinary';
import dotenv from 'dotenv';
// import FileUpload from '../models/FileUpload.js';
import DepositAccountApplication from '../models/DepositAccountApplication.js'; // Ensure this path matches your project structure
import { generateAccountIdentifiers } from '../utils/generateAccountNumber.js';

// Load environment variables
dotenv.config();

// Configure Cloudinary
cloudinaryV2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});


// Controller for Deposit Account Application actions
const DepositAccountApplicationController = {
  createApplication: async (req, res) => {
    try {
      console.log('Request body:', req.body);
      console.log('Files:', req.files);
  
      const {
        CUST_ID,
        ACCT_NM,
        CRNCY_ID,
        PROD_ID,
        BU_ID,
        AVAIL_DT,
        OPENED_DT,
        NATIONALITY_NO,
        CREATED_BY,
        BVN_NO,
        DOCUMENT_TYPE,
        DOCUMENT_NUMBER,
        CREATED_AT,
        STATUS,
      } = req.body;
  
      // Generate account identifiers
      const { ACCT_NO, ACCT_ID } = generateAccountIdentifiers();
  
      // Validate BVN_NO
      if (!/^\d{11}$/.test(BVN_NO)) {
        return res.status(400).json({ message: 'BVN_NO must be exactly 11 digits.' });
      }
  
      // Check for existing BVN_NO and NATIONALITY_NO
      const existingBVN = await DepositAccountApplication.findOne({ BVN_NO });
      if (existingBVN) {
        return res.status(400).json({ message: 'BVN_NO has already been used.' });
      }
  
      if (NATIONALITY_NO) {
        const existingNationalityNo = await DepositAccountApplication.findOne({ NATIONALITY_NO });
        if (existingNationalityNo) {
          return res.status(400).json({ message: 'NATIONALITY_NO has already been used.' });
        }
      }
  
      // Ensure required files are provided
      if (!req.files || !req.files.IMAGE || !req.files.DOCUMENT || !req.files.BANK_MANDATE) {
        return res.status(400).json({ error: 'IMAGE, DOCUMENT, and BANK_MANDATE files are required.' });
      }
  
      const imageFile = req.files.IMAGE;
      const documentFile = req.files.DOCUMENT;
      const bankmandateFile = req.files.BANK_MANDATE;
  
      // Validate tempFilePath
      if (!imageFile.tempFilePath || !documentFile.tempFilePath || !bankmandateFile.tempFilePath) {
        return res.status(400).json({ error: 'Temporary file paths are missing.' });
      }
  
      // Upload files to Cloudinary
      const imageResult = await cloudinaryV2.uploader.upload(imageFile.tempFilePath, {
        folder: 'PEOPLE CHOICE BANKING DOCUMENT/IMAGE',
      });
      const documentResult = await cloudinaryV2.uploader.upload(documentFile.tempFilePath, {
        folder: 'PEOPLE CHOICE BANKING DOCUMENT/DOCUMENT',
      });
      const bankmandateResult = await cloudinaryV2.uploader.upload(bankmandateFile.tempFilePath, {
        folder: 'PEOPLE CHOICE BANKING DOCUMENT/DOCUMENT',
      });
  
      // Create a new application
      const newApplication = new DepositAccountApplication({
        CUST_ID,
        ACCT_ID,
        ACCT_NO,
        ACCT_NM,
        CRNCY_ID,
        PROD_ID,
        BU_ID,
        AVAIL_DT,
        OPENED_DT,
        NATIONALITY_NO,
        CREATED_BY,
        BVN_NO,
        DOCUMENT_TYPE,
        DOCUMENT_NUMBER,
        CREATED_AT: CREATED_AT || Date.now(),
        IMAGE: imageResult.secure_url,
        DOCUMENT: documentResult.secure_url,
        BANK_MANDATE: bankmandateResult.secure_url,
        STATUS: STATUS || 'pending',
      });
  
      // Save the application
      const savedApplication = await newApplication.save();
  
      res.status(201).json({
        message: 'Application created successfully',
        data: savedApplication,
      });
    } catch (error) {
      console.error('Unexpected error:', error);
      res.status(500).json({ message: 'Unexpected error occurred', error: error.message });
    }
  },
  

  getDepositAccountApplication: async (req, res) => {
    try {
      const applications = await DepositAccountApplication.find();
      res.status(200).json({ data: applications });
    } catch (error) {
      console.error('Error fetching applications:', error);
      res.status(500).json({ message: 'Error fetching applications', error: error.message });
    }
  },

  updateApplication: async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const updatedApplication = await DepositAccountApplication.findByIdAndUpdate(id, updates, { new: true });

      if (!updatedApplication) {
        return res.status(404).json({ message: 'Application not found.' });
      }

      res.status(200).json({
        message: 'Application updated successfully',
        data: updatedApplication,
      });
    } catch (error) {
      console.error('Error updating application:', error);
      res.status(500).json({ message: 'Error updating application', error: error.message });
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
