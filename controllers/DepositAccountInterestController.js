// pco_banking_backend/controllers/DepositAccountInterest_TierController.js
import DepositAccountInterest_Tier from '../models/DepositAccountInterest_Tier.js';  // Correct path to model // Correct path

export const createTier = async (req, res) => {
    try {
      const newTier = new DepositAccountInterest_Tier(req.body);
      await newTier.save();
      res.status(201).json(newTier);
    } catch (error) {
      console.error('Error creating tier:', error);  // Add some logging here
      res.status(400).json({ error: error.message });
    }
  };
// Get all tiers
export const getAllTiers = async (req, res) => {
  try {
    const tiers = await DepositAccountInterest_Tier.find();
    res.status(200).json(tiers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get a tier by ID
export const getTierById = async (req, res) => {
  try {
    const tier = await DepositAccountInterest_Tier.findById(req.params.id);
    if (!tier) {
      return res.status(404).json({ message: 'Tier not found' });
    }
    res.status(200).json(tier);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update a tier
export const updateTier = async (req, res) => {
  try {
    const updatedTier = await DepositAccountInterest_Tier.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updatedTier) {
      return res.status(404).json({ message: 'Tier not found' });
    }
    res.status(200).json(updatedTier);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete a tier
export const deleteTier = async (req, res) => {
  try {
    const deletedTier = await DepositAccountInterest_Tier.findByIdAndDelete(req.params.id);
    if (!deletedTier) {
      return res.status(404).json({ message: 'Tier not found' });
    }
    res.status(200).json({ message: 'Tier deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
