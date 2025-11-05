import DrawerUserRole from '../models/DrawerUserRole.js';

// Create a new DrawerUserRole
export const createDrawerUserRole = async (req, res) => {
  try {
    const newDrawerUserRole = new DrawerUserRole(req.body);
    await newDrawerUserRole.save();
    res.status(201).json(newDrawerUserRole);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error creating Drawer User Role', error: error.message });
  }
};

// Get all DrawerUserRoles
export const getAllDrawerUserRoles = async (req, res) => {
  try {
    const drawerUserRoles = await DrawerUserRole.find();
    res.status(200).json(drawerUserRoles);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error retrieving Drawer User Roles', error: error.message });
  }
};

// Get a specific DrawerUserRole by ID
export const getDrawerUserRoleById = async (req, res) => {
  try {
    const { id } = req.params;
    const drawerUserRole = await DrawerUserRole.findById(id);

    if (!drawerUserRole) {
      return res.status(404).json({ message: 'Drawer User Role not found' });
    }

    res.status(200).json(drawerUserRole);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error retrieving Drawer User Role', error: error.message });
  }
};

// Update a DrawerUserRole by ID
export const updateDrawerUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedDrawerUserRole = await DrawerUserRole.findByIdAndUpdate(id, req.body, { new: true });

    if (!updatedDrawerUserRole) {
      return res.status(404).json({ message: 'Drawer User Role not found' });
    }

    res.status(200).json(updatedDrawerUserRole);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating Drawer User Role', error: error.message });
  }
};

// Delete a DrawerUserRole by ID
export const deleteDrawerUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedDrawerUserRole = await DrawerUserRole.findByIdAndDelete(id);

    if (!deletedDrawerUserRole) {
      return res.status(404).json({ message: 'Drawer User Role not found' });
    }

    res.status(200).json({ message: 'Drawer User Role deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error deleting Drawer User Role', error: error.message });
  }
};
