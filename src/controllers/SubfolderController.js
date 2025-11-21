import mongoose from 'mongoose';
import Subfolder from '../models/Subfolder.js';
import Ledger from '../models/Ledger.js';

// For GL Account creation - expects GL_ACCT_NO (original function)
export const createRootSubfolder = async (transactionId, { GL_ACCT_NO, createdBy, description }, { session } = {}) => {
  try {
    if (!createdBy || !GL_ACCT_NO) {
      throw new Error('createdBy and GL_ACCT_NO are required');
    }

    // Fetch ledgerNo from Ledger or use SUB_LEDGER_NO from transaction
    const ledger = await Ledger.findOne({ GL_ACCT_NO }).session(session).exec();
    const ledgerNo = ledger?.LEDGER_NO || '0000';

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

    const parentId = 1;
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

// In your subfolderController.js, update the createSimpleRootSubfolder function:
export const createSimpleRootSubfolder = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      const { name, createdBy, ledgerNo = '001', description, parentId = 1 } = req.body; // Default to 1

      if (!name || !createdBy) {
        throw new Error('name and createdBy are required');
      }

      // Generate a simple subfolderId
      const maxSubfolder = await Subfolder.findOne()
        .sort({ subfolderId: -1 })
        .session(session);

      let subfolderId = 1;
      if (maxSubfolder && maxSubfolder.subfolderId) {
        subfolderId = Number(maxSubfolder.subfolderId) + 1;
      }

      const newSubfolder = new Subfolder({
        subfolderId: subfolderId,
        parentId: Number(parentId), // Ensure it's a number
        createdBy: createdBy.trim().toUpperCase(),
        ledgerNo: ledgerNo.trim(),
        isRoot: true,
        name: name.trim(),
        description: description || '',
        createdAt: new Date(),
      });

      await newSubfolder.save({ session });

      res.status(201).json({
        success: true,
        message: 'Root subfolder created successfully',
        data: newSubfolder
      });
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error('Error creating root subfolder:', error.message);
    res.status(400).json({
      success: false,
      message: 'Error creating root subfolder',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// Create subfolder with GL_ACCT_NO (for GL account integration)
export const createSubfolderWithGLAccount = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      const { GL_ACCT_NO, createdBy, description, name } = req.body;

      if (!GL_ACCT_NO || !createdBy) {
        throw new Error('GL_ACCT_NO and createdBy are required');
      }

      // Fetch ledgerNo from Ledger
      const ledger = await Ledger.findOne({ GL_ACCT_NO }).session(session);
      const ledgerNo = ledger?.LEDGER_NO || '0000';

      // Generate subfolderId
      const maxSubfolder = await Subfolder.findOne()
        .sort({ subfolderId: -1 })
        .session(session);

      let subfolderId = 1;
      if (maxSubfolder && maxSubfolder.subfolderId) {
        subfolderId = Number(maxSubfolder.subfolderId) + 1;
      }

      const finalName = name || (description ? `${description} Subfolder` : `Subfolder for ${GL_ACCT_NO}`);

      const newSubfolder = new Subfolder({
        subfolderId: subfolderId.toString(),
        parentId: null,
        createdBy: createdBy.trim(),
        ledgerNo: ledgerNo.trim(),
        isRoot: true,
        name: finalName.trim(),
        description: description || '',
        GL_ACCT_NO: GL_ACCT_NO,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await newSubfolder.save({ session });

      res.status(201).json({
        success: true,
        message: 'Subfolder created successfully',
        data: newSubfolder
      });
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error('Error creating subfolder:', error.message);
    res.status(400).json({
      success: false,
      message: 'Error creating subfolder',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// Original fetch function
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

// Get all subfolders API endpoint
export const getAllSubfolders = async (req, res) => {
  try {
    const { parentId } = req.query;
    
    const filter = parentId ? { parentId: Number(parentId) } : {};
    const subfolders = await Subfolder.find(filter)
      .sort({ subfolderId: 1 })
      .exec();

    res.status(200).json({
      success: true,
      count: subfolders.length,
      data: subfolders
    });
  } catch (error) {
    console.error('Error fetching subfolders:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching subfolders',
      error: error.message
    });
  }
};

// Get subfolder by ID
export const getSubfolderById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const subfolder = await Subfolder.findOne({ subfolderId: id });
    
    if (!subfolder) {
      return res.status(404).json({
        success: false,
        message: 'Subfolder not found'
      });
    }

    res.status(200).json({
      success: true,
      data: subfolder
    });
  } catch (error) {
    console.error('Error fetching subfolder:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching subfolder',
      error: error.message
    });
  }
};

// New function for GL account creation (uses LEDGER_NO directly)
export const createRootSubfolderWithLedger = async (createdBy, ledgerNo, description = '', { session } = {}) => {
  try {
    if (!createdBy || !ledgerNo) {
      throw new Error('createdBy and ledgerNo are required');
    }

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

    const parentId = null;
    const isRoot = true;
    const name = description ? `${description} Subfolder` : `Root Subfolder ${ledgerNo}`;

    const newSubfolder = new Subfolder({
      subfolderId: subfolderId.toString(),
      parentId,
      createdBy: createdBy.trim(),
      ledgerNo: ledgerNo.trim(),
      isRoot,
      name: name.trim(),
      description: description || '',
      createdAt: new Date(),
      updatedAt: new Date()
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