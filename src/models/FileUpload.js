// backend/models/FileUpload.js
import mongoose from 'mongoose';

const FileUploadSchema = new mongoose.Schema({
    CUST_NO: {type: Number, required: true},
    filename: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, required: true },
    format: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: String, required: false }, // Optional: Track who uploaded the file
}, { timestamps: true });

export default mongoose.model('FileUpload', FileUploadSchema);
