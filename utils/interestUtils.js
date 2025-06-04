export function calculateAccruedInterest(balance, lastDebitDate = null) {
    const interestRate = 0.05; // Example: 5% annual interest
    const dailyInterestRate = interestRate / 365;
  
    if (lastDebitDate) {
      const currentDate = new Date();
      const daysOutstanding = Math.ceil((currentDate - new Date(lastDebitDate)) / (1000 * 3600 * 24)); // Calculate days outstanding
      return balance * dailyInterestRate * daysOutstanding;
    }
  
    return balance * dailyInterestRate; // If no last debit date, calculate interest daily
  }
  