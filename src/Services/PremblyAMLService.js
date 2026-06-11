// services/PremblyAMLService.js
import axios from 'axios';
import logger from '../utils/logger.js';

class PremblyAMLService {
  constructor() {
    this.baseURL = 'https://api.prembly.com/api/v1/verification/aml-screening';
    this.apiKey = process.env.PREMBLY_API_KEY || 'test_sk_9b1c2bafe7c3466fb0e433daab2ac87c';
    this.appId = process.env.PREMBLY_APP_ID;
  }

  /**
   * Check if a person is a Politically Exposed Person (PEP)
   * @param {Object} personData - Person details
   * @returns {Promise<Object>} PEP screening result
   */
  async checkPEP(personData) {
    const { first_name, middle_name, last_name, gender, date_of_birth, country } = personData;
    
    try {
      if (!this.appId) {
        throw new Error('Prembly App ID not configured');
      }

      const payload = {
        first_name: first_name?.toUpperCase(),
        last_name: last_name?.toUpperCase(),
        ...(middle_name && { middle_name: middle_name?.toUpperCase() }),
        ...(gender && { gender }),
        ...(date_of_birth && { date_of_birth }),
        ...(country && { country })
      };

      console.log('🔍 Checking PEP status for:', `${first_name} ${last_name}`);
      
      const response = await axios.post(
        `${this.baseURL}/pep/`,
        payload,
        {
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'x-api-key': this.apiKey,
            'app-id': this.appId
          },
          timeout: 30000
        }
      );

      console.log('✅ PEP check completed');
      return this.processAMLResponse(response.data, 'PEP');
      
    } catch (error) {
      console.error('❌ PEP check error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      return this.getFallbackResponse('PEP', error.message);
    }
  }

  /**
   * Check if a person is on Sanction list
   * @param {Object} personData - Person details
   * @returns {Promise<Object>} Sanction screening result
   */
  async checkSanction(personData) {
    const { first_name, middle_name, last_name } = personData;
    
    try {
      if (!this.appId) {
        throw new Error('Prembly App ID not configured');
      }

      const payload = {
        first_name: first_name?.toUpperCase(),
        last_name: last_name?.toUpperCase(),
        ...(middle_name && { middle_name: middle_name?.toUpperCase() })
      };

      console.log('🔍 Checking Sanction list for:', `${first_name} ${last_name}`);
      
      const response = await axios.post(
        `${this.baseURL}/sanction/`,
        payload,
        {
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'x-api-key': this.apiKey,
            'app-id': this.appId
          },
          timeout: 30000
        }
      );

      console.log('✅ Sanction check completed');
      return this.processAMLResponse(response.data, 'SANCTION');
      
    } catch (error) {
      console.error('❌ Sanction check error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      return this.getFallbackResponse('SANCTION', error.message);
    }
  }

  /**
   * Complete AML screening (both PEP and Sanction)
   * @param {Object} personData - Person details
   * @returns {Promise<Object>} Combined AML screening result
   */
  async fullAMLScreening(personData) {
    try {
      console.log('🔍 Starting full AML screening for:', `${personData.first_name} ${personData.last_name}`);
      
      // Run both checks in parallel
      const [pepResult, sanctionResult] = await Promise.all([
        this.checkPEP(personData),
        this.checkSanction(personData)
      ]);

      // Calculate overall risk level
      const overallRisk = this.calculateOverallRisk(pepResult, sanctionResult);
      
      const result = {
        success: true,
        timestamp: new Date().toISOString(),
        person: {
          first_name: personData.first_name,
          last_name: personData.last_name,
          middle_name: personData.middle_name,
          gender: personData.gender
        },
        pep_check: pepResult,
        sanction_check: sanctionResult,
        overall_risk: overallRisk,
        recommendation: this.getRecommendation(overallRisk),
        requires_approval: overallRisk.level === 'HIGH' || overallRisk.level === 'CRITICAL',
        requires_suspicious_report: overallRisk.level === 'CRITICAL'
      };

      console.log(`✅ AML screening complete - Risk Level: ${overallRisk.level}, Score: ${overallRisk.score}`);
      return result;
      
    } catch (error) {
      console.error('❌ AML screening error:', error.message);
      return {
        success: false,
        error: error.message,
        overall_risk: this.getFallbackRiskLevel(),
        pep_check: this.getFallbackResponse('PEP', error.message),
        sanction_check: this.getFallbackResponse('SANCTION', error.message)
      };
    }
  }

  /**
   * Process AML API response
   */
  processAMLResponse(response, type) {
    // Check if the response indicates a match
    const isMatch = response.status === true || 
                    response.data?.match === true ||
                    response.data?.is_match === true ||
                    response.data?.is_pep === true ||
                    response.data?.is_sanctioned === true;
    
    const riskScore = this.calculateRiskScoreFromResponse(response, isMatch);
    
    return {
      checked: true,
      timestamp: new Date().toISOString(),
      type: type,
      is_match: isMatch,
      risk_score: riskScore,
      risk_level: this.getRiskLevelFromScore(riskScore),
      details: response.data || response,
      raw_response: response,
      message: isMatch ? `Potential ${type} match found` : `No ${type} match found`
    };
  }

