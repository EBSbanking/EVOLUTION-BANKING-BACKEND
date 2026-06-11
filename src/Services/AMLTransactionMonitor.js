// src/services/AMLTransactionMonitor.js
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';
import AuditTrail from '../models/AuditTrail.js';
import AMLConfigurationService from './AMLConfigurationService.js';

class AMLTransactionMonitor {
  constructor() {
    this.configService = AMLConfigurationService;
  }

  /**
   * Get all thresholds from database
   */
  async getThresholds() {
    return await this.configService.getConfigs([
      'SINGLE_TRANSACTION_LIMIT',
      'MEDIUM_TRANSACTION_LIMIT',
      'LOW_TRANSACTION_LIMIT',
      'DAILY_TOTAL_LIMIT',
      'DAILY_COUNT_LIMIT',
      'WEEKLY_TOTAL_LIMIT',
      'WEEKLY_COUNT_LIMIT',
      'MONTHLY_TOTAL_LIMIT',
      'MONTHLY_COUNT_LIMIT',
      'SUDDEN_BALANCE_INCREASE_PERCENT',
      'SUDDEN_BALANCE_DECREASE_PERCENT',
      'RAPID_CONSECUTIVE_TRANSACTIONS',
      'RAPID_TIME_WINDOW_MS',
      'STRUCTURING_THRESHOLD_PERCENT',
      'RISK_SCORE_VERY_HIGH',
      'RISK_SCORE_HIGH',
      'RISK_SCORE_MEDIUM',
      'RISK_SCORE_LOW',
      'RISK_SCORE_VERY_LOW',
      'CRITICAL_RISK_THRESHOLD',
      'HIGH_RISK_THRESHOLD',
      'MEDIUM_RISK_THRESHOLD',
      'LOW_RISK_THRESHOLD',
      'CRITICAL_RISK_LEVEL',
      'HIGH_RISK_LEVEL',
      'MEDIUM_RISK_LEVEL',
      'LOW_RISK_LEVEL',
      'VERY_LOW_RISK_LEVEL',
      'AML_MONITORING_ENABLED',
      'REQUIRE_APPROVAL_FOR_MEDIUM_RISK',
      'AUTO_BLOCK_HIGH_RISK',
      'USE_AI_PREDICTION',
      'ENABLE_BEHAVIORAL_ANALYSIS',
      'AUTO_GENERATE_SAR',
      'HIGH_RISK_COUNTRIES',
      'SANCTIONED_COUNTRIES'
    ]);
  }

