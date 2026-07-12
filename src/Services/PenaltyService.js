// src/services/PenaltyAccrualService.js
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import LoanAccount from '../models/LoanAccount.js';
import LoanPenalty from '../models/LoanPenalty.js';
import PenaltyRule from '../models/PenaltyRule.js';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import LoanRepayment from '../models/LoanRepayment.js';
import logger from '../utils/logger.js';
import moment from 'moment';

class PenaltyAccrualService {
  /**
   * Calculate daily penalty for a single loan
   */
  static calculateDailyPenalty(loan, penaltyRule) {
    const outstandingPrincipal = parseFloat(loan.outstanding_principal || 0);
    const overdueDays = this.calculateOverdueDays(loan);
    
    if (outstandingPrincipal <= 0 || overdueDays <= 0) {
      return 0;
    }

    let dailyPenalty = 0;

    // Handle both simple and complex PenaltyRule models
    const isSimpleModel = penaltyRule.calculation_method && 
      ['PERCENTAGE_OF_PRINCIPAL', 'FLAT_RATE', 'PERCENTAGE_OF_AMOUNT_DUE', 'SLIDING_SCALE']
      .includes(penaltyRule.calculation_method);

    if (isSimpleModel) {
      // SIMPLE MODEL LOGIC
      switch (penaltyRule.calculation_method) {
        case 'PERCENTAGE_OF_PRINCIPAL':
          const dailyRate = (penaltyRule.rate || 1) / 100;
          dailyPenalty = outstandingPrincipal * (dailyRate / 365);
          break;
        
        case 'FLAT_RATE':
          dailyPenalty = parseFloat(penaltyRule.flat_amount || 0);
          break;
        
        case 'PERCENTAGE_OF_AMOUNT_DUE':
          const amountDue = this.calculateAmountDue(loan);
          dailyPenalty = amountDue * ((penaltyRule.rate || 1) / 100);
          break;
        
        case 'SLIDING_SCALE':
          // Get sliding rates from the database
          const rates = penaltyRule.sliding_rates;
          
          if (!rates || !Array.isArray(rates) || rates.length === 0) {
            logger.warn(`No sliding rates configured for penalty rule ${penaltyRule.id}, using default`);
            const defaultRates = [
              { days: 30, rate: 0.5 },
              { days: 60, rate: 1.0 },
              { days: 90, rate: 1.5 }
            ];
            
            let applicableRate = 1;
            for (const tier of defaultRates) {
              if (overdueDays >= tier.days) {
                applicableRate = tier.rate;
              }
            }
            dailyPenalty = outstandingPrincipal * (applicableRate / 100 / 365);
          } else {
            let applicableRate = 1;
            const sortedRates = [...rates].sort((a, b) => a.days - b.days);
            
            for (const tier of sortedRates) {
              if (overdueDays >= tier.days) {
                applicableRate = tier.rate;
              }
            }
            dailyPenalty = outstandingPrincipal * (applicableRate / 100 / 365);
          }
          break;
        
        default:
          dailyPenalty = 0;
      }

      // Apply min/max caps
      if (penaltyRule.max_amount && dailyPenalty > parseFloat(penaltyRule.max_amount)) {
        dailyPenalty = parseFloat(penaltyRule.max_amount);
      }
      if (penaltyRule.min_amount && dailyPenalty < parseFloat(penaltyRule.min_amount)) {
        dailyPenalty = parseFloat(penaltyRule.min_amount);
      }
    } else {
      // COMPLEX MODEL LOGIC
      if (penaltyRule.calculation_method === 'TIERED' && penaltyRule.tier_config) {
        const tiers = penaltyRule.tier_config;
        if (Array.isArray(tiers) && tiers.length > 0) {
          let applicableTier = null;
          for (const tier of tiers) {
            const minDays = tier.min_days || 0;
            const maxDays = tier.max_days || Infinity;
            if (overdueDays >= minDays && overdueDays <= maxDays) {
              applicableTier = tier;
              break;
            }
          }
          
          if (applicableTier) {
            if (applicableTier.calculation === 'PERCENTAGE') {
              dailyPenalty = outstandingPrincipal * ((applicableTier.rate || 0) / 100 / 365);
            } else if (applicableTier.calculation === 'FIXED') {
              dailyPenalty = parseFloat(applicableTier.amount || 0);
            }
          }
        }
      } else if (penaltyRule.rate_value) {
        const dailyRate = parseFloat(penaltyRule.rate_value) / 100;
        dailyPenalty = outstandingPrincipal * (dailyRate / 365);
      } else if (penaltyRule.fixed_amount) {
        dailyPenalty = parseFloat(penaltyRule.fixed_amount);
      } else {
        dailyPenalty = 0;
      }
    }

    return parseFloat(dailyPenalty.toFixed(2));
  }

