// Models/IdentificationInformation.js
import mongoose from 'mongoose';

const IdentificationInformationSchema = new mongoose.Schema({
  CUST_ID:{type: Number, require: true},
  CUST_NM: {type:String},
  docId: {
    type: String, // Using String for the document ID
    required: true,
    unique: true, // Ensure each Document ID is unique
  },
  documentType: {
    type: String,
    required: true,
    enum: ['Passport', "Driver's License", 'National ID', "Voter's ID"], // Valid document types
  },
  documentId: {
    type: String, // Using String for the document ID
    required: true,
  },
  countryOfIssuer: {
    type: String,
    required: true,
  },
  expiryDate: {
    type: Date,
    required: true,
  },
  image: {
    type: String, // Store the path or URL to the uploaded image
    required: true,
  },
  status: {
    type: String,
    enum: ['active', 'inactive'], // Only allow these statuses
    default: 'active', // Set default status to 'active'
  },
}, { 
  timestamps: true, // Automatically manage createdAt and updatedAt fields
  versionKey: false, // Disable __v version key if not needed
});

// Export the model
export default mongoose.model('IdentificationInformation', IdentificationInformationSchema);
