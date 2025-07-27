// controllers/holidayController.js
import Holiday from '../models/Holiday.js';

/**
 * Create a new holiday
 */
export const createHoliday = async (req, res) => {
  try {
    const { date, description, recurring, country, createdBy } = req.body;

    const holiday = new Holiday({ date, description, recurring, country, createdBy });
    await holiday.save();

    res.status(201).json({ message: 'Holiday created successfully', holiday });
  } catch (error) {
    console.error('Error creating holiday:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get all holidays
 */
export const getAllHolidays = async (req, res) => {
  try {
    const holidays = await Holiday.find().sort({ date: 1 });
    res.status(200).json({ holidays });
  } catch (error) {
    console.error('Error fetching holidays:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get a single holiday by ID
 */
export const getHolidayById = async (req, res) => {
  try {
    const holiday = await Holiday.findById(req.params.id);
    if (!holiday) {
      return res.status(404).json({ error: 'Holiday not found' });
    }
    res.status(200).json(holiday);
  } catch (error) {
    console.error('Error getting holiday by ID:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update a holiday
 */
export const updateHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Holiday.findByIdAndUpdate(id, req.body, { new: true });

    if (!updated) {
      return res.status(404).json({ error: 'Holiday not found' });
    }

    res.status(200).json({ message: 'Holiday updated', holiday: updated });
  } catch (error) {
    console.error('Error updating holiday:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Delete a holiday
 */
export const deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Holiday.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Holiday not found' });
    }

    res.status(200).json({ message: 'Holiday deleted' });
  } catch (error) {
    console.error('Error deleting holiday:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Check if a given date is a holiday
 */
export const isDateHoliday = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'Date query parameter is required' });
    }

    const parsedDate = new Date(date);
    const isHoliday = await Holiday.isHoliday(parsedDate);

    res.status(200).json({ date: parsedDate, isHoliday });
  } catch (error) {
    console.error('Error checking if date is holiday:', error);
    res.status(500).json({ error: error.message });
  }
};