  /**
   * Calculate overdue days for a loan
   */
  static calculateOverdueDays(loan) {
    const today = moment();
    let dueDate = null;

    if (loan.next_payment_date) {
      dueDate = moment(loan.next_payment_date);
    } else if (loan.maturity_dt) {
      dueDate = moment(loan.maturity_dt);
    } else {
      const schedule = loan.repayment_schedules || [];
      const nextPayment = schedule.find(s => s.status === 'PENDING');
      if (nextPayment) {
        dueDate = moment(nextPayment.due_date);
      }
    }

    if (!dueDate) {
      return 0;
    }

    if (dueDate.isAfter(today)) {
      return 0;
    }

    return today.diff(dueDate, 'days');
  }

  /**
   * Calculate the amount due for a loan
   */
  static calculateAmountDue(loan) {
    const nextPayment = loan.repayment_schedules?.find(s => s.status === 'PENDING');
    if (nextPayment) {
      return parseFloat(nextPayment.total_payment || 0);
    }
    return parseFloat(loan.outstanding_principal || 0);
  }

  /**
   * Get penalty rule for a loan
   */
  static async getPenaltyRule(loan) {
    try {
      const now = new Date();
      
      // Try to get global/default rule
      let rule = await PenaltyRule.findOne({
        where: {
          [Op.or]: [
            { is_global: true, is_active: true },
            { is_default: true, is_active: true }
          ]
        }
      });

      if (rule) {
        return rule;
      }

      // Try to get any active rule (simple model)
      rule = await PenaltyRule.findOne({
        where: {
          is_active: true
        }
      });

      if (rule) {
        return rule;
      }

      // Try to get any active rule (complex model)
      rule = await PenaltyRule.findOne({
        where: {
          status: 'ACTIVE',
          effective_from: { [Op.lte]: now },
          [Op.or]: [
            { effective_to: null },
            { effective_to: { [Op.gte]: now } }
          ]
        }
      });

      if (rule) {
        return rule;
      }

      // Fallback: get any rule
      rule = await PenaltyRule.findOne();

      if (rule) {
        logger.warn('Using fallback penalty rule (may not be active)');
        return rule;
      }

      logger.warn('No penalty rule found in database');
      return null;

    } catch (error) {
      logger.error('Error getting penalty rule:', error.message);
      return null;
    }
  }

  /**
   * Accrue penalties for a single loan
   */
  static async accruePenaltyForLoan(loan, penaltyRule, accrualDate, transaction = null) {
    try {
      const overdueDays = this.calculateOverdueDays(loan);
      
      if (overdueDays <= 0) {
        return { accrued: false, reason: 'Not overdue' };
      }

      // Check if penalty already accrued for today
      const existingPenalty = await LoanPenalty.findOne({
        where: {
          loan_id: loan.id,
          accrual_date: {
            [Op.gte]: moment(accrualDate).startOf('day').toDate(),
            [Op.lte]: moment(accrualDate).endOf('day').toDate()
          },
          status: 'PENDING'
        },
        transaction
      });

      if (existingPenalty) {
        const dailyAmount = this.calculateDailyPenalty(loan, penaltyRule);
        if (Math.abs(parseFloat(existingPenalty.amount) - dailyAmount) > 0.01) {
          await existingPenalty.update({
            amount: dailyAmount,
            days_overdue: overdueDays,
            updated_at: new Date()
          }, { transaction });
          return { 
            accrued: true, 
            penalty: existingPenalty, 
            amount: dailyAmount,
            action: 'UPDATED'
          };
        }
        return { accrued: false, reason: 'Already accrued today' };
      }

      const dailyAmount = this.calculateDailyPenalty(loan, penaltyRule);
      
      if (dailyAmount <= 0) {
        return { accrued: false, reason: 'Penalty amount is zero' };
      }

      // Create new penalty record - include penalty_rule_id since it exists in loan_penalties
      const penalty = await LoanPenalty.create({
        loan_id: loan.id,
        loan_account_no: loan.acct_no,
        customer_id: loan.cust_id,
        penalty_type: 'LATE_PAYMENT',
        amount: dailyAmount,
        days_overdue: overdueDays,
        calculation_basis: penaltyRule?.calculation_method || penaltyRule?.rule_type || 'DAILY_RATE',
        accrual_date: accrualDate,
        due_date: moment(accrualDate).add(7, 'days').toDate(),
        status: 'PENDING',
        description: `Daily late payment penalty - Day ${overdueDays} of overdue (Rule: ${penaltyRule?.rule_name || penaltyRule?.name || penaltyRule?.id})`,
        penalty_rule_id: penaltyRule?.id || null, // This column EXISTS in loan_penalties
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction });

      // Update loan's total penalty amount
      await this.updateLoanTotalPenalty(loan.id, transaction);

      return {
        accrued: true,
        penalty: penalty,
        amount: dailyAmount,
        action: 'CREATED'
      };

    } catch (error) {
      logger.error(`Error accruing penalty for loan ${loan.acct_no}:`, error.message);
      throw error;
    }
  }

