// controllers/DrawerController.js
import Drawer from '../models/Drawer.js';

// Create a new Drawer entry
export const createDrawer = async (req, res) => {
  try {
    const {
      DRAWER_ID,
      DRAWER_NO,
      TOTAL_INSURED_AMT,
      MIN_BAL,
      MAX_BAL,
      EFF_FROM_DT,
      EFF_TO_DT,
      DRAWER_TY_CD,
      REC_ST,
      VERSION_NO,
      USER_ID,
      BU_ID,
      CREATE_DT,
      SYS_CREATE_TS,
      CREATED_BY,
      OVERAGE_AMT,
      SHORTAGE_AMT,
      DRAWER_CASH_LIMIT_FG,
      DRAWER_LIMIT_EXCEED_TM,
      DRAWER_INSURED_LIMIT_FG,
      LAST_DRAWER_CLOSE_DT,
      LAST_DRAWER_OPEN_DT,
      GL_ACCT_NO,
      SP_ACCT_NO,
      SP_ACCT_FG,
      WF_STATUS,
      DRAWER_NM
    } = req.body;

    const newDrawer = new Drawer({
      DRAWER_ID,
      DRAWER_NO,
      TOTAL_INSURED_AMT,
      MIN_BAL,
      MAX_BAL,
      EFF_FROM_DT,
      EFF_TO_DT,
      DRAWER_TY_CD,
      REC_ST,
      VERSION_NO,
      USER_ID,
      BU_ID,
      CREATE_DT,
      SYS_CREATE_TS,
      CREATED_BY,
      OVERAGE_AMT,
      SHORTAGE_AMT,
      DRAWER_CASH_LIMIT_FG,
      DRAWER_LIMIT_EXCEED_TM,
      DRAWER_INSURED_LIMIT_FG,
      LAST_DRAWER_CLOSE_DT,
      LAST_DRAWER_OPEN_DT,
      GL_ACCT_NO,
      SP_ACCT_NO,
      SP_ACCT_FG,
      WF_STATUS,
      DRAWER_NM
    });

    await newDrawer.save();
    res.status(201).json(newDrawer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error creating Drawer entry', error: error.message });
  }
};

// Get all Drawer entries
export const getAllDrawers = async (req, res) => {
  try {
    const drawers = await Drawer.find();
    res.status(200).json(drawers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error retrieving Drawer entries', error: error.message });
  }
};

// Get a specific Drawer entry by ID
export const getDrawerById = async (req, res) => {
  try {
    const { id } = req.params;
    const drawer = await Drawer.findById(id);

    if (!drawer) {
      return res.status(404).json({ message: 'Drawer entry not found' });
    }

    res.status(200).json(drawer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error retrieving Drawer entry', error: error.message });
  }
};

// Update a Drawer entry by ID
export const updateDrawer = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedDrawer = await Drawer.findByIdAndUpdate(id, req.body, { new: true });

    if (!updatedDrawer) {
      return res.status(404).json({ message: 'Drawer entry not found' });
    }

    res.status(200).json(updatedDrawer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating Drawer entry', error: error.message });
  }
};

// Delete a Drawer entry by ID
export const deleteDrawer = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedDrawer = await Drawer.findByIdAndDelete(id);

    if (!deletedDrawer) {
      return res.status(404).json({ message: 'Drawer entry not found' });
    }

    res.status(200).json({ message: 'Drawer entry deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error deleting Drawer entry', error: error.message });
  }
};
