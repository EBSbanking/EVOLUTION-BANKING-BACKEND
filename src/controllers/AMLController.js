// controllers/AMLController.js - Complete Sequelize Version with Prembly Integration

import AML from '../models/AML.js';
import Customer from '../models/Customer.js';
import AMLThreshold from '../models/AMLThreshold.js';
import AMLSystemConfig from '../models/AMLSystemConfig.js';
import auditLogger from '../utils/AuditLogger.js';
import { checkSanctionList } from '../utils/checkSanctionList.js';
import WF_WORK_ITEMController from '../controllers/WF_WORK_ITEMController.js';
import { validateAMLInput } from '../utils/amlValidator.js';
import { GENERAL_TX_TYPES } from '../constants/transactionTypes.js';
import { generateTransactionIds } from '../utils/generateAccountNumber.js';
import sequelize from '../../config/db.js';
import { QueryTypes, Op } from 'sequelize';
import PremblyAMLService from '../services/PremblyAMLService.js';

// ==================== DYNAMIC CONFIGURATION HELPER ====================

/**
 * Get AML configuration dynamically from database
 * Falls back to defaults if not found
 */
export const getAMLConfig = async (key = null) => {
  try {
    let configData = {};
    
    // Try to get from Sequelize model first
    const configRecord = await AMLSystemConfig.findOne({
      where: { type: 'SYSTEM_CONFIG', is_active: true }
    });
    
    if (configRecord && configRecord.configs) {
      configData = configRecord.configs;
    } else {
      // Try raw SQL as fallback
      const configs = await sequelize.query(
        `SELECT configs FROM aml_configurations WHERE id = 1 LIMIT 1`,
        { type: QueryTypes.SELECT }
      );
      
      if (configs && configs.length > 0) {
        configData = typeof configs[0].configs === 'string' 
          ? JSON.parse(configs[0].configs) 
          : configs[0].configs;
      }
    }
    
    // If still no config, fetch from dynamic defaults builder
    if (Object.keys(configData).length === 0) {
      configData = await buildDynamicDefaults();
      await saveAMLConfig(configData, 'system', 'Initial default configuration');
    }
    
    if (key) {
      return configData[key];
    }
    
    return configData;
  } catch (error) {
    console.error('Error fetching AML config:', error);
    return await buildDynamicDefaults();
  }
};

/**
 * Save AML configuration to database
 */
export const saveAMLConfig = async (configs, userId = 'system', reason = 'Configuration update') => {
  try {
    let configRecord = await AMLSystemConfig.findOne({
      where: { type: 'SYSTEM_CONFIG' }
    });
    
    if (configRecord) {
      await configRecord.update({
        configs: configs,
        updated_by: userId,
        update_reason: reason,
        version: configRecord.version + 1,
        updated_at: new Date()
      });
    } else {
      await AMLSystemConfig.create({
        type: 'SYSTEM_CONFIG',
        configs: configs,
        created_by: userId,
        updated_by: userId,
        update_reason: reason,
        version: 1,
        is_active: true
      });
    }
    
    // Also update the aml_configurations table for backward compatibility
    await sequelize.query(
      `INSERT INTO aml_configurations (id, configs, created_by, updated_by, updated_at)
       VALUES (1, :configs, :createdBy, :updatedBy, NOW())
       ON DUPLICATE KEY UPDATE
       configs = VALUES(configs),
       updated_by = VALUES(updated_by),
       updated_at = NOW()`,
      {
        replacements: {
          configs: JSON.stringify(configs),
          createdBy: userId,
          updatedBy: userId
        },
        type: QueryTypes.INSERT
      }
    );
    
    return true;
  } catch (error) {
    console.error('Error saving AML config:', error);
    return false;
  }
};

/**
 * Build dynamic default configurations based on business rules
 */
