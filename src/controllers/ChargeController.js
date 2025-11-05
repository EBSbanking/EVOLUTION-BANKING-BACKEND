// controllers/ChargeController.js
import Charge from '../models/Charge.js';
import mongoose from 'mongoose';

const ChargeController = {
  // 🔹 Transform request body (simplified → Oracle schema)
  transformChargeRequest: (body) => {
    const transformed = { ...body };

    // Map simplified input fields to Charge schema
    if (body.chargeType) {
      transformed.CHRG_TY = body.chargeType.toUpperCase();
      delete transformed.chargeType;
    }

    if (body.chargeAmount !== undefined) {
      transformed.CHRG_AMT = body.chargeAmount;
      delete transformed.chargeAmount;
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

    // Auto-generate CHRG_ID if missing
    if (!transformed.CHRG_ID) {
      transformed.CHRG_ID = Date.now(); // Replace with proper sequence if needed
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
      // Transform body
      const transformedBody = ChargeController.transformChargeRequest(req.body);

      // Validate required fields
      const requiredFields = [
        'CHRG_ID', 'CHRG_CD', 'CHRG_TY', 'TIER_TY',
        'VERSION_NO', 'USER_ID', 'CREATED_BY', 'BAL_ACTION_CD'
      ];
      const missingFields = requiredFields.filter(field => !transformedBody[field]);

      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`
        });
      }

      // Check duplicates
      const existingCharge = await Charge.findOne({
        $or: [
          { CHRG_ID: transformedBody.CHRG_ID },
          { CHRG_CD: transformedBody.CHRG_CD }
        ]
      });

      if (existingCharge) {
        return res.status(400).json({
          success: false,
          message: 'Charge with this CHRG_ID or CHRG_CD already exists'
        });
      }

      // ✅ Save charge
      const charge = new Charge(transformedBody);
      await charge.save();

      // ✅ Always return simplified format to API response
      res.status(201).json({
        success: true,
        message: 'Charge created successfully',
        data: ChargeController.transformToSimplifiedFormat(charge)
      });

    } catch (error) {
      console.error('Create Charge Error:', error);

      res.status(500).json({
        success: false,
        message: 'Error creating charge',
        error: error.message
      });
    }
  },
  
  // Get all charges with support for both response formats
  getAllCharges: async (req, res) => {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'CHRG_CD',
        sortOrder = 'asc',
        search,
        recSt,
        chrgTy,
        tierTy,
        format = 'oracle' // 'oracle' or 'simplified'
      } = req.query;

      // Build filter object
      const filter = {};
      
      if (recSt) filter.REC_ST = recSt;
      if (chrgTy) filter.CHRG_TY = chrgTy;
      if (tierTy) filter.TIER_TY = tierTy;
      
      if (search) {
        filter.$or = [
          { CHRG_CD: { $regex: search, $options: 'i' } },
          { CHRG_NM: { $regex: search, $options: 'i' } },
          { CHRG_DESC: { $regex: search, $options: 'i' } }
        ];
      }

      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const charges = await Charge.find(filter)
        .sort(sortOptions)
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Charge.countDocuments(filter);

      // Transform response based on format parameter
      let data = charges;
      if (format === 'simplified') {
        data = charges.map(charge => ChargeController.transformToSimplifiedFormat(charge));
      }

      res.status(200).json({
        success: true,
        data: data,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      });

    } catch (error) {
      console.error('Get All Charges Error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching charges',
        error: error.message
      });
    }
  },

  // Get charge by ID with format option
  getChargeById: async (req, res) => {
    try {
      const { format = 'oracle' } = req.query;
      const charge = await Charge.findOne({ CHRG_ID: parseInt(req.params.id) });
      
      if (!charge) {
        return res.status(404).json({
          success: false,
          message: 'Charge not found'
        });
      }

      let data = charge;
      if (format === 'simplified') {
        data = ChargeController.transformToSimplifiedFormat(charge);
      }

      res.status(200).json({
        success: true,
        data: data
      });

    } catch (error) {
      console.error('Get Charge By ID Error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching charge',
        error: error.message
      });
    }
  },

  // Update charge with support for both formats
  updateCharge: async (req, res) => {
    try {
      const { id } = req.params;
      const { format = 'oracle' } = req.query;
      
      // Transform request body if needed
      const transformedBody = ChargeController.transformChargeRequest(req.body);

      // Check if charge exists
      const existingCharge = await Charge.findOne({ CHRG_ID: parseInt(id) });
      if (!existingCharge) {
        return res.status(404).json({
          success: false,
          message: 'Charge not found'
        });
      }

      // Prevent changing CHRG_ID and CHRG_CD
      if (transformedBody.CHRG_ID && transformedBody.CHRG_ID !== parseInt(id)) {
        return res.status(400).json({
          success: false,
          message: 'Cannot change CHRG_ID'
        });
      }

      if (transformedBody.CHRG_CD && transformedBody.CHRG_CD !== existingCharge.CHRG_CD) {
        return res.status(400).json({
          success: false,
          message: 'Cannot change CHRG_CD'
        });
      }

      const updatedCharge = await Charge.findOneAndUpdate(
        { CHRG_ID: parseInt(id) },
        { ...transformedBody, ROW_TS: new Date() },
        { new: true, runValidators: true }
      );

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

      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error updating charge',
        error: error.message
      });
    }
  },

  // Get charge by code
  getChargeByCode: async (req, res) => {
    try {
      const charge = await Charge.findOne({ CHRG_CD: req.params.code });
      
      if (!charge) {
        return res.status(404).json({
          success: false,
          message: 'Charge not found'
        });
      }

      res.status(200).json({
        success: true,
        data: charge
      });

    } catch (error) {
      console.error('Get Charge By Code Error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching charge',
        error: error.message
      });
    }
  },

  // Delete charge by ID
  deleteCharge: async (req, res) => {
    try {
      const charge = await Charge.findOneAndDelete({ CHRG_ID: parseInt(req.params.id) });
      
      if (!charge) {
        return res.status(404).json({
          success: false,
          message: 'Charge not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Charge deleted successfully',
        data: charge
      });

    } catch (error) {
      console.error('Delete Charge Error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting charge',
        error: error.message
      });
    }
  },

  // Soft delete (deactivate) charge
  deactivateCharge: async (req, res) => {
    try {
      const charge = await Charge.findOneAndUpdate(
        { CHRG_ID: parseInt(req.params.id) },
        { REC_ST: 'I', ROW_TS: new Date() },
        { new: true }
      );

      if (!charge) {
        return res.status(404).json({
          success: false,
          message: 'Charge not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Charge deactivated successfully',
        data: charge
      });

    } catch (error) {
      console.error('Deactivate Charge Error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deactivating charge',
        error: error.message
      });
    }
  },

  // Activate charge
  activateCharge: async (req, res) => {
    try {
      const charge = await Charge.findOneAndUpdate(
        { CHRG_ID: parseInt(req.params.id) },
        { REC_ST: 'A', ROW_TS: new Date() },
        { new: true }
      );

      if (!charge) {
        return res.status(404).json({
          success: false,
          message: 'Charge not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Charge activated successfully',
        data: charge
      });

    } catch (error) {
      console.error('Activate Charge Error:', error);
      res.status(500).json({
        success: false,
        message: 'Error activating charge',
        error: error.message
      });
    }
  },

  // Get charges by type
  getChargesByType: async (req, res) => {
    try {
      const { type } = req.params;
      const charges = await Charge.find({ 
        CHRG_TY: type.toUpperCase(),
        REC_ST: 'A'
      });

      res.status(200).json({
        success: true,
        data: charges,
        count: charges.length
      });

    } catch (error) {
      console.error('Get Charges By Type Error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching charges by type',
        error: error.message
      });
    }
  },

  // Get active charges only
  getActiveCharges: async (req, res) => {
    try {
      const charges = await Charge.findActive();
      
      res.status(200).json({
        success: true,
        data: charges,
        count: charges.length
      });

    } catch (error) {
      console.error('Get Active Charges Error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching active charges',
        error: error.message
      });
    }
  },

  // Bulk create charges
  bulkCreateCharges: async (req, res) => {
    try {
      const { charges } = req.body;

      if (!Array.isArray(charges) || charges.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Charges array is required'
        });
      }

      // Validate each charge
      const validatedCharges = [];
      const errors = [];

      for (const [index, chargeData] of charges.entries()) {
        try {
          const charge = new Charge(chargeData);
          await charge.validate();
          validatedCharges.push(chargeData);
        } catch (error) {
          errors.push({
            index,
            error: error.message,
            data: chargeData
          });
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

      const result = await Charge.insertMany(validatedCharges);

      res.status(201).json({
        success: true,
        message: `${result.length} charges created successfully`,
        data: result
      });

    } catch (error) {
      console.error('Bulk Create Charges Error:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating charges in bulk',
        error: error.message
      });
    }
  }
};

export default ChargeController;