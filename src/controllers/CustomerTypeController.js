import CustomerType from '../models/CustomerType.js'; // adjust path if needed

// Create a new CustomerType
const createCustomerType = async (req, res) => {
  try {
    const data = req.body;
    const newCustomerType = new CustomerType(data);
    await newCustomerType.save();
    res.status(201).json(newCustomerType);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get all CustomerTypes
const getAllCustomerTypes = async (req, res) => {
  try {
    const types = await CustomerType.find(); // Fetch all types
    res.status(200).json(types);             // Return as array
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch customer types" });
  }
};

// Get CustomerType by ID
const getCustomerTypeById = async (req, res) => {
  try {
    const { id } = req.params;
    const customerType = await CustomerType.findById(id);
    if (!customerType) return res.status(404).json({ error: 'CustomerType not found' });
    res.json(customerType);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update CustomerType by ID
const updateCustomerType = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    const customerType = await CustomerType.findByIdAndUpdate(id, updatedData, {
      new: true,
      runValidators: true
    });
    if (!customerType) return res.status(404).json({ error: 'CustomerType not found' });
    res.json(customerType);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Delete CustomerType by ID
const deleteCustomerType = async (req, res) => {
  try {
    const { id } = req.params;
    const customerType = await CustomerType.findByIdAndDelete(id);
    if (!customerType) return res.status(404).json({ error: 'CustomerType not found' });
    res.json({ message: 'CustomerType deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Export all controllers
export default {
  createCustomerType,
  getAllCustomerTypes,
  getCustomerTypeById,
  updateCustomerType,
  deleteCustomerType
};
