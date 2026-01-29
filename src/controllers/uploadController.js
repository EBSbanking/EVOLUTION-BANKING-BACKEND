import fs from 'fs';
import { v2 as cloudinaryV2 } from 'cloudinary';
import dotenv from 'dotenv';
// import DepositAccountApplication from '../models/DepositAccountApplication.js';
import FileUpload from '../models/FileUpload.js';
import File from '../models/File.js'; // Assuming you have a File model for cloudinary uploads

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
            folder: 'EVOLUTION BANKING DOCUMENT/IMAGE', // Specify folder in Cloudinary
        });

        const documentResult = await cloudinaryV2.uploader.upload(documentPath, {
            folder: 'EVOLUTION BANKING DOCUMENT/DOCUMENT', // Specify folder in Cloudinary
        });

        const bankMandateResult = await cloudinaryV2.uploader.upload(bankMandatePath, {
            folder: 'EVOLUTION BANKING DOCUMENT/BANK_MANDATE', // Specify folder in Cloudinary
        });

        // Log Cloudinary results
        console.log("Cloudinary Image upload result:", imageResult);
        console.log("Cloudinary Document upload result:", documentResult);
        console.log("Cloudinary Bank Mandate upload result:", bankMandateResult);

        // Save the file metadata to the FileUpload table
        const [imageMetadata, documentMetadata, bankMandateMetadata] = await Promise.all([
            FileUpload.create({
                CUST_NO, 
                filename: imageResult.original_filename,
                url: imageResult.secure_url,
                size: imageFile.size,
                format: imageResult.format,
                uploadedBy: uploadedBy || 'Unknown User',
            }),
            FileUpload.create({
                CUST_NO,
                filename: documentResult.original_filename,
                url: documentResult.secure_url,
                size: documentFile.size,
                format: documentResult.format,
                uploadedBy: uploadedBy || 'Unknown User',
            }),
            FileUpload.create({
                CUST_NO,
                filename: bankMandateResult.original_filename,
                url: bankMandateResult.secure_url,
                size: bankMandateFile.size,
                format: bankMandateResult.format,
                uploadedBy: uploadedBy || 'Unknown User',
            })
        ]);

        // Also save to File table (if you're using it for cloudinary references)
        const [imageFileRecord, documentFileRecord, bankMandateFileRecord] = await Promise.all([
            File.create({
                url: imageResult.secure_url,
                publicId: imageResult.public_id,
            }),
            File.create({
                url: documentResult.secure_url,
                publicId: documentResult.public_id,
            }),
            File.create({
                url: bankMandateResult.secure_url,
                publicId: bankMandateResult.public_id,
            })
        ]);

        // Update the application status in the database (commented out as DepositAccountApplication is not defined)
        /*
        const updatedApplication = await DepositAccountApplication.update(
            { IMAGE: imageResult.secure_url,
                DOCUMENT: documentResult.secure_url,
                BANK_MANDATE: bankMandateResult.secure_url,
                STATUS: STATUS === 'APPROVED' ? 'Active' : 'pending',
            },
            {
                where: { CUST_ID: CUST_NO }
            }
        );

        // If no application is found
        if (!updatedApplication || updatedApplication[0] === 0) {
            return res.status(404).json({ message: 'Application not found.' });
        }

        // Get the updated application
        const application = await DepositAccountApplication.findOne({
            where: { CUST_ID: CUST_NO }
        });
        */

        // Clean up temporary files if they were created
        if (fs.existsSync('./temp_image_file')) fs.unlinkSync('./temp_image_file');
        if (fs.existsSync('./temp_document_file')) fs.unlinkSync('./temp_document_file');
        if (fs.existsSync('./temp_bank_mandate_file')) fs.unlinkSync('./temp_bank_mandate_file');

        // Success response
        res.status(200).json({
            message: 'Files uploaded successfully.',
            files: {
                image: imageMetadata,
                document: documentMetadata,
                bankMandate: bankMandateMetadata
            },
            // data: application // Uncomment when DepositAccountApplication is defined
        });
    } catch (error) {
        console.error('Error uploading files and updating application:', error);
        
        // Clean up temporary files on error
        try {
            if (fs.existsSync('./temp_image_file')) fs.unlinkSync('./temp_image_file');
            if (fs.existsSync('./temp_document_file')) fs.unlinkSync('./temp_document_file');
            if (fs.existsSync('./temp_bank_mandate_file')) fs.unlinkSync('./temp_bank_mandate_file');
        } catch (cleanupError) {
            console.error('Error cleaning up temp files:', cleanupError);
        }
        
        res.status(500).json({ 
            error: 'Error uploading files and updating application.', 
            details: error.message 
        });
    }
};

export const getFileByCUSTNO = async (req, res) => {
    try {
        const { CUSTNO } = req.params;  // Get the CUSTNO from the route parameter

        // Find the file associated with the CUSTNO
        const file = await FileUpload.findOne({
            where: { CUST_NO: CUSTNO },
            order: [['uploadedAt', 'DESC']] // Get the most recent file
        });

        if (!file) {
            return res.status(404).json({ message: 'File not found for the given CUST_NO.' });
        }

        res.status(200).json({ data: file });
    } catch (error) {
        console.error('Error fetching file by CUSTNO:', error);
        res.status(500).json({ 
            message: 'Error fetching file by CUSTNO', 
            error: error.message 
        });
    }
};

// New function to get all files for a customer
export const getFilesByCUSTNO = async (req, res) => {
    try {
        const { CUSTNO } = req.params;

        const files = await FileUpload.findAll({
            where: { CUST_NO: CUSTNO },
            order: [['uploadedAt', 'DESC']]
        });

        if (!files || files.length === 0) {
            return res.status(404).json({ message: 'No files found for the given CUST_NO.' });
        }

        res.status(200).json({ 
            count: files.length,
            data: files 
        });
    } catch (error) {
        console.error('Error fetching files by CUSTNO:', error);
        res.status(500).json({ 
            message: 'Error fetching files by CUSTNO', 
            error: error.message 
        });
    }
};

// Function to delete a file
export const deleteFile = async (req, res) => {
    try {
        const { id } = req.params;

        const file = await FileUpload.findByPk(id);
        
        if (!file) {
            return res.status(404).json({ message: 'File not found.' });
        }

        // Optionally delete from Cloudinary
        try {
            await cloudinaryV2.uploader.destroy(file.publicId || '');
        } catch (cloudinaryError) {
            console.warn('Could not delete from Cloudinary:', cloudinaryError);
        }

        await file.destroy();

        res.status(200).json({ 
            message: 'File deleted successfully.',
            deletedFile: file 
        });
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({ 
            message: 'Error deleting file', 
            error: error.message 
        });
    }
};