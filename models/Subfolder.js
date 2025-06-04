import mongoose from 'mongoose';

// Define the Subfolder Schema
const SubfolderSchema = new mongoose.Schema({
  subfolderId: { type: Number, required: true }, // Optional, auto-incrementing ID
  parentId: { type: Number, required: true },
  createdBy: { type: String, required: true },
  ledgerNo: { type: Number, required: true },
  isRoot: { type: Boolean, required: true },
  name: { type: String, required: true },
}, {
  timestamps: true,
});


// Check if the model already exists in mongoose.models
const Subfolder = mongoose.models.Subfolder || mongoose.model('Subfolder', SubfolderSchema);

export default Subfolder;

// Function to create a root subfolder (if needed)
export const createRootSubfolder = async (createdBy, ledgerNo) => {
    try {
        // Generate a unique numeric parentId for the root subfolder
        const maxParentId = await Subfolder.findOne().sort({ parentId: -1 }).limit(1);
        const newParentId = maxParentId ? maxParentId.parentId + 1 : 1; // Increment the last used parentId

        const rootSubfolder = new Subfolder({
            parentId: newParentId, // Set the generated numeric parentId
            createdBy,
            ledgerNo,
            isRoot: true,
            name: 'Root Folder',
        });

        await rootSubfolder.save();
        return rootSubfolder;
    } catch (error) {
        console.error('Error creating root subfolder:', error);
        throw error;
    }
};

// Utility function to fetch subfolders
export const fetchSubfolders = async (parentId = null) => {
    try {
        const filter = parentId ? { parentId } : {};
        const subfolders = await Subfolder.find(filter).sort({ createdAt: -1 });
        return subfolders;
    } catch (error) {
        console.error('Error fetching subfolders:', error);
        throw error;
    }
};
