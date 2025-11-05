import Customer from '../models/Customer.js';  // Import the Customer model
import CustomerAccount from '../models/CustomerAccount.js'; // Import the CustomerAccount model
import LoanAccount from '../models/LoanAccount.js'; // Import the LoanAccount model

// Controller to get all available Business Units (BU) from Customer collection
export const getAllBusinessUnits = async (req, res) => {
  try {
    // Get distinct Business Units from the Customer collection
    const businessUnits = await Customer.distinct('BU_ID');
    res.status(200).json({ businessUnits });
  } catch (error) {
    console.error('Error fetching business units:', error);
    res.status(500).json({ error: 'Server error while fetching business units' });
  }
};

// Controller to get total customer count
export const getTotalCustomerCount = async (req, res) => {
  try {
    const totalCustomerCount = await Customer.countDocuments();
    res.status(200).json({ totalCustomerCount });
  } catch (error) {
    console.error('Error fetching total customer count:', error);
    res.status(500).json({ error: 'Server error while fetching total customer count' });
  }
};

// Controller to get total customer count by Business Unit (BU)
export const getTotalCustomerCountByBU = async (req, res) => {
  try {
    const { businessUnit } = req.params;
    const totalCustomerCountByBU = await Customer.countDocuments({ BU_ID: businessUnit });
    res.status(200).json({ totalCustomerCountByBU });
  } catch (error) {
    console.error('Error fetching total customer count by BU:', error);
    res.status(500).json({ error: 'Server error while fetching total customer count by BU' });
  }
};

// Controller to get total customer account count
export const getTotalCustomerAccountCount = async (req, res) => {
  try {
    const totalCustomerAccountCount = await CustomerAccount.countDocuments();
    res.status(200).json({ totalCustomerAccountCount });
  } catch (error) {
    console.error('Error fetching total customer account count:', error);
    res.status(500).json({ error: 'Server error while fetching total customer account count' });
  }
};

// Controller to get total customer account count by Business Unit (BU)
export const getTotalCustomerAccountCountByBU = async (req, res) => {
  try {
    const { businessUnit } = req.params;
    const totalCustomerAccountCountByBU = await CustomerAccount.countDocuments({ BU_ID: businessUnit });
    res.status(200).json({ totalCustomerAccountCountByBU });
  } catch (error) {
    console.error('Error fetching total customer account count by BU:', error);
    res.status(500).json({ error: 'Server error while fetching total customer account count by BU' });
  }
};

// Controller to get total loan account count
export const getTotalLoanAccountCount = async (req, res) => {
  try {
    const totalLoanAccountCount = await LoanAccount.countDocuments();
    res.status(200).json({ totalLoanAccountCount });
  } catch (error) {
    console.error('Error fetching total loan account count:', error);
    res.status(500).json({ error: 'Server error while fetching total loan account count' });
  }
};

// Controller to get total loan account count by Business Unit (BU)
export const getTotalLoanAccountCountByBU = async (req, res) => {
  try {
    const { businessUnit } = req.params;
    const totalLoanAccountCountByBU = await LoanAccount.countDocuments({ BU_ID: businessUnit });
    res.status(200).json({ totalLoanAccountCountByBU });
  } catch (error) {
    console.error('Error fetching total loan account count by BU:', error);
    res.status(500).json({ error: 'Server error while fetching total loan account count by BU' });
  }
};
