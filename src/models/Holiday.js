// models/Holiday.js
import mongoose from 'mongoose';

const HolidaySchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true
  },
  description: {
    type: String,
    required: true
  },
  recurring: {
    type: Boolean,
    default: false
  },
  country: {
    type: String,
    required: true
  },
  createdBy: {
    type: String,
    ref: 'User',
    required: true
  }
}, { timestamps: true });


// ✅ Single static method to check if a given date is a holiday
HolidaySchema.statics.isHoliday = async function (date) {
  try {
    const inputDate = new Date(date);
    if (isNaN(inputDate)) return null;

    // Normalize to start & end of day
    const startOfDay = new Date(inputDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(inputDate.setHours(23, 59, 59, 999));

    // 1. Check for exact match
    const exact = await this.findOne({
      date: { $gte: startOfDay, $lte: endOfDay }
    });
    if (exact) return exact;

    // 2. Check recurring holidays (month/day match)
    const recurring = await this.find({ recurring: true });
    for (const holiday of recurring) {
      const hDate = new Date(holiday.date);
      if (
        hDate.getMonth() === startOfDay.getMonth() &&
        hDate.getDate() === startOfDay.getDate()
      ) {
        return holiday;
      }
    }

    return null;
  } catch (error) {
    console.error('Error checking holiday:', error);
    throw error;
  }
};

const Holiday = mongoose.model('Holiday', HolidaySchema);

export default Holiday;
