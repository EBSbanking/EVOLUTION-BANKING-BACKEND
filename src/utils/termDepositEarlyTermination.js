// utils/termDepositEarlyTermination.js

/**
 * Calculate early termination amounts for a term deposit
 * 
 * @param {Object} params - Calculation parameters
 * @param {number} params.principal - Original principal amount (e.g., 100,000,000)
 * @param {number} params.upfrontInterestAmount - Upfront interest paid (e.g., 20,000,000)
 * @param {number} params.whtRate - Withholding tax rate (e.g., 0.10 for 10%)
 * @param {number} params.whtAmount - WHT deducted from upfront interest (e.g., 2,000,000)
 * @param {number} params.termMonths - Original term in months (e.g., 12)
 * @param {number} params.monthsElapsed - Months elapsed before termination (e.g., 3)
 * @param {number} params.interestRate - Annual interest rate (e.g., 20 for 20%)
 * @param {string} params.startDate - Start date of the term deposit
 * @param {string} params.maturityDate - Original maturity date
 * @param {string} params.terminationDate - Date of early termination
 * @returns {Object} Calculation results
 */
export function calculateEarlyTermination(params) {
  const {
    principal,
    upfrontInterestAmount,
    whtRate = 0.10,
    whtAmount,
    termMonths,
    monthsElapsed,
    interestRate,
    startDate,
    maturityDate,
    terminationDate,
  } = params;

  // ============================================================
  // 1. CALCULATE ACTUAL DAYS
  // ============================================================
  
  const start = new Date(startDate);
  const maturity = new Date(maturityDate);
  const termination = new Date(terminationDate || new Date());
  
  // Total days in the term
  const totalDays = Math.ceil((maturity - start) / (1000 * 60 * 60 * 24));
  
  // Days elapsed
  const daysElapsed = Math.ceil((termination - start) / (1000 * 60 * 60 * 24));
  
  // Days remaining
  const daysRemaining = totalDays - daysElapsed;
  
  console.log(`📅 Days calculation:`, {
    startDate: start.toISOString().split('T')[0],
    maturityDate: maturity.toISOString().split('T')[0],
    terminationDate: termination.toISOString().split('T')[0],
    totalDays,
    daysElapsed,
    daysRemaining,
    monthsElapsed: monthsElapsed || daysElapsed / 30.44
  });

  // ============================================================
  // 2. CALCULATE AMORTIZED INTEREST
  // ============================================================
  
  // Total interest for the full term (using Actual/365 or Actual/Actual)
  const totalInterest = (principal * (interestRate / 100)) * (totalDays / 365);
  
  // Daily interest rate
  const dailyInterestRate = (interestRate / 100) / 365;
  
  // Interest earned per day
  const dailyInterestAmount = principal * dailyInterestRate;
  
  // Total interest earned up to termination date
  const interestEarned = dailyInterestAmount * daysElapsed;
  
  // Unearned interest (not yet amortized)
  const unearnedInterest = totalInterest - interestEarned;
  
  console.log(`💰 Interest calculation:`, {
    totalInterest,
    dailyInterestAmount,
    interestEarned,
    unearnedInterest,
    interestRate
  });

  // ============================================================
  // 3. CALCULATE UPFRONT INTEREST AND WHT
  // ============================================================
  
  // WHT amount (if not provided, calculate)
  const calculatedWhtAmount = whtAmount || (upfrontInterestAmount * whtRate);
  
  // Net upfront interest paid to customer
  const netUpfrontInterest = upfrontInterestAmount - calculatedWhtAmount;
  
  console.log(`💰 Upfront interest:`, {
    upfrontInterestAmount,
    whtRate,
    calculatedWhtAmount,
    netUpfrontInterest
  });

  // ============================================================
  // 4. DETERMINE REFUND / RECOVERY AMOUNTS
  // ============================================================
  
  // Option A: Customer stays for 3 months out of 12
  // - They should only keep the interest earned in those 3 months
  // - They must refund the unearned portion of the upfront interest
  
  // If upfront interest was paid in full:
  // - Total upfront paid: 20,000,000
  // - Interest earned in 3 months: (20,000,000 / 12) * 3 = 5,000,000
  // - Excess paid: 20,000,000 - 5,000,000 = 15,000,000 (to be recovered)
  
  // Interest earned per month (simple)
  const monthlyInterest = totalInterest / termMonths;
  
  // Interest earned in elapsed months
  const interestEarnedByMonth = monthlyInterest * monthsElapsed;
  
  // Excess upfront interest paid (to be recovered)
  const excessUpfrontInterest = upfrontInterestAmount - interestEarnedByMonth;
  
  console.log(`📊 Monthly breakdown:`, {
    monthlyInterest,
    interestEarnedByMonth,
    excessUpfrontInterest
  });

  // ============================================================
  // 5. CALCULATE FINAL PAYMENT
  // ============================================================
  
  // The customer should receive:
  // 1. Their principal back (100,000,000)
  // 2. The interest they earned (5,000,000)
  // 3. But we deduct the excess upfront interest they already received (15,000,000)
  // 4. We also account for WHT already deducted
  
  // Interest actually earned (should be kept by customer)
  const interestToKeep = interestEarnedByMonth;
  
  // Amount to deduct from principal (recovery of unearned upfront interest)
  const recoveryAmount = Math.max(0, excessUpfrontInterest);
  
  // WHT already paid on upfront interest (pro-rated for the period)
  const whtAlreadyPaid = calculatedWhtAmount;
  
  // WHT that should have been paid (only on the earned portion)
  const whtShouldBePaid = interestToKeep * whtRate;
  
  // WHT refund (excess WHT paid)
  const whtRefund = whtAlreadyPaid - whtShouldBePaid;
  
  // Net payment to customer
  // = Principal + Interest Earned - Recovery of Unearned Interest + WHT Refund
  const netPayment = principal + interestToKeep - recoveryAmount + whtRefund;
  
  console.log(`💰 Final calculation:`, {
    principal,
    interestToKeep,
    recoveryAmount,
    whtAlreadyPaid,
    whtShouldBePaid,
    whtRefund,
    netPayment
  });

  // ============================================================
  // 6. DETAILED BREAKDOWN
  // ============================================================
  
  return {
    success: true,
    summary: {
      principal,
      totalInterest,
      upfrontInterestAmount,
      whtAmount: calculatedWhtAmount,
      netUpfrontInterest,
      termMonths,
      monthsElapsed,
      daysElapsed,
      daysRemaining,
      interestRate,
    },
    interestBreakdown: {
      totalInterest,
      interestEarned,
      unearnedInterest,
      monthlyInterest,
      interestEarnedByMonth,
      dailyInterestAmount,
      interestToKeep,
      excessUpfrontInterest: recoveryAmount,
    },
    whtBreakdown: {
      whtRate,
      whtAlreadyPaid,
      whtShouldBePaid,
      whtRefund,
    },
    paymentBreakdown: {
      principalReturn: principal,
      interestRetained: interestToKeep,
      recoveryAmount: -recoveryAmount,
      whtRefund: whtRefund,
      netPayment,
      netPaymentFormatted: `₦${netPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
    // Simple formulas for explanation
    formulas: {
      totalInterestFormula: `(${principal} × ${interestRate}% × ${totalDays}/365) = ₦${totalInterest.toFixed(2)}`,
      dailyInterestFormula: `(${principal} × ${interestRate}% / 365) = ₦${dailyInterestAmount.toFixed(4)}/day`,
      interestEarnedFormula: `₦${dailyInterestAmount.toFixed(4)} × ${daysElapsed} days = ₦${interestEarned.toFixed(2)}`,
      recoveryFormula: `Upfront (${upfrontInterestAmount}) - Earned (${interestEarnedByMonth.toFixed(2)}) = ₦${recoveryAmount.toFixed(2)}`,
      netPaymentFormula: `${principal} + ${interestToKeep.toFixed(2)} - ${recoveryAmount.toFixed(2)} + ${whtRefund.toFixed(2)} = ₦${netPayment.toFixed(2)}`,
    },
    // Human-readable explanation
    explanation: `Customer deposited ₦${principal.toLocaleString()} for ${termMonths} months at ${interestRate}%. 
They received ₦${upfrontInterestAmount.toLocaleString()} upfront interest (₦${calculatedWhtAmount.toLocaleString()} WHT deducted, net ₦${netUpfrontInterest.toLocaleString()}).
After ${monthsElapsed} months (${daysElapsed} days), they have earned ₦${interestToKeep.toLocaleString()} in interest.
The unearned portion of ₦${recoveryAmount.toLocaleString()} will be recovered from the principal.
With WHT refund of ₦${whtRefund.toLocaleString()}, the customer will receive ₦${netPayment.toLocaleString()}.`,
    refundCalculation: {
      principalRefund: principal,
      interestEarned: interestToKeep,
      recoveryDeduction: recoveryAmount,
      whtRefund: whtRefund,
      totalPayout: netPayment,
    }
  };
}

/**
 * Example usage with your specific numbers:
 * 
 * Principal: 100,000,000
 * Upfront Interest: 20,000,000 (20% of principal)
 * WHT: 2,000,000 (10% of upfront interest)
 * Term: 12 months
 * Months Elapsed: 3 months
 * Interest Rate: 20% (annual)
 */
export function calculateExample() {
  const result = calculateEarlyTermination({
    principal: 100000000,
    upfrontInterestAmount: 20000000,
    whtRate: 0.10,
    whtAmount: 2000000,
    termMonths: 12,
    monthsElapsed: 3,
    interestRate: 20,
    startDate: '2024-01-01',
    maturityDate: '2025-01-01',
    terminationDate: '2024-04-01',
  });
  
  console.log('========================================');
  console.log('📊 EARLY TERMINATION CALCULATION');
  console.log('========================================');
  console.log('📋 Summary:', result.summary);
  console.log('💰 Payment Breakdown:', result.paymentBreakdown);
  console.log('📝 Explanation:', result.explanation);
  console.log('🧮 Formulas:');
  Object.entries(result.formulas).forEach(([key, formula]) => {
    console.log(`   ${key}: ${formula}`);
  });
  console.log('========================================');
  
  return result;
}

// Run the example
// calculateExample();