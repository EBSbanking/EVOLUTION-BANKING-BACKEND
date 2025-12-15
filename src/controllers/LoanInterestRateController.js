// controllers/LoanInterestController.js - COMPLETE FIXED VERSION
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import LoanInterestRate from '../models/LoanInterestRate.js';
import RateIndex from '../models/Rate-Index.js'; // FIXED: Correct import path
import AuditTrail from '../models/AuditTrail.js';
import { validationResult } from 'express-validator';

// Helper functions
const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           '127.0.0.1';
};

const generateEventId = () => {
    return Date.now() + Math.floor(Math.random() * 1000000);
};

const convertTermToMonths = (value, termType) => {
    if (!value || !termType) return value;
    
    const termTypeUpper = termType.toUpperCase();
    switch(termTypeUpper) {
        case 'DAYS':
            return Math.ceil(value / 30.44);
        case 'WEEKS':
            return Math.ceil(value / 4.345);
        case 'MONTHS':
            return value;
        case 'QUARTERS':
            return value * 3;
        case 'YEARS':
            return value * 12;
        default:
            return value;
    }
};

const generateInterestRateCode = (rateType, productType = 'LOAN') => {
    const prefix = productType.slice(0, 2).toUpperCase();
    const typeCode = rateType.slice(0, 3).toUpperCase();
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    
    return `${prefix}-${typeCode}-${timestamp}${random}`;
};

const validateRateValues = (minRate, maxRate, defaultRate) => {
    const min = parseFloat(minRate);
    const max = parseFloat(maxRate);
    const def = parseFloat(defaultRate);
    
    if (isNaN(min) || isNaN(max) || isNaN(def)) {
        return { valid: false, message: 'Rate values must be valid numbers' };
    }
    
    if (min < 0 || max < 0 || def < 0) {
        return { valid: false, message: 'Rate values cannot be negative' };
    }
    
    if (min > max) {
        return { valid: false, message: 'Minimum rate cannot be greater than maximum rate' };
    }
    
    if (def < min || def > max) {
        return { valid: false, message: 'Default rate must be between min and max rates' };
    }
    
    return { valid: true };
};

const generateUniqueLoanProudIntId = async (session) => {
    try {
        const lastRate = await LoanInterestRate.findOne()
            .sort({ LOAN_PROUD_INT_ID: -1 })
            .select('LOAN_PROUD_INT_ID')
            .session(session || null);
        
        const baseId = 1000;
        return lastRate && lastRate.LOAN_PROUD_INT_ID 
            ? lastRate.LOAN_PROUD_INT_ID + 1 
            : baseId;
    } catch (error) {
        console.error('Error generating LOAN_PROUD_INT_ID:', error);
        return Date.now();
    }
};

const validateFlatRateValues = (minRate, maxRate, defaultRate, termType) => {
    const min = parseFloat(minRate);
    const max = parseFloat(maxRate);
    const def = parseFloat(defaultRate);
    
    if (isNaN(min) || isNaN(max) || isNaN(def)) {
        return {
            valid: false,
            message: 'Flat rate values must be valid numbers'
        };
    }
    
    if (min < 0 || max < 0 || def < 0) {
        return {
            valid: false,
            message: 'Flat rate values cannot be negative'
        };
    }
    
    if (def < min || def > max) {
        return {
            valid: false,
            message: 'Default flat rate must be between min and max rates'
        };
    }
    
    if (max > 100) {
        console.warn('Flat rate exceeds 100% - ensure this is intentional');
    }
    
    return { valid: true };
};

const calculateFlatRateEMI = (principal, flatRatePercent, termMonths) => {
    const totalInterest = principal * (flatRatePercent / 100);
    const totalRepayment = principal + totalInterest;
    const emi = totalRepayment / termMonths;
    
    return {
        principal,
        flatRatePercent,
        termMonths,
        totalInterest: parseFloat(totalInterest.toFixed(2)),
        totalRepayment: parseFloat(totalRepayment.toFixed(2)),
        emi: parseFloat(emi.toFixed(2)),
        breakdown: {
            monthlyPrincipal: parseFloat((principal / termMonths).toFixed(2)),
            monthlyInterest: parseFloat((totalInterest / termMonths).toFixed(2)),
            totalPayments: termMonths
        }
    };
};

