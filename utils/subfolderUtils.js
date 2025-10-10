import Subfolder from '../models/Subfolder.js';
import Ledger from '../models/Ledger.js';

export const createRootSubfolder = async (transactionId, { GL_ACCT_NO, createdBy, description }, { session } = {}) => {
  try {
    if (!createdBy || !GL_ACCT_NO) {
      throw new Error('createdBy and GL_ACCT_NO are required');
    }

    // Fetch ledgerNo from Ledger or use SUB_LEDGER_NO from transaction
    const ledger = await Ledger.findOne({ GL_ACCT_NO }).session(session).exec();
    const ledgerNo = ledger?.LEDGER_NO || '0000'; // Fallback to default if not found

    // Generate a unique numeric subfolderId
    const maxSubfolder = await Subfolder.findOne()
      .sort({ subfolderId: -1 })
      .lean()
      .session(session)
      .exec();

    let subfolderId = 1;
    if (maxSubfolder && maxSubfolder.subfolderId !== undefined && !isNaN(Number(maxSubfolder.subfolderId))) {
      subfolderId = Number(maxSubfolder.subfolderId) + 1;
    }

    const parentId = 1; // Root subfolders have a fixed parentId
    const isRoot = true;
    const name = description ? `${description} Subfolder ${ledgerNo}`.trim() : `Root Subfolder ${ledgerNo}`.trim();

    const newSubfolder = new Subfolder({
      subfolderId,
      parentId,
      createdBy: createdBy.trim(),
      ledgerNo: ledgerNo.trim(),
      isRoot,
      name,
    });

    await newSubfolder.save({ session });
    return newSubfolder;
  } catch (error) {
    console.error('Error creating root subfolder:', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

export const fetchSubfolders = async (parentId = null, { session } = {}) => {
  try {
    const filter = parentId ? { parentId } : {};
    const subfolders = await Subfolder.find(filter)
      .sort({ subfolderId: 1 })
      .session(session)
      .exec();
    return subfolders;
  } catch (error) {
    console.error('Error fetching subfolders:', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};