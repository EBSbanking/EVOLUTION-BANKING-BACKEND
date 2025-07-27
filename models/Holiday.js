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

// Indexes
HolidaySchema.index({ date: 1 });
HolidaySchema.index({ country: 1 });
HolidaySchema.index({ recurring: 1 });

// Static method to check if a given date is a holiday
HolidaySchema.statics.isHoliday = async function (date) {
  try {
    // Normalize input date to midnight
    const inputDate = new Date(date);
    inputDate.setHours(0, 0, 0, 0);

    // 1. Check for exact date match (non-recurring or exact recurring date)
    const exact = await this.findOne({ date: inputDate });
    if (exact) return true;

    // 2. Check for recurring holidays (ignores year, matches only month & day)
    const recurring = await this.find({ recurring: true });
    for (const holiday of recurring) {
      const hDate = new Date(holiday.date);
      if (
        hDate.getMonth() === inputDate.getMonth() &&
        hDate.getDate() === inputDate.getDate()
      ) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking holiday:', error);
    throw error;
  }
};

const Holiday = mongoose.model('Holiday', HolidaySchema);

export default Holiday;
