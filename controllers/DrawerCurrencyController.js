import DrawerCurrency from '../models/DrawerCurrency.js';

// Create a new DrawerCurrency entry
export const createDrawerCurrency = async (req, res) => {
    try {
      const newDrawerCurrency = new DrawerCurrency(req.body);
      await newDrawerCurrency.save();
      res.status(201).json(newDrawerCurrency);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error creating Drawer Currency entry', error: error.message });
    }
  };
// Get all DrawerCurrency entries
export const getAllDrawerCurrencies = async (req, res) => {
  try {
    const drawerCurrencies = await DrawerCurrency.find();
    res.status(200).json(drawerCurrencies);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error retrieving Drawer Currency entries', error: error.message });
  }
};

// Get a specific DrawerCurrency entry by ID
export const getDrawerCurrencyById = async (req, res) => {
  try {
    const { id } = req.params;
    const drawerCurrency = await DrawerCurrency.findById(id);

    if (!drawerCurrency) {
      return res.status(404).json({ message: 'Drawer Currency entry not found' });
    }

    res.status(200).json(drawerCurrency);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error retrieving Drawer Currency entry', error: error.message });
  }
};

// Update a DrawerCurrency entry by ID
export const updateDrawerCurrency = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedDrawerCurrency = await DrawerCurrency.findByIdAndUpdate(id, req.body, { new: true });

    if (!updatedDrawerCurrency) {
      return res.status(404).json({ message: 'Drawer Currency entry not found' });
    }

    res.status(200).json(updatedDrawerCurrency);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating Drawer Currency entry', error: error.message });
  }
};

// Delete a DrawerCurrency entry by ID
export const deleteDrawerCurrency = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedDrawerCurrency = await DrawerCurrency.findByIdAndDelete(id);

    if (!deletedDrawerCurrency) {
      return res.status(404).json({ message: 'Drawer Currency entry not found' });
    }

    res.status(200).json({ message: 'Drawer Currency entry deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error deleting Drawer Currency entry', error: error.message });
  }
};