export const buildDynamicDefaults = async () => {
  const bankTier = process.env.BANK_TIER || 'STANDARD';
  
  const baseConfigs = {
    // Risk Thresholds
    SINGLE_TRANSACTION_LIMIT: parseFloat(process.env.AML_SINGLE_LIMIT) || 5000000,
    MEDIUM_TRANSACTION_LIMIT: parseFloat(process.env.AML_MEDIUM_LIMIT) || 1000000,
    LOW_TRANSACTION_LIMIT: parseFloat(process.env.AML_LOW_LIMIT) || 500000,
    
    // Time-based Limits
    DAILY_TOTAL_LIMIT: parseFloat(process.env.AML_DAILY_LIMIT) || 10000000,
    DAILY_COUNT_LIMIT: parseInt(process.env.AML_DAILY_COUNT) || 10,
    WEEKLY_TOTAL_LIMIT: parseFloat(process.env.AML_WEEKLY_LIMIT) || 50000000,
    WEEKLY_COUNT_LIMIT: parseInt(process.env.AML_WEEKLY_COUNT) || 50,
    MONTHLY_TOTAL_LIMIT: parseFloat(process.env.AML_MONTHLY_LIMIT) || 200000000,
    MONTHLY_COUNT_LIMIT: parseInt(process.env.AML_MONTHLY_COUNT) || 200,
    
    // AML Feature Toggles
    AML_MONITORING_ENABLED: process.env.AML_MONITORING_ENABLED === 'true' || true,
    REQUIRE_APPROVAL_FOR_MEDIUM_RISK: process.env.AML_REQUIRE_APPROVAL === 'true' || true,
    AUTO_BLOCK_HIGH_RISK: process.env.AML_AUTO_BLOCK === 'true' || true,
    USE_AI_PREDICTION: process.env.AML_USE_AI === 'true' || false,
    ENABLE_BEHAVIORAL_ANALYSIS: process.env.AML_BEHAVIORAL === 'true' || true,
    
    // Risk Scoring Weights
    MAX_AML_RISK_SCORE: parseInt(process.env.AML_MAX_SCORE) || 100,
    MIN_AML_RISK_SCORE: parseInt(process.env.AML_MIN_SCORE) || 0,
    PEP_RISK_MULTIPLIER: parseFloat(process.env.AML_PEP_MULTIPLIER) || 2.5,
    SANCTION_RISK_MULTIPLIER: parseFloat(process.env.AML_SANCTION_MULTIPLIER) || 3.0,
    HIGH_RISK_COUNTRY_MULTIPLIER: parseFloat(process.env.AML_COUNTRY_MULTIPLIER) || 1.8,
    RCA_RISK_MULTIPLIER: parseFloat(process.env.AML_RCA_MULTIPLIER) || 1.5,
    
    ...(bankTier === 'PREMIUM' && {
      SINGLE_TRANSACTION_LIMIT: 10000000,
      DAILY_TOTAL_LIMIT: 20000000,
      USE_AI_PREDICTION: true
    }),
    ...(bankTier === 'ENTERPRISE' && {
      SINGLE_TRANSACTION_LIMIT: 20000000,
      DAILY_TOTAL_LIMIT: 50000000,
      USE_AI_PREDICTION: true,
      ENABLE_BEHAVIORAL_ANALYSIS: true
    })
  };
  
  return baseConfigs;
};

/**
 * Initialize default configurations if none exist
 */
export const initializeAMLConfigurations = async () => {
  try {
    const existingConfig = await AMLSystemConfig.findOne({
      where: { type: 'SYSTEM_CONFIG' }
    });
    
    if (!existingConfig) {
      const defaultConfigs = await buildDynamicDefaults();
      await saveAMLConfig(defaultConfigs, 'system', 'Initial system initialization');
      console.log('✅ AML configurations initialized with dynamic defaults');
    } else {
      console.log('✅ AML configurations already exist');
    }
  } catch (error) {
    console.error('Failed to initialize AML configs:', error);
  }
};

// ==================== PREMBLY AML INTEGRATION ====================

/**
 * Check PEP status using Prembly API
 */
export const checkPEPStatus = async (req, res) => {
  try {
    const { first_name, middle_name, last_name, gender, date_of_birth, country } = req.body;
    
    if (!first_name || !last_name) {
      return res.status(400).json({
        success: false,
        message: 'First name and last name are required'
      });
    }
    
    const result = await PremblyAMLService.checkPEP({
      first_name,
      middle_name,
      last_name,
      gender,
      date_of_birth,
      country
    });
    
    // Log audit
    auditLogger.info('Audit Event', {
      entity_type: 'PEP_CHECK',
      user_id: req.user_id || 'system',
      action: 'PEP Status Check',
      new_value: JSON.stringify({ first_name, last_name, result: result.is_match }),
      ip_address: req.ip || 'unknown',
      event_type: 'AML_PEP_CHECK',
      outcome: 'success'
    });
    
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('PEP check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check PEP status',
      error: error.message
    });
  }
};

