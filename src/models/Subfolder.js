import mongoose from 'mongoose';

const SubfolderSchema = new mongoose.Schema(
  {
    subfolderId: {
      type: Number,
      required: true,
      unique: true,
    },
    parentId: {
      type: Number,
      default: null, // Allow null for root folders
    },
    createdBy: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    ledgerNo: {
      type: String,
      required: true,
      trim: true,
    },
    isRoot: {
      type: Boolean,
      default: false,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: { // Add this field since your function uses it
      type: String,
      default: '',
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'subfolders',
    timestamps: true,
    versionKey: false,
  }
);

export default mongoose.model('Subfolder', SubfolderSchema);