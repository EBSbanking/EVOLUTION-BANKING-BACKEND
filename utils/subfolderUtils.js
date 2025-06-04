import Subfolder from '../models/Subfolder.js';

export const createRootSubfolder = async (createdBy, ledgerNo) => {
try {
  // Get the current max subfolderId as a plain object
  const maxSubfolder = await Subfolder.findOne().sort({ subfolderId: -1 }).lean().exec();

  // Calculate new subfolderId safely
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
}