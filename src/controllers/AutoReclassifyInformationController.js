import AutoReclassifyInformation from '../models/AutoReclassifyInformation.js';
import mongoose from 'mongoose';

// Create a new entry
export const createReclassification = async (req, res) => {
  try {
    const newEntry = await AutoReclassifyInformation.create(req.body);
    res.status(201).json({ message: 'Reclassification created successfully', data: newEntry });
  } catch (error) {
    res.status(500).json({ message: 'Error creating reclassification', error: error.message });
  }
};

// Get all entries
export const getAllReclassifications = async (req, res) => {
  try {
    const entries = await AutoReclassifyInformation.find({});
    res.status(200).json(entries);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching data', error: error.message });
  }
};

// Get entry by ID
export const getReclassificationById = async (req, res) => {
  try {
    const entry = await AutoReclassifyInformation.findById(req.params.id);
    if (!entry) {
      return res.status(404).json({ message: 'Reclassification not found' });
    }
    res.status(200).json(entry);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching data', error: error.message });
  }
};

// Update an entry
export const updateReclassification = async (req, res) => {
  try {
    const entry = await AutoReclassifyInformation.findById(req.params.id);
    if (!entry) {
      return res.status(404).json({ message: 'Reclassification not found' });
    }

    Object.assign(entry, req.body); // Dynamically update all fields from request body
    await entry.save();

    res.status(200).json({ message: 'Reclassification updated successfully', data: entry });
  } catch (error) {
    res.status(500).json({ message: 'Error updating reclassification', error: error.message });
  }
};

// Delete an entry
export const deleteReclassification = async (req, res) => {
  try {
    const entry = await AutoReclassifyInformation.findById(req.params.id);
    if (!entry) {
      return res.status(404).json({ message: 'Reclassification not found' });
    }

    await entry.deleteOne();
    res.status(200).json({ message: 'Reclassification deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting reclassification', error: error.message });
  }
};

export default {
  createReclassification,
  getAllReclassifications,
  getReclassificationById,
  updateReclassification,
  deleteReclassification
};