/**
 * Check Sanction list using Prembly API
 */
export const checkSanctionStatus = async (req, res) => {
  try {
    const { first_name, middle_name, last_name } = req.body;
    
    if (!first_name || !last_name) {
      return res.status(400).json({
        success: false,
        message: 'First name and last name are required'
      });
    }
    
    const result = await PremblyAMLService.checkSanction({
      first_name,
      middle_name,
      last_name
    });
    
    // Log audit
    auditLogger.info('Audit Event', {
      entity_type: 'SANCTION_CHECK',
      user_id: req.user_id || 'system',
      action: 'Sanction List Check',
      new_value: JSON.stringify({ first_name, last_name, result: result.is_match }),
      ip_address: req.ip || 'unknown',
      event_type: 'AML_SANCTION_CHECK',
      outcome: 'success'
    });
    
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Sanction check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check sanction list',
      error: error.message
    });
  }
};

/**
 * Complete AML screening (PEP + Sanction) using Prembly
 */
export const completeAMLScreening = async (req, res) => {
  try {
    const { first_name, middle_name, last_name, gender, date_of_birth, country, customer_id } = req.body;
    
    if (!first_name || !last_name) {
      return res.status(400).json({
        success: false,
        message: 'First name and last name are required'
      });
    }
    
    const result = await PremblyAMLService.fullAMLScreening({
      first_name,
      middle_name,
      last_name,
      gender,
      date_of_birth,
      country
    });
    
    // If customer_id is provided, update AML record
    if (customer_id) {
      await updateAMLRiskFromScreening(customer_id, result);
    }
    
    // Log audit
    auditLogger.info('Audit Event', {
      entity_type: 'AML_SCREENING',
      user_id: req.user_id || 'system',
      action: 'Complete AML Screening',
      new_value: JSON.stringify({
        customer_id,
        first_name,
        last_name,
        overall_risk: result.overall_risk.level,
        pep_match: result.pep_check.is_match,
        sanction_match: result.sanction_check.is_match
      }),
      ip_address: req.ip || 'unknown',
      event_type: 'AML_SCREENING',
      outcome: 'success'
    });
    
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('AML screening error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to complete AML screening',
      error: error.message
    });
  }
};

/**
 * Validate customer for transaction using Prembly
 */
export const validateCustomerTransaction = async (req, res) => {
  try {
    const { customer, amount, transaction_type } = req.body;
    
    if (!customer || !customer.first_name || !customer.last_name) {
      return res.status(400).json({
        success: false,
        message: 'Customer information with first name and last name is required'
      });
    }
    
    if (!amount) {
      return res.status(400).json({
        success: false,
        message: 'Transaction amount is required'
      });
    }
    
    const result = await PremblyAMLService.validateCustomerForTransaction(customer, amount);
    
    return res.status(200).json({
      success: true,
      data: {
        ...result,
        transaction_amount: amount,
        transaction_type: transaction_type || 'UNKNOWN',
        recommendation: result.can_proceed ? 'PROCEED' : 'BLOCKED',
        requires_approval: result.requires_approval,
        requires_suspicious_report: result.requires_suspicious_report
      }
    });
  } catch (error) {
    console.error('Customer transaction validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to validate customer for transaction',
      error: error.message
    });
  }
};

/**
 * Update AML risk based on Prembly screening results
 */
const updateAMLRiskFromScreening = async (customerId, screeningResult) => {
  try {
    const riskScore = screeningResult.overall_risk.score;
    let riskRating = 'Low';
    
    if (riskScore >= 70) riskRating = 'High';
    else if (riskScore >= 30) riskRating = 'Medium';
    
    const existing = await AML.findByCustomerId(customerId);
    const now = new Date();
    let nextReviewDate;
    
    if (riskRating === 'High') {
      nextReviewDate = new Date(now.setMonth(now.getMonth() + 1));
    } else if (riskRating === 'Medium') {
      nextReviewDate = new Date(now.setMonth(now.getMonth() + 3));
    } else {
      nextReviewDate = new Date(now.setMonth(now.getMonth() + 6));
    }
    
    if (existing) {
      await existing.update({
        IS_PEP: screeningResult.pep_check.is_match,
        SANCTION_MATCH: screeningResult.sanction_check.is_match,
        CUSTOMER_RISK_RATING: riskRating,
        NEXT_REVIEW_DATE: nextReviewDate
      });
    } else {
      await AML.create({
        CUST_ID: customerId,
        IS_PEP: screeningResult.pep_check.is_match,
        IS_RCA: false,
        SANCTION_MATCH: screeningResult.sanction_check.is_match,
        CUSTOMER_RISK_RATING: riskRating,
        AML_STATUS: 'Pending',
        NEXT_REVIEW_DATE: nextReviewDate
      });
    }
  } catch (error) {
    console.error('Error updating AML risk from screening:', error);
  }
};

