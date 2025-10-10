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
      required: true,
    },
    createdBy: {
      type: String,
      required: true,
      trim: true,
      uppercase: true, // optional if you want consistency like CREATED_BY
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
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'subfolders',
    timestamps: true, // adds createdAt and updatedAt automatically
    versionKey: false, // removes __v
  }
);

export default mongoose.model('Subfolder', SubfolderSchema);
