// models/Guarantor.js - MySQL/Sequelize Version with AI-Powered Duplicate Detection
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class Guarantor extends Model {
  // ============================================
  // ✅ AI-POWERED DUPLICATE DETECTION
  // ============================================
  
  /**
   * Check if a guarantor has been used before with smart matching
   * Uses AI-like fuzzy matching to detect duplicates
   */
  static async findDuplicateGuarantors(guarantorData, threshold = 0.7) {
    const {
      fullName,
      phoneNumber,
      email,
      bvn,
      idNumber,
      address,
      dateOfBirth,
      state,
      localGovernment
    } = guarantorData;

    const results = {
      exactMatches: [],
      potentialMatches: [],
      aiScore: 0,
      isDuplicate: false,
      confidence: 0,
      matchedFields: [],
      suggestion: null
    };

    try {
      // 1. EXACT MATCHES - Highest priority
      const exactMatchConditions = [];
      
      if (bvn && bvn.length === 11) {
        exactMatchConditions.push({ bvn });
      }
      
      if (phoneNumber) {
        exactMatchConditions.push({ phone_number: phoneNumber });
      }
      
      if (email) {
        exactMatchConditions.push({ email });
      }
      
      if (idNumber) {
        exactMatchConditions.push({ id_number: idNumber });
      }

      if (exactMatchConditions.length > 0) {
        const exactMatches = await this.findAll({
          where: {
            [Op.or]: exactMatchConditions,
            is_active: true
          },
          attributes: [
            'id', 'guarantor_id', 'full_name', 'phone_number', 'email', 
            'bvn', 'status', 'verification_status', 'created_at',
            'loan_id', 'relationship_to_borrower', 'state', 'local_government'
          ]
        });

        if (exactMatches.length > 0) {
          results.exactMatches = exactMatches;
          results.isDuplicate = true;
          results.confidence = 1.0;
          results.aiScore = 1.0;
          results.suggestion = 'This guarantor already exists with exact match. Please use the existing record.';
          return results;
        }
      }

      // 2. FUZZY MATCHING - AI-like similarity detection
      const potentialMatchConditions = [];
      
      if (fullName) {
        // Split name into parts for fuzzy matching
        const nameParts = fullName.trim().split(/\s+/);
        const nameConditions = nameParts.map(part => ({
          full_name: { [Op.like]: `%${part}%` }
        }));
        potentialMatchConditions.push({
          [Op.or]: nameConditions
        });
      }
      
      if (phoneNumber) {
        // Match last 6 digits of phone (in case of formatting differences)
        const phoneLast6 = phoneNumber.slice(-6);
        potentialMatchConditions.push({
          phone_number: { [Op.like]: `%${phoneLast6}` }
        });
      }
      
      if (dateOfBirth) {
        potentialMatchConditions.push({ date_of_birth: dateOfBirth });
      }
      
      if (address) {
        // Match key parts of address
        const addressParts = address.split(',').map(part => part.trim());
        const addressConditions = addressParts.slice(0, 3).map(part => ({
          address: { [Op.like]: `%${part}%` }
        }));
        potentialMatchConditions.push({
          [Op.or]: addressConditions
        });
      }

      if (state) {
        potentialMatchConditions.push({ state });
      }
      
      if (localGovernment) {
        potentialMatchConditions.push({ local_government: localGovernment });
      }

      if (potentialMatchConditions.length > 0) {
        const potentialMatches = await this.findAll({
          where: {
            [Op.or]: potentialMatchConditions,
            is_active: true
          },
          attributes: [
            'id', 'guarantor_id', 'full_name', 'phone_number', 'email', 
            'bvn', 'status', 'verification_status', 'created_at',
            'loan_id', 'relationship_to_borrower', 'state', 'local_government',
            'address', 'date_of_birth', 'id_number'
          ],
          limit: 20
        });

        if (potentialMatches.length > 0) {
          // Calculate similarity score for each match
          const scoredMatches = potentialMatches.map(match => {
            let score = 0;
            const matchedFields = [];
            
            // Name similarity (40% weight)
            if (fullName && match.full_name) {
              const nameSimilarity = this.calculateSimilarity(fullName, match.full_name);
              if (nameSimilarity > 0.5) {
                score += nameSimilarity * 0.4;
                matchedFields.push('full_name');
              }
            }
            
            // Phone similarity (20% weight)
            if (phoneNumber && match.phone_number) {
              const phoneSimilarity = this.calculateSimilarity(phoneNumber, match.phone_number);
              if (phoneSimilarity > 0.5) {
                score += phoneSimilarity * 0.2;
                matchedFields.push('phone_number');
              }
            }
            
            // Email similarity (15% weight)
            if (email && match.email) {
              const emailSimilarity = this.calculateSimilarity(email, match.email);
              if (emailSimilarity > 0.5) {
                score += emailSimilarity * 0.15;
                matchedFields.push('email');
              }
            }
            
            // BVN match (10% weight)
            if (bvn && match.bvn && bvn === match.bvn) {
              score += 0.1;
              matchedFields.push('bvn');
            }
            
            // Address similarity (10% weight)
            if (address && match.address) {
              const addressSimilarity = this.calculateSimilarity(address, match.address);
              if (addressSimilarity > 0.3) {
                score += addressSimilarity * 0.1;
                matchedFields.push('address');
              }
            }
            
            // Date of Birth match (5% weight)
            if (dateOfBirth && match.date_of_birth) {
              const dobMatch = dateOfBirth === match.date_of_birth;
              if (dobMatch) {
                score += 0.05;
                matchedFields.push('date_of_birth');
              }
            }
            
            return {
              ...match.toJSON(),
              similarityScore: Math.round(score * 100) / 100,
              matchedFields,
              isHighMatch: score >= threshold
            };
          });

          // Filter high matches (above threshold)
          const highMatches = scoredMatches.filter(m => m.similarityScore >= threshold);
          const mediumMatches = scoredMatches.filter(m => m.similarityScore >= 0.4 && m.similarityScore < threshold);

          results.potentialMatches = scoredMatches;
          
          if (highMatches.length > 0) {
            results.isDuplicate = true;
            results.confidence = Math.max(...highMatches.map(m => m.similarityScore));
            results.aiScore = results.confidence;
            results.matchedFields = highMatches[0].matchedFields;
            results.suggestion = `⚠️ High similarity detected (${Math.round(results.confidence * 100)}% match). This guarantor may already exist. Please review the matched records below.`;
          } else if (mediumMatches.length > 0) {
            results.isDuplicate = false;
            results.confidence = Math.max(...mediumMatches.map(m => m.similarityScore));
            results.aiScore = results.confidence;
            results.suggestion = `ℹ️ Medium similarity detected (${Math.round(results.confidence * 100)}%). Please review potential matches below before proceeding.`;
          } else {
            results.isDuplicate = false;
            results.confidence = 0;
            results.suggestion = '✅ No significant matches found. You can proceed with creating this guarantor.';
          }
        } else {
          results.suggestion = '✅ No matches found. You can proceed with creating this guarantor.';
        }
      } else {
        results.suggestion = '✅ No matches found. You can proceed with creating this guarantor.';
      }

      return results;

    } catch (error) {
      console.error('Error in findDuplicateGuarantors:', error.message);
      throw error;
    }
  }

  /**
   * Calculate similarity between two strings (Levenshtein distance based)
   */
  static calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 1.0;
    if (s1.includes(s2) || s2.includes(s1)) return 0.85;
    
    // Calculate Levenshtein distance
    const len1 = s1.length;
    const len2 = s2.length;
    
    if (len1 === 0) return len2 === 0 ? 1.0 : 0;
    if (len2 === 0) return 0;
    
    const matrix = [];
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i-1] === s2[j-1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i-1][j] + 1,
          matrix[i][j-1] + 1,
          matrix[i-1][j-1] + cost
        );
      }
    }
    
    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    return maxLen === 0 ? 1.0 : 1 - (distance / maxLen);
  }

  /**
   * Validate guarantor with AI-powered duplicate detection
   * Returns validation result with suggestions
   */
  static async validateGuarantor(guarantorData, options = {}) {
    const { strictMode = true, threshold = 0.7 } = options;
    
    const validationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      duplicateCheck: null,
      suggestions: []
    };

    try {
      // 1. Basic validation
      if (!guarantorData.fullName) {
        validationResult.isValid = false;
        validationResult.errors.push('Full name is required');
      }
      
      if (!guarantorData.phoneNumber) {
        validationResult.isValid = false;
        validationResult.errors.push('Phone number is required');
      }
      
      if (!guarantorData.relationshipToBorrower) {
        validationResult.isValid = false;
        validationResult.errors.push('Relationship to borrower is required');
      }
      
      if (!guarantorData.state) {
        validationResult.isValid = false;
        validationResult.errors.push('State is required');
      }

      // 2. Phone number validation
      if (guarantorData.phoneNumber) {
        const phoneStr = String(guarantorData.phoneNumber).replace(/\D/g, '');
        if (phoneStr.length < 10 || phoneStr.length > 15) {
          validationResult.isValid = false;
          validationResult.errors.push('Phone number must be between 10 and 15 digits');
        }
      }

      // 3. Email validation
      if (guarantorData.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(guarantorData.email)) {
          validationResult.isValid = false;
          validationResult.errors.push('Invalid email format');
        }
      }

      // 4. BVN validation
      if (guarantorData.bvn) {
        const bvnStr = String(guarantorData.bvn).replace(/\D/g, '');
        if (bvnStr.length !== 11) {
          validationResult.isValid = false;
          validationResult.errors.push('BVN must be exactly 11 digits');
        }
      }

      // 5. AI-Powered duplicate detection
      if (guarantorData.fullName) {
        const duplicateResult = await this.findDuplicateGuarantors(guarantorData, threshold);
        validationResult.duplicateCheck = duplicateResult;
        
        if (duplicateResult.isDuplicate) {
          if (strictMode) {
            validationResult.isValid = false;
            validationResult.errors.push(duplicateResult.suggestion);
          } else {
            validationResult.warnings.push(duplicateResult.suggestion);
          }
          
          // Add matched guarantors as suggestions
          if (duplicateResult.exactMatches.length > 0) {
            duplicateResult.exactMatches.forEach(match => {
              validationResult.suggestions.push({
                type: 'exact_match',
                message: `Exact match found: ${match.full_name} (ID: ${match.guarantor_id})`,
                data: match
              });
            });
          }
          
          if (duplicateResult.potentialMatches.length > 0) {
            const highMatches = duplicateResult.potentialMatches.filter(m => m.isHighMatch);
            highMatches.forEach(match => {
              validationResult.suggestions.push({
                type: 'high_similarity',
                message: `High similarity (${Math.round(match.similarityScore * 100)}%): ${match.full_name} (ID: ${match.guarantor_id})`,
                data: match
              });
            });
          }
        }
      }

      return validationResult;

    } catch (error) {
      console.error('Error in validateGuarantor:', error.message);
      validationResult.isValid = false;
      validationResult.errors.push(error.message);
      return validationResult;
    }
  }

  // ============================================
  // ✅ EXISTING STATIC METHODS
  // ============================================

  static async createGuarantor(guarantorData) {
    try {
      // Validate before creation
      const validation = await this.validateGuarantor(guarantorData, { strictMode: true });
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Generate guarantor ID
      const guarantorId = await this.generateGuarantorId();
      
      if (guarantorData.verificationStatus === 'Verified') {
        if (!guarantorData.email) throw new Error('Email is required for verified guarantors');
        if (!guarantorData.verifiedBy) throw new Error('Verifier must be specified when status is Verified');
        if (!guarantorData.consentDate) guarantorData.consentDate = new Date();
      }
      
      const guarantor = await Guarantor.create({
        ...guarantorData,
        guarantor_id: guarantorId
      });
      return guarantor;
    } catch (error) {
      console.error('Error creating guarantor:', error.message);
      throw error;
    }
  }

  static async getActiveByLoan(loanId) {
    try {
      const guarantors = await Guarantor.findAll({
        where: { loan_id: loanId, is_active: true, status: 'ACTIVE' },
        order: [['created_at', 'DESC']]
      });
      return guarantors;
    } catch (error) {
      console.error('Error getting active guarantors by loan:', error.message);
      throw error;
    }
  }

  static async findPendingRemovals() {
    try {
      const [guarantors] = await sequelize.query(
        `SELECT * FROM guarantors 
         WHERE JSON_EXTRACT(removal_request, '$.status') = 'PENDING'
         AND is_active = 1 AND status = 'ACTIVE'`
      );
      return guarantors;
    } catch (error) {
      console.error('Error finding pending removals:', error.message);
      throw error;
    }
  }

  static async findByRemovalStatus(status) {
    try {
      const [guarantors] = await sequelize.query(
        `SELECT * FROM guarantors 
         WHERE JSON_EXTRACT(removal_request, '$.status') = ?
         ORDER BY created_at DESC`,
        { replacements: [status] }
      );
      return guarantors;
    } catch (error) {
      console.error('Error finding by removal status:', error.message);
      throw error;
    }
  }

  static async requestRemoval(guarantorId, requestData) {
    try {
      const guarantor = await Guarantor.findByPk(guarantorId);
      if (!guarantor) throw new Error('Guarantor not found');
      if (!guarantor.is_active) throw new Error('Guarantor is not active');

      const removalRequest = {
        requestedAt: new Date(),
        requestedBy: requestData.requestedBy,
        reason: requestData.reason,
        notes: requestData.notes || null,
        loanAccountNumber: requestData.loanAccountNumber,
        status: 'PENDING'
      };
      guarantor.removalRequest = removalRequest;
      await guarantor.save();
      return guarantor;
    } catch (error) {
      console.error('Error requesting removal:', error.message);
      throw error;
    }
  }

  static async approveRemoval(guarantorId, approvedBy) {
    try {
      const guarantor = await Guarantor.findByPk(guarantorId);
      if (!guarantor) throw new Error('Guarantor not found');
      if (!guarantor.removalRequest || guarantor.removalRequest.status !== 'PENDING')
        throw new Error('No pending removal request found');

      guarantor.removalRequest.status = 'APPROVED';
      guarantor.removalRequest.approvedBy = approvedBy;
      guarantor.removalRequest.approvedAt = new Date();
      guarantor.status = 'DEACTIVATED';
      guarantor.removedAt = new Date();
      guarantor.is_active = false;
      await guarantor.save();
      return guarantor;
    } catch (error) {
      console.error('Error approving removal:', error.message);
      throw error;
    }
  }

  static async rejectRemoval(guarantorId, rejectedBy, notes = null) {
    try {
      const guarantor = await Guarantor.findByPk(guarantorId);
      if (!guarantor) throw new Error('Guarantor not found');
      if (!guarantor.removalRequest || guarantor.removalRequest.status !== 'PENDING')
        throw new Error('No pending removal request found');

      guarantor.removalRequest.status = 'REJECTED';
      guarantor.removalRequest.notes = notes || guarantor.removalRequest.notes;
      guarantor.updated_by = rejectedBy;
      await guarantor.save();
      return guarantor;
    } catch (error) {
      console.error('Error rejecting removal:', error.message);
      throw error;
    }
  }

  static async getGuarantorStats(buId = null) {
    try {
      let whereClause = '';
      let replacements = [];
      if (buId) {
        whereClause = 'WHERE bu_id = ?';
        replacements = [buId];
      }
      const [stats] = await sequelize.query(`
        SELECT 
          COUNT(*) as total_guarantors,
          SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_guarantors,
          SUM(CASE WHEN verification_status = 'Verified' THEN 1 ELSE 0 END) as verified_guarantors,
          SUM(CASE WHEN verification_status = 'Pending' THEN 1 ELSE 0 END) as pending_verification,
          SUM(guaranteed_amount) as total_guaranteed_amount
        FROM guarantors 
        ${whereClause}
      `, { replacements });
      return stats[0];
    } catch (error) {
      console.error('Error getting guarantor stats:', error.message);
      throw error;
    }
  }

  static async initializeTable() {
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS guarantors (
          id INT AUTO_INCREMENT PRIMARY KEY,
          guarantor_id VARCHAR(7) UNIQUE NOT NULL,
          full_name VARCHAR(100) NOT NULL,
          phone_number VARCHAR(15) NOT NULL,
          relationship_to_borrower ENUM('Parent', 'Sibling', 'Spouse', 'Business Partner', 'Friend', 'Relative', 'Colleague', 'Other') NOT NULL,
          guaranteed_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
          created_by VARCHAR(50) NOT NULL,
          relationship_officer_name VARCHAR(100) NOT NULL,
          loan_id INT NULL,
          status ENUM('ACTIVE', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'DEACTIVATED') DEFAULT 'PENDING',
          email VARCHAR(100) NULL,
          address TEXT NULL,
          state VARCHAR(50) NOT NULL,
          local_government VARCHAR(50) NULL,
          bu_id VARCHAR(20) NOT NULL,
          country VARCHAR(50) DEFAULT 'Nigeria',
          id_type VARCHAR(50) NULL,
          id_number VARCHAR(50) NULL,
          bvn VARCHAR(11) NULL,
          date_of_birth DATE NULL,
          net_worth DECIMAL(15,2) DEFAULT 0.00,
          annual_income DECIMAL(15,2) DEFAULT 0.00,
          occupation VARCHAR(100) NULL,
          employment_type VARCHAR(50) NULL,
          verification_status ENUM('Pending', 'Verified', 'Rejected', 'Expired') DEFAULT 'Pending',
          verified_by VARCHAR(50) NULL,
          verification_date DATETIME NULL,
          consent_date DATETIME NULL,
          is_active BOOLEAN DEFAULT true,
          removed_at DATETIME NULL,
          removal_reason VARCHAR(255) NULL,
          updated_by VARCHAR(50) NULL,
          removal_request JSON NULL,
          version INT DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_guarantor_id (guarantor_id),
          INDEX idx_loan_active (loan_id, is_active),
          INDEX idx_bu_id (bu_id),
          INDEX idx_status (status),
          INDEX idx_verification_status (verification_status),
          CONSTRAINT fk_guarantor_loan FOREIGN KEY (loan_id) REFERENCES loan_accounts(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log('✅ Guarantors table initialized');
      return true;
    } catch (error) {
      console.error('Error initializing guarantors table:', error.message);
      return false;
    }
  }

  static async syncTable() {
    try {
      await Guarantor.sync({ alter: false });
      console.log('✅ Guarantor table synced');
      return true;
    } catch (error) {
      console.error('Error syncing Guarantor table:', error.message);
      return false;
    }
  }

  static async generateGuarantorId() {
    const lastGuarantor = await this.findOne({
      order: [['id', 'DESC']],
      attributes: ['guarantor_id']
    });
    
    if (!lastGuarantor) {
      return '1000001';
    }
    
    const lastId = parseInt(lastGuarantor.guarantor_id);
    const newId = lastId + 1;
    return newId.toString().padStart(7, '0');
  }

  static async findActiveById(id) {
    return await this.findOne({
      where: { id, is_active: true }
    });
  }

  static async searchGuarantors({ search, status, verificationStatus, buId, limit = 10, offset = 0 }) {
    const where = {};
    
    if (search) {
      where[Op.or] = [
        { full_name: { [Op.like]: `%${search}%` } },
        { phone_number: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { guarantor_id: { [Op.like]: `%${search}%` } },
        { state: { [Op.like]: `%${search}%` } },
        { local_government: { [Op.like]: `%${search}%` } }
      ];
    }
    
    if (status) where.status = status;
    if (verificationStatus) where.verification_status = verificationStatus;
    if (buId) where.bu_id = buId;
    
    const { count, rows } = await this.findAndCountAll({
      where,
      limit,
      offset,
      order: [['created_at', 'DESC']]
    });
    
    return { count, rows };
  }

  /**
   * Get guarantor usage history by BVN or Phone
   */
  static async getGuarantorUsageHistory(identifier) {
    try {
      const where = {};
      if (identifier.startsWith('0') || /^\d{10,15}$/.test(identifier)) {
        where.phone_number = identifier;
      } else if (identifier.length === 11 && /^\d{11}$/.test(identifier)) {
        where.bvn = identifier;
      } else {
        where.email = identifier;
      }

      const history = await this.findAll({
        where: {
          ...where,
          is_active: true
        },
        attributes: [
          'id', 'guarantor_id', 'full_name', 'phone_number', 'email',
          'bvn', 'status', 'loan_id', 'relationship_to_borrower',
          'created_at', 'guaranteed_amount'
        ],
        include: [{
          model: sequelize.models.LoanAccount,
          as: 'loan',
          attributes: ['id', 'loan_account_number', 'status'],
          required: false
        }]
      });

      return history;
    } catch (error) {
      console.error('Error getting guarantor usage history:', error.message);
      throw error;
    }
  }
}

// ========== Model Initialisation ==========
Guarantor.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'id'
    },
    guarantor_id: {
      type: DataTypes.STRING(7),
      allowNull: false,
      unique: true,
      validate: { is: /^\d{7}$/, len: [7, 7] },
      field: 'guarantor_id'
    },
    fullName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'full_name'
    },
    phoneNumber: {
      type: DataTypes.STRING(15),
      allowNull: false,
      validate: { is: /^\+?\d{10,15}$/ },
      field: 'phone_number'
    },
    relationshipToBorrower: {
      type: DataTypes.ENUM('Parent', 'Sibling', 'Spouse', 'Business Partner', 'Friend', 'Relative', 'Colleague', 'Other'),
      allowNull: false,
      field: 'relationship_to_borrower'
    },
    guaranteed_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
      field: 'guaranteed_amount'
    },
    createdBy: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'created_by'
    },
    relationshipOfficerName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'relationship_officer_name'
    },
    loanId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'loan_id'
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'DEACTIVATED'),
      defaultValue: 'PENDING',
      field: 'status'
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      validate: { isEmail: true },
      field: 'email'
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'address'
    },
    state: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'state'
    },
    localGovernment: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'local_government'
    },
    BU_ID: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'bu_id'
    },
    country: {
      type: DataTypes.STRING(50),
      defaultValue: 'Nigeria',
      field: 'country'
    },
    idType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'id_type'
    },
    idNumber: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'id_number'
    },
    bvn: {
      type: DataTypes.STRING(11),
      allowNull: true,
      validate: { is: /^\d{11}$/, len: [11, 11] },
      field: 'bvn'
    },
    dateOfBirth: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'date_of_birth'
    },
    netWorth: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      defaultValue: 0.00,
      field: 'net_worth'
    },
    annualIncome: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      defaultValue: 0.00,
      field: 'annual_income'
    },
    occupation: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'occupation'
    },
    employmentType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'employment_type'
    },
    verificationStatus: {
      type: DataTypes.ENUM('Pending', 'Verified', 'Rejected', 'Expired'),
      defaultValue: 'Pending',
      field: 'verification_status'
    },
    verifiedBy: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'verified_by'
    },
    verificationDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'verification_date'
    },
    consentDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'consent_date'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    },
    removedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'removed_at'
    },
    removalReason: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'removal_reason'
    },
    updatedBy: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'updated_by'
    },
    removalRequest: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      field: 'removal_request'
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'version'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      onUpdate: DataTypes.NOW,
      field: 'updated_at'
    }
  },
  {
    sequelize,
    modelName: 'Guarantor',
    tableName: 'guarantors',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false,
    indexes: [
      { unique: true, fields: ['guarantor_id'] },
      { fields: ['loan_id', 'is_active'] },
      { fields: ['bu_id'] },
      { fields: ['status'] },
      { fields: ['verification_status'] }
    ]
  }
);

export default Guarantor;
