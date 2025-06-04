// Import RateIndex model
import RateIndex from '../models/Rate-Index.js';

// Get all rate indices or filter by INDEX_RATE
export const getAllRateIndices = async (req, res) => {
  try {
    const { INDEX_RATE } = req.query;
    let filter = {};
    if (INDEX_RATE) {
      filter.INDEX_RATE = INDEX_RATE;
    }

    const rateIndices = await RateIndex.find(filter);
    if (!rateIndices.length) {
      return res.status(404).json({ message: 'Rate indices not found.' });
    }

    res.status(200).json(rateIndices);
  } catch (error) {
    console.error('Error fetching Rate Indices:', error);
    res.status(500).json({ message: 'Failed to fetch Rate Indices', error: error.message });
  }
};

// Create a new rate index
export const createRateIndex = async (req, res) => {
  const { INDEX_RATE_ID, INDEX_CD, INDEX_RATE, INDEX_NM, CRNCY_ID, PRECISION, EFFECTIVE_DT, VERSION, REC_ST, CREATED_BY } = req.body;
  try {
    if (!INDEX_RATE_ID || !INDEX_CD || !INDEX_RATE || !INDEX_NM || !CRNCY_ID || !PRECISION || !EFFECTIVE_DT || !VERSION || !REC_ST || !CREATED_BY) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const newRateIndex = new RateIndex({ INDEX_RATE_ID, INDEX_CD, INDEX_RATE, INDEX_NM, CRNCY_ID, PRECISION, EFFECTIVE_DT, VERSION, REC_ST, CREATED_BY });
    await newRateIndex.save();
    res.status(201).json({ message: 'Rate Index created successfully!', newRateIndex });
  } catch (error) {
    console.error('Error creating Rate Index:', error);
    res.status(500).json({ message: 'Failed to create Rate Index', error: error.message });
  }
};

// Update an existing rate index
export const updateRateIndex = async (req, res) => {
  try {
    const rateIndex = await RateIndex.findOneAndUpdate(
      { INDEX_RATE_ID: req.params.id }, 
      req.body, 
      { new: true }
    );

    if (!rateIndex) {
      return res.status(404).json({ message: 'Rate Index not found.' });
    }

    res.status(200).json({ message: 'Rate Index updated successfully!', rateIndex });
  } catch (error) {
    console.error('Error updating Rate Index:', error);
    res.status(500).json({ message: 'Failed to update Rate Index', error: error.message });
  }
};

// Get a specific rate index by ID
export const getRateIndexById = async (req, res) => {
  try {
    const rateIndex = await RateIndex.findOne({ INDEX_RATE_ID: req.params.id });
    if (!rateIndex) {
      return res.status(404).json({ message: 'Rate Index not found.' });
    }

    res.status(200).json(rateIndex);
  } catch (error) {
    console.error('Error fetching Rate Index by ID:', error);
    res.status(500).json({ message: 'Failed to fetch Rate Index', error: error.message });
  }
};

// Delete a rate index by ID
export const deleteRateIndex = async (req, res) => {
  try {
    const rateIndex = await RateIndex.findOneAndDelete({ INDEX_RATE_ID: req.params.id });
    if (!rateIndex) {
      return res.status(404).json({ message: 'Rate Index not found.' });
    }

    res.status(200).json({ message: 'Rate Index deleted successfully!', rateIndex });
  } catch (error) {
    console.error('Error deleting Rate Index:', error);
    res.status(500).json({ message: 'Failed to delete Rate Index', error: error.message });
  }
};