// ==================== AML SYSTEM CONFIGURATIONS ====================

export const getAMLConfigurations = async (req, res) => {
  try {
    const userId = req.user_id || 'system';
    const ipAddress = req.ip_address || req.ip || '0.0.0.0';
    
    const configData = await getAMLConfig();
    const stats = await AML.getStatistics();
    
    auditLogger.info('Audit Event', {
      entity_type: 'AML_CONFIG',
      entity_id: 1,
      user_id: userId,
      action: 'get_aml_configurations',
      old_value: null,
      new_value: { config_keys: Object.keys(configData) },
      ip_address: ipAddress,
      event_type: 'CONFIG_QUERY',
      outcome: 'success'
    });

    return res.status(200).json({
      success: true,
      data: {
        configurations: configData,
        statistics: stats
      }
    });
  } catch (error) {
    console.error('Error fetching AML configs:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch AML configurations',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const updateAMLConfigurations = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { configs } = req.body;
    const userId = req.user_id || req.body.USER_ID || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const updateReason = req.body.reason || 'Manual update';
    
    if (!configs || typeof configs !== 'object') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Valid configs object is required'
      });
    }
    
    let currentConfigs = await getAMLConfig();
    const oldValue = JSON.stringify(currentConfigs);
    const mergedConfigs = { ...currentConfigs, ...configs };
    
    mergedConfigs.LAST_UPDATED = new Date().toISOString();
    mergedConfigs.LAST_UPDATED_BY = userId;
    mergedConfigs.UPDATE_REASON = updateReason;
    
    await saveAMLConfig(mergedConfigs, userId, updateReason);
    await transaction.commit();
    
    const changedKeys = Object.keys(configs);
    auditLogger.info('Audit Event', {
      entity_type: 'AML_CONFIG',
      entity_id: 1,
      user_id: userId,
      action: 'update_aml_configurations',
      old_value: oldValue,
      new_value: JSON.stringify(mergedConfigs),
      ip_address: ipAddress,
      event_type: 'CONFIG_UPDATE',
      outcome: 'success',
      changed_keys: changedKeys,
      update_reason: updateReason
    });
    
    return res.status(200).json({
      success: true,
      message: 'AML configurations updated successfully',
      data: { updated_keys: changedKeys, timestamp: new Date().toISOString() }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error updating AML configs:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update AML configurations',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ==================== AML STATISTICS ====================

export const getAMLStatistics = async (req, res) => {
  try {
    const stats = await AML.getStatistics();
    
    const transactionStats = await sequelize.query(`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN aml_risk_level = 'LOW' THEN 1 ELSE 0 END) as low_risk_transactions,
        SUM(CASE WHEN aml_risk_level = 'MEDIUM' THEN 1 ELSE 0 END) as medium_risk_transactions,
        SUM(CASE WHEN aml_risk_level = 'HIGH' THEN 1 ELSE 0 END) as high_risk_transactions,
        SUM(CASE WHEN aml_risk_level = 'CRITICAL' THEN 1 ELSE 0 END) as critical_risk_transactions,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_review,
        SUM(amount) as total_amount,
        AVG(aml_risk_score) as avg_risk_score
      FROM deposit_transactions 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `, { type: QueryTypes.SELECT });

    return res.status(200).json({
      success: true,
      data: {
        customers: stats,
        transactions: transactionStats[0] || {
          total_transactions: 0,
          low_risk_transactions: 0,
          medium_risk_transactions: 0,
          high_risk_transactions: 0,
          critical_risk_transactions: 0,
          pending_review: 0,
          total_amount: 0,
          avg_risk_score: 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching AML stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch AML statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ==================== AML RECORD MANAGEMENT ====================

export const upsertAML = async (req, res) => {
  try {
    const {
      CUST_ID, BVN, NIN, IS_PEP, IS_RCA, SANCTION_SCORE,
      AML_STATUS, NEXT_REVIEW_DATE, USER_ID
    } = req.body;

    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    const validationError = validateAMLInput(req.body);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    // Also check with Prembly if customer exists and has name
    let premblyResult = null;
    if (CUST_ID) {
      const customer = await Customer.findOne({ where: { CUST_ID } });
      if (customer && customer.FIRST_NAME && customer.LAST_NAME) {
        try {
          premblyResult = await PremblyAMLService.fullAMLScreening({
            first_name: customer.FIRST_NAME,
            middle_name: customer.MIDDLE_NAME,
            last_name: customer.LAST_NAME,
            gender: customer.GENDER
          });
        } catch (error) {
          console.warn('Prembly check failed, using local data only', error.message);
        }
      }
    }

    const { isSanctioned } = await checkSanctionList(BVN, NIN);

    // Calculate risk score
    let riskScore = 0;
    if (IS_PEP || (premblyResult?.pep_check?.is_match)) riskScore += 30;
    if (IS_RCA) riskScore += 20;
    if (isSanctioned || (premblyResult?.sanction_check?.is_match)) riskScore += (SANCTION_SCORE || 50);
    if (SANCTION_SCORE) riskScore += SANCTION_SCORE;
    if (premblyResult?.overall_risk?.score) {
      riskScore = Math.max(riskScore, premblyResult.overall_risk.score);
    }
    
    let CUSTOMER_RISK_RATING = 'Low';
    if (riskScore >= 70) CUSTOMER_RISK_RATING = 'High';
    else if (riskScore >= 30) CUSTOMER_RISK_RATING = 'Medium';

    let nextReviewDate = NEXT_REVIEW_DATE;
    if (!nextReviewDate) {
      const now = new Date();
      if (CUSTOMER_RISK_RATING === 'High') {
        nextReviewDate = new Date(now.setMonth(now.getMonth() + 1));
      } else if (CUSTOMER_RISK_RATING === 'Medium') {
        nextReviewDate = new Date(now.setMonth(now.getMonth() + 3));
      } else {
        nextReviewDate = new Date(now.setMonth(now.getMonth() + 6));
      }
    }

    let amlRecord = await AML.findByCustomerId(CUST_ID);
    let action = 'created';

    if (amlRecord) {
      const oldValue = JSON.stringify(amlRecord.toJSON());
      await amlRecord.update({
        BVN, NIN, 
        IS_PEP: IS_PEP || (premblyResult?.pep_check?.is_match) || false, 
        IS_RCA: IS_RCA || false,
        SANCTION_SCORE: SANCTION_SCORE || 0, 
        SANCTION_MATCH: isSanctioned || (premblyResult?.sanction_check?.is_match) || false,
        CUSTOMER_RISK_RATING, 
        AML_STATUS: AML_STATUS || 'Pending',
        NEXT_REVIEW_DATE: nextReviewDate
      });
      action = 'updated';
      
      auditLogger.info('Audit Event', {
        entity_type: 'AML_UPDATE', entity_id: amlRecord.id, user_id: USER_ID,
        action: 'Updated AML record', old_value: oldValue,
        new_value: JSON.stringify(amlRecord.toJSON()), ip_address: ipAddress,
        event_type: 'AML_UPDATE', outcome: 'success'
      });
    } else {
      amlRecord = await AML.create({
        CUST_ID, BVN, NIN, 
        IS_PEP: IS_PEP || (premblyResult?.pep_check?.is_match) || false, 
        IS_RCA: IS_RCA || false,
        SANCTION_SCORE: SANCTION_SCORE || 0, 
        SANCTION_MATCH: isSanctioned || (premblyResult?.sanction_check?.is_match) || false,
        CUSTOMER_RISK_RATING, 
        AML_STATUS: AML_STATUS || 'Pending',
        NEXT_REVIEW_DATE: nextReviewDate
      });
      
      auditLogger.info('Audit Event', {
        entity_type: 'AML_CREATE', entity_id: amlRecord.id, user_id: USER_ID,
        action: 'Created AML record', old_value: null,
        new_value: JSON.stringify(amlRecord.toJSON()), ip_address: ipAddress,
        event_type: 'AML_CREATE', outcome: 'success'
      });
    }

    return res.status(200).json({
      success: true,
      message: `AML record ${action} successfully.`,
      data: {
        ...amlRecord.getBasicInfo(),
        prembly_screening: premblyResult
      }
    });
  } catch (error) {
    console.error('❌ AML Upsert Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process AML record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const updateAMLByCustId = async (req, res) => {
  try {
    const { CUST_ID, BVN, NIN, IS_PEP, IS_RCA, SANCTION_SCORE, AML_STATUS, USER_ID } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    if (!CUST_ID || !USER_ID) {
      return res.status(400).json({ success: false, message: 'CUST_ID and USER_ID are required.' });
    }

    const existing = await AML.findByCustomerId(CUST_ID);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'AML record not found.' });
    }

    const oldValue = JSON.stringify(existing.toJSON());
    
    await existing.update({
      ...(BVN && { BVN }),
      ...(NIN && { NIN }),
      ...(typeof IS_PEP !== 'undefined' && { IS_PEP }),
      ...(typeof IS_RCA !== 'undefined' && { IS_RCA }),
      ...(SANCTION_SCORE && { SANCTION_SCORE }),
      ...(AML_STATUS && { AML_STATUS })
    });

    auditLogger.info('Audit Event', {
      entity_type: 'AML_UPDATE', entity_id: existing.id, user_id: USER_ID,
      action: 'Updated AML by CUST_ID', old_value: oldValue,
      new_value: JSON.stringify(existing.toJSON()), ip_address: ipAddress,
      event_type: 'AML_UPDATE', outcome: 'success'
    });

    return res.status(200).json({
      success: true,
      message: 'AML record updated successfully.',
      data: existing.getBasicInfo()
    });
  } catch (error) {
    console.error('❌ updateAMLByCustId Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update AML record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const approveAML = async (req, res) => {
  try {
    const { CUST_ID, USER_ID, comments } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    if (!CUST_ID || !USER_ID) {
      return res.status(400).json({ success: false, message: 'CUST_ID and USER_ID are required.' });
    }

    const amlRecord = await AML.findByCustomerId(CUST_ID);
    if (!amlRecord) {
      return res.status(404).json({ success: false, message: 'AML record not found.' });
    }

    const oldValue = JSON.stringify(amlRecord.toJSON());
    
    await amlRecord.update({
      AML_STATUS: 'Approved',
      updated_at: new Date()
    });

    auditLogger.info('Audit Event', {
      entity_type: 'AML_APPROVAL', entity_id: amlRecord.id, user_id: USER_ID,
      action: 'Approved AML record', old_value: oldValue,
      new_value: JSON.stringify(amlRecord.toJSON()), ip_address: ipAddress,
      event_type: 'AML_APPROVAL', outcome: 'success', approval_comments: comments
    });

    return res.status(200).json({
      success: true,
      message: 'AML record approved successfully',
      data: amlRecord.getBasicInfo()
    });
  } catch (error) {
    console.error('❌ AML Approval Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to approve AML record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const rejectAML = async (req, res) => {
  try {
    const { CUST_ID, USER_ID, rejectionReason, comments } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    if (!CUST_ID || !USER_ID || !rejectionReason) {
      return res.status(400).json({ 
        success: false, 
        message: 'CUST_ID, USER_ID, and rejectionReason are required.' 
      });
    }

    const amlRecord = await AML.findByCustomerId(CUST_ID);
    if (!amlRecord) {
      return res.status(404).json({ success: false, message: 'AML record not found.' });
    }

    const oldValue = JSON.stringify(amlRecord.toJSON());
    
    await amlRecord.update({
      AML_STATUS: 'Rejected',
      updated_at: new Date()
    });

    auditLogger.info('Audit Event', {
      entity_type: 'AML_REJECTION', entity_id: amlRecord.id, user_id: USER_ID,
      action: 'Rejected AML record', old_value: oldValue,
      new_value: JSON.stringify(amlRecord.toJSON()), ip_address: ipAddress,
      event_type: 'AML_REJECTION', outcome: 'success',
      rejection_reason: rejectionReason, rejection_comments: comments
    });

    return res.status(200).json({
      success: true,
      message: 'AML record rejected successfully.',
      data: amlRecord.getBasicInfo()
    });
  } catch (error) {
    console.error('❌ AML Rejection Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject AML record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getAMLByCustId = async (req, res) => {
  try {
    const { custId } = req.params;
    
    if (!custId) {
      return res.status(400).json({ success: false, message: 'Customer ID is required' });
    }

    const amlRecord = await AML.findByCustomerId(custId);

    if (!amlRecord) {
      return res.status(404).json({ success: false, message: 'AML record not found.' });
    }

    return res.json({ success: true, data: amlRecord.getBasicInfo() });
  } catch (err) {
    console.error('Error fetching AML by CustId:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve AML record',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

export const getAllAMLRecords = async (req, res) => {
  try {
    const { status, riskRating, page = 1, limit = 20 } = req.query;
    
    const where = {};
    if (status) where.AML_STATUS = status;
    if (riskRating) where.CUSTOMER_RISK_RATING = riskRating;
    
    const offset = (page - 1) * limit;
    
    const { count, rows } = await AML.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['updated_at', 'DESC']]
    });
    
    const records = rows.map(record => record.getBasicInfo());

    return res.json({ 
      success: true, 
      data: records,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (err) {
    console.error('Error fetching all AML records:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve AML records',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

export const deleteAMLByCustId = async (req, res) => {
  try {
    const { custId } = req.params;
    const { USER_ID, reason } = req.body;

    if (!USER_ID || !reason) {
      return res.status(400).json({ success: false, message: 'USER_ID and deletion reason are required' });
    }

    const existing = await AML.findByCustomerId(custId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'AML record not found.' });
    }

    const oldValue = JSON.stringify(existing.toJSON());

    auditLogger.info('Audit Event', {
      entity_type: 'AML_DELETION', entity_id: existing.id, user_id: USER_ID,
      action: `Deleted AML record for customer ${custId}`, old_value: oldValue,
      new_value: null, ip_address: req.ip || 'unknown',
      event_type: 'AML_DELETION', outcome: 'success', reason: reason
    });

    await existing.destroy();

    return res.json({ success: true, message: 'AML record deleted successfully.' });
  } catch (err) {
    console.error('Error deleting AML by CustId:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to delete AML record',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// ==================== TRANSACTION AML FUNCTIONS ====================

export const getSuspiciousTransactions = async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const transactions = await sequelize.query(`
      SELECT * FROM deposit_transactions 
      WHERE aml_risk_level IN ('HIGH', 'CRITICAL')
      ORDER BY created_at DESC
      LIMIT :limit OFFSET :offset
    `, {
      replacements: { limit: parseInt(limit), offset: parseInt(offset) },
      type: QueryTypes.SELECT
    });
    
    res.json({ success: true, data: transactions, count: transactions.length });
  } catch (error) {
    console.error('Error fetching suspicious transactions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch suspicious transactions', error: error.message });
  }
};

export const getPendingAMLReviews = async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const transactions = await sequelize.query(`
      SELECT * FROM deposit_transactions 
      WHERE aml_risk_level IN ('MEDIUM', 'HIGH')
        AND status = 'PENDING'
      ORDER BY created_at DESC
      LIMIT :limit
    `, {
      replacements: { limit: parseInt(limit) },
      type: QueryTypes.SELECT
    });
    
    res.json({ success: true, data: transactions, count: transactions.length });
  } catch (error) {
    console.error('Error fetching pending AML reviews:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending AML reviews', error: error.message });
  }
};

export const approveTransaction = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { referenceNo } = req.params;
    const { approved_by, notes } = req.body;
    
    await sequelize.query(`
      UPDATE deposit_transactions 
      SET status = 'APPROVED',
          approved_by = :approvedBy,
          approved_at = NOW(),
          description = CONCAT(description, ' | AML Approved: ', :notes)
      WHERE transaction_ref_no = :referenceNo
    `, {
      replacements: { referenceNo, approvedBy: approved_by || req.user_id, notes: notes || 'Approved after AML review' },
      transaction
    });
    
    await transaction.commit();
    
    res.json({ success: true, message: 'Transaction approved successfully', reference_no: referenceNo });
  } catch (error) {
    await transaction.rollback();
    console.error('Error approving transaction:', error);
    res.status(500).json({ success: false, message: 'Failed to approve transaction', error: error.message });
  }
};

export const getAMLRiskStats = async (req, res) => {
  try {
    const stats = await AML.getStatistics();
    
    return res.json({ 
      success: true, 
      data: {
        total: stats.total,
        highRisk: stats.byRisk.high,
        mediumRisk: stats.byRisk.medium,
        lowRisk: stats.byRisk.low,
        pepCount: stats.pepCount,
        sanctionedCount: stats.sanctionMatches
      }
    });
  } catch (err) {
    console.error('Error fetching AML risk stats:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve AML statistics',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// ==================== EXPORTS ====================