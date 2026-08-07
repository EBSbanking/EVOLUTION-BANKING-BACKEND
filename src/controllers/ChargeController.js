// controllers/ChargeController.js – with multi‑tier support + VAT & WHT
import { Op } from 'sequelize';
import Charge from '../models/Charge.js';
import ChargeTier from '../models/ChargeTier.js';

const ChargeController = {
  // ==================== TRANSFORM REQUEST ====================
  transformChargeRequest: (body) => {
    const transformed = { ...body };
    
    const getValue = (camelKey, snakeKey) => {
      if (body[camelKey] !== undefined) return body[camelKey];
      if (body[snakeKey] !== undefined) return body[snakeKey];
      return undefined;
    };

    if (body.chargeType) {
      transformed.CHRG_TY = body.chargeType.toUpperCase();
      delete transformed.chargeType;
    }
    if (body.chargeAmount !== undefined) {
      transformed.CHRG_AMT = parseFloat(body.chargeAmount);
      delete transformed.chargeAmount;
    }
    if (body.chargePercentage !== undefined) {
      transformed.CHRG_PCT = parseFloat(body.chargePercentage);
      delete transformed.chargePercentage;
    }
    if (body.chargeGLAccountNo) {
      transformed.INCOME_GL_ACCT_NO = body.chargeGLAccountNo;
      delete transformed.chargeGLAccountNo;
    }
    if (body.chargeCode) {
      transformed.CHRG_CD = body.chargeCode;
      delete transformed.chargeCode;
    }
    if (body.chargeName) {
      transformed.CHRG_NM = body.chargeName;
      delete transformed.chargeName;
    }
    if (body.chargeDescription) {
      transformed.CHRG_DESC = body.chargeDescription;
      delete transformed.chargeDescription;
    }
    if (body.chargeId) {
      transformed.CHRG_ID = body.chargeId;
      delete transformed.chargeId;
    }
    if (body.status) {
      transformed.REC_ST = body.status;
      delete transformed.status;
    }

    // Tier fields – legacy single‑tier support
    const minAmount = getValue('minAmount', 'min_amount');
    if (minAmount !== undefined) transformed.MIN_AMOUNT = parseFloat(minAmount);
    const maxAmount = getValue('maxAmount', 'max_amount');
    if (maxAmount !== undefined) transformed.MAX_AMOUNT = parseFloat(maxAmount);
    const feeType = getValue('feeType', 'fee_type');
    if (feeType !== undefined) transformed.FEE_TYPE = feeType;
    const feeAmount = getValue('feeAmount', 'fee_amount');
    if (feeAmount !== undefined) transformed.FEE_AMOUNT = parseFloat(feeAmount);
    const feePercentage = getValue('feePercentage', 'fee_percentage');
    if (feePercentage !== undefined) transformed.FEE_PERCENTAGE = parseFloat(feePercentage);

    // Remove temporary fields
    delete transformed.minAmount;
    delete transformed.min_amount;
    delete transformed.maxAmount;
    delete transformed.max_amount;
    delete transformed.feeType;
    delete transformed.fee_type;
    delete transformed.feeAmount;
    delete transformed.fee_amount;
    delete transformed.feePercentage;
    delete transformed.fee_percentage;

    // Preserve tiers array for multi‑tier (not transformed to db columns here)
    if (body.tiers && Array.isArray(body.tiers)) {
      transformed._tiers = body.tiers;
      // Clear legacy single‑tier fields if multi‑tier is present
      delete transformed.MIN_AMOUNT;
      delete transformed.MAX_AMOUNT;
      delete transformed.FEE_TYPE;
      delete transformed.FEE_AMOUNT;
      delete transformed.FEE_PERCENTAGE;
    }

    // ==================== VAT TRANSFORMATIONS ====================
    if (body.isVATApplicable !== undefined) {
      transformed.IS_VAT_APPLICABLE = body.isVATApplicable;
      delete transformed.isVATApplicable;
    }
    if (body.vatRate !== undefined) {
      transformed.VAT_RATE = parseFloat(body.vatRate);
      delete transformed.vatRate;
    }
    if (body.vatGLAccountNo !== undefined) {
      transformed.VAT_GL_ACCOUNT_NO = body.vatGLAccountNo;
      delete transformed.vatGLAccountNo;
    }
    
    // ==================== WHT TRANSFORMATIONS ====================
    if (body.isWHTApplicable !== undefined) {
      transformed.IS_WHT_APPLICABLE = body.isWHTApplicable;
      delete transformed.isWHTApplicable;
    }
    if (body.whtRate !== undefined) {
      transformed.WHT_RATE = parseFloat(body.whtRate);
      delete transformed.whtRate;
    }
    if (body.whtGLAccountNo !== undefined) {
      transformed.WHT_GL_ACCOUNT_NO = body.whtGLAccountNo;
      delete transformed.whtGLAccountNo;
    }
    if (body.whtType !== undefined) {
      transformed.WHT_TYPE = body.whtType;
      delete transformed.whtType;
    }

    // ✅ CRITICAL FIX: For FLAT and PERCENTAGE, clear ALL tier-related fields
    // This prevents FEE_TYPE from being carried over from a previous selection
    if (transformed.TIER_TY === 'FLAT' || transformed.TIER_TY === 'PERCENTAGE') {
      transformed.FEE_TYPE = null;
      transformed.FEE_AMOUNT = null;
      transformed.FEE_PERCENTAGE = null;
      transformed.MIN_AMOUNT = null;
      transformed.MAX_AMOUNT = null;
      // Also clear any tiers that might have been sent
      delete transformed._tiers;
    }

    return transformed;
  },

  // ==================== VALIDATE TIERS ====================
  validateTiers: (tiers) => {
    if (!tiers || tiers.length === 0) {
      throw new Error('At least one tier is required for RANGE charge');
    }
    // Sort by minAmount
    const sorted = [...tiers].sort((a, b) => a.minAmount - b.minAmount);
    
    // First tier must start at 0
    if (sorted[0].minAmount !== 0) {
      throw new Error('First tier must have minAmount = 0');
    }
    
    for (let i = 0; i < sorted.length; i++) {
      const tier = sorted[i];
      const min = parseFloat(tier.minAmount);
      const max = tier.maxAmount ? parseFloat(tier.maxAmount) : null;
      
      if (isNaN(min) || min < 0) {
        throw new Error(`Tier ${i+1}: minAmount must be >= 0`);
      }
      if (max !== null && max <= min) {
        throw new Error(`Tier ${i+1}: maxAmount must be > minAmount`);
      }
      if (i > 0 && min <= sorted[i-1].maxAmount) {
        throw new Error(`Tier ${i+1}: minAmount (${min}) must be greater than previous tier's max (${sorted[i-1].maxAmount})`);
      }
      if (tier.feeType === 'FIXED') {
        if (!tier.feeAmount || parseFloat(tier.feeAmount) <= 0) {
          throw new Error(`Tier ${i+1}: FIXED fee requires positive feeAmount`);
        }
      } else if (tier.feeType === 'PERCENTAGE') {
        if (!tier.feePercentage || parseFloat(tier.feePercentage) <= 0) {
          throw new Error(`Tier ${i+1}: PERCENTAGE fee requires positive feePercentage`);
        }
      } else {
        throw new Error(`Tier ${i+1}: feeType must be FIXED or PERCENTAGE`);
      }
    }
    return sorted;
  },

  // ==================== TRANSFORM TO SIMPLIFIED FORMAT ====================
  transformToSimplifiedFormat: (charge) => {
    const base = {
      chargeId: charge.CHRG_ID,
      chargeCode: charge.CHRG_CD,
      chargeType: charge.CHRG_TY,
      chargeName: charge.CHRG_NM,
      chargeAmount: charge.CHRG_AMT ? parseFloat(charge.CHRG_AMT.toString()) : null,
      chargePercentage: charge.CHRG_PCT ? parseFloat(charge.CHRG_PCT.toString()) : null,
      chargeGLAccountNo: charge.INCOME_GL_ACCT_NO,
      status: charge.REC_ST,
      description: charge.CHRG_DESC,
      tierType: charge.TIER_TY,
      calculationBasis: charge.CALC_BASIS_TY,
      settlementOption: charge.SETLMNT_OPTN,
      currencyId: charge.CRNCY_ID,
      effectiveDate: charge.EFFECTIVE_DT,
      version: charge.VERSION_NO,
      // VAT fields
      isVATApplicable: charge.IS_VAT_APPLICABLE || false,
      vatRate: charge.VAT_RATE ? parseFloat(charge.VAT_RATE) : 7.5,
      vatGLAccountNo: charge.VAT_GL_ACCOUNT_NO || null,
      // WHT fields
      isWHTApplicable: charge.IS_WHT_APPLICABLE || false,
      whtRate: charge.WHT_RATE ? parseFloat(charge.WHT_RATE) : 5,
      whtGLAccountNo: charge.WHT_GL_ACCOUNT_NO || null,
      whtType: charge.WHT_TYPE || 'CORPORATE',
    };
    
    if (charge.TIER_TY === 'RANGE') {
      if (charge.tiers && Array.isArray(charge.tiers)) {
        // Multi‑tier data
        base.tiers = charge.tiers.map(t => ({
          minAmount: parseFloat(t.min_amount),
          maxAmount: t.max_amount ? parseFloat(t.max_amount) : null,
          feeType: t.fee_type,
          feeAmount: t.fee_amount ? parseFloat(t.fee_amount) : null,
          feePercentage: t.fee_percentage ? parseFloat(t.fee_percentage) : null
        }));
      } else {
        // Legacy single‑tier fallback
        base.minAmount = charge.MIN_AMOUNT ? parseFloat(charge.MIN_AMOUNT) : null;
        base.maxAmount = charge.MAX_AMOUNT ? parseFloat(charge.MAX_AMOUNT) : null;
        base.feeType = charge.FEE_TYPE;
        base.feeAmount = charge.FEE_AMOUNT ? parseFloat(charge.FEE_AMOUNT) : null;
        base.feePercentage = charge.FEE_PERCENTAGE ? parseFloat(charge.FEE_PERCENTAGE) : null;
      }
    }
    return base;
  },

  // ==================== CREATE CHARGE ====================
// ==================== CREATE CHARGE ====================
createCharge: async (req, res) => {
  try {
    const transformedBody = ChargeController.transformChargeRequest(req.body);
    delete transformedBody.CHRG_ID;

    // Validate required fields
    const requiredFields = ['CHRG_CD', 'CHRG_TY', 'TIER_TY', 'VERSION_NO', 'USER_ID', 'CREATED_BY', 'BAL_ACTION_CD'];
    const missing = requiredFields.filter(f => !transformedBody[f]);
    if (missing.length) {
      return res.status(400).json({ success: false, message: `Missing: ${missing.join(', ')}` });
    }

    // Log incoming data for debugging
    console.log('📥 Incoming transformed body:', JSON.stringify({
      TIER_TY: transformedBody.TIER_TY,
      FEE_TYPE: transformedBody.FEE_TYPE,
      FEE_AMOUNT: transformedBody.FEE_AMOUNT,
      FEE_PERCENTAGE: transformedBody.FEE_PERCENTAGE,
      MIN_AMOUNT: transformedBody.MIN_AMOUNT,
      MAX_AMOUNT: transformedBody.MAX_AMOUNT,
      CHRG_AMT: transformedBody.CHRG_AMT,
      CHRG_PCT: transformedBody.CHRG_PCT,
      has_tiers: transformedBody._tiers ? transformedBody._tiers.length : 0
    }, null, 2));

    // FLAT / PERCENTAGE validation
    if (transformedBody.TIER_TY === 'FLAT') {
      if (!transformedBody.CHRG_AMT || transformedBody.CHRG_AMT <= 0) {
        return res.status(400).json({ success: false, message: 'For FLAT charges, CHRG_AMT > 0 required' });
      }
      transformedBody.CHRG_PCT = null;
      transformedBody.MIN_AMOUNT = null;
      transformedBody.MAX_AMOUNT = null;
      transformedBody.FEE_TYPE = null;
      transformedBody.FEE_AMOUNT = null;
      transformedBody.FEE_PERCENTAGE = null;
      delete transformedBody._tiers;
    } 
    else if (transformedBody.TIER_TY === 'PERCENTAGE') {
      if (!transformedBody.CHRG_PCT || transformedBody.CHRG_PCT <= 0) {
        return res.status(400).json({ success: false, message: 'For PERCENTAGE charges, CHRG_PCT > 0 required' });
      }
      transformedBody.CHRG_AMT = null;
      transformedBody.MIN_AMOUNT = null;
      transformedBody.MAX_AMOUNT = null;
      transformedBody.FEE_TYPE = null;
      transformedBody.FEE_AMOUNT = null;
      transformedBody.FEE_PERCENTAGE = null;
      delete transformedBody._tiers;
    } 
    else if (transformedBody.TIER_TY === 'RANGE') {
      if (transformedBody._tiers && Array.isArray(transformedBody._tiers) && transformedBody._tiers.length > 0) {
        try {
          const validatedTiers = ChargeController.validateTiers(transformedBody._tiers);
          transformedBody._tiers = validatedTiers;
          transformedBody.MIN_AMOUNT = null;
          transformedBody.MAX_AMOUNT = null;
          transformedBody.FEE_TYPE = null;
          transformedBody.FEE_AMOUNT = null;
          transformedBody.FEE_PERCENTAGE = null;
          transformedBody.CHRG_AMT = null;
          transformedBody.CHRG_PCT = null;
        } catch (err) {
          return res.status(400).json({ success: false, message: err.message });
        }
      } else {
        const minAmount = transformedBody.MIN_AMOUNT;
        const maxAmount = transformedBody.MAX_AMOUNT;
        let feeType = transformedBody.FEE_TYPE;
        let feeAmount = transformedBody.FEE_AMOUNT;
        let feePercentage = transformedBody.FEE_PERCENTAGE;

        if (minAmount === undefined || minAmount === null || minAmount === '') {
          return res.status(400).json({ success: false, message: 'RANGE charges require minAmount/min_amount' });
        }
        if (parseFloat(minAmount) < 0) {
          return res.status(400).json({ success: false, message: 'Minimum amount cannot be negative' });
        }
        if (maxAmount !== undefined && maxAmount !== null && maxAmount !== '' && parseFloat(maxAmount) <= parseFloat(minAmount)) {
          return res.status(400).json({ success: false, message: 'MAX_AMOUNT must be greater than MIN_AMOUNT' });
        }
        if (!feeType) {
          return res.status(400).json({ success: false, message: 'RANGE charges require feeType/fee_type (FIXED or PERCENTAGE)' });
        }
        
        if (feeType === 'FIXED') {
          if (feeAmount === undefined || feeAmount === null || feeAmount === '' || parseFloat(feeAmount) <= 0) {
            return res.status(400).json({ 
              success: false, 
              message: 'FIXED fee requires positive feeAmount/fee_amount' 
            });
          }
          transformedBody.FEE_AMOUNT = parseFloat(feeAmount);
          transformedBody.FEE_PERCENTAGE = null;
        } else if (feeType === 'PERCENTAGE') {
          if (feePercentage === undefined || feePercentage === null || feePercentage === '' || parseFloat(feePercentage) <= 0) {
            return res.status(400).json({ 
              success: false, 
              message: 'PERCENTAGE fee requires positive feePercentage/fee_percentage' 
            });
          }
          transformedBody.FEE_PERCENTAGE = parseFloat(feePercentage);
          transformedBody.FEE_AMOUNT = null;
        } else {
          return res.status(400).json({ success: false, message: 'feeType/fee_type must be FIXED or PERCENTAGE' });
        }
        
        transformedBody.CHRG_AMT = null;
        transformedBody.CHRG_PCT = null;
        transformedBody.MIN_AMOUNT = parseFloat(minAmount);
        transformedBody.MAX_AMOUNT = (maxAmount && maxAmount !== '') ? parseFloat(maxAmount) : null;
        transformedBody.FEE_TYPE = feeType;
      }
    }

    // ==================== VAT VALIDATION ====================
    if (transformedBody.IS_VAT_APPLICABLE) {
      if (!transformedBody.VAT_RATE || transformedBody.VAT_RATE <= 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'VAT rate must be greater than 0 when VAT is applicable' 
        });
      }
      if (!transformedBody.VAT_GL_ACCOUNT_NO) {
        return res.status(400).json({ 
          success: false, 
          message: 'VAT GL account is required when VAT is applicable' 
        });
      }
    }

    // ==================== WHT VALIDATION ====================
    if (transformedBody.IS_WHT_APPLICABLE) {
      if (!transformedBody.WHT_RATE || transformedBody.WHT_RATE <= 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'WHT rate must be greater than 0 when WHT is applicable' 
        });
      }
      if (!transformedBody.WHT_GL_ACCOUNT_NO) {
        return res.status(400).json({ 
          success: false, 
          message: 'WHT GL account is required when WHT is applicable' 
        });
      }
      if (!transformedBody.WHT_TYPE) {
        return res.status(400).json({ 
          success: false, 
          message: 'WHT type is required when WHT is applicable' 
        });
      }
    }

    // Check duplicate charge code
    const existing = await Charge.findOne({ where: { CHRG_CD: transformedBody.CHRG_CD } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Charge code already exists' });
    }

    // ✅ CRITICAL: Log the EXACT data being sent to Sequelize
    console.log('🔴 EXACT DATA FOR SEQUELIZE:', JSON.stringify({
      CHRG_CD: transformedBody.CHRG_CD,
      CHRG_TY: transformedBody.CHRG_TY,
      CHRG_NM: transformedBody.CHRG_NM,
      TIER_TY: transformedBody.TIER_TY,
      CHRG_AMT: transformedBody.CHRG_AMT,
      CHRG_PCT: transformedBody.CHRG_PCT,
      FEE_TYPE: transformedBody.FEE_TYPE,
      FEE_AMOUNT: transformedBody.FEE_AMOUNT,
      FEE_PERCENTAGE: transformedBody.FEE_PERCENTAGE,
      MIN_AMOUNT: transformedBody.MIN_AMOUNT,
      MAX_AMOUNT: transformedBody.MAX_AMOUNT,
      IS_VAT_APPLICABLE: transformedBody.IS_VAT_APPLICABLE,
      VAT_RATE: transformedBody.VAT_RATE,
      VAT_GL_ACCOUNT_NO: transformedBody.VAT_GL_ACCOUNT_NO,
      IS_WHT_APPLICABLE: transformedBody.IS_WHT_APPLICABLE,
      WHT_RATE: transformedBody.WHT_RATE,
      WHT_GL_ACCOUNT_NO: transformedBody.WHT_GL_ACCOUNT_NO,
      WHT_TYPE: transformedBody.WHT_TYPE,
      BAL_ACTION_CD: transformedBody.BAL_ACTION_CD,
      CHRG_DESC: transformedBody.CHRG_DESC,
      CRNCY_ID: transformedBody.CRNCY_ID,
      VERSION_NO: transformedBody.VERSION_NO,
      USER_ID: transformedBody.USER_ID,
      CREATED_BY: transformedBody.CREATED_BY,
      has_tiers: transformedBody._tiers ? transformedBody._tiers.length : 0
    }, null, 2));

    // ✅ Also log the model's default values for comparison
    console.log('🔴 CHARGE MODEL DEFAULTS:', {
      FEE_TYPE: Charge.rawAttributes.FEE_TYPE.defaultValue,
      FEE_AMOUNT: Charge.rawAttributes.FEE_AMOUNT.defaultValue,
      FEE_PERCENTAGE: Charge.rawAttributes.FEE_PERCENTAGE.defaultValue,
      MIN_AMOUNT: Charge.rawAttributes.MIN_AMOUNT.defaultValue,
      MAX_AMOUNT: Charge.rawAttributes.MAX_AMOUNT.defaultValue,
    });

    // Create charge
    const charge = await Charge.create(transformedBody);

    // Create tiers if multi‑tier
    if (transformedBody.TIER_TY === 'RANGE' && transformedBody._tiers && transformedBody._tiers.length) {
      const tierRecords = transformedBody._tiers.map(tier => ({
        charge_id: charge.CHRG_ID,
        min_amount: tier.minAmount,
        max_amount: tier.maxAmount || null,
        fee_type: tier.feeType,
        fee_amount: tier.feeType === 'FIXED' ? tier.feeAmount : null,
        fee_percentage: tier.feeType === 'PERCENTAGE' ? tier.feePercentage : null
      }));
      await ChargeTier.bulkCreate(tierRecords);
    }

    // Fetch charge with tiers for response
    const fullCharge = await Charge.findByPk(charge.CHRG_ID, {
      include: [{ model: ChargeTier, as: 'tiers' }]
    });

    res.status(201).json({
      success: true,
      message: 'Charge created',
      data: ChargeController.transformToSimplifiedFormat(fullCharge)
    });
  } catch (error) {
    console.error('Create Charge Error:', error);
    
    // Handle specific database errors
    if (error.name === 'SequelizeDatabaseError') {
      if (error.message.includes('FEE_AMOUNT')) {
        return res.status(400).json({ 
          success: false, 
          message: 'FEE_AMOUNT is required when FEE_TYPE is FIXED. Please provide a positive fee amount.' 
        });
      }
      if (error.message.includes('FEE_PERCENTAGE')) {
        return res.status(400).json({ 
          success: false, 
          message: 'FEE_PERCENTAGE is required when FEE_TYPE is PERCENTAGE. Please provide a positive percentage.' 
        });
      }
    }
    
    res.status(500).json({ success: false, message: 'Error creating charge', error: error.message });
  }
},
  // ==================== GET ALL CHARGES ====================
  getAllCharges: async (req, res) => {
    try {
      const { page = 1, limit = 10, sortBy = 'CHRG_CD', sortOrder = 'ASC', search, recSt, chrgTy, tierTy, format = 'oracle' } = req.query;
      const where = {};
      if (recSt) where.REC_ST = recSt;
      if (chrgTy) where.CHRG_TY = chrgTy;
      if (tierTy) where.TIER_TY = tierTy;
      if (search) {
        where[Op.or] = [
          { CHRG_CD: { [Op.like]: `%${search}%` } },
          { CHRG_NM: { [Op.like]: `%${search}%` } },
          { CHRG_DESC: { [Op.like]: `%${search}%` } }
        ];
      }
      const offset = (page - 1) * limit;
      const { count, rows } = await Charge.findAndCountAll({
        where,
        order: [[sortBy, sortOrder.toUpperCase()]],
        limit: parseInt(limit),
        offset: parseInt(offset),
        include: [{ model: ChargeTier, as: 'tiers', required: false }]
      });
      let data = rows;
      if (format === 'simplified') data = rows.map(c => ChargeController.transformToSimplifiedFormat(c));
      res.status(200).json({ success: true, data, pagination: { page: parseInt(page), totalPages: Math.ceil(count / limit), total: count, limit: parseInt(limit) } });
    } catch (error) {
      console.error('Get All Charges Error:', error);
      res.status(500).json({ success: false, message: 'Error fetching charges', error: error.message });
    }
  },

  // ==================== GET CHARGE BY ID ====================
  getChargeById: async (req, res) => {
    try {
      const { format = 'oracle' } = req.query;
      const charge = await Charge.findOne({
        where: { CHRG_ID: parseInt(req.params.id) },
        include: [{ model: ChargeTier, as: 'tiers', required: false }]
      });
      if (!charge) return res.status(404).json({ success: false, message: 'Charge not found' });
      let data = charge;
      if (format === 'simplified') data = ChargeController.transformToSimplifiedFormat(charge);
      res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('Get Charge By ID Error:', error);
      res.status(500).json({ success: false, message: 'Error fetching charge', error: error.message });
    }
  },

  // ==================== UPDATE CHARGE ====================
  updateCharge: async (req, res) => {
    try {
      const { id } = req.params;
      const { format = 'oracle' } = req.query;
      const transformed = ChargeController.transformChargeRequest(req.body);
      const existing = await Charge.findOne({ where: { CHRG_ID: parseInt(id) } });
      if (!existing) return res.status(404).json({ success: false, message: 'Charge not found' });
      if (transformed.CHRG_CD && transformed.CHRG_CD !== existing.CHRG_CD) {
        return res.status(400).json({ success: false, message: 'Cannot change CHRG_CD' });
      }
      delete transformed.CHRG_ID;

      const newTier = transformed.TIER_TY || existing.TIER_TY;

      // FLAT update
      if (newTier === 'FLAT') {
        const amount = transformed.CHRG_AMT !== undefined ? transformed.CHRG_AMT : existing.CHRG_AMT;
        if (!amount || amount <= 0) {
          return res.status(400).json({ success: false, message: 'FLAT charge requires CHRG_AMT > 0' });
        }
        transformed.CHRG_PCT = null;
        transformed.MIN_AMOUNT = null;
        transformed.MAX_AMOUNT = null;
        transformed.FEE_TYPE = null;
        transformed.FEE_AMOUNT = null;
        transformed.FEE_PERCENTAGE = null;
        await ChargeTier.destroy({ where: { charge_id: id } });
      } 
      // PERCENTAGE update
      else if (newTier === 'PERCENTAGE') {
        const pct = transformed.CHRG_PCT !== undefined ? transformed.CHRG_PCT : existing.CHRG_PCT;
        if (!pct || pct <= 0) {
          return res.status(400).json({ success: false, message: 'PERCENTAGE charge requires CHRG_PCT > 0' });
        }
        transformed.CHRG_AMT = null;
        transformed.MIN_AMOUNT = null;
        transformed.MAX_AMOUNT = null;
        transformed.FEE_TYPE = null;
        transformed.FEE_AMOUNT = null;
        transformed.FEE_PERCENTAGE = null;
        await ChargeTier.destroy({ where: { charge_id: id } });
      } 
      // RANGE update – multi‑tier or legacy single‑tier
      else if (newTier === 'RANGE') {
        // Check for multi‑tier payload
        if (transformed._tiers && Array.isArray(transformed._tiers)) {
          try {
            const validatedTiers = ChargeController.validateTiers(transformed._tiers);
            await ChargeTier.destroy({ where: { charge_id: id } });
            const tierRecords = validatedTiers.map(tier => ({
              charge_id: id,
              min_amount: tier.minAmount,
              max_amount: tier.maxAmount || null,
              fee_type: tier.feeType,
              fee_amount: tier.feeType === 'FIXED' ? tier.feeAmount : null,
              fee_percentage: tier.feeType === 'PERCENTAGE' ? tier.feePercentage : null
            }));
            await ChargeTier.bulkCreate(tierRecords);
            transformed.CHRG_AMT = null;
            transformed.CHRG_PCT = null;
            transformed.MIN_AMOUNT = null;
            transformed.MAX_AMOUNT = null;
            transformed.FEE_TYPE = null;
            transformed.FEE_AMOUNT = null;
            transformed.FEE_PERCENTAGE = null;
          } catch (err) {
            return res.status(400).json({ success: false, message: err.message });
          }
        } else {
          // Legacy single‑tier update
          const minAmount = transformed.MIN_AMOUNT !== undefined ? transformed.MIN_AMOUNT : existing.MIN_AMOUNT;
          const maxAmount = transformed.MAX_AMOUNT !== undefined ? transformed.MAX_AMOUNT : existing.MAX_AMOUNT;
          let feeType = transformed.FEE_TYPE !== undefined ? transformed.FEE_TYPE : existing.FEE_TYPE;
          let feeAmount = transformed.FEE_AMOUNT !== undefined ? transformed.FEE_AMOUNT : existing.FEE_AMOUNT;
          let feePercentage = transformed.FEE_PERCENTAGE !== undefined ? transformed.FEE_PERCENTAGE : existing.FEE_PERCENTAGE;

          if (minAmount === undefined || minAmount === null || minAmount === '') {
            return res.status(400).json({ success: false, message: 'RANGE charges require minAmount/min_amount' });
          }
          if (parseFloat(minAmount) < 0) {
            return res.status(400).json({ success: false, message: 'Minimum amount cannot be negative' });
          }
          if (maxAmount !== undefined && maxAmount !== null && maxAmount !== '' && parseFloat(maxAmount) <= parseFloat(minAmount)) {
            return res.status(400).json({ success: false, message: 'MAX_AMOUNT must be greater than MIN_AMOUNT' });
          }
          if (!feeType) {
            return res.status(400).json({ success: false, message: 'RANGE charges require feeType/fee_type' });
          }
          
          if (feeType === 'FIXED') {
            if (feeAmount === undefined || feeAmount === null || feeAmount === '' || parseFloat(feeAmount) <= 0) {
              return res.status(400).json({ 
                success: false, 
                message: 'FIXED fee requires positive feeAmount/fee_amount' 
              });
            }
            transformed.FEE_AMOUNT = parseFloat(feeAmount);
            transformed.FEE_PERCENTAGE = null;
          } else if (feeType === 'PERCENTAGE') {
            if (feePercentage === undefined || feePercentage === null || feePercentage === '' || parseFloat(feePercentage) <= 0) {
              return res.status(400).json({ 
                success: false, 
                message: 'PERCENTAGE fee requires positive feePercentage/fee_percentage' 
              });
            }
            transformed.FEE_PERCENTAGE = parseFloat(feePercentage);
            transformed.FEE_AMOUNT = null;
          } else {
            return res.status(400).json({ success: false, message: 'feeType must be FIXED or PERCENTAGE' });
          }
          
          transformed.CHRG_AMT = null;
          transformed.CHRG_PCT = null;
          transformed.FEE_TYPE = feeType;
          transformed.MIN_AMOUNT = parseFloat(minAmount);
          transformed.MAX_AMOUNT = (maxAmount && maxAmount !== '') ? parseFloat(maxAmount) : null;
          await ChargeTier.destroy({ where: { charge_id: id } });
        }
      }

      // ==================== VAT VALIDATION FOR UPDATE ====================
      const isVATApplicable = transformed.IS_VAT_APPLICABLE !== undefined ? transformed.IS_VAT_APPLICABLE : existing.IS_VAT_APPLICABLE;
      if (isVATApplicable) {
        const vatRate = transformed.VAT_RATE !== undefined ? transformed.VAT_RATE : existing.VAT_RATE;
        const vatGL = transformed.VAT_GL_ACCOUNT_NO !== undefined ? transformed.VAT_GL_ACCOUNT_NO : existing.VAT_GL_ACCOUNT_NO;
        if (!vatRate || vatRate <= 0) {
          return res.status(400).json({ success: false, message: 'VAT rate must be greater than 0 when VAT is applicable' });
        }
        if (!vatGL) {
          return res.status(400).json({ success: false, message: 'VAT GL account is required when VAT is applicable' });
        }
      }

      // ==================== WHT VALIDATION FOR UPDATE ====================
      const isWHTApplicable = transformed.IS_WHT_APPLICABLE !== undefined ? transformed.IS_WHT_APPLICABLE : existing.IS_WHT_APPLICABLE;
      if (isWHTApplicable) {
        const whtRate = transformed.WHT_RATE !== undefined ? transformed.WHT_RATE : existing.WHT_RATE;
        const whtGL = transformed.WHT_GL_ACCOUNT_NO !== undefined ? transformed.WHT_GL_ACCOUNT_NO : existing.WHT_GL_ACCOUNT_NO;
        const whtType = transformed.WHT_TYPE !== undefined ? transformed.WHT_TYPE : existing.WHT_TYPE;
        if (!whtRate || whtRate <= 0) {
          return res.status(400).json({ success: false, message: 'WHT rate must be greater than 0 when WHT is applicable' });
        }
        if (!whtGL) {
          return res.status(400).json({ success: false, message: 'WHT GL account is required when WHT is applicable' });
        }
        if (!whtType) {
          return res.status(400).json({ success: false, message: 'WHT type is required when WHT is applicable' });
        }
      }

      await Charge.update({ ...transformed, ROW_TS: new Date() }, { where: { CHRG_ID: parseInt(id) } });
      const updated = await Charge.findOne({
        where: { CHRG_ID: parseInt(id) },
        include: [{ model: ChargeTier, as: 'tiers', required: false }]
      });
      let data = updated;
      if (format === 'simplified') data = ChargeController.transformToSimplifiedFormat(updated);
      res.status(200).json({ success: true, message: 'Charge updated', data });
    } catch (error) {
      console.error('Update Charge Error:', error);
      res.status(500).json({ success: false, message: 'Error updating charge', error: error.message });
    }
  },

  // ==================== GET CHARGE BY CODE ====================
  getChargeByCode: async (req, res) => {
    try {
      const charge = await Charge.findOne({ 
        where: { CHRG_CD: req.params.code },
        include: [{ model: ChargeTier, as: 'tiers', required: false }]
      });
      if (!charge) return res.status(404).json({ success: false, message: 'Charge not found' });
      res.status(200).json({ success: true, data: charge });
    } catch (error) {
      console.error('Get Charge By Code Error:', error);
      res.status(500).json({ success: false, message: 'Error fetching charge', error: error.message });
    }
  },

  // ==================== DELETE CHARGE ====================
  deleteCharge: async (req, res) => {
    try {
      const charge = await Charge.findOne({ where: { CHRG_ID: parseInt(req.params.id) } });
      if (!charge) return res.status(404).json({ success: false, message: 'Charge not found' });
      await charge.destroy();
      res.status(200).json({ success: true, message: 'Charge deleted', data: charge });
    } catch (error) {
      console.error('Delete Charge Error:', error);
      res.status(500).json({ success: false, message: 'Error deleting charge', error: error.message });
    }
  },

  // ==================== DEACTIVATE CHARGE ====================
  deactivateCharge: async (req, res) => {
    try {
      const charge = await Charge.findOne({ where: { CHRG_ID: parseInt(req.params.id) } });
      if (!charge) return res.status(404).json({ success: false, message: 'Charge not found' });
      await charge.update({ REC_ST: 'I', ROW_TS: new Date() });
      res.status(200).json({ success: true, message: 'Charge deactivated', data: charge });
    } catch (error) {
      console.error('Deactivate Charge Error:', error);
      res.status(500).json({ success: false, message: 'Error deactivating charge', error: error.message });
    }
  },

  // ==================== ACTIVATE CHARGE ====================
  activateCharge: async (req, res) => {
    try {
      const charge = await Charge.findOne({ where: { CHRG_ID: parseInt(req.params.id) } });
      if (!charge) return res.status(404).json({ success: false, message: 'Charge not found' });
      await charge.update({ REC_ST: 'A', ROW_TS: new Date() });
      res.status(200).json({ success: true, message: 'Charge activated', data: charge });
    } catch (error) {
      console.error('Activate Charge Error:', error);
      res.status(500).json({ success: false, message: 'Error activating charge', error: error.message });
    }
  },

  // ==================== GET CHARGES BY TYPE ====================
  getChargesByType: async (req, res) => {
    try {
      const { type } = req.params;
      const charges = await Charge.findAll({ 
        where: { CHRG_TY: type.toUpperCase(), REC_ST: 'A' },
        include: [{ model: ChargeTier, as: 'tiers', required: false }]
      });
      res.status(200).json({ success: true, data: charges, count: charges.length });
    } catch (error) {
      console.error('Get Charges By Type Error:', error);
      res.status(500).json({ success: false, message: 'Error fetching charges by type', error: error.message });
    }
  },

  // ==================== GET ACTIVE CHARGES ====================
  getActiveCharges: async (req, res) => {
    try {
      const charges = await Charge.findAll({ 
        where: { REC_ST: 'A' },
        include: [{ model: ChargeTier, as: 'tiers', required: false }]
      });
      res.status(200).json({ success: true, data: charges, count: charges.length });
    } catch (error) {
      console.error('Get Active Charges Error:', error);
      res.status(500).json({ success: false, message: 'Error fetching active charges', error: error.message });
    }
  },

  // ==================== BULK CREATE CHARGES ====================
  bulkCreateCharges: async (req, res) => {
    try {
      const { charges } = req.body;
      if (!Array.isArray(charges) || charges.length === 0) {
        return res.status(400).json({ success: false, message: 'Charges array required' });
      }
      const validated = [];
      const errors = [];
      for (let i = 0; i < charges.length; i++) {
        try {
          const transformed = ChargeController.transformChargeRequest(charges[i]);
          delete transformed.CHRG_ID;
          if (transformed.TIER_TY === 'FLAT' && (!transformed.CHRG_AMT || transformed.CHRG_AMT <= 0))
            throw new Error('Flat charge requires positive CHRG_AMT');
          if (transformed.TIER_TY === 'PERCENTAGE' && (!transformed.CHRG_PCT || transformed.CHRG_PCT <= 0))
            throw new Error('Percentage charge requires positive CHRG_PCT');
          if (transformed.TIER_TY === 'RANGE') {
            if (transformed._tiers && transformed._tiers.length) {
              ChargeController.validateTiers(transformed._tiers);
            } else {
              if (!transformed.MIN_AMOUNT && transformed.MIN_AMOUNT !== 0) 
                throw new Error('Range charge requires minAmount');
              if (transformed.MIN_AMOUNT < 0) 
                throw new Error('Minimum amount cannot be negative');
              if (transformed.MAX_AMOUNT && transformed.MAX_AMOUNT <= transformed.MIN_AMOUNT)
                throw new Error('MAX_AMOUNT must be greater than MIN_AMOUNT');
              if (!transformed.FEE_TYPE) 
                throw new Error('Range charge requires feeType');
              if (transformed.FEE_TYPE === 'FIXED' && (!transformed.FEE_AMOUNT || transformed.FEE_AMOUNT <= 0))
                throw new Error('FIXED fee requires positive FEE_AMOUNT');
              if (transformed.FEE_TYPE === 'PERCENTAGE' && (!transformed.FEE_PERCENTAGE || transformed.FEE_PERCENTAGE <= 0))
                throw new Error('PERCENTAGE fee requires positive FEE_PERCENTAGE');
            }
          }
          if (transformed.IS_VAT_APPLICABLE) {
            if (!transformed.VAT_RATE || transformed.VAT_RATE <= 0)
              throw new Error('VAT rate must be greater than 0 when VAT is applicable');
            if (!transformed.VAT_GL_ACCOUNT_NO)
              throw new Error('VAT GL account is required when VAT is applicable');
          }
          if (transformed.IS_WHT_APPLICABLE) {
            if (!transformed.WHT_RATE || transformed.WHT_RATE <= 0)
              throw new Error('WHT rate must be greater than 0 when WHT is applicable');
            if (!transformed.WHT_GL_ACCOUNT_NO)
              throw new Error('WHT GL account is required when WHT is applicable');
            if (!transformed.WHT_TYPE)
              throw new Error('WHT type is required when WHT is applicable');
          }
          validated.push(transformed);
        } catch (err) {
          errors.push({ index: i, error: err.message, data: charges[i] });
        }
      }
      if (errors.length) {
        return res.status(400).json({ success: false, message: 'Some charges failed validation', errors, validatedCount: validated.length });
      }
      const result = await Charge.bulkCreate(validated, { validate: true, returning: true });
      res.status(201).json({ success: true, message: `${result.length} charges created`, data: result });
    } catch (error) {
      console.error('Bulk Create Error:', error);
      res.status(500).json({ success: false, message: 'Error creating charges in bulk', error: error.message });
    }
  },

  // ==================== EXPORT CHARGES ====================
  exportCharges: async (req, res) => {
    try {
      const { format = 'json', recSt, chrgTy, tierTy } = req.query;
      const where = {};
      if (recSt) where.REC_ST = recSt;
      if (chrgTy) where.CHRG_TY = chrgTy;
      if (tierTy) where.TIER_TY = tierTy;
      const charges = await Charge.findAll({ 
        where, 
        order: [['CHRG_CD', 'ASC']],
        include: [{ model: ChargeTier, as: 'tiers', required: false }]
      });
      const simplified = charges.map(c => ChargeController.transformToSimplifiedFormat(c));
      if (format === 'csv') {
        const csvRows = [];
        const headers = Object.keys(simplified[0] || {});
        csvRows.push(headers.join(','));
        for (const row of simplified) {
          const values = headers.map(h => JSON.stringify(row[h] ?? '').replace(/,/g, ';')).join(',');
          csvRows.push(values);
        }
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=charges_export.csv');
        return res.send(csvRows.join('\n'));
      }
      res.status(200).json({ success: true, data: simplified, count: simplified.length });
    } catch (error) {
      console.error('Export Charges Error:', error);
      res.status(500).json({ success: false, message: 'Error exporting charges', error: error.message });
    }
  }
};

export default ChargeController;