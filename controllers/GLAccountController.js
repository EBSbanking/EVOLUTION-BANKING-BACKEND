import GLAccount from '../models/GLAccount.js';
import Subfolder from '../models/Subfolder.js';
import { createRootSubfolder } from '../utils/subfolderUtils.js';


export const createGLAccount = async (req, res) => {
    try {
        console.log('Request Body:', req.body);

        const {
            CHART_OF_ACCT_ID,
            ACCT_DESC,
            LEDGER_NO,
            GL_ACCT_CAT,
            JOURNAL_ID,
            TRANSACTION_TYPE,
            BAL_CD,
            SUB_LEDGER_NO,
            BU_ID,
            CR_ALLOWED,
            DR_ALLOWED,
            REC_ST,
            POST_ALLOW,
            POST_FG,
            CONTROL_ACCT_FG,
            CREATED_BY,
            SUPENSE_ACCT_FG,
            ALLOW_BAL_SWING_FG,
            PARENT_ID,
            SEG_VALUE,
            SEG_DESC,
            SEG_NO,
            subfolderId,
            SEG_TY_CD,
            SEG_PLACEHLDR_ID,
            PROMPT,
        } = req.body;

        // ✅ Validate required fields
        if (!CREATED_BY || !LEDGER_NO || !BAL_CD || !SUB_LEDGER_NO || !BU_ID || !SEG_NO) {
            return res.status(400).json({
                message: 'CREATED_BY, LEDGER_NO, BAL_CD, SUB_LEDGER_NO, BU_ID, and SEG_NO are required'
            });
        }

        // ✅ Step 1: Determine or create the parent subfolder
        let parentFolder;
        if (PARENT_ID) {
            parentFolder = await Subfolder.findOne({ parentId: PARENT_ID });
            if (!parentFolder) {
                console.log(`Parent folder with ID ${PARENT_ID} not found, creating new.`);
                parentFolder = await createRootSubfolder(CREATED_BY, LEDGER_NO);
            }
        } else {
            parentFolder = await createRootSubfolder(CREATED_BY, LEDGER_NO);
        }

        const resolvedParentId = PARENT_ID || parentFolder.parentId || 1;

        // ✅ Step 2: Generate the next 7-digit GL_ACCT_ID (starting from 31111111)
        const lastAcct = await GLAccount.findOne().sort({ GL_ACCT_ID: -1 }).limit(1);
        const newGLAcctId = lastAcct ? String(parseInt(lastAcct.GL_ACCT_ID) + 1) : "31111111";
        console.log(`Generated GL_ACCT_ID: ${newGLAcctId}`);

        // ✅ Step 3: Construct the GL_ACCT_NO (descriptive string)
        const glAcctNo = `${resolvedParentId}-${BAL_CD}-${LEDGER_NO}-${SUB_LEDGER_NO}-${BU_ID}-${SEG_NO}`;
        console.log(`Generated GL_ACCT_NO: ${glAcctNo}`);

        // ✅ Step 4: Create the new GLAccount using the updated logic
        const newGLAccount = new GLAccount({
            GL_ACCT_NO: glAcctNo,
            GL_ACCT_ID: newGLAcctId,
            CREATED_BY,
            LEDGER_NO,
            PARENT_ID: resolvedParentId,
            subfolderId: parentFolder.subfolderId,
            BAL_CD,
            SUB_LEDGER_NO,
            BU_ID,
            SEG_NO,
            CHART_OF_ACCT_ID: CHART_OF_ACCT_ID || '10001',
            ACCT_DESC: ACCT_DESC || 'GL Account',
            GL_ACCT_CAT_CD: GL_ACCT_CAT || 'ASSET',
            GL_ACCT_CAT: GL_ACCT_CAT || 'ASSET',
            JOURNAL_ID: JOURNAL_ID || Math.floor(Math.random() * 1_000_000_000),
            TRANSACTION_TYPE: TRANSACTION_TYPE || 'Deposit',
            CR_ALLOWED: CR_ALLOWED !== undefined ? CR_ALLOWED : true,
            DR_ALLOWED: DR_ALLOWED !== undefined ? DR_ALLOWED : true,
            REC_ST: REC_ST || 'Active',
            POST_ALLOW: POST_ALLOW !== undefined ? POST_ALLOW : true,
            POST_FG: POST_FG !== undefined ? POST_FG : 'Y',
            CONTROL_ACCT_FG: CONTROL_ACCT_FG !== undefined ? CONTROL_ACCT_FG : 'N',
            SUPENSE_ACCT_FG: SUPENSE_ACCT_FG !== undefined ? SUPENSE_ACCT_FG : 'N',
            ALLOW_BAL_SWING_FG: ALLOW_BAL_SWING_FG !== undefined ? ALLOW_BAL_SWING_FG : 'N',
            SEG_VALUE: SEG_VALUE || '',
            SEG_DESC: SEG_DESC || '',
            SEG_TY_CD: SEG_TY_CD || '',
            SEG_PLACEHLDR_ID: SEG_PLACEHLDR_ID || '',
            PROMPT: PROMPT || '',
        });

        // ✅ Step 5: Save the new GLAccount
        await newGLAccount.save();

        res.status(201).json({
            message: 'GL account created successfully',
            glAccount: newGLAccount,
        });
    } catch (error) {
        console.error('Error creating GL account:', error);
        res.status(500).json({
            message: 'Error creating GL account',
            error: error.errors || error.message,
        });
    }
};