  /**
   * Update loan's total penalty amount
   */
  static async updateLoanTotalPenalty(loanId, transaction = null) {
    try {
      const totalPenalty = await LoanPenalty.sum('amount', {
        where: {
          loan_id: loanId,
          status: 'PENDING'
        },
        transaction
      });

      await LoanAccount.update(
        {
          penalty_amount: totalPenalty || 0,
          updated_at: new Date()
        },
        {
          where: { id: loanId },
          transaction
        }
      );

      return totalPenalty || 0;
    } catch (error) {
      logger.error('Error updating loan total penalty:', error.message);
      throw error;
    }
  }

  /**
   * Run daily penalty accrual for all overdue loans
   */
  static async runDailyPenaltyAccrual(accrualDate = new Date()) {
    const transaction = await sequelize.transaction();
    const results = {
      totalLoansProcessed: 0,
      penaltiesApplied: 0,
      totalPenaltyAmount: 0,
      failedLoans: [],
      details: [],
      loansWithNoPenaltyRule: []
    };

    try {
      logger.info(`🔄 Starting daily penalty accrual for ${moment(accrualDate).format('YYYY-MM-DD')}`);

      // Find all overdue loans - SPECIFY ONLY COLUMNS THAT EXIST IN loan_accounts
      const overdueLoans = await LoanAccount.findAll({
        attributes: [
          'id', 
          'acct_no', 
          'acct_nm', 
          'cust_id', 
          'outstanding_principal', 
          'loan_status',
          'next_payment_date',
          'maturity_dt',
          'penalty_amount'
          // IMPORTANT: Do NOT include penalty_rule_id - it doesn't exist in loan_accounts
        ],
        where: {
          loan_status: ['OVERDUE', 'DELINQUENT', 'ACTIVE'],
          outstanding_principal: { [Op.gt]: 0 }
        },
        transaction
      });

      if (overdueLoans.length === 0) {
        logger.info('No overdue loans found for penalty accrual');
        await transaction.commit();
        return {
          ...results,
          message: 'No overdue loans found'
        };
      }

      logger.info(`Found ${overdueLoans.length} overdue loans`);

      for (const loan of overdueLoans) {
        results.totalLoansProcessed++;
        
        try {
          // Get penalty rule
          const penaltyRule = await this.getPenaltyRule(loan);
          
          if (!penaltyRule) {
            results.loansWithNoPenaltyRule.push(loan.acct_no);
            continue;
          }

          // Accrue penalty
          const accrualResult = await this.accruePenaltyForLoan(
            loan,
            penaltyRule,
            accrualDate,
            transaction
          );

          if (accrualResult.accrued) {
            results.penaltiesApplied++;
            results.totalPenaltyAmount += accrualResult.amount;
            results.details.push({
              loanId: loan.id,
              accountNo: loan.acct_no,
              amount: accrualResult.amount,
              action: accrualResult.action,
              daysOverdue: accrualResult.penalty?.days_overdue || 0
            });
          }

        } catch (loanError) {
          logger.error(`Failed to process loan ${loan.acct_no}:`, loanError.message);
          results.failedLoans.push({
            loanId: loan.id,
            accountNo: loan.acct_no,
            error: loanError.message
          });
        }
      }

      // Mark loans as DELINQUENT if they have significant penalties
      try {
        const highPenaltyLoans = await LoanPenalty.findAll({
          where: {
            status: 'PENDING',
            amount: { [Op.gte]: 1000 }
          },
          attributes: ['loan_id'],
          group: ['loan_id'],
          having: sequelize.literal('SUM(amount) >= 1000'),
          transaction
        });

        for (const penalty of highPenaltyLoans) {
          await LoanAccount.update(
            { loan_status: 'DELINQUENT' },
            {
              where: { id: penalty.loan_id },
              transaction
            }
          );
        }
      } catch (updateError) {
        logger.warn('Failed to update loan statuses:', updateError.message);
      }

      await transaction.commit();

      logger.info(`✅ Penalty accrual completed: ${results.penaltiesApplied} penalties applied, total: ₦${results.totalPenaltyAmount.toFixed(2)}`);

      return results;

    } catch (error) {
      await transaction.rollback();
      logger.error('Error running daily penalty accrual:', {
        error: error.message,
        stack: error.stack,
        results: results
      });
      throw error;
    }
  }

