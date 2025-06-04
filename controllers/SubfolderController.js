import Subfolder from '../models/Subfolder.js';
import { createRootSubfolder } from '../utils/subfolderUtils.js'; // Optional import

// Controller to create a subfolder
export const createSubfolder = async (req, res) => {
  const { parentId, createdBy, ledgerNo, isRoot, name } = req.body;

  // Validation allowing 0/false but ensuring correct types
  if (
    typeof parentId !== 'number' ||
    typeof ledgerNo !== 'number' ||
    typeof isRoot !== 'boolean' ||
    typeof createdBy !== 'string' ||
    typeof name !== 'string' ||
    !createdBy.trim() ||
    !name.trim()
  ) {
    return res.status(400).json({ message: 'Required fields are missing or invalid.' });
  }

  try {
    // Get the current max subfolderId as a plain object
    const maxSubfolder = await Subfolder.findOne().sort({ subfolderId: -1 }).lean().exec();

    // Calculate the next subfolderId safely
    let subfolderId = 1;
    if (maxSubfolder && maxSubfolder.subfolderId !== undefined && !isNaN(Number(maxSubfolder.subfolderId))) {
      subfolderId = Number(maxSubfolder.subfolderId) + 1;
    }

    const newSubfolder = new Subfolder({
      subfolderId,
      parentId,
      createdBy: createdBy.trim(),
      ledgerNo,
      isRoot,
      name: name.trim(),
    });

    await newSubfolder.save();

    res.status(201).json({
      message: 'Subfolder created successfully',
      subfolder: newSubfolder,
    });
  } catch (error) {
    console.error('Error creating subfolder:', error);
    res.status(500).json({
      message: 'Error creating subfolder',
      error: error.message,
    });
  }
};

// Controller to fetch subfolders, optionally filtered by parentId
export const fetchSubfolders = async (req, res) => {
  try {
    const { parentId } = req.query;

    const filter = parentId ? { parentId: Number(parentId) } : {};

    const subfolders = await Subfolder.find(filter).sort({ createdAt: -1 }).exec();

    res.status(200).json({
      message: 'Subfolders fetched successfully',
      subfolders,
    });
  } catch (error) {
    console.error('Error fetching subfolders:', error);
    res.status(500).json({
      message: 'Error fetching subfolders',
      error: error.message,
    });
  }
};