// Other controllers remain unchanged...



// Function to create a root subfolder
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


// Get all GL Accounts
export const getAllGLAccounts = async (req, res) => {
    try {
        const accounts = await GLAccount.find({});
        return res.status(200).json(accounts);
    } catch (error) {
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};


// Get a single GL Account by ACCT_NO
export const getGLAccountById = async (req, res) => {
    try {
        const { id } = req.params; // Use `id` if that's the route definition

        if (!id) {
            return res.status(400).json({ message: 'GL Account Number is required' });
        }

        const trimmedGL_ACCT_NO = id.trim();

        // Format validation
        const isValidFormat = /^\d{1,2}-\d{3}-\d{3}-\d{1,3}-\d{1,3}-\d{1,2}$/.test(trimmedGL_ACCT_NO);
        if (!isValidFormat) {
            return res.status(400).json({ message: 'Invalid GL Account Number format' });
        }

        const glAccount = await GLAccount.findOne({ GL_ACCT_NO: trimmedGL_ACCT_NO });

        if (!glAccount) {
            return res.status(404).json({ message: 'GL Account not found' });
        }

        res.status(200).json({ message: 'GL Account fetched successfully', data: glAccount });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching GL Account', error: error.message });
    }
};

// Update a GL Account by ACCT_NO
export const updateGLAccount = async (req, res) => {
    try {
        const { id } = req.params; // Use `id` if that's the route definition
        const updatedData = req.body;

        if (!GL_ACCT_NO) {
            return res.status(400).json({ message: 'GL Account Number is required' });
        }

        const isValidFormat = /^\d+-\d+-\d+-\d+-\d+$/.test(GL_ACCT_NO);
        if (!isValidFormat) {
            return res.status(400).json({ message: 'Invalid GL Account Number format' });
        }

        const updatedGLAccount = await GLAccount.findOneAndUpdate(
            { GL_ACCT_NO },
            updatedData,
            { new: true }
        );

        if (!updatedGLAccount) {
            return res.status(404).json({ message: 'GL Account not found' });
        }

        res.status(200).json({ message: 'GL Account updated successfully', data: updatedGLAccount });
    } catch (error) {
        res.status(400).json({ message: 'Error updating GL Account', error: error.message });
    }
};

// Delete a GL Account by ACCT_NO
export const deleteGLAccount = async (req, res) => {
    try {
        const {GL_ACCT_NO } = req.params;

        if (!GL_ACCT_NO) {
            return res.status(400).json({ message: 'GL Account Number is required' });
        }

        const isValidFormat = /^\d+-\d+-\d+-\d+-\d+$/.test(GL_ACCT_NO);
        if (!isValidFormat) {
            return res.status(400).json({ message: 'Invalid GL Account Number format' });
        }

        const deletedGLAccount = await GLAccount.findOneAndDelete({ GL_ACCT_NO });

        if (!deletedGLAccount) {
            return res.status(404).json({ message: 'GL Account not found' });
        }

        res.status(200).json({ message: 'GL Account deleted successfully', data: deletedGLAccount });
    } catch (error) {
        res.status(400).json({ message: 'Error deleting GL Account', error: error.message });
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


export default {
    createGLAccount,
    getAllGLAccounts,
    getGLAccountById,
    updateGLAccount,
    deleteGLAccount,
    fetchSubfolders
};
