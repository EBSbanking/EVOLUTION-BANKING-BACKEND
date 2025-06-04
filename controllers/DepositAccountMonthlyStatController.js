// pco_banking_backend/controllers/DepositAccountMonthlyStatController.js
import DepositAccountMonthlyStat from '../models/DepositAccountMonthlyStat.js';

// Create a new Deposit Account Monthly Stat
export const createMonthlyStat = async (req, res) => {
  try {
    const newStat = new DepositAccountMonthlyStat(req.body);
    await newStat.save();
    res.status(201).json(newStat); // Respond with the newly created stat
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get all Deposit Account Monthly Stats
export const getAllMonthlyStats = async (req, res) => {
  try {
    const stats = await DepositAccountMonthlyStat.find();
    res.status(200).json(stats); // Respond with all stats
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get a Deposit Account Monthly Stat by ID
export const getMonthlyStatById = async (req, res) => {
  try {
    const stat = await DepositAccountMonthlyStat.findById(req.params.id);
    if (!stat) {
      return res.status(404).json({ message: 'Stat not found' });
    }
    res.status(200).json(stat); // Respond with the stat
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update a Deposit Account Monthly Stat by ID
export const updateMonthlyStat = async (req, res) => {
  try {
    const updatedStat = await DepositAccountMonthlyStat.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true } // Return the updated stat
    );
    if (!updatedStat) {
      return res.status(404).json({ message: 'Stat not found' });
    }
    res.status(200).json(updatedStat); // Respond with the updated stat
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete a Deposit Account Monthly Stat by ID
export const deleteMonthlyStat = async (req, res) => {
  try {
    const deletedStat = await DepositAccountMonthlyStat.findByIdAndDelete(req.params.id);
    if (!deletedStat) {
      return res.status(404).json({ message: 'Stat not found' });
    }
    res.status(200).json({ message: 'Stat deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