  /**
   * Calculate risk score from response
   */
  calculateRiskScoreFromResponse(response, isMatch) {
    if (!isMatch) return 0;
    
    // Extract confidence score if available
    let confidence = 0;
    if (response.data?.confidence_score) {
      confidence = parseFloat(response.data.confidence_score);
    } else if (response.data?.score) {
      confidence = parseFloat(response.data.score);
    } else if (response.data?.match_score) {
      confidence = parseFloat(response.data.match_score);
    } else {
      // Default scores based on match
      confidence = 70;
    }
    
    // Convert confidence to risk score (0-100)
    return Math.min(100, Math.max(0, confidence));
  }

  /**
   * Get risk level from score
   */
  getRiskLevelFromScore(score) {
    if (score >= 80) return 'CRITICAL';
    if (score >= 60) return 'HIGH';
    if (score >= 30) return 'MEDIUM';
    if (score > 0) return 'LOW';
    return 'NONE';
  }

  /**
   * Calculate overall risk from PEP and Sanction results
   */
  calculateOverallRisk(pepResult, sanctionResult) {
    const pepScore = pepResult.risk_score || 0;
    const sanctionScore = sanctionResult.risk_score || 0;
    
    // Highest score determines overall risk
    const overallScore = Math.max(pepScore, sanctionScore);
    const level = this.getRiskLevelFromScore(overallScore);
    
    return {
      score: overallScore,
      level: level,
      pep_score: pepScore,
      sanction_score: sanctionScore,
      pep_risk_level: pepResult.risk_level,
      sanction_risk_level: sanctionResult.risk_level
    };
  }

  /**
   * Get recommendation based on risk level
   */
  getRecommendation(risk) {
    switch (risk.level) {
      case 'CRITICAL':
        return 'Transaction blocked. Customer flagged for suspicious activity. Requires immediate investigation and SAR filing.';
      case 'HIGH':
        return 'Transaction requires senior management approval. Enhanced due diligence required.';
      case 'MEDIUM':
        return 'Transaction requires supervisor approval. Additional verification recommended.';
      case 'LOW':
        return 'Transaction can proceed. Standard monitoring applies.';
      default:
        return 'Transaction can proceed. Standard due diligence completed.';
    }
  }

  /**
   * Get fallback risk level when API fails
   */
  getFallbackRiskLevel() {
    return {
      score: 10,
      level: 'LOW',
      message: 'Default low risk - API check failed'
    };
  }

  /**
   * Get fallback response when API call fails
   */
  getFallbackResponse(type, errorMessage) {
    return {
      checked: false,
      timestamp: new Date().toISOString(),
      type: type,
      is_match: false,
      risk_score: 0,
      risk_level: 'LOW',
      error: errorMessage,
      message: `Unable to complete ${type} check. Defaulting to low risk.`
    };
  }

  /**
   * Get customer AML summary for a transaction
   */
  async getCustomerAMLRisk(customerData) {
    const mandatoryFields = ['first_name', 'last_name'];
    const missingFields = mandatoryFields.filter(field => !customerData[field]);
    
    if (missingFields.length > 0) {
      console.warn('⚠️ Missing required fields for AML check:', missingFields);
      return {
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
        overall_risk: this.getFallbackRiskLevel(),
        requires_approval: false,
        requires_suspicious_report: false
      };
    }
    
    return await this.fullAMLScreening(customerData);
  }

  /**
   * Validate customer before transaction
   */
  async validateCustomerForTransaction(customerData, amount) {
    const amlResult = await this.getCustomerAMLRisk(customerData);
    
    // Adjust risk based on transaction amount
    let finalRisk = amlResult.overall_risk;
    if (amount > 10000000) { // Over 10 million NGN
      finalRisk.score = Math.min(100, finalRisk.score + 20);
      finalRisk.level = this.getRiskLevelFromScore(finalRisk.score);
    } else if (amount > 5000000) { // Over 5 million NGN
      finalRisk.score = Math.min(100, finalRisk.score + 10);
      finalRisk.level = this.getRiskLevelFromScore(finalRisk.score);
    }
    
    return {
      ...amlResult,
      final_risk: finalRisk,
      transaction_amount: amount,
      can_proceed: finalRisk.level !== 'CRITICAL',
      requires_approval: finalRisk.level === 'HIGH' || finalRisk.level === 'CRITICAL',
      requires_suspicious_report: finalRisk.level === 'CRITICAL'
    };
  }
}

export default new PremblyAMLService();