  /**
   * Analyze transaction for AML risk - CONFIGURABLE VERSION
   */
  async analyzeTransaction(transaction, customerAccount, customer) {
    // Check if AML monitoring is enabled
    const thresholds = await this.getThresholds();
    
    if (!thresholds.AML_MONITORING_ENABLED) {
      return { riskLevel: 'VERY_LOW', riskScore: 0, riskIndicators: [], requiresApproval: false, requiresSuspiciousReport: false };
    }
    
    const riskIndicators = [];
    let totalRiskScore = 0;
    
    // 1. Check transaction amount (using configurable thresholds)
    const amountRisk = await this.checkAmountRisk(transaction.amount, thresholds);
    if (amountRisk.riskScore > 0) {
      riskIndicators.push(amountRisk);
      totalRiskScore += amountRisk.riskScore;
    }
    
    // 2. Check transaction velocity
    const velocityRisk = await this.checkTransactionVelocity(customerAccount.account_number, transaction.created_at, thresholds);
    if (velocityRisk.riskScore > 0) {
      riskIndicators.push(velocityRisk);
      totalRiskScore += velocityRisk.riskScore;
    }
    
    // 3. Check daily cumulative amount
    const dailyRisk = await this.checkDailyCumulative(customerAccount.account_number, transaction.created_at, thresholds);
    if (dailyRisk.riskScore > 0) {
      riskIndicators.push(dailyRisk);
      totalRiskScore += dailyRisk.riskScore;
    }
    
    // 4. Check weekly cumulative amount
    const weeklyRisk = await this.checkWeeklyCumulative(customerAccount.account_number, transaction.created_at, thresholds);
    if (weeklyRisk.riskScore > 0) {
      riskIndicators.push(weeklyRisk);
      totalRiskScore += weeklyRisk.riskScore;
    }
    
    // 5. Check monthly cumulative amount
    const monthlyRisk = await this.checkMonthlyCumulative(customerAccount.account_number, transaction.created_at, thresholds);
    if (monthlyRisk.riskScore > 0) {
      riskIndicators.push(monthlyRisk);
      totalRiskScore += monthlyRisk.riskScore;
    }
    
    // 6. Check structuring risk
    const structuringRisk = this.checkStructuringRisk(transaction.amount, thresholds);
    if (structuringRisk.riskScore > 0) {
      riskIndicators.push(structuringRisk);
      totalRiskScore += structuringRisk.riskScore;
    }
    
    // 7. Check balance anomaly
    const balanceRisk = await this.checkBalanceAnomaly(customerAccount, transaction, thresholds);
    if (balanceRisk.riskScore > 0) {
      riskIndicators.push(balanceRisk);
      totalRiskScore += balanceRisk.riskScore;
    }
    
    // 8. Check customer AML profile
    const customerRisk = await this.checkCustomerAMLProfile(customer.CUST_ID);
    if (customerRisk.riskScore > 0) {
      riskIndicators.push(customerRisk);
      totalRiskScore += customerRisk.riskScore;
    }
    
    // 9. Check country risk (if applicable)
    if (transaction.additional_info?.country) {
      const countryRisk = await this.checkCountryRisk(transaction.additional_info.country, thresholds);
      if (countryRisk.riskScore > 0) {
        riskIndicators.push(countryRisk);
        totalRiskScore += countryRisk.riskScore;
      }
    }
    
    // 10. AI prediction (if enabled)
    if (thresholds.USE_AI_PREDICTION) {
      const aiRisk = await this.getAIPredictionRisk(transaction, customerAccount, customer);
      if (aiRisk.riskScore > 0) {
        riskIndicators.push(aiRisk);
        totalRiskScore += aiRisk.riskScore;
      }
    }
    
    // Determine risk level based on thresholds
    const riskLevel = this.determineRiskLevel(totalRiskScore, thresholds);
    
    // Determine if approval is required
    const requiresApproval = riskLevel === thresholds.HIGH_RISK_LEVEL || 
                            (riskLevel === thresholds.MEDIUM_RISK_LEVEL && thresholds.REQUIRE_APPROVAL_FOR_MEDIUM_RISK);
    
    // Determine if suspicious report is required
    const requiresSuspiciousReport = riskLevel === thresholds.CRITICAL_RISK_LEVEL;
    
    // Determine if transaction should be blocked
    const shouldBlock = riskLevel === thresholds.CRITICAL_RISK_LEVEL && thresholds.AUTO_BLOCK_HIGH_RISK;
    
    return {
      riskLevel,
      riskScore: totalRiskScore,
      riskIndicators,
      requiresApproval,
      requiresSuspiciousReport,
      shouldBlock,
      timestamp: new Date().toISOString(),
      configUsed: {
        highRiskThreshold: thresholds.HIGH_RISK_THRESHOLD,
        criticalRiskThreshold: thresholds.CRITICAL_RISK_THRESHOLD
      }
    };
  }
  
  /**
   * Check transaction amount risk - CONFIGURABLE
   */
  async checkAmountRisk(amount, thresholds) {
    if (amount >= thresholds.SINGLE_TRANSACTION_LIMIT) {
      return {
        type: 'EXCESSIVE_TRANSACTION_AMOUNT',
        description: `Transaction amount (₦${amount.toLocaleString()}) exceeds high-risk threshold (₦${thresholds.SINGLE_TRANSACTION_LIMIT.toLocaleString()})`,
        riskScore: thresholds.RISK_SCORE_VERY_HIGH,
        severity: thresholds.HIGH_RISK_LEVEL
      };
    } else if (amount >= thresholds.MEDIUM_TRANSACTION_LIMIT) {
      return {
        type: 'MODERATE_TRANSACTION_AMOUNT',
        description: `Transaction amount (₦${amount.toLocaleString()}) exceeds medium-risk threshold`,
        riskScore: thresholds.RISK_SCORE_MEDIUM,
        severity: thresholds.MEDIUM_RISK_LEVEL
      };
    } else if (amount >= thresholds.LOW_TRANSACTION_LIMIT) {
      return {
        type: 'NOTICEABLE_TRANSACTION_AMOUNT',
        description: `Transaction amount (₦${amount.toLocaleString()}) exceeds low-risk threshold`,
        riskScore: thresholds.RISK_SCORE_LOW,
        severity: thresholds.LOW_RISK_LEVEL
      };
    }
    return { riskScore: 0 };
  }
  
