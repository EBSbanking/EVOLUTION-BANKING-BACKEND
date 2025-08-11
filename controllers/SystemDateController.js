// controllers/SystemDateController.js
import SystemDate from '../models/SystemDate.js';
import Holiday from '../models/Holiday.js';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';


export const SystemDateController = {
  /**
   * Get current business date
   */
  async getCurrentBusinessDate(req, res) {
    try {
      const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
      if (!systemDate) {
        return res.status(404).json({ message: 'System date not found' });
      }

      return res.status(200).json({ currentBusinessDate: systemDate.currentBusinessDate });
    } catch (error) {
      logger.error('Failed to get current business date', { error: error.message });
      return res.status(500).json({ error: error.message });
    }
  },

  /**
   * Check if the current date is a holiday
   */
  async isHoliday(req, res) {
    try {
      const today = new Date();
      const isHoliday = await Holiday.isHoliday(today);
      return res.status(200).json({ date: today, isHoliday });
    } catch (error) {
      logger.error('Failed to check holiday status', { error: error.message });
      return res.status(500).json({ error: error.message });
    }
  },

  /**
   * Force initialize system date (e.g. admin trigger)
   */
  async initializeSystemDate(req, res) {
    try {
      const count = await SystemDate.countDocuments();
      if (count > 0) {
        return res.status(400).json({ message: 'System date already initialized' });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let nextBusinessDate = new Date(today);
      let isHoliday = true;
      let attempts = 0;

      while (isHoliday && attempts < 30) {
        nextBusinessDate.setDate(nextBusinessDate.getDate() + 1);
        isHoliday =
          (await Holiday.isHoliday(nextBusinessDate)) ||
          nextBusinessDate.getDay() === 0 || nextBusinessDate.getDay() === 6;
        attempts++;
      }

      const newSystemDate = await SystemDate.create({
        currentBusinessDate: today,
        nextBusinessDate,
        isEODProcessing: false,
        eodStatus: 'IDLE',
        eodHistory: []
      });

      logger.info('System date initialized manually', {
        currentBusinessDate: today,
        nextBusinessDate
      });

      return res.status(201).json({ message: 'System date initialized', systemDate: newSystemDate });
    } catch (error) {
      logger.error('System date initialization failed', { error: error.message });
      return res.status(500).json({ error: error.message });
    }
  },

  /**
   * Update EOD status (manual override or correction)
   */
  async updateEODStatus(req, res) {
    const { status } = req.body;
    const validStatuses = ['IDLE', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid EOD status' });
    }

    try {
      const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
      if (!systemDate) {
        return res.status(404).json({ message: 'System date not found' });
      }

      systemDate.eodStatus = status;
      await systemDate.save();

      return res.status(200).json({ message: 'EOD status updated', eodStatus: status });
    } catch (error) {
      logger.error('Failed to update EOD status', { error: error.message });
      return res.status(500).json({ error: error.message });
    }
  },

  /**
   * Get EOD history
   */
  async getEODHistory(req, res) {
    try {
      const systemDate = await SystemDate.findOne().sort({ createdAt: -1 }).populate('eodHistory.processedBy', 'name email');
      if (!systemDate) {
        return res.status(404).json({ message: 'System date not found' });
      }

      return res.status(200).json({ history: systemDate.eodHistory });
    } catch (error) {
      logger.error('Failed to fetch EOD history', { error: error.message });
      return res.status(500).json({ error: error.message });
    }
  }
};
