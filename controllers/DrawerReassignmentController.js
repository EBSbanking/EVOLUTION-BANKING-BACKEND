import DrawerReassignment from '../models/DrawerReassignment.js';

// Create a new DrawerReassignment entry
export const createDrawerReassignment = async (req, res) => {
  try {
    const newDrawerReassignment = new DrawerReassignment(req.body);
    await newDrawerReassignment.save();
    res.status(201).json(newDrawerReassignment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error creating Drawer Reassignment entry', error: error.message });
  }
};

// Get all DrawerReassignment entries
export const getAllDrawerReassignments = async (req, res) => {
  try {
    const drawerReassignments = await DrawerReassignment.find();
    res.status(200).json(drawerReassignments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error retrieving Drawer Reassignment entries', error: error.message });
  }
};

// Get a specific DrawerReassignment entry by ID
export const getDrawerReassignmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const drawerReassignment = await DrawerReassignment.findById(id);

    if (!drawerReassignment) {
      return res.status(404).json({ message: 'Drawer Reassignment entry not found' });
    }

    res.status(200).json(drawerReassignment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error retrieving Drawer Reassignment entry', error: error.message });
  }
};

// Update a DrawerReassignment entry by ID
export const updateDrawerReassignment = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedDrawerReassignment = await DrawerReassignment.findByIdAndUpdate(id, req.body, { new: true });

    if (!updatedDrawerReassignment) {
      return res.status(404).json({ message: 'Drawer Reassignment entry not found' });
    }

    res.status(200).json(updatedDrawerReassignment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating Drawer Reassignment entry', error: error.message });
  }
};

// Delete a DrawerReassignment entry by ID
export const deleteDrawerReassignment = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedDrawerReassignment = await DrawerReassignment.findByIdAndDelete(id);

    if (!deletedDrawerReassignment) {
      return res.status(404).json({ message: 'Drawer Reassignment entry not found' });
    }

    res.status(200).json({ message: 'Drawer Reassignment entry deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error deleting Drawer Reassignment entry', error: error.message });
  }
};