  /**
   * Check rapid consecutive transactions - CONFIGURABLE
   */
  async checkTransactionVelocity(accountNumber, transactionDate, thresholds) {
    const timeWindow = new Date(transactionDate.getTime() - thresholds.RAPID_TIME_WINDOW_MS);
    
    const [result] = await sequelize.query(
      `SELECT COUNT(*) as count FROM audit_trails 
       WHERE account_no = :accountNumber 
         AND timestamp >= :timeWindow 
         AND event_type IN ('TRANSACTION_CR', 'TRANSACTION_DR', 'DEPOSIT', 'WITHDRAWAL')`,
      {
        replacements: { accountNumber, timeWindow },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (result.count >= thresholds.RAPID_CONSECUTIVE_TRANSACTIONS) {
      return {
        type: 'RAPID_CONSECUTIVE_TRANSACTIONS',
        description: `${result.count} transactions in last ${thresholds.RAPID_TIME_WINDOW_MS / 60000} minutes`,
        riskScore: thresholds.RISK_SCORE_HIGH,
        severity: thresholds.HIGH_RISK_LEVEL
      };
    }
    return { riskScore: 0 };
  }
  
  /**
   * Check daily cumulative amount - CONFIGURABLE
   */
  async checkDailyCumulative(accountNumber, transactionDate, thresholds) {
    const startOfDay = new Date(transactionDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const [result] = await sequelize.query(
      `SELECT SUM(amount) as total, COUNT(*) as count FROM audit_trails 
       WHERE account_no = :accountNumber 
         AND timestamp >= :startOfDay 
         AND event_type IN ('TRANSACTION_CR', 'DEPOSIT')`,
      {
        replacements: { accountNumber, startOfDay },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    const dailyTotal = parseFloat(result.total || 0);
    const dailyCount = parseInt(result.count || 0);
    
    if (dailyTotal >= thresholds.DAILY_TOTAL_LIMIT) {
      return {
        type: 'EXCESSIVE_DAILY_CREDITS',
        description: `Daily total credits (₦${dailyTotal.toLocaleString()}) exceeds limit (₦${thresholds.DAILY_TOTAL_LIMIT.toLocaleString()})`,
        riskScore: thresholds.RISK_SCORE_HIGH,
        severity: thresholds.HIGH_RISK_LEVEL
      };
    }
    
    if (dailyCount >= thresholds.DAILY_COUNT_LIMIT) {
      return {
        type: 'EXCESSIVE_DAILY_COUNT',
        description: `${dailyCount} transactions today exceeds limit of ${thresholds.DAILY_COUNT_LIMIT}`,
        riskScore: thresholds.RISK_SCORE_MEDIUM,
        severity: thresholds.MEDIUM_RISK_LEVEL
      };
    }
    
    return { riskScore: 0 };
  }
  
  /**
   * Check weekly cumulative amount - CONFIGURABLE
   */
  async checkWeeklyCumulative(accountNumber, transactionDate, thresholds) {
    const startOfWeek = new Date(transactionDate);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const [result] = await sequelize.query(
      `SELECT SUM(amount) as total FROM audit_trails 
       WHERE account_no = :accountNumber 
         AND timestamp >= :startOfWeek 
         AND event_type IN ('TRANSACTION_CR', 'DEPOSIT')`,
      {
        replacements: { accountNumber, startOfWeek },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    const weeklyTotal = parseFloat(result.total || 0);
    
    if (weeklyTotal >= thresholds.WEEKLY_TOTAL_LIMIT) {
      return {
        type: 'EXCESSIVE_WEEKLY_CREDITS',
        description: `Weekly total credits (₦${weeklyTotal.toLocaleString()}) exceeds limit`,
        riskScore: thresholds.RISK_SCORE_VERY_HIGH,
        severity: thresholds.CRITICAL_RISK_LEVEL
      };
    }
    return { riskScore: 0 };
  }
  
  /**
   * Check monthly cumulative amount - NEW
   */
  async checkMonthlyCumulative(accountNumber, transactionDate, thresholds) {
    const startOfMonth = new Date(transactionDate.getFullYear(), transactionDate.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const [result] = await sequelize.query(
      `SELECT SUM(amount) as total, COUNT(*) as count FROM audit_trails 
       WHERE account_no = :accountNumber 
         AND timestamp >= :startOfMonth 
         AND event_type IN ('TRANSACTION_CR', 'DEPOSIT')`,
      {
        replacements: { accountNumber, startOfMonth },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    const monthlyTotal = parseFloat(result.total || 0);
    const monthlyCount = parseInt(result.count || 0);
    let riskScore = 0;
    let severity = null;
    let type = null;
    let description = null;
    
    if (monthlyTotal >= thresholds.MONTHLY_TOTAL_LIMIT) {
      riskScore = thresholds.RISK_SCORE_VERY_HIGH;
      severity = thresholds.CRITICAL_RISK_LEVEL;
      type = 'EXCESSIVE_MONTHLY_CREDITS';
      description = `Monthly total credits (₦${monthlyTotal.toLocaleString()}) exceeds limit`;
    } else if (monthlyCount >= thresholds.MONTHLY_COUNT_LIMIT) {
      riskScore = thresholds.RISK_SCORE_HIGH;
      severity = thresholds.HIGH_RISK_LEVEL;
      type = 'EXCESSIVE_MONTHLY_COUNT';
      description = `${monthlyCount} transactions this month exceeds limit of ${thresholds.MONTHLY_COUNT_LIMIT}`;
    }
    
    if (riskScore > 0) {
      return { type, description, riskScore, severity };
    }
    return { riskScore: 0 };
  }
  
  /**
   * Check structuring risk - CONFIGURABLE
   */
  checkStructuringRisk(amount, thresholds) {
    const structuringThreshold = thresholds.SINGLE_TRANSACTION_LIMIT * (thresholds.STRUCTURING_THRESHOLD_PERCENT / 100);
    
    if (amount >= structuringThreshold && amount < thresholds.SINGLE_TRANSACTION_LIMIT) {
      return {
        type: 'POTENTIAL_STRUCTURING',
        description: `Transaction amount (₦${amount.toLocaleString()}) is just below reporting threshold - possible structuring`,
        riskScore: thresholds.RISK_SCORE_HIGH,
        severity: thresholds.HIGH_RISK_LEVEL
      };
    }
    return { riskScore: 0 };
  }
  
  /**
   * Check balance anomaly - CONFIGURABLE
   */
  async checkBalanceAnomaly(customerAccount, transaction, thresholds) {
    const previousBalance = customerAccount.ledger_balance - transaction.amount;
    if (previousBalance > 0) {
      const percentIncrease = (transaction.amount / previousBalance) * 100;
      
      if (percentIncrease >= thresholds.SUDDEN_BALANCE_INCREASE_PERCENT) {
        return {
          type: 'SUDDEN_BALANCE_INCREASE',
          description: `Balance increased by ${percentIncrease.toFixed(2)}% from previous balance of ₦${previousBalance.toLocaleString()}`,
          riskScore: thresholds.RISK_SCORE_HIGH,
          severity: thresholds.HIGH_RISK_LEVEL
        };
      }
      
      const percentDecrease = (transaction.amount / previousBalance) * 100;
      if (percentDecrease >= thresholds.SUDDEN_BALANCE_DECREASE_PERCENT) {
        return {
          type: 'SUDDEN_BALANCE_DECREASE',
          description: `Balance decreased by ${percentDecrease.toFixed(2)}%`,
          riskScore: thresholds.RISK_SCORE_HIGH,
          severity: thresholds.HIGH_RISK_LEVEL
        };
      }
    }
    return { riskScore: 0 };
  }
  
  /**
   * Check country risk - NEW
   */
  async checkCountryRisk(country, thresholds) {
    const highRiskCountries = thresholds.HIGH_RISK_COUNTRIES || [];
    const sanctionedCountries = thresholds.SANCTIONED_COUNTRIES || [];
    
    if (sanctionedCountries.includes(country)) {
      return {
        type: 'SANCTIONED_COUNTRY',
        description: `Transaction involves sanctioned country: ${country}`,
        riskScore: thresholds.RISK_SCORE_VERY_HIGH,
        severity: thresholds.CRITICAL_RISK_LEVEL
      };
    }
    
    if (highRiskCountries.includes(country)) {
      return {
        type: 'HIGH_RISK_COUNTRY',
        description: `Transaction involves high-risk country: ${country}`,
        riskScore: thresholds.RISK_SCORE_HIGH,
        severity: thresholds.HIGH_RISK_LEVEL
      };
    }
    
    return { riskScore: 0 };
  }
  
  /**
   * Get AI prediction risk - NEW
   */
  async getAIPredictionRisk(transaction, customerAccount, customer) {
    // This would call an AI/ML service
    // For now, return a simple calculation based on historical pattern
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const [historical] = await sequelize.query(
      `SELECT AVG(amount) as avg_amount, COUNT(*) as count, STDDEV(amount) as stddev 
       FROM audit_trails 
       WHERE account_no = :accountNumber AND timestamp >= :thirtyDaysAgo`,
      {
        replacements: { accountNumber: customerAccount.account_number, thirtyDaysAgo },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    const thresholds = await this.getThresholds();
    
    if (historical.count > 5 && historical.avg_amount > 0) {
      const deviation = transaction.amount / historical.avg_amount;
      if (deviation > 5) {
        return {
          type: 'AI_ANOMALY_DETECTION',
          description: `AI detected unusual transaction: ${deviation.toFixed(2)}x average amount`,
          riskScore: thresholds.RISK_SCORE_HIGH,
          severity: thresholds.HIGH_RISK_LEVEL
        };
      }
    }
    
    return { riskScore: 0 };
  }
  
  /**
   * Check customer AML profile
   */
  async checkCustomerAMLProfile(customerId) {
    const [amlRecord] = await sequelize.query(
      `SELECT CUSTOMER_RISK_RATING, IS_PEP, SANCTION_MATCH FROM aml WHERE CUST_ID = :customerId`,
      { replacements: { customerId }, type: sequelize.QueryTypes.SELECT }
    );
    
    const thresholds = await this.getThresholds();
    
    if (amlRecord) {
      if (amlRecord.CUSTOMER_RISK_RATING === 'High') {
        return {
          type: 'HIGH_RISK_CUSTOMER',
          description: 'Customer has high-risk AML rating',
          riskScore: thresholds.RISK_SCORE_HIGH,
          severity: thresholds.HIGH_RISK_LEVEL
        };
      }
      if (amlRecord.IS_PEP) {
        return {
          type: 'PEP_CUSTOMER',
          description: 'Customer is a Politically Exposed Person (PEP)',
          riskScore: thresholds.RISK_SCORE_MEDIUM,
          severity: thresholds.MEDIUM_RISK_LEVEL
        };
      }
      if (amlRecord.SANCTION_MATCH) {
        return {
          type: 'SANCTION_MATCH',
          description: 'Customer matches sanction list',
          riskScore: thresholds.RISK_SCORE_VERY_HIGH,
          severity: thresholds.CRITICAL_RISK_LEVEL
        };
      }
    }
    return { riskScore: 0 };
  }
  
  /**
   * Determine risk level based on score - CONFIGURABLE
   */
  determineRiskLevel(riskScore, thresholds) {
    if (riskScore >= thresholds.CRITICAL_RISK_THRESHOLD) return thresholds.CRITICAL_RISK_LEVEL;
    if (riskScore >= thresholds.HIGH_RISK_THRESHOLD) return thresholds.HIGH_RISK_LEVEL;
    if (riskScore >= thresholds.MEDIUM_RISK_THRESHOLD) return thresholds.MEDIUM_RISK_LEVEL;
    if (riskScore >= thresholds.LOW_RISK_THRESHOLD) return thresholds.LOW_RISK_LEVEL;
    return thresholds.VERY_LOW_RISK_LEVEL;
  }
  
  /**
   * Create suspicious activity report - CONFIGURABLE
   */
  async createSuspiciousActivityReport(transaction, customerAccount, customer, riskAnalysis) {
    const thresholds = await this.getThresholds();
    
    if (!thresholds.AUTO_GENERATE_SAR) {
      return { generated: false, message: 'SAR generation is disabled' };
    }
    
    const sarId = `SAR-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    await AuditTrail.create({
      event_id: sarId,
      user_id: 'SYSTEM_AML',
      event_type: 'SUSPICIOUS_ACTIVITY_REPORT',
      action: 'AML_SYSTEM_FLAG',
      old_value: null,
      new_value: JSON.stringify({
        transaction_id: transaction.id,
        transaction_amount: transaction.amount,
        transaction_date: transaction.created_at,
        account_number: customerAccount.account_number,
        customer_id: customer.CUST_ID,
        customer_name: customer.CUST_NM || `${customer.FIRST_NAME} ${customer.LAST_NAME}`,
        risk_level: riskAnalysis.riskLevel,
        risk_score: riskAnalysis.riskScore,
        risk_indicators: riskAnalysis.riskIndicators,
        configuration_used: {
          high_risk_threshold: thresholds.HIGH_RISK_THRESHOLD,
          single_transaction_limit: thresholds.SINGLE_TRANSACTION_LIMIT
        },
        reported_at: new Date().toISOString()
      }),
      ip_address: 'SYSTEM',
      entity_type: 'Transaction',
      entity_id: transaction.id,
      status: 'PENDING_REVIEW',
      account_no: customerAccount.account_number,
      description: `AML System flagged suspicious transaction - Risk Level: ${riskAnalysis.riskLevel}`,
      additional_info: {
        risk_indicators: riskAnalysis.riskIndicators,
        requires_immediate_action: riskAnalysis.riskLevel === thresholds.CRITICAL_RISK_LEVEL
      }
    });
    
    return { sarId, riskAnalysis, generated: true };
  }
}

export default new AMLTransactionMonitor();