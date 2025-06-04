import DepositAccountInterestOption from '../models/DepositAccountInterestOption.js';

// Create a new deposit account interest option record
export const createDepositAccountInterestOption = async (req, res) => {
  try {
    const newOption = new DepositAccountInterestOption(req.body);
    const savedOption = await newOption.save();
    res.status(201).json({ message: 'Deposit account interest option created successfully', data: savedOption });
  } catch (error) {
    console.error('Error creating deposit account interest option:', error);
    res.status(500).json({ message: 'Error creating deposit account interest option', error: error.message });
  }
};

// Get all deposit account interest options
export const getDepositAccountInterestOptions = async (req, res) => {
  try {
    const options = await DepositAccountInterestOption.find();
    res.status(200).json({ message: 'Deposit account interest options retrieved successfully', data: options });
  } catch (error) {
    console.error('Error fetching deposit account interest options:', error);
    res.status(500).json({ message: 'Error fetching deposit account interest options', error: error.message });
  }
};

// Other methods like get, update, delete can follow a similar pattern...