  /**
   * Process penalty payment
   */
  static async processPenaltyPayment(loanId, paymentAmount, paymentMethod = 'CASH', transaction = null) {
    const result = {
      totalPayment: paymentAmount,
      penaltiesPaid: 0,
      principalPaid: 0,
      interestPaid: 0,
      remainingPenalties: 0,
      remainingBalance: 0,
      penaltyDetails: []
    };

    try {
      const penalties = await LoanPenalty.findAll({
        where: {
          loan_id: loanId,
          status: 'PENDING'
        },
        order: [['created_at', 'ASC']],
        transaction
      });

      let remainingAmount = paymentAmount;

      for (const penalty of penalties) {
        if (remainingAmount <= 0) break;

        const amountToPay = Math.min(remainingAmount, parseFloat(penalty.amount));
        
        await penalty.update({
          amount_paid: amountToPay,
          payment_date: new Date(),
          status: amountToPay >= parseFloat(penalty.amount) ? 'PAID' : 'PARTIALLY_PAID',
          updated_at: new Date()
        }, { transaction });

        result.penaltiesPaid += amountToPay;
        result.penaltyDetails.push({
          penaltyId: penalty.id,
          originalAmount: penalty.amount,
          paidAmount: amountToPay,
          remaining: parseFloat(penalty.amount) - amountToPay
        });

        remainingAmount -= amountToPay;
      }

      const remainingPenalties = await LoanPenalty.sum('amount', {
        where: {
          loan_id: loanId,
          status: ['PENDING', 'PARTIALLY_PAID']
        },
        transaction
      });

      result.remainingPenalties = remainingPenalties || 0;

      if (remainingAmount > 0) {
        const loan = await LoanAccount.findByPk(loanId, { transaction });
        if (loan) {
          const principalBalance = parseFloat(loan.outstanding_principal || 0);
          result.principalPaid = Math.min(remainingAmount, principalBalance);
          result.remainingBalance = principalBalance - result.principalPaid;

          await loan.update({
            outstanding_principal: result.remainingBalance,
            updated_at: new Date()
          }, { transaction });

          await LoanRepayment.create({
            loan_id: loanId,
            acct_no: loan.acct_no,
            amount: result.principalPaid,
            principal_paid: result.principalPaid,
            interest_paid: 0,
            penalty_paid: result.penaltiesPaid,
            payment_date: new Date(),
            payment_method: paymentMethod,
            status: 'COMPLETED'
          }, { transaction });
        }
      }

      return result;

    } catch (error) {
      logger.error('Error processing penalty payment:', error.message);
      throw error;
    }
  }

  /**
   * Get penalty summary for a loan
   */
  static async getLoanPenaltySummary(loanId) {
    try {
      const penalties = await LoanPenalty.findAll({
        where: { loan_id: loanId },
        order: [['created_at', 'DESC']]
      });

      const totalPending = penalties
        .filter(p => p.status === 'PENDING' || p.status === 'PARTIALLY_PAID')
        .reduce((sum, p) => sum + parseFloat(p.amount), 0);

      const totalPaid = penalties
        .filter(p => p.status === 'PAID')
        .reduce((sum, p) => sum + parseFloat(p.amount_paid || 0), 0);

      return {
        totalPenalties: penalties.length,
        pendingPenalties: penalties.filter(p => p.status === 'PENDING').length,
        partiallyPaid: penalties.filter(p => p.status === 'PARTIALLY_PAID').length,
        totalPendingAmount: totalPending,
        totalPaidAmount: totalPaid,
        penalties: penalties.map(p => ({
          id: p.id,
          amount: p.amount,
          daysOverdue: p.days_overdue,
          accrualDate: p.accrual_date,
          status: p.status,
          description: p.description
        }))
      };
    } catch (error) {
      logger.error('Error getting loan penalty summary:', error.message);
      throw error;
    }
  }
}

export default PenaltyAccrualService;