import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema({
    url: { type: String, required: true },
    publicId: { type: String, required: true },
}, { timestamps: true });

const File = mongoose.model('File', fileSchema);

export default File;
