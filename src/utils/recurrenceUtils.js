// utils/recurrenceUtils.js
import { addDays, addWeeks, addMonths, addYears, setDate, setDay, getDate, getDay, getISODay, startOfMonth, endOfMonth, isValid } from 'date-fns';

/**
 * Calculates the next execution date for a standing order based on recurrence rules.
 * @param {Object} params - Recurrence parameters
 * @param {string} params.frequency - 'daily', 'weekly', 'monthly', 'yearly'
 * @param {number} params.interval - Multiplier (default 1)
 * @param {number} [params.dayOfWeek] - 1=Monday to 7=Sunday (for weekly/monthly week-based)
 * @param {number} [params.dayOfMonth] - 1-31 (for monthly/yearly fixed day)
 * @param {number} [params.weekOfMonth] - 1-5 (for monthly week-based, 5=last)
 * @param {Date} params.startDate - Original start date (used for alignment if needed)
 * @param {Date} [params.currentDate] - Date from which to calculate next (default: now)
 * @returns {Date} Next execution date
 */
export const calculateNextExecutionDate = ({
  frequency,
  interval = 1,
  dayOfWeek,  // 1=Mon to 7=Sun (ISO: getISODay)
  dayOfMonth,
  weekOfMonth,
  startDate,
  currentDate = new Date()
}) => {
  let nextDate = new Date(currentDate);

  // Ensure we start after currentDate
  nextDate = new Date(Math.max(nextDate, startDate));

  switch (frequency.toLowerCase()) {
    case 'daily':
      nextDate = addDays(nextDate, interval);
      break;

    case 'weekly':
      if (dayOfWeek) {
        // Align to the specified day of week in the next interval
        const daysUntil = (dayOfWeek - getISODay(nextDate) + 7) % 7;
        nextDate = addDays(nextDate, daysUntil || 7);  // At least 1 week if already on day
        nextDate = addWeeks(nextDate, interval - 1);
      } else {
        nextDate = addWeeks(nextDate, interval);
      }
      break;

    case 'monthly':
      if (dayOfMonth) {
        // Fixed day of month
        nextDate = addMonths(nextDate, interval);
        nextDate = setDate(nextDate, dayOfMonth);
        // Handle overflow (e.g., 31st in Feb -> last day of month)
        if (!isValid(nextDate)) {
          nextDate = endOfMonth(nextDate);
        } else if (getDate(nextDate) !== dayOfMonth) {
          nextDate = endOfMonth(nextDate);
        }
      } else if (weekOfMonth && dayOfWeek) {
        // Week-based: e.g., 2nd Monday of the month
        nextDate = addMonths(nextDate, interval);
        const monthStart = startOfMonth(nextDate);

        // Find first occurrence of dayOfWeek in the month
        let firstOccurrence = setDay(monthStart, dayOfWeek);
        if (getISODay(firstOccurrence) !== dayOfWeek) {
          firstOccurrence = addWeeks(firstOccurrence, 1);
        }

        // Add (weekOfMonth - 1) weeks
        nextDate = addWeeks(firstOccurrence, weekOfMonth - 1);

        // If weekOfMonth=5 and it overflows to next month, use last occurrence
        if (weekOfMonth === 5 && nextDate.getMonth() !== monthStart.getMonth()) {
          // Find last dayOfWeek in the month
          const monthEnd = endOfMonth(monthStart);
          const daysFromEnd = (getISODay(monthEnd) - dayOfWeek + 7) % 7;
          nextDate = addDays(monthEnd, -daysFromEnd);
        }
      } else {
        // Fallback: just add months
        nextDate = addMonths(nextDate, interval);
      }
      break;

    case 'yearly':
      if (dayOfMonth) {
        nextDate = addYears(nextDate, interval);
        nextDate = setDate(nextDate, dayOfMonth);
        // Handle Feb 29 in non-leap years -> Feb 28
        if (!isValid(nextDate)) {
          nextDate = setDate(nextDate, getDate(endOfMonth(nextDate)));
        }
      } else {
        nextDate = addYears(nextDate, interval);
      }
      break;

    default:
      throw new Error(`Unsupported frequency: ${frequency}`);
  }

  // Ensure it's after currentDate
  if (nextDate <= currentDate) {
    // Recursive call if still not future (edge case)
    return calculateNextExecutionDate({
      frequency, interval, dayOfWeek, dayOfMonth, weekOfMonth, startDate, currentDate: nextDate
    });
  }

  return nextDate;
};

// Example usage (for testing)
// console.log(calculateNextExecutionDate({
//   frequency: 'monthly',
//   dayOfMonth: 25,
//   startDate: new Date('2025-01-01'),
//   currentDate: new Date('2025-10-26')  // Should return 2025-11-25
// }));

export default calculateNextExecutionDate;