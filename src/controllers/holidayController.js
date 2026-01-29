import Holiday from '../models/Holiday.js';


// Check if a date is a holiday
export const isDateHoliday = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'Date query parameter is required' });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // ✅ Use the updated static method
    const holiday = await Holiday.isHoliday(parsedDate);

    res.status(200).json({
      date: parsedDate,
      isHoliday: !!holiday,
      holiday
    });
  } catch (error) {
    console.error('Error checking if date is holiday:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get all holidays
export const getAllHolidays = async (req, res) => {
  try {
    const holidays = await Holiday.find().sort({ date: 1 });
    res.status(200).json(holidays); // Return array directly for frontend
  } catch (error) {
    console.error('Error fetching holidays:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get a single holiday by ID
export const getHolidayById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid holiday ID' });
    }
    const holiday = await Holiday.findById(id);
    if (!holiday) {
      return res.status(404).json({ error: 'Holiday not found' });
    }
    res.status(200).json(holiday);
  } catch (error) {
    console.error('Error getting holiday by ID:', error);
    res.status(500).json({ error: error.message });
  }
};

// Create a new holiday
export const createHoliday = async (req, res) => {
  try {
    const { date, description, recurring, country, createdBy } = req.body;
    if (!date || !description || !country || !createdBy) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const parsedDate = new Date(date);
    if (isNaN(parsedDate)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    const existingHoliday = await Holiday.findOne({ date: parsedDate });
    if (existingHoliday) {
      return res.status(400).json({ error: 'A holiday already exists for this date' });
    }
    const holiday = new Holiday({
      date: parsedDate,
      description,
      recurring: recurring || false,
      country,
      createdBy,
    });
    await holiday.save();
    res.status(201).json(holiday);
  } catch (error) {
    console.error('Error creating holiday:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update a holiday by _id
export const updateHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, description, recurring, country, createdBy } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid holiday ID' });
    }
    if (!date || !description || !country || !createdBy) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const parsedDate = new Date(date);
    if (isNaN(parsedDate)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    // Check for date uniqueness (excluding the current holiday)
    const existingHoliday = await Holiday.findOne({ date: parsedDate, _id: { $ne: id } });
    if (existingHoliday) {
      return res.status(400).json({ error: 'A holiday already exists for this date' });
    }
    const holiday = await Holiday.findByIdAndUpdate(
      id,
      { date: parsedDate, description, recurring, country, createdBy },
      { new: true, runValidators: true }
    );
    if (!holiday) {
      return res.status(404).json({ error: 'Holiday not found' });
    }
    res.status(200).json(holiday);
  } catch (error) {
    console.error('Error updating holiday:', error);
    res.status(500).json({ error: error.message });
  }
};

// Delete a holiday by _id
export const deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid holiday ID' });
    }
    const holiday = await Holiday.findByIdAndDelete(id);
    if (!holiday) {
      return res.status(404).json({ error: 'Holiday not found' });
    }
    res.status(200).json({ message: 'Holiday deleted successfully' });
  } catch (error) {
    console.error('Error deleting holiday:', error);
    res.status(500).json({ error: error.message });
  }
};
export const updateHolidayByDate = async (req, res) => {
  try {
    const { date } = req.params; // e.g., /holiday/2025-12-25
    const { description, recurring, country, createdBy } = req.body;
    if (!date) {
      return res.status(400).json({ error: 'Date parameter is required' });
    }
    if (!description || !country || !createdBy) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const parsedDate = new Date(date);
    if (isNaN(parsedDate)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    const holiday = await Holiday.findOneAndUpdate(
      { date: parsedDate },
      { description, recurring, country, createdBy },
      { new: true, runValidators: true }
    );
    if (!holiday) {
      return res.status(404).json({ error: 'Holiday not found for given date' });
    }
    res.status(200).json(holiday);
  } catch (error) {
    console.error('Error updating holiday by date:', error);
    res.status(500).json({ error: error.message });
  }
};

