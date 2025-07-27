import RateIndex from '../models/Rate-Index.js';
import InterestCalculationService from '../Services/InterestCalculationService.js';

const interestService = new InterestCalculationService();

// Get all rate indices or filter by INDEX_RATE
export const getAllRateIndices = async (req, res) => {
  try {
    const { INDEX_RATE, CRNCY_ID, REC_ST } = req.query;
    const filter = {};
    
    if (INDEX_RATE) filter.INDEX_RATE = INDEX_RATE;
    if (CRNCY_ID) filter.CRNCY_ID = CRNCY_ID;
    if (REC_ST) filter.REC_ST = REC_ST;

    const rateIndices = await RateIndex.find(filter)
      .sort({ EFFECTIVE_DT: -1 }); // Most recent first
      
    res.status(200).json({
      success: true,
      count: rateIndices.length,
      data: rateIndices
    });
  } catch (error) {
    console.error('Error fetching Rate Indices:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch Rate Indices', 
      error: error.message 
    });
  }
};

// Create a new rate index
export const createRateIndex = async (req, res) => {
  try {
    const requiredFields = [
      'INDEX_RATE_ID', 'INDEX_CD', 'INDEX_RATE', 
      'INDEX_NM', 'CRNCY_ID', 'PRECISION', 
      'EFFECTIVE_DT', 'DAY_COUNT_CONVENTION'
    ];
    
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        missingFields
      });
    }

    // Validate rate is a positive number
    if (req.body.INDEX_RATE <= 0) {
      return res.status(400).json({
        success: false,
        message: 'INDEX_RATE must be a positive number'
      });
    }

    const newRateIndex = new RateIndex(req.body);
    await newRateIndex.save();
    
    res.status(201).json({
      success: true,
      message: 'Rate Index created successfully',
      data: newRateIndex
    });
  } catch (error) {
    console.error('Error creating Rate Index:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to create Rate Index', 
      error: error.message 
    });
  }
};

// Get a specific rate index by ID
export const getRateIndexById = async (req, res) => {
  try {
    const rateIndex = await RateIndex.findOne({ 
      INDEX_RATE_ID: req.params.id 
    });
    
    if (!rateIndex) {
      return res.status(404).json({
        success: false,
        message: 'Rate Index not found'
      });
    }

    res.status(200).json({
      success: true,
      data: rateIndex
    });
  } catch (error) {
    console.error('Error fetching Rate Index:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch Rate Index', 
      error: error.message 
    });
  }
};

// Update an existing rate index
export const updateRateIndex = async (req, res) => {
  try {
    // Prevent updating immutable fields
    const { CREATED_DT, SYS_CREATE_TS, _id, __v, ...updateData } = req.body;
    
    const rateIndex = await RateIndex.findOneAndUpdate(
      { INDEX_RATE_ID: req.params.id },
      updateData,
      { new: true, runValidators: true }
    );

    if (!rateIndex) {
      return res.status(404).json({
        success: false,
        message: 'Rate Index not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Rate Index updated successfully',
      data: rateIndex
    });
  } catch (error) {
    console.error('Error updating Rate Index:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to update Rate Index', 
      error: error.message 
    });
  }
};

// Delete a rate index by ID
export const deleteRateIndex = async (req, res) => {
  try {
    // Check if any products are using this rate index
    const productsUsingRate = await LoanInterestRate.countDocuments({ 
      INDEX_RATE_ID: req.params.id 
    });
    
    if (productsUsingRate > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete - rate index is in use by loan products'
      });
    }

    const rateIndex = await RateIndex.findOneAndDelete({ 
      INDEX_RATE_ID: req.params.id 
    });

    if (!rateIndex) {
      return res.status(404).json({
        success: false,
        message: 'Rate Index not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Rate Index deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting Rate Index:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to delete Rate Index', 
      error: error.message 
    });
  }
};

// Calculate interest using the centralized service
export const calculateInterest = async (req, res) => {
  try {
    const { rateIndexId } = req.params;
    const { principal, startDate, endDate } = req.body;

    // Validate inputs
    if (!principal || !startDate) {
      return res.status(400).json({
        success: false,
        message: 'Principal and start date are required'
      });
    }

    // Get the rate index
    const rateIndex = await RateIndex.findOne({ 
      INDEX_RATE_ID: rateIndexId 
    });
    
    if (!rateIndex) {
      return res.status(404).json({
        success: false,
        message: 'Rate Index not found'
      });
    }

    // Use the centralized service
    const result = await interestService.calculateInterest({
      principal: parseFloat(principal),
      annualRate: rateIndex.INDEX_RATE,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : new Date(),
      dayCountConvention: rateIndex.DAY_COUNT_CONVENTION,
      interestType: 'SIMPLE', // Default for rate indices
      precision: rateIndex.PRECISION || 4
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error calculating interest:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to calculate interest', 
      error: error.message 
    });
  }
};