const LoanInterestController = {
 
   // CREATE LOAN INTEREST RATE - FORCED FLAT RATE VERSION
// CREATE LOAN INTEREST RATE - FORCED FLAT RATE VERSION (FIXED)
createInterestRate: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        session.startTransaction();
        
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }
        
        const {
            name,
            description,
            code,
            LOAN_PROUD_INT_ID,
            RATE_TYPE = 'FIXED',
            INTEREST_TYPE = 'SIMPLE',
            CALCULATION_METHOD = 'FLAT',
            ACCRUAL_BASIS = 'ACTUAL/360',
            ACCRUAL_FREQUENCY = 'DAILY',
            MIN_RATE_PER_MONTH,
            MAX_RATE_PER_MONTH,
            DEFAULT_RATE_PER_MONTH,
            ANNUAL_PERCENTAGE_RATE,
            MIN_TERM_VALUE = 1,
            MAX_TERM_VALUE = 60,
            TERM_TYPE = 'MONTHS',
            INDEX_RATE_ID,
            MARGIN_RATE = 0,
            SPREAD_RATE = 0,
            MIN_LOAN_AMOUNT = '0.00',
            MAX_LOAN_AMOUNT = '1000000000.00',
            CAPITALIZE_INTEREST = false,
            COMPOUNDING_FREQUENCY = 'MONTHLY',
            AMORTIZED = true,
            REPAYMENT_FREQUENCY = 'MONTHLY',
            RATE_CHANGE_ALLOWED = false,
            RATE_CHANGE_NOTICE_DAYS = 30,
            MAX_RATE_CHANGES = 1,
            ORIGINATION_FEE_RATE = 0, // This is the correct field name
            PROCESSING_FEE_FIXED = 0,
            LATE_PAYMENT_PENALTY_RATE = 0,
            EARLY_REPAYMENT_PENALTY_RATE = 0,
            STATUS = 'DRAFT',
            CREATED_BY,
            EFFECTIVE_DATE = new Date(),
            EXPIRY_DATE,
            TAGS = [],
            NOTES,
            VERSION = '1.0'
        } = req.body;

        // FLAT RATE VALIDATION
        if (INTEREST_TYPE.toUpperCase() !== 'SIMPLE') {
            return res.status(400).json({
                success: false,
                message: 'For flat rate calculation, INTEREST_TYPE must be SIMPLE'
            });
        }
        
        if (CAPITALIZE_INTEREST) {
            return res.status(400).json({
                success: false,
                message: 'For flat rate calculation, CAPITALIZE_INTEREST must be false'
            });
        }
        
        const rateValidation = validateFlatRateValues(
            MIN_RATE_PER_MONTH,
            MAX_RATE_PER_MONTH,
            DEFAULT_RATE_PER_MONTH,
            TERM_TYPE
        );
        
        if (!rateValidation.valid) {
            return res.status(400).json({
                success: false,
                message: rateValidation.message
            });
        }

        // LOAN_PROUD_INT_ID HANDLING
        let finalLoanProudIntId;
        
        if (LOAN_PROUD_INT_ID) {
            const providedId = parseInt(LOAN_PROUD_INT_ID);
            if (isNaN(providedId)) {
                return res.status(400).json({
                    success: false,
                    message: 'LOAN_PROUD_INT_ID must be a valid number'
                });
            }
            
            const existingWithId = await LoanInterestRate.findOne({ 
                LOAN_PROUD_INT_ID: providedId 
            }).session(session);
            
            if (existingWithId) {
                return res.status(400).json({
                    success: false,
                    message: `LOAN_PROUD_INT_ID ${providedId} already exists. Please use a different value.`
                });
            }
            
            finalLoanProudIntId = providedId;
        } else {
            finalLoanProudIntId = await generateUniqueLoanProudIntId(session);
        }

        // Enhanced validation
        if (!name?.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Rate name is required'
            });
        }

        if (parseInt(MIN_TERM_VALUE) > parseInt(MAX_TERM_VALUE)) {
            return res.status(400).json({
                success: false,
                message: 'Minimum term cannot be greater than maximum term'
            });
        }

        const minTermMonths = convertTermToMonths(parseInt(MIN_TERM_VALUE), TERM_TYPE);
        const maxTermMonths = convertTermToMonths(parseInt(MAX_TERM_VALUE), TERM_TYPE);

        const validTermTypes = ['DAYS', 'WEEKS', 'MONTHS', 'QUARTERS', 'YEARS'];
        if (!validTermTypes.includes(TERM_TYPE.toUpperCase())) {
            return res.status(400).json({
                success: false,
                message: `Invalid TERM_TYPE. Must be one of: ${validTermTypes.join(', ')}`
            });
        }

        const validRateTypes = ['FIXED', 'VARIABLE', 'TIERED', 'PROMOTIONAL', 'INTRODUCTORY'];
        if (!validRateTypes.includes(RATE_TYPE.toUpperCase())) {
            return res.status(400).json({
                success: false,
                message: `Invalid RATE_TYPE. Must be one of: ${validRateTypes.join(', ')}`
            });
        }

        // Check for duplicate name
        const existingByName = await LoanInterestRate.findOne({ 
            name: name.trim(),
            STATUS: { $ne: 'DELETED' }
        }).session(session);
        
        if (existingByName) {
            return res.status(400).json({
                success: false,
                message: `Interest rate with name '${name}' already exists`
            });
        }

        // Generate or validate code
        let finalCode = code?.toUpperCase();
        if (!finalCode) {
            finalCode = generateInterestRateCode(RATE_TYPE);
        } else {
            const existingWithCode = await LoanInterestRate.findOne({ 
                code: finalCode,
                STATUS: { $ne: 'DELETED' }
            }).session(session);
            
            if (existingWithCode) {
                return res.status(400).json({
                    success: false,
                    message: `Interest rate with code '${finalCode}' already exists`
                });
            }
        }

        // For flat rate, ignore index rate even if provided
        if (INDEX_RATE_ID) {
            console.warn('INDEX_RATE_ID provided for flat rate. Ignoring.');
        }

        // Calculate flat rate APR
        const defaultRate = parseFloat(DEFAULT_RATE_PER_MONTH);
        const calculatedAPR = ANNUAL_PERCENTAGE_RATE 
            ? parseFloat(ANNUAL_PERCENTAGE_RATE)
            : defaultRate * 12;

        // For flat rate, compounding frequency should be appropriate
        // Common valid values: 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY', 'AT_MATURITY'
        let compoundingFrequencyValue;
        
        // Check if COMPOUNDING_FREQUENCY is provided and valid
        if (COMPOUNDING_FREQUENCY && [
            'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY', 'AT_MATURITY', 'NONE'
        ].includes(COMPOUNDING_FREQUENCY.toUpperCase())) {
            compoundingFrequencyValue = COMPOUNDING_FREQUENCY.toUpperCase();
        } else {
            // For flat rate with simple interest, use 'AT_MATURITY' (most appropriate)
            compoundingFrequencyValue = 'AT_MATURITY';
        }

        // Create interest rate data
        const interestRateData = {
            LOAN_PROUD_INT_ID: finalLoanProudIntId,
            name: name.trim(),
            code: finalCode,
            description: description?.trim(),
            RATE_TYPE: RATE_TYPE.toUpperCase(),
            INTEREST_TYPE: 'SIMPLE',
            CALCULATION_METHOD: 'FLAT',
            ACCRUAL_BASIS: ACCRUAL_BASIS.toUpperCase(),
            ACCRUAL_FREQUENCY: ACCRUAL_FREQUENCY.toUpperCase(),
            MIN_RATE_PER_MONTH: parseFloat(MIN_RATE_PER_MONTH),
            MAX_RATE_PER_MONTH: parseFloat(MAX_RATE_PER_MONTH),
            DEFAULT_RATE_PER_MONTH: defaultRate,
            ANNUAL_PERCENTAGE_RATE: calculatedAPR,
            MIN_TERM_VALUE: parseInt(MIN_TERM_VALUE),
            MAX_TERM_VALUE: parseInt(MAX_TERM_VALUE),
            MIN_TERM_MONTHS: minTermMonths,
            MAX_TERM_MONTHS: maxTermMonths,
            TERM_TYPE: TERM_TYPE.toUpperCase(),
            INDEX_RATE_ID: null,
            MARGIN_RATE: 0,
            SPREAD_RATE: 0,
            MIN_LOAN_AMOUNT: new mongoose.Types.Decimal128(MIN_LOAN_AMOUNT),
            MAX_LOAN_AMOUNT: new mongoose.Types.Decimal128(MAX_LOAN_AMOUNT),
            CAPITALIZE_INTEREST: false,
            COMPOUNDING_FREQUENCY: compoundingFrequencyValue,
            AMORTIZED: Boolean(AMORTIZED),
            REPAYMENT_FREQUENCY: REPAYMENT_FREQUENCY.toUpperCase(),
            RATE_CHANGE_ALLOWED: false,
            RATE_CHANGE_NOTICE_DAYS: 0,
            MAX_RATE_CHANGES: 0,
            // ========== FIXED: Correct field name ==========
            ORIGINATION_FEE_RATE: parseFloat(ORIGINATION_FEE_RATE),
            // ================================================
            PROCESSING_FEE_FIXED: new mongoose.Types.Decimal128(PROCESSING_FEE_FIXED.toString()),
            LATE_PAYMENT_PENALTY_RATE: parseFloat(LATE_PAYMENT_PENALTY_RATE),
            EARLY_REPAYMENT_PENALTY_RATE: parseFloat(EARLY_REPAYMENT_PENALTY_RATE),
            STATUS: STATUS.toUpperCase(),
            CREATED_BY: CREATED_BY || req.user?.id || 'SYSTEM',
            EFFECTIVE_DATE: new Date(EFFECTIVE_DATE),
            EXPIRY_DATE: EXPIRY_DATE ? new Date(EXPIRY_DATE) : null,
            TAGS: Array.isArray(TAGS) ? TAGS.map(tag => tag.trim()) : [],
            NOTES: NOTES?.trim(),
            VERSION,
            CREATED_AT: new Date(),
            UPDATED_AT: new Date(),
            LAST_UPDATED_BY: CREATED_BY || req.user?.id || 'SYSTEM',
            IS_ACTIVE: STATUS.toUpperCase() === 'ACTIVE',
            IS_FLAT_RATE: true
        };

        // Create new interest rate
        const newInterestRate = new LoanInterestRate(interestRateData);
        await newInterestRate.save({ session });

        // AUDIT TRAIL
        const auditTrailData = {
            event_id: generateEventId(),
            user_id: CREATED_BY || req.user?.id || 'SYSTEM',
            user_name: req.user?.name || 'SYSTEM',
            event_type: 'CREATE',
            action: 'CREATE_LOAN_INTEREST_RATE',
            old_value: null,
            new_value: {
                _id: newInterestRate._id.toString(),
                name: newInterestRate.name,
                code: newInterestRate.code,
                LOAN_PROUD_INT_ID: newInterestRate.LOAN_PROUD_INT_ID,
                RATE_TYPE: newInterestRate.RATE_TYPE,
                DEFAULT_RATE_PER_MONTH: newInterestRate.DEFAULT_RATE_PER_MONTH,
                ANNUAL_PERCENTAGE_RATE: newInterestRate.ANNUAL_PERCENTAGE_RATE,
                MIN_RATE_PER_MONTH: newInterestRate.MIN_RATE_PER_MONTH,
                MAX_RATE_PER_MONTH: newInterestRate.MAX_RATE_PER_MONTH,
                TERM_TYPE: newInterestRate.TERM_TYPE,
                STATUS: newInterestRate.STATUS,
                VERSION: newInterestRate.VERSION,
                IS_FLAT_RATE: newInterestRate.IS_FLAT_RATE
            },
            ip_address: getClientIp(req),
            user_agent: req.headers['user-agent'],
            entity_id: newInterestRate._id.toString(),
            entity_type: 'LoanInterestRate',
            status: 'SUCCESS',
            description: `Created flat rate loan interest: ${newInterestRate.name} (${newInterestRate.code}) with LOAN_PROUD_INT_ID: ${newInterestRate.LOAN_PROUD_INT_ID}`,
            timestamp: new Date(),
            metadata: {
                route: req.originalUrl,
                method: req.method,
                params: req.params,
                query: req.query
            }
        };

        await new AuditTrail(auditTrailData).save({ session });
        await session.commitTransaction();

        // Format response
        const responseData = newInterestRate.toObject();
        responseData.MIN_LOAN_AMOUNT = responseData.MIN_LOAN_AMOUNT.toString();
        responseData.MAX_LOAN_AMOUNT = responseData.MAX_LOAN_AMOUNT.toString();
        responseData.PROCESSING_FEE_FIXED = responseData.PROCESSING_FEE_FIXED?.toString();

        res.status(201).json({
            success: true,
            message: 'Flat rate interest rate created successfully',
            data: responseData,
            metadata: {
                code: newInterestRate.code,
                loan_proud_int_id: newInterestRate.LOAN_PROUD_INT_ID,
                version: newInterestRate.VERSION,
                created_at: newInterestRate.CREATED_AT,
                effective_date: newInterestRate.EFFECTIVE_DATE,
                is_flat_rate: newInterestRate.IS_FLAT_RATE
            }
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('Error creating Interest Rate:', error);
        
        if (error.name === 'ValidationError') {
            const errorMessages = Object.values(error.errors).map(err => ({
                field: err.path,
                message: err.message,
                type: err.kind
            }));
            
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errorMessages
            });
        }
        
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            let message = `Duplicate value for ${field}: ${error.keyValue[field]}`;
            
            if (field === 'LOAN_PROUD_INT_ID') {
                message = `LOAN_PROUD_INT_ID ${error.keyValue[field]} already exists. Please use a different value.`;
            }
            
            return res.status(400).json({
                success: false,
                message: message,
                error: 'DUPLICATE_KEY_ERROR',
                field: field,
                value: error.keyValue[field]
            });
        }
        
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: `Invalid data type for ${error.path}: ${error.value}`,
                error: 'CAST_ERROR'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Failed to create Interest Rate',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
            request_id: generateEventId()
        });
    } finally {
        session.endSession();
    }
}),

    // GET ALL LOAN INTEREST RATES
    getAllInterestRates: asyncHandler(async (req, res) => {
        try {
            const {
                page = 1,
                limit = 10,
                sortBy = 'CREATED_AT',
                sortOrder = 'desc',
                status,
                rate_type,
                search,
                min_rate,
                max_rate,
                effective_date_from,
                effective_date_to,
                is_flat_rate = true // Default to show only flat rates
            } = req.query;

            // Build query
            const query = { 
                STATUS: { $ne: 'DELETED' },
                IS_FLAT_RATE: true // Always filter for flat rates
            };
            
            if (status) {
                query.STATUS = status.toUpperCase();
            }
            
            if (rate_type) {
                query.RATE_TYPE = rate_type.toUpperCase();
            }
            
            if (search) {
                query.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { code: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } }
                ];
            }
            
            if (min_rate) {
                query.DEFAULT_RATE_PER_MONTH = { $gte: parseFloat(min_rate) };
            }
            
            if (max_rate) {
                query.DEFAULT_RATE_PER_MONTH = { ...query.DEFAULT_RATE_PER_MONTH, $lte: parseFloat(max_rate) };
            }
            
            if (effective_date_from || effective_date_to) {
                query.EFFECTIVE_DATE = {};
                if (effective_date_from) {
                    query.EFFECTIVE_DATE.$gte = new Date(effective_date_from);
                }
                if (effective_date_to) {
                    query.EFFECTIVE_DATE.$lte = new Date(effective_date_to);
                }
            }

            // Sort
            const sortOptions = {};
            sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

            // Execute query with pagination
            const skip = (parseInt(page) - 1) * parseInt(limit);
            
            const [rates, total] = await Promise.all([
                LoanInterestRate.find(query)
                    .sort(sortOptions)
                    .skip(skip)
                    .limit(parseInt(limit))
                    .lean(),
                LoanInterestRate.countDocuments(query)
            ]);

            // Format decimal fields
            const formattedRates = rates.map(rate => ({
                ...rate,
                MIN_LOAN_AMOUNT: rate.MIN_LOAN_AMOUNT?.toString(),
                MAX_LOAN_AMOUNT: rate.MAX_LOAN_AMOUNT?.toString(),
                PROCESSING_FEE_FIXED: rate.PROCESSING_FEE_FIXED?.toString()
            }));

            const totalPages = Math.ceil(total / parseInt(limit));

            res.status(200).json({
                success: true,
                message: 'Flat rate interest rates retrieved successfully',
                data: formattedRates,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages,
                    hasNextPage: parseInt(page) < totalPages,
                    hasPrevPage: parseInt(page) > 1
                },
                metadata: {
                    is_flat_rate: true,
                    count: formattedRates.length,
                    filtered_by: {
                        status: status || 'all',
                        rate_type: rate_type || 'all'
                    }
                }
            });

        } catch (error) {
            console.error('Error fetching Interest Rates:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch Interest Rates',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
        }
    }),

    // GET SINGLE INTEREST RATE BY ID OR CODE
    getInterestRateById: asyncHandler(async (req, res) => {
        try {
            const { id } = req.params;
            
            let query;
            if (mongoose.Types.ObjectId.isValid(id)) {
                query = { _id: id, STATUS: { $ne: 'DELETED' }, IS_FLAT_RATE: true };
            } else {
                query = { code: id.toUpperCase(), STATUS: { $ne: 'DELETED' }, IS_FLAT_RATE: true };
            }

            const interestRate = await LoanInterestRate.findOne(query).lean();
            
            if (!interestRate) {
                return res.status(404).json({
                    success: false,
                    message: 'Flat rate interest rate not found'
                });
            }

            // Format decimal fields
            interestRate.MIN_LOAN_AMOUNT = interestRate.MIN_LOAN_AMOUNT?.toString();
            interestRate.MAX_LOAN_AMOUNT = interestRate.MAX_LOAN_AMOUNT?.toString();
            interestRate.PROCESSING_FEE_FIXED = interestRate.PROCESSING_FEE_FIXED?.toString();

            res.status(200).json({
                success: true,
                message: 'Flat rate interest rate retrieved successfully',
                data: interestRate,
                metadata: {
                    is_flat_rate: interestRate.IS_FLAT_RATE,
                    calculation_method: 'FLAT',
                    interest_type: 'SIMPLE'
                }
            });

        } catch (error) {
            console.error('Error fetching Interest Rate:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch Interest Rate',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
        }
    }),

    // UPDATE INTEREST RATE
    updateInterestRate: asyncHandler(async (req, res) => {
        const session = await mongoose.startSession();
        
        try {
            session.startTransaction();
            
            const { id } = req.params;
            const updateData = req.body;
            const userId = req.user?.id || 'SYSTEM';
            const userName = req.user?.name || 'SYSTEM';

            // Find existing rate
            const existingRate = await LoanInterestRate.findOne({
                _id: id,
                STATUS: { $ne: 'DELETED' },
                IS_FLAT_RATE: true
            }).session(session);
            
            if (!existingRate) {
                return res.status(404).json({
                    success: false,
                    message: 'Flat rate interest rate not found'
                });
            }

            // Prevent updates to critical flat rate fields
            if (updateData.CALCULATION_METHOD && updateData.CALCULATION_METHOD !== 'FLAT') {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot change calculation method from FLAT'
                });
            }
            
            if (updateData.INTEREST_TYPE && updateData.INTEREST_TYPE !== 'SIMPLE') {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot change interest type from SIMPLE for flat rates'
                });
            }
            
            if (updateData.CAPITALIZE_INTEREST !== undefined && updateData.CAPITALIZE_INTEREST !== false) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot enable capitalization for flat rates'
                });
            }

            // Prevent updates if rate is in use
            if (existingRate.IS_ACTIVE && existingRate.IN_USE) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot update an active flat rate that is in use'
                });
            }

            // Store old values for audit
            const oldValues = {
                name: existingRate.name,
                code: existingRate.code,
                DEFAULT_RATE_PER_MONTH: existingRate.DEFAULT_RATE_PER_MONTH,
                MIN_RATE_PER_MONTH: existingRate.MIN_RATE_PER_MONTH,
                MAX_RATE_PER_MONTH: existingRate.MAX_RATE_PER_MONTH,
                STATUS: existingRate.STATUS,
                VERSION: existingRate.VERSION
            };

            // Prepare update data
            const updatePayload = {
                ...updateData,
                // Ensure flat rate fields remain correct
                CALCULATION_METHOD: 'FLAT',
                INTEREST_TYPE: 'SIMPLE',
                CAPITALIZE_INTEREST: false,
                IS_FLAT_RATE: true,
                UPDATED_AT: new Date(),
                LAST_UPDATED_BY: userId,
                VERSION: (parseFloat(existingRate.VERSION || '1.0') + 0.1).toFixed(1)
            };

            // Remove fields that shouldn't be updated
            delete updatePayload._id;
            delete updatePayload.code;
            delete updatePayload.CREATED_AT;
            delete updatePayload.CREATED_BY;
            delete updatePayload.LOAN_PROUD_INT_ID;
            delete updatePayload.IS_FLAT_RATE;

            // If updating rate values, validate them
            if (updateData.MIN_RATE_PER_MONTH || updateData.MAX_RATE_PER_MONTH || updateData.DEFAULT_RATE_PER_MONTH) {
                const minRate = updateData.MIN_RATE_PER_MONTH || existingRate.MIN_RATE_PER_MONTH;
                const maxRate = updateData.MAX_RATE_PER_MONTH || existingRate.MAX_RATE_PER_MONTH;
                const defaultRate = updateData.DEFAULT_RATE_PER_MONTH || existingRate.DEFAULT_RATE_PER_MONTH;
                
                const rateValidation = validateFlatRateValues(minRate, maxRate, defaultRate, existingRate.TERM_TYPE);
                if (!rateValidation.valid) {
                    return res.status(400).json({
                        success: false,
                        message: rateValidation.message
                    });
                }
                
                // Recalculate APR if rate changed
                if (updateData.DEFAULT_RATE_PER_MONTH) {
                    updatePayload.ANNUAL_PERCENTAGE_RATE = parseFloat(defaultRate) * 12;
                }
            }

            // Update the rate
            const updatedRate = await LoanInterestRate.findByIdAndUpdate(
                id,
                updatePayload,
                { new: true, session, runValidators: true }
            );

            // AUDIT TRAIL - FIXED: Using numeric event_id
            const auditTrailData = {
                event_id: generateEventId(),
                user_id: userId,
                user_name: userName,
                event_type: 'UPDATE',
                action: 'UPDATE_LOAN_INTEREST_RATE',
                old_value: oldValues,
                new_value: {
                    name: updatedRate.name,
                    code: updatedRate.code,
                    DEFAULT_RATE_PER_MONTH: updatedRate.DEFAULT_RATE_PER_MONTH,
                    MIN_RATE_PER_MONTH: updatedRate.MIN_RATE_PER_MONTH,
                    MAX_RATE_PER_MONTH: updatedRate.MAX_RATE_PER_MONTH,
                    STATUS: updatedRate.STATUS,
                    VERSION: updatedRate.VERSION,
                    IS_FLAT_RATE: updatedRate.IS_FLAT_RATE
                },
                ip_address: getClientIp(req),
                user_agent: req.headers['user-agent'],
                entity_id: updatedRate._id.toString(),
                entity_type: 'LoanInterestRate',
                status: 'SUCCESS',
                description: `Updated flat rate loan interest: ${updatedRate.name} (${updatedRate.code}) to version ${updatedRate.VERSION}`,
                timestamp: new Date(),
                changes: Object.keys(updateData)
            };

            await new AuditTrail(auditTrailData).save({ session });
            await session.commitTransaction();

            // Format response
            const responseData = updatedRate.toObject();
            responseData.MIN_LOAN_AMOUNT = responseData.MIN_LOAN_AMOUNT?.toString();
            responseData.MAX_LOAN_AMOUNT = responseData.MAX_LOAN_AMOUNT?.toString();
            responseData.PROCESSING_FEE_FIXED = responseData.PROCESSING_FEE_FIXED?.toString();

            res.status(200).json({
                success: true,
                message: 'Flat rate interest rate updated successfully',
                data: responseData,
                metadata: {
                    version: updatedRate.VERSION,
                    updated_at: updatedRate.UPDATED_AT,
                    updated_by: updatedRate.LAST_UPDATED_BY,
                    is_flat_rate: updatedRate.IS_FLAT_RATE
                }
            });

        } catch (error) {
            await session.abortTransaction();
            console.error('Error updating Interest Rate:', error);
            
            if (error.name === 'ValidationError') {
                const errorMessages = Object.values(error.errors).map(err => ({
                    field: err.path,
                    message: err.message
                }));
                
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errorMessages
                });
            }
            
            res.status(500).json({
                success: false,
                message: 'Failed to update Interest Rate',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
        } finally {
            session.endSession();
        }
    }),

    // DELETE/DEACTIVATE INTEREST RATE
    deleteInterestRate: asyncHandler(async (req, res) => {
        const session = await mongoose.startSession();
        
        try {
            session.startTransaction();
            
            const { id } = req.params;
            const { hardDelete = false, reason } = req.body;
            const userId = req.user?.id || 'SYSTEM';
            const userName = req.user?.name || 'SYSTEM';

            // Find the rate
            const interestRate = await LoanInterestRate.findOne({
                _id: id,
                IS_FLAT_RATE: true
            }).session(session);
            
            if (!interestRate) {
                return res.status(404).json({
                    success: false,
                    message: 'Flat rate interest rate not found'
                });
            }

            let result;
            let auditAction;
            let auditDescription;

            if (hardDelete) {
                // Hard delete - only if not in use
                if (interestRate.IN_USE) {
                    return res.status(400).json({
                        success: false,
                        message: 'Cannot delete a flat rate that is in use'
                    });
                }
                
                result = await LoanInterestRate.findByIdAndDelete(id, { session });
                auditAction = 'DELETE_LOAN_INTEREST_RATE';
                auditDescription = `Hard deleted flat rate: ${interestRate.name} (${interestRate.code})`;
            } else {
                // Soft delete (deactivate)
                result = await LoanInterestRate.findByIdAndUpdate(
                    id,
                    {
                        STATUS: 'DELETED',
                        UPDATED_AT: new Date(),
                        LAST_UPDATED_BY: userId,
                        DEACTIVATION_DATE: new Date(),
                        DEACTIVATION_REASON: reason || 'User requested deactivation'
                    },
                    { new: true, session }
                );
                
                auditAction = 'DEACTIVATE_LOAN_INTEREST_RATE';
                auditDescription = `Deactivated flat rate: ${interestRate.name} (${interestRate.code})`;
            }

            // AUDIT TRAIL - FIXED: Using numeric event_id
            const auditTrailData = {
                event_id: generateEventId(),
                user_id: userId,
                user_name: userName,
                event_type: hardDelete ? 'DELETE' : 'UPDATE',
                action: auditAction,
                old_value: {
                    name: interestRate.name,
                    code: interestRate.code,
                    STATUS: interestRate.STATUS,
                    IS_FLAT_RATE: interestRate.IS_FLAT_RATE
                },
                new_value: hardDelete ? null : {
                    STATUS: 'DELETED',
                    DEACTIVATION_DATE: result.DEACTIVATION_DATE,
                    DEACTIVATION_REASON: result.DEACTIVATION_REASON
                },
                ip_address: getClientIp(req),
                user_agent: req.headers['user-agent'],
                entity_id: interestRate._id.toString(),
                entity_type: 'LoanInterestRate',
                status: 'SUCCESS',
                description: auditDescription,
                timestamp: new Date(),
                metadata: {
                    hardDelete,
                    reason: reason || 'No reason provided',
                    was_flat_rate: true
                }
            };

            await new AuditTrail(auditTrailData).save({ session });
            await session.commitTransaction();

            res.status(200).json({
                success: true,
                message: hardDelete 
                    ? 'Flat rate interest rate deleted permanently' 
                    : 'Flat rate interest rate deactivated successfully',
                data: hardDelete ? null : result
            });

        } catch (error) {
            await session.abortTransaction();
            console.error('Error deleting Interest Rate:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete Interest Rate',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
        } finally {
            session.endSession();
        }
    }),

    // ACTIVATE INTEREST RATE
    activateInterestRate: asyncHandler(async (req, res) => {
        const session = await mongoose.startSession();
        
        try {
            session.startTransaction();
            
            const { id } = req.params;
            const userId = req.user?.id || 'SYSTEM';
            const userName = req.user?.name || 'SYSTEM';

            const interestRate = await LoanInterestRate.findOne({
                _id: id,
                STATUS: 'INACTIVE',
                IS_FLAT_RATE: true
            }).session(session);
            
            if (!interestRate) {
                return res.status(404).json({
                    success: false,
                    message: 'Inactive flat rate interest rate not found'
                });
            }

            // Update to active
            const activatedRate = await LoanInterestRate.findByIdAndUpdate(
                id,
                {
                    STATUS: 'ACTIVE',
                    IS_ACTIVE: true,
                    UPDATED_AT: new Date(),
                    LAST_UPDATED_BY: userId,
                    ACTIVATION_DATE: new Date()
                },
                { new: true, session }
            );

            // AUDIT TRAIL
            const auditTrailData = {
                event_id: generateEventId(),
                user_id: userId,
                user_name: userName,
                event_type: 'UPDATE',
                action: 'ACTIVATE_LOAN_INTEREST_RATE',
                old_value: {
                    STATUS: 'INACTIVE'
                },
                new_value: {
                    STATUS: 'ACTIVE',
                    ACTIVATION_DATE: activatedRate.ACTIVATION_DATE
                },
                ip_address: getClientIp(req),
                user_agent: req.headers['user-agent'],
                entity_id: activatedRate._id.toString(),
                entity_type: 'LoanInterestRate',
                status: 'SUCCESS',
                description: `Activated flat rate loan interest: ${activatedRate.name} (${activatedRate.code})`,
                timestamp: new Date()
            };

            await new AuditTrail(auditTrailData).save({ session });
            await session.commitTransaction();

            res.status(200).json({
                success: true,
                message: 'Flat rate interest rate activated successfully',
                data: activatedRate
            });

        } catch (error) {
            await session.abortTransaction();
            console.error('Error activating Interest Rate:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to activate Interest Rate',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
        } finally {
            session.endSession();
        }
    }),

    // CALCULATE INTEREST - FORCED FLAT RATE CALCULATION
    calculateInterest: asyncHandler(async (req, res) => {
        try {
            const { 
                rate_id,
                principal_amount,
                term_value,
                term_type = 'MONTHS',
                calculation_date = new Date()
            } = req.body;

            // Validate required fields
            if (!rate_id || !principal_amount || !term_value) {
                return res.status(400).json({
                    success: false,
                    message: 'rate_id, principal_amount, and term_value are required'
                });
            }

            // Get interest rate - MUST be a flat rate
            const interestRate = await LoanInterestRate.findOne({
                _id: rate_id,
                STATUS: 'ACTIVE',
                IS_FLAT_RATE: true
            });

            if (!interestRate) {
                return res.status(404).json({
                    success: false,
                    message: 'Active flat rate interest rate not found'
                });
            }

            // Convert term to months
            const termMonths = convertTermToMonths(parseInt(term_value), term_type);
            
            // Validate term is within rate's allowed range
            const minTermMonths = convertTermToMonths(interestRate.MIN_TERM_VALUE, interestRate.TERM_TYPE);
            const maxTermMonths = convertTermToMonths(interestRate.MAX_TERM_VALUE, interestRate.TERM_TYPE);
            
            if (termMonths < minTermMonths || termMonths > maxTermMonths) {
                return res.status(400).json({
                    success: false,
                    message: `Term must be between ${interestRate.MIN_TERM_VALUE} ${interestRate.TERM_TYPE} and ${interestRate.MAX_TERM_VALUE} ${interestRate.TERM_TYPE}`,
                    valid_range: {
                        min: interestRate.MIN_TERM_VALUE,
                        max: interestRate.MAX_TERM_VALUE,
                        term_type: interestRate.TERM_TYPE
                    }
                });
            }

            // Validate principal amount
            const principal = parseFloat(principal_amount);
            const minLoan = parseFloat(interestRate.MIN_LOAN_AMOUNT.toString());
            const maxLoan = parseFloat(interestRate.MAX_LOAN_AMOUNT.toString());
            
            if (principal < minLoan || principal > maxLoan) {
                return res.status(400).json({
                    success: false,
                    message: `Principal amount must be between ${minLoan} and ${maxLoan}`,
                    valid_range: {
                        min: minLoan,
                        max: maxLoan
                    }
                });
            }

            // FORCED FLAT RATE CALCULATION
            const flatRatePercent = interestRate.DEFAULT_RATE_PER_MONTH; // This is the flat rate percentage
            
            // Calculate using flat rate formula
            const flatRateCalculation = calculateFlatRateEMI(principal, flatRatePercent, termMonths);
            
            // Calculate origination fee
            const originationFee = principal * (interestRate.ORIGINATION_FEE_RATE / 100);
            const processingFee = parseFloat(interestRate.PROCESSING_FEE_FIXED?.toString() || '0');
            
            const totalFees = originationFee + processingFee;
            const netDisbursement = principal - totalFees;
            const totalRepayment = flatRateCalculation.totalRepayment + totalFees;
            const emiWithFees = totalRepayment / termMonths;

            // Prepare response
            const calculation = {
                input: {
                    principal_amount: principal,
                    term_value: parseInt(term_value),
                    term_type,
                    term_months: termMonths,
                    calculation_date: new Date(calculation_date),
                    rate_id: interestRate._id,
                    rate_code: interestRate.code,
                    rate_name: interestRate.name,
                    is_flat_rate: true
                },
                rates: {
                    flat_rate_percent: flatRatePercent,
                    monthly_rate_percent: flatRatePercent,
                    annual_rate_percent: interestRate.ANNUAL_PERCENTAGE_RATE,
                    interest_type: 'SIMPLE (FORCED)',
                    calculation_method: 'FLAT (FORCED)'
                },
                flat_rate_calculation: {
                    formula: 'Total Interest = Principal × (FlatRate / 100)',
                    total_interest: flatRateCalculation.totalInterest,
                    total_repayment_without_fees: flatRateCalculation.totalRepayment,
                    emi_without_fees: flatRateCalculation.emi
                },
                calculations: {
                    interest_amount: flatRateCalculation.totalInterest,
                    principal_amount: principal,
                    total_amount_without_fees: flatRateCalculation.totalRepayment,
                    origination_fee: parseFloat(originationFee.toFixed(2)),
                    processing_fee: parseFloat(processingFee.toFixed(2)),
                    total_fees: parseFloat(totalFees.toFixed(2)),
                    net_disbursement: parseFloat(netDisbursement.toFixed(2)),
                    total_repayment: parseFloat(totalRepayment.toFixed(2))
                },
                schedule: {
                    repayment_frequency: interestRate.REPAYMENT_FREQUENCY,
                    number_of_payments: termMonths,
                    estimated_payment_amount: parseFloat(emiWithFees.toFixed(2)),
                    monthly_breakdown: flatRateCalculation.breakdown
                },
                metadata: {
                    calculation_timestamp: new Date(),
                    rate_version: interestRate.VERSION,
                    is_amortized: interestRate.AMORTIZED,
                    forced_calculation: 'FLAT_RATE',
                    note: 'All calculations use flat rate formula regardless of stored values'
                }
            };

            res.status(200).json({
                success: true,
                message: 'Flat rate interest calculated successfully',
                data: calculation
            });

        } catch (error) {
            console.error('Error calculating interest:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to calculate interest',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
        }
    }),

    // MIGRATE EXISTING RATES TO FLAT RATE
    migrateToFlatRate: asyncHandler(async (req, res) => {
        const session = await mongoose.startSession();
        
        try {
            session.startTransaction();
            
            const userId = req.user?.id || 'SYSTEM';
            const userName = req.user?.name || 'SYSTEM';
            
            // Update all existing rates to flat rate
            const result = await LoanInterestRate.updateMany(
                { STATUS: { $ne: 'DELETED' } },
                {
                    $set: {
                        CALCULATION_METHOD: 'FLAT',
                        INTEREST_TYPE: 'SIMPLE',
                        CAPITALIZE_INTEREST: false,
                        IS_FLAT_RATE: true,
                        UPDATED_AT: new Date(),
                        LAST_UPDATED_BY: userId,
                        VERSION: '2.0' // Major version bump
                    }
                },
                { session }
            );
            
            // AUDIT TRAIL
            const auditTrailData = {
                event_id: generateEventId(),
                user_id: userId,
                user_name: userName,
                event_type: 'UPDATE',
                action: 'MIGRATE_TO_FLAT_RATE',
                old_value: null,
                new_value: {
                    migrated_count: result.modifiedCount,
                    timestamp: new Date()
                },
                ip_address: getClientIp(req),
                user_agent: req.headers['user-agent'],
                entity_type: 'LoanInterestRate',
                status: 'SUCCESS',
                description: `Migrated ${result.modifiedCount} interest rates to flat rate calculation`,
                timestamp: new Date()
            };
            
            await new AuditTrail(auditTrailData).save({ session });
            await session.commitTransaction();
            
            res.status(200).json({
                success: true,
                message: `Successfully migrated ${result.modifiedCount} interest rates to flat rate calculation`,
                data: result
            });
            
        } catch (error) {
            await session.abortTransaction();
            console.error('Error migrating to flat rate:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to migrate interest rates',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
        } finally {
            session.endSession();
        }
    })
};

export default LoanInterestController;