import mongoose from 'mongoose';
import fs from 'fs';
import { v2 as cloudinaryV2 } from 'cloudinary';
import dotenv from 'dotenv';
// import DepositAccountApplication from '../models/DepositAccountApplication.js';
import FileUpload from '../models/FileUpload.js';

// Load environment variables
dotenv.config();

// Configure Cloudinary
cloudinaryV2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Controller to handle file upload and status update
export const uploadFileAndUpdateStatus = async (req, res) => {
    try {
        const { CUST_NO, uploadedBy, STATUS } = req.body;

        // Check if IMAGE, DOCUMENT, and BANK_MANDATE are uploaded
        if (!req.files || !req.files.IMAGE || !req.files.DOCUMENT || !req.files.BANK_MANDATE) {
            return res.status(400).json({ error: 'IMAGE, DOCUMENT, and BANK_MANDATE files are required.' });
        }

        const imageFile = req.files.IMAGE;
        const documentFile = req.files.DOCUMENT;
        const bankMandateFile = req.files.BANK_MANDATE;

        // Log file details for debugging
        console.log("Image File details:", imageFile);
        console.log("Document File details:", documentFile);
        console.log("Bank Mandate File details:", bankMandateFile);

        // Check if the files are too large (max 10 MB)
        if (imageFile.size > 10 * 1024 * 1024 || documentFile.size > 10 * 1024 * 1024 || bankMandateFile.size > 10 * 1024 * 1024) {
            return res.status(400).json({ error: 'File size exceeds 10 MB limit.' });
        }

        // Determine file paths
        let imagePath = imageFile.tempFilePath || imageFile.data;
        let documentPath = documentFile.tempFilePath || documentFile.data;
        let bankMandatePath = bankMandateFile.tempFilePath || bankMandateFile.data;

        // If the file is a Buffer, create a temporary file path for Cloudinary upload
        if (Buffer.isBuffer(imagePath)) {
            const tempImagePath = './temp_image_file';
            fs.writeFileSync(tempImagePath, imagePath);
            imagePath = tempImagePath;
        }
        if (Buffer.isBuffer(documentPath)) {
            const tempDocumentPath = './temp_document_file';
            fs.writeFileSync(tempDocumentPath, documentPath);
            documentPath = tempDocumentPath;
        }
        if (Buffer.isBuffer(bankMandatePath)) {
            const tempBankMandatePath = './temp_bank_mandate_file';
            fs.writeFileSync(tempBankMandatePath, bankMandatePath);
            bankMandatePath = tempBankMandatePath;
        }

        // Upload files to Cloudinary
        const imageResult = await cloudinaryV2.uploader.upload(imagePath, {
            folder: 'PEOPLE CHOICE BANKING DOCUMENT/IMAGE', // Specify folder in Cloudinary
        });

        const documentResult = await cloudinaryV2.uploader.upload(documentPath, {
            folder: 'PEOPLE CHOICE BANKING DOCUMENT/DOCUMENT', // Specify folder in Cloudinary
        });

        const bankMandateResult = await cloudinaryV2.uploader.upload(bankMandatePath, {
            folder: 'PEOPLE CHOICE BANKING DOCUMENT/BANK_MANDATE', // Specify folder in Cloudinary
        });

        // Log Cloudinary results
        console.log("Cloudinary Image upload result:", imageResult);
        console.log("Cloudinary Document upload result:", documentResult);
        console.log("Cloudinary Bank Mandate upload result:", bankMandateResult);

        // Save the file metadata to the database with CUST_NO
        const imageMetadata = new FileUpload({
            CUST_NO, 
            filename: imageResult.original_filename,
            url: imageResult.secure_url,
            size: imageFile.size,
            format: imageResult.format,
            uploadedBy: uploadedBy || 'Unknown User',
        });

        const documentMetadata = new FileUpload({
            CUST_NO,
            filename: documentResult.original_filename,
            url: documentResult.secure_url,
            size: documentFile.size,
            format: documentResult.format,
            uploadedBy: uploadedBy || 'Unknown User',
        });

        const bankMandateMetadata = new FileUpload({
            CUST_NO,
            filename: bankMandateResult.original_filename,
            url: bankMandateResult.secure_url,
            size: bankMandateFile.size,
            format: bankMandateResult.format,
            uploadedBy: uploadedBy || 'Unknown User',
        });

        // Save file metadata to the database
        await imageMetadata.save();
        await documentMetadata.save();
        await bankMandateMetadata.save();

        // Update the application status in the database
        const updatedApplication = await DepositAccountApplication.findOneAndUpdate(
            { CUST_ID: CUST_NO },
            {
                IMAGE: imageResult.secure_url,
                DOCUMENT: documentResult.secure_url,
                BANK_MANDATE: bankMandateResult.secure_url,
                STATUS: STATUS === 'APPROVED' ? 'Active' : 'pending',
            },
            { new: true }
        );

        // If no application is found
        if (!updatedApplication) {
            return res.status(404).json({ message: 'Application not found.' });
        }

        // Success response
        res.status(200).json({
            message: 'Files uploaded successfully and application updated.',
            data: updatedApplication,
        });
    } catch (error) {
        console.error('Error uploading files and updating application:', error);
        res.status(500).json({ error: 'Error uploading files and updating application.', details: error.message });
    }
};

export const getFileByCUSTNO = async (req, res) => {
    try {
      const { CUSTNO } = req.params;  // Get the CUSTNO from the route parameter
  
      // Find the file associated with the CUSTNO
      const file = await FileUpload.findOne({ CUST_NO: CUSTNO });
  
      if (!file) {
        return res.status(404).json({ message: 'File not found for the given CUST_NO.' });
      }
  
      res.status(200).json({ data: file });
    } catch (error) {
      console.error('Error fetching file by CUSTNO:', error);
      res.status(500).json({ message: 'Error fetching file by CUSTNO', error: error.message });
    }
  };
  