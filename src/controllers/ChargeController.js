// controllers/ChargeController.js – with percentage support
import { Op } from 'sequelize';
import Charge from '../models/Charge.js';

const ChargeController = {
  // 🔹 Transform request body (simplified → Oracle schema)
  transformChargeRequest: (body) => {
    const transformed = { ...body };

    // Map simplified input fields to Charge schema
    if (body.chargeType) {
      transformed.CHRG_TY = body.chargeType.toUpperCase();
      delete transformed.chargeType;
    }

    // Handle amount vs percentage
    if (body.chargeAmount !== undefined) {
      transformed.CHRG_AMT = body.chargeAmount;
      delete transformed.chargeAmount;
    }
    if (body.chargePercentage !== undefined) {
      transformed.CHRG_PCT = body.chargePercentage;
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

    return transformed;
  },

  // 🔹 Transform DB record → simplified API response
  transformToSimplifiedFormat: (charge) => {
    return {
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
      version: charge.VERSION_NO
    };
  },

  // 🔹 Create a new charge
  createCharge: async (req, res) => {
    try {
      const transformedBody = ChargeController.transformChargeRequest(req.body);
      delete transformedBody.CHRG_ID; // let DB auto-increment

      // Validate required fields
      const requiredFields = [
        'CHRG_CD', 'CHRG_TY', 'TIER_TY',
        'VERSION_NO', 'USER_ID', 'CREATED_BY', 'BAL_ACTION_CD'
      ];
      const missingFields = requiredFields.filter(field => !transformedBody[field]);
      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`
        });
      }

      // Additional validation based on TIER_TY
      if (transformedBody.TIER_TY === 'FLAT') {
        if (!transformedBody.CHRG_AMT || transformedBody.CHRG_AMT <= 0) {
          return res.status(400).json({
            success: false,
            message: 'For FLAT charges, a positive CHRG_AMT is required.'
          });
        }
        // Ensure CHRG_PCT is null for flat charges
        transformedBody.CHRG_PCT = null;
      } else if (transformedBody.TIER_TY === 'PERCENTAGE') {
        if (!transformedBody.CHRG_PCT || transformedBody.CHRG_PCT <= 0) {
          return res.status(400).json({
            success: false,
            message: 'For PERCENTAGE charges, a positive CHRG_PCT is required.'
          });
        }
        // Ensure CHRG_AMT is null for percentage charges
        transformedBody.CHRG_AMT = null;
      }

      // Check duplicate by CHRG_CD
      const existingCharge = await Charge.findOne({
        where: { CHRG_CD: transformedBody.CHRG_CD }
      });
      if (existingCharge) {
        return res.status(400).json({
          success: false,
          message: 'Charge with this CHRG_CD already exists'
        });
      }

      const charge = await Charge.create(transformedBody);
      res.status(201).json({
        success: true,
        message: 'Charge created successfully',
        data: ChargeController.transformToSimplifiedFormat(charge)
      });

    } catch (error) {
      console.error('Create Charge Error:', error);
      if (error.name === 'SequelizeValidationError') {
        const errors = error.errors.map(err => err.message);
        return res.status(400).json({ success: false, message: 'Validation error', errors });
      }
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(400).json({ success: false, message: 'Duplicate charge code' });
      }
      res.status(500).json({ success: false, message: 'Error creating charge', error: error.message });
    }
  },

  // Get all charges with support for both response formats
  getAllCharges: async (req, res) => {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'CHRG_CD',
        sortOrder = 'ASC',
        search,
        recSt,
        chrgTy,
        tierTy,
        format = 'oracle'
      } = req.query;

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

      const order = [[sortBy, sortOrder.toUpperCase()]];
      const offset = (page - 1) * limit;

      const { count, rows: charges } = await Charge.findAndCountAll({
        where,
        order,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      let data = charges;
      if (format === 'simplified') {
        data = charges.map(charge => ChargeController.transformToSimplifiedFormat(charge));
      }

      res.status(200).json({
        success: true,
        data: data,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(count / limit),
          totalItems: count,
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Get All Charges Error:', error);
      res.status(500).json({ success: false, message: 'Error fetching charges', error: error.message });
    }
  },

  // Get charge by ID with format option
  getChargeById: async (req, res) => {
    try {
      const { format = 'oracle' } = req.query;
      const charge = await Charge.findOne({ where: { CHRG_ID: parseInt(req.params.id) } });
      if (!charge) {
        return res.status(404).json({ success: false, message: 'Charge not found' });
      }
      let data = charge;
      if (format === 'simplified') {
        data = ChargeController.transformToSimplifiedFormat(charge);
      }
      res.status(200).json({ success: true, data: data });
    } catch (error) {
      console.error('Get Charge By ID Error:', error);
      res.status(500).json({ success: false, message: 'Error fetching charge', error: error.message });
    }
  },

  // Update charge with support for both formats and percentage handling
  updateCharge: async (req, res) => {
    try {
      const { id } = req.params;
      const { format = 'oracle' } = req.query;
      const transformedBody = ChargeController.transformChargeRequest(req.body);

      const existingCharge = await Charge.findOne({ where: { CHRG_ID: parseInt(id) } });
      if (!existingCharge) {
        return res.status(404).json({ success: false, message: 'Charge not found' });
      }

      // Prevent changing CHRG_CD
      if (transformedBody.CHRG_CD && transformedBody.CHRG_CD !== existingCharge.CHRG_CD) {
        return res.status(400).json({ success: false, message: 'Cannot change CHRG_CD' });
      }
      delete transformedBody.CHRG_ID;

      // Validate based on TIER_TY
      const newTier = transformedBody.TIER_TY || existingCharge.TIER_TY;
      if (newTier === 'FLAT') {
        if (transformedBody.CHRG_AMT === undefined && existingCharge.CHRG_AMT === null) {
          return res.status(400).json({ success: false, message: 'For FLAT charges, CHRG_AMT is required.' });
        }
        transformedBody.CHRG_PCT = null;
      } else if (newTier === 'PERCENTAGE') {
        if (transformedBody.CHRG_PCT === undefined && existingCharge.CHRG_PCT === null) {
          return res.status(400).json({ success: false, message: 'For PERCENTAGE charges, CHRG_PCT is required.' });
        }
        transformedBody.CHRG_AMT = null;
      }

      await Charge.update(
        { ...transformedBody, ROW_TS: new Date() },
        { where: { CHRG_ID: parseInt(id) } }
      );

      const updatedCharge = await Charge.findOne({ where: { CHRG_ID: parseInt(id) } });
      let data = updatedCharge;
      if (format === 'simplified') {
        data = ChargeController.transformToSimplifiedFormat(updatedCharge);
      }
      res.status(200).json({
        success: true,
        message: 'Charge updated successfully',
        data: data
      });
    } catch (error) {
      console.error('Update Charge Error:', error);
      if (error.name === 'SequelizeValidationError') {
        const errors = error.errors.map(err => err.message);
        return res.status(400).json({ success: false, message: 'Validation failed', errors });
      }
      res.status(500).json({ success: false, message: 'Error updating charge', error: error.message });
    }
  },

  getChargeByCode: async (req, res) => {
    try {
      const charge = await Charge.findOne({ where: { CHRG_CD: req.params.code } });
      if (!charge) return res.status(404).json({ success: false, message: 'Charge not found' });
      res.status(200).json({ success: true, data: charge });
    } catch (error) {
      console.error('Get Charge By Code Error:', error);
      res.status(500).json({ success: false, message: 'Error fetching charge', error: error.message });
    }
  },

  deleteCharge: async (req, res) => {
    try {
      const charge = await Charge.findOne({ where: { CHRG_ID: parseInt(req.params.id) } });
      if (!charge) return res.status(404).json({ success: false, message: 'Charge not found' });
      await charge.destroy();
      res.status(200).json({ success: true, message: 'Charge deleted successfully', data: charge });
    } catch (error) {
      console.error('Delete Charge Error:', error);
      res.status(500).json({ success: false, message: 'Error deleting charge', error: error.message });
    }
  },

  deactivateCharge: async (req, res) => {
    try {
      const charge = await Charge.findOne({ where: { CHRG_ID: parseInt(req.params.id) } });
      if (!charge) return res.status(404).json({ success: false, message: 'Charge not found' });
      await charge.update({ REC_ST: 'I', ROW_TS: new Date() });
      res.status(200).json({ success: true, message: 'Charge deactivated successfully', data: charge });
    } catch (error) {
      console.error('Deactivate Charge Error:', error);
      res.status(500).json({ success: false, message: 'Error deactivating charge', error: error.message });
    }
  },

  activateCharge: async (req, res) => {
    try {
      const charge = await Charge.findOne({ where: { CHRG_ID: parseInt(req.params.id) } });
      if (!charge) return res.status(404).json({ success: false, message: 'Charge not found' });
      await charge.update({ REC_ST: 'A', ROW_TS: new Date() });
      res.status(200).json({ success: true, message: 'Charge activated successfully', data: charge });
    } catch (error) {
      console.error('Activate Charge Error:', error);
      res.status(500).json({ success: false, message: 'Error activating charge', error: error.message });
    }
  },

  getChargesByType: async (req, res) => {
    try {
      const { type } = req.params;
      const charges = await Charge.findAll({ where: { CHRG_TY: type.toUpperCase(), REC_ST: 'A' } });
      res.status(200).json({ success: true, data: charges, count: charges.length });
    } catch (error) {
      console.error('Get Charges By Type Error:', error);
      res.status(500).json({ success: false, message: 'Error fetching charges by type', error: error.message });
    }
  },

  getActiveCharges: async (req, res) => {
    try {
      const charges = await Charge.findAll({ where: { REC_ST: 'A' } });
      res.status(200).json({ success: true, data: charges, count: charges.length });
    } catch (error) {
      console.error('Get Active Charges Error:', error);
      res.status(500).json({ success: false, message: 'Error fetching active charges', error: error.message });
    }
  },

  bulkCreateCharges: async (req, res) => {
    try {
      const { charges } = req.body;
      if (!Array.isArray(charges) || charges.length === 0) {
        return res.status(400).json({ success: false, message: 'Charges array is required' });
      }

      const validatedCharges = [];
      const errors = [];

      for (const [index, chargeData] of charges.entries()) {
        try {
          const transformed = ChargeController.transformChargeRequest(chargeData);
          delete transformed.CHRG_ID;
          // Additional validation for flat/percentage
          if (transformed.TIER_TY === 'FLAT' && (!transformed.CHRG_AMT || transformed.CHRG_AMT <= 0)) {
            throw new Error('Flat charge requires positive CHRG_AMT');
          }
          if (transformed.TIER_TY === 'PERCENTAGE' && (!transformed.CHRG_PCT || transformed.CHRG_PCT <= 0)) {
            throw new Error('Percentage charge requires positive CHRG_PCT');
          }
          const charge = Charge.build(transformed);
          await charge.validate();
          validatedCharges.push(transformed);
        } catch (error) {
          errors.push({ index, error: error.message, data: chargeData });
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Some charges failed validation',
          errors,
          validatedCount: validatedCharges.length
        });
      }

      const result = await Charge.bulkCreate(validatedCharges, { validate: true, returning: true });
      res.status(201).json({
        success: true,
        message: `${result.length} charges created successfully`,
        data: result
      });
    } catch (error) {
      console.error('Bulk Create Charges Error:', error);
      if (error.name === 'SequelizeValidationError') {
        const errors = error.errors.map(err => err.message);
        return res.status(400).json({ success: false, message: 'Validation error during bulk create', errors });
      }
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(400).json({ success: false, message: 'Duplicate charge codes in bulk data' });
      }
      res.status(500).json({ success: false, message: 'Error creating charges in bulk', error: error.message });
    }
  }
};

export default ChargeController;