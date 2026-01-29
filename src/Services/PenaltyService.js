// services/PenaltyService.js
import Penalty from '../models/LoanPenalty.js';
import PenaltyRule from '../models/PenaltyRule.js';

class PenaltyService {
  static async applyLatePaymentPenalty(loanId, overdueDays, principalAmount) {
    // Get applicable penalty rule
    const penaltyAmount = await PenaltyRule.calculatePenalty(
      'LATE_PAYMENT',
      principalAmount,
      overdueDays
    );
    
    if (penaltyAmount <= 0) {
      return null; // No penalty to apply
    }
    
    // Create penalty record
    const penalty = await Penalty.create({
      loan_id: loanId,
      penalty_type: 'LATE_PAYMENT',
      amount: penaltyAmount,
      calculation_basis: 'OUTSTANDING',
      period_start: new Date(),
      days_count: overdueDays,
      description: `Late payment penalty: ${overdueDays} days overdue`
    });
    
    return penalty;
  }

  static async applyBatchPenalties(overdueLoans) {
    const results = {
      applied: 0,
      failed: 0,
      details: []
    };
    
    for (const loan of overdueLoans) {
      try {
        if (loan.days_overdue > 0) {
          const penalty = await this.applyLatePaymentPenalty(
            loan.loan_id,
            loan.days_overdue,
            loan.amount_due
          );
          
          if (penalty) {
            results.applied++;
            results.details.push({
              loan_id: loan.loan_id,
              penalty_id: penalty.id,
              amount: penalty.amount
            });
          }
        }
      } catch (error) {
        results.failed++;
        console.error(`Failed to apply penalty for loan ${loan.loan_id}:`, error);
      }
    }
    
    return results;
  }

  static async getLoanPenalties(loanId) {
    const penalties = await Penalty.findByLoanId(loanId);
    const totalActive = await Penalty.getTotalActiveByLoan(loanId);
    
    return {
      penalties,
      summary: {
        total: penalties.length,
        active: penalties.filter(p => p.status === 'ACTIVE').length,
        total_amount: totalActive
      }
    };
  }

  static async waivePenalty(penaltyId, userId, reason = null) {
    const penalty = await Penalty.findByPk(penaltyId);
    
    if (!penalty) {
      throw new Error('Penalty not found');
    }
    
    if (penalty.status !== 'ACTIVE') {
      throw new Error('Only active penalties can be waived');
    }
    
    return await penalty.waive(userId, reason);
  }

  static async settlePenalty(penaltyId, referenceNumber = null) {
    const penalty = await Penalty.findByPk(penaltyId);
    
    if (!penalty) {
      throw new Error('Penalty not found');
    }
    
    if (penalty.status !== 'ACTIVE') {
      throw new Error('Only active penalties can be settled');
    }
    
    return await penalty.markAsPaid(referenceNumber);
  }

  static async recalculatePenalties(loanId) {
    const OverdueLoan = sequelize.models.OverdueLoan;
    const overdueLoan = await OverdueLoan.findByLoanId(loanId);
    
    if (!overdueLoan) {
      throw new Error('Overdue loan not found');
    }
    
    // Get active late payment penalties
    const activePenalties = await Penalty.findAll({
      where: {
        loan_id: loanId,
        penalty_type: 'LATE_PAYMENT',
        status: 'ACTIVE'
      }
    });
    
    // Recalculate based on current overdue days
    let totalRecalculated = 0;
    
    for (const penalty of activePenalties) {
      if (penalty.calculation_basis === 'DAILY_RATE') {
        const newAmount = await PenaltyRule.calculatePenalty(
          'LATE_PAYMENT',
          overdueLoan.amount_due,
          overdueLoan.days_overdue
        );
        
        if (newAmount !== penalty.amount) {
          penalty.amount = newAmount;
          await penalty.save();
          totalRecalculated++;
        }
      }
    }
    
    return {
      recalculated: totalRecalculated,
      total: activePenalties.length
    };
  }
}

export default PenaltyService;