// controllers/LoanInterestController.js - COMPLETE FIXED VERSION with Sequelize
import asyncHandler from 'express-async-handler';
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import { validationResult } from 'express-validator';

// Models (Sequelize imports)
import LoanInterestRate from '../models/LoanInterestRate.js';
import RateIndex from '../models/Rate-Index.js'; // FIXED: Correct import path
import AuditTrail from '../models/AuditTrail.js';

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

const generateUniqueLoanProudIntId = async (transaction) => {
    try {
        const lastRate = await LoanInterestRate.findOne({
            order: [['LOAN_PROUD_INT_ID', 'DESC']],
            attributes: ['LOAN_PROUD_INT_ID'],
            transaction
        });
        
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
 
createInterestRate: asyncHandler(async (req, res) => {
    const transaction = await sequelize.transaction();
    let committed = false;

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        // Destructure request body
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
            MIN_LOAN_AMOUNT = 0.00,
            MAX_LOAN_AMOUNT = 1000000000.00,
            CAPITALIZE_INTEREST = false,
            COMPOUNDING_FREQUENCY = 'MONTHLY',
            AMORTIZED = true,
            REPAYMENT_FREQUENCY = 'MONTHLY',
            RATE_CHANGE_ALLOWED = false,
            RATE_CHANGE_NOTICE_DAYS = 30,
            MAX_RATE_CHANGES = 1,
            ORIGINATION_FEE_RATE = 0,
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

        // ========== VALIDATION ==========
        if (INTEREST_TYPE.toUpperCase() !== 'SIMPLE') {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'For flat rate calculation, INTEREST_TYPE must be SIMPLE'
            });
        }
        
        if (CAPITALIZE_INTEREST) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'For flat rate calculation, CAPITALIZE_INTEREST must be false'
            });
        }

        // Validate rate values
        if (MIN_RATE_PER_MONTH === undefined || MAX_RATE_PER_MONTH === undefined || DEFAULT_RATE_PER_MONTH === undefined) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'MIN_RATE_PER_MONTH, MAX_RATE_PER_MONTH, and DEFAULT_RATE_PER_MONTH are required'
            });
        }

        const rateValidation = validateFlatRateValues(
            MIN_RATE_PER_MONTH,
            MAX_RATE_PER_MONTH,
            DEFAULT_RATE_PER_MONTH,
            TERM_TYPE
        );
        if (!rateValidation.valid) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: rateValidation.message
            });
        }

        // Variables
        let finalLoanProudIntId;
        let finalCode;
        let minRate, maxRate, defaultRate;
        let minTerm, maxTerm;
        let minTermMonths, maxTermMonths;
        let minLoanAmount, maxLoanAmount;
        let calculatedAPR;
        let compoundingFrequencyValue;

        // LOAN_PROUD_INT_ID generation
        if (LOAN_PROUD_INT_ID) {
            const providedId = parseInt(LOAN_PROUD_INT_ID);
            if (isNaN(providedId)) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'LOAN_PROUD_INT_ID must be a valid number'
                });
            }
            const existingWithId = await LoanInterestRate.findOne({ 
                where: { LOAN_PROUD_INT_ID: providedId },
                transaction 
            });
            if (existingWithId) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: `LOAN_PROUD_INT_ID ${providedId} already exists.`
                });
            }
            finalLoanProudIntId = providedId;
        } else {
            finalLoanProudIntId = await generateUniqueLoanProudIntId(transaction);
        }

        // Name validation
        if (!name?.trim()) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Rate name is required'
            });
        }

        // Term values
        minTerm = parseInt(MIN_TERM_VALUE);
        maxTerm = parseInt(MAX_TERM_VALUE);
        if (minTerm > maxTerm) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Minimum term cannot be greater than maximum term'
            });
        }
        if (minTerm < 1) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Minimum term must be at least 1'
            });
        }

        minTermMonths = convertTermToMonths(minTerm, TERM_TYPE);
        maxTermMonths = convertTermToMonths(maxTerm, TERM_TYPE);

        // Term type validation
        const validTermTypes = ['DAYS', 'WEEKS', 'MONTHS', 'QUARTERS', 'YEARS'];
        if (!validTermTypes.includes(TERM_TYPE.toUpperCase())) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Invalid TERM_TYPE. Must be one of: ${validTermTypes.join(', ')}`
            });
        }

        // Rate type validation
        const validRateTypes = ['FIXED', 'VARIABLE', 'TIERED', 'PROMOTIONAL', 'INTRODUCTORY'];
        if (!validRateTypes.includes(RATE_TYPE.toUpperCase())) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Invalid RATE_TYPE. Must be one of: ${validRateTypes.join(', ')}`
            });
        }

        // Check duplicate name
        const existingByName = await LoanInterestRate.findOne({ 
            where: { 
                name: name.trim(),
                status: { [Op.ne]: 'DELETED' }
            },
            transaction 
        });
        if (existingByName) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Interest rate with name '${name}' already exists`
            });
        }

        // Generate or validate code
        finalCode = code?.toUpperCase();
        if (!finalCode) {
            finalCode = generateInterestRateCode(RATE_TYPE);
        } else {
            const existingWithCode = await LoanInterestRate.findOne({ 
                where: { 
                    code: finalCode,
                    status: { [Op.ne]: 'DELETED' }
                },
                transaction 
            });
            if (existingWithCode) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: `Interest rate with code '${finalCode}' already exists`
                });
            }
        }

        // Parse rate values
        minRate = parseFloat(MIN_RATE_PER_MONTH);
        maxRate = parseFloat(MAX_RATE_PER_MONTH);
        defaultRate = parseFloat(DEFAULT_RATE_PER_MONTH);
        
        if (isNaN(minRate) || isNaN(maxRate) || isNaN(defaultRate)) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'MIN_RATE_PER_MONTH, MAX_RATE_PER_MONTH, and DEFAULT_RATE_PER_MONTH must be valid numbers'
            });
        }

        // Loan amount validation
        minLoanAmount = parseFloat(MIN_LOAN_AMOUNT);
        maxLoanAmount = parseFloat(MAX_LOAN_AMOUNT);
        if (minLoanAmount < 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'MIN_LOAN_AMOUNT must be non-negative'
            });
        }
        if (minLoanAmount > maxLoanAmount) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'MIN_LOAN_AMOUNT cannot be greater than MAX_LOAN_AMOUNT'
            });
        }

        // APR calculation
        calculatedAPR = ANNUAL_PERCENTAGE_RATE 
            ? parseFloat(ANNUAL_PERCENTAGE_RATE)
            : defaultRate * 12;

        // Compounding frequency
        if (COMPOUNDING_FREQUENCY && [
            'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY', 'AT_MATURITY', 'NONE'
        ].includes(COMPOUNDING_FREQUENCY.toUpperCase())) {
            compoundingFrequencyValue = COMPOUNDING_FREQUENCY.toUpperCase();
        } else {
            compoundingFrequencyValue = 'AT_MATURITY';
        }

        // Ensure CREATED_BY is provided
        if (!CREATED_BY) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'CREATED_BY is required'
            });
        }

        // ✅ FIXED: Handle tags properly as an array
        let tagsArray = [];
        if (TAGS) {
            if (Array.isArray(TAGS)) {
                tagsArray = TAGS.map(tag => typeof tag === 'string' ? tag.trim() : String(tag));
            } else if (typeof TAGS === 'string') {
                try {
                    const parsed = JSON.parse(TAGS);
                    tagsArray = Array.isArray(parsed) ? parsed.map(t => t.trim()) : [TAGS.trim()];
                } catch (e) {
                    // If it's a comma-separated string
                    if (TAGS.includes(',')) {
                        tagsArray = TAGS.split(',').map(s => s.trim());
                    } else {
                        tagsArray = [TAGS.trim()];
                    }
                }
            } else if (typeof TAGS === 'object') {
                tagsArray = Array.isArray(TAGS) ? TAGS.map(t => String(t).trim()) : Object.values(TAGS).map(t => String(t).trim());
            }
        }

        // ✅ CRITICAL: Use snake_case keys matching the model columns
        const interestRateData = {
            loan_proud_int_id: finalLoanProudIntId,
            name: name.trim(),
            code: finalCode,
            description: description?.trim(),
            rate_type: RATE_TYPE.toUpperCase(),
            interest_type: 'SIMPLE',
            calculation_method: 'FLAT',
            accrual_basis: ACCRUAL_BASIS.toUpperCase(),
            accrual_frequency: ACCRUAL_FREQUENCY.toUpperCase(),
            min_rate_per_month: minRate,
            max_rate_per_month: maxRate,
            default_rate_per_month: defaultRate,
            annual_percentage_rate: calculatedAPR,
            min_term_value: minTerm,
            max_term_value: maxTerm,
            min_term_months: minTermMonths,
            max_term_months: maxTermMonths,
            term_type: TERM_TYPE.toUpperCase(),
            index_rate_id: null,
            margin_rate: 0,
            spread_rate: 0,
            min_loan_amount: minLoanAmount,
            max_loan_amount: maxLoanAmount,
            capitalize_interest: false,
            compounding_frequency: compoundingFrequencyValue,
            amortized: Boolean(AMORTIZED),
            repayment_frequency: REPAYMENT_FREQUENCY.toUpperCase(),
            rate_change_allowed: false,
            rate_change_notice_days: 0,
            max_rate_changes: 0,
            origination_fee_rate: parseFloat(ORIGINATION_FEE_RATE),
            processing_fee_fixed: parseFloat(PROCESSING_FEE_FIXED),
            late_payment_penalty_rate: parseFloat(LATE_PAYMENT_PENALTY_RATE),
            early_repayment_penalty_rate: parseFloat(EARLY_REPAYMENT_PENALTY_RATE),
            status: STATUS.toUpperCase(),
            created_by: CREATED_BY,
            effective_date: new Date(EFFECTIVE_DATE),
            expiry_date: EXPIRY_DATE ? new Date(EXPIRY_DATE) : null,
            // ✅ FIXED: tags as array (NOT JSON string)
            tags: tagsArray,
            notes: NOTES?.trim(),
            version: VERSION,
            created_at: new Date(),
            updated_at: new Date(),
            last_updated_by: CREATED_BY,
            is_active: STATUS.toUpperCase() === 'ACTIVE',
            is_flat_rate: true
        };

        // TOTAL_INTEREST_RATE (optional)
        if (!req.body.total_interest_rate) {
            interestRateData.total_interest_rate = defaultRate * maxTerm;
        } else {
            interestRateData.total_interest_rate = parseFloat(req.body.total_interest_rate);
        }

        const newInterestRate = await LoanInterestRate.create(interestRateData, { transaction });

        // Commit transaction before audit trail
        await transaction.commit();
        committed = true;

        // Audit trail (optional)
        try {
            const auditTrailData = {
                event_id: generateEventId(),
                user_id: CREATED_BY,
                user_name: req.user?.name || 'SYSTEM',
                event_type: 'CREATE',
                action: 'CREATE_LOAN_INTEREST_RATE',
                old_value: null,
                new_value: {
                    id: newInterestRate.id,
                    name: newInterestRate.name,
                    code: newInterestRate.code,
                    loan_proud_int_id: newInterestRate.loan_proud_int_id,
                    rate_type: newInterestRate.rate_type,
                    default_rate_per_month: newInterestRate.default_rate_per_month,
                    annual_percentage_rate: newInterestRate.annual_percentage_rate,
                    min_rate_per_month: newInterestRate.min_rate_per_month,
                    max_rate_per_month: newInterestRate.max_rate_per_month,
                    term_type: newInterestRate.term_type,
                    status: newInterestRate.status,
                    version: newInterestRate.version,
                    is_flat_rate: newInterestRate.is_flat_rate,
                    tags: newInterestRate.tags
                },
                ip_address: getClientIp(req),
                entity_id: newInterestRate.id,
                entity_type: 'LoanInterestRate',
                status: 'SUCCESS',
                description: `Created flat rate loan interest: ${newInterestRate.name} (${newInterestRate.code})`,
                timestamp: new Date(),
                metadata: {
                    route: req.originalUrl,
                    method: req.method,
                    user_agent: req.headers['user-agent']
                }
            };
            await AuditTrail.create(auditTrailData);
        } catch (auditError) {
            console.warn('Audit trail creation failed, continuing without audit:', auditError.message);
        }

        // Success response
        res.status(201).json({
            success: true,
            message: 'Flat rate interest rate created successfully',
            data: newInterestRate.toJSON(),
            metadata: {
                code: finalCode,
                loan_proud_int_id: finalLoanProudIntId,
                version: VERSION,
                effective_date: EFFECTIVE_DATE,
                expiry_date: EXPIRY_DATE,
                is_flat_rate: true,
                is_active: STATUS.toUpperCase() === 'ACTIVE',
                term_range: `${MIN_TERM_VALUE} - ${MAX_TERM_VALUE} ${TERM_TYPE.toLowerCase()}`,
                term_months: `${minTermMonths} - ${maxTermMonths} months`,
                rate_range: `${minRate} - ${maxRate}% per month`,
                annual_rate: `${(defaultRate * 12).toFixed(2)}% per year`,
                tags: tagsArray
            }
        });

    } catch (error) {
        if (!committed) await transaction.rollback();
        console.error('Error creating Interest Rate:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
        });
    }
}),


    // GET ALL LOAN INTEREST RATES with Sequelize
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
            const where = { 
                STATUS: { [Op.ne]: 'DELETED' },
                IS_FLAT_RATE: true // Always filter for flat rates
            };
            
            if (status) {
                where.STATUS = status.toUpperCase();
            }
            
            if (rate_type) {
                where.RATE_TYPE = rate_type.toUpperCase();
            }
            
            if (search) {
                where[Op.or] = [
                    { name: { [Op.iLike]: `%${search}%` } },
                    { code: { [Op.iLike]: `%${search}%` } },
                    { description: { [Op.iLike]: `%${search}%` } }
                ];
            }
            
            if (min_rate) {
                where.DEFAULT_RATE_PER_MONTH = { [Op.gte]: parseFloat(min_rate) };
            }
            
            if (max_rate) {
                where.DEFAULT_RATE_PER_MONTH = { 
                    ...(where.DEFAULT_RATE_PER_MONTH || {}),
                    [Op.lte]: parseFloat(max_rate) 
                };
            }
            
            if (effective_date_from || effective_date_to) {
                where.EFFECTIVE_DATE = {};
                if (effective_date_from) {
                    where.EFFECTIVE_DATE[Op.gte] = new Date(effective_date_from);
                }
                if (effective_date_to) {
                    where.EFFECTIVE_DATE[Op.lte] = new Date(effective_date_to);
                }
            }

            // Execute query with pagination
            const offset = (parseInt(page) - 1) * parseInt(limit);
            const order = [[sortBy, sortOrder.toUpperCase()]];
            
            const { count, rows: rates } = await LoanInterestRate.findAndCountAll({
                where,
                order,
                offset,
                limit: parseInt(limit)
            });

            const totalPages = Math.ceil(count / parseInt(limit));

            res.status(200).json({
                success: true,
                message: 'Flat rate interest rates retrieved successfully',
                data: rates.map(rate => rate.toJSON()),
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: count,
                    totalPages,
                    hasNextPage: parseInt(page) < totalPages,
                    hasPrevPage: parseInt(page) > 1
                },
                metadata: {
                    is_flat_rate: true,
                    count: rates.length,
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

    // GET SINGLE INTEREST RATE BY ID OR CODE with Sequelize
    getInterestRateById: asyncHandler(async (req, res) => {
        try {
            const { id } = req.params;
            
            let where;
            
            // Check if it's an ObjectId or a code
            if (/^\d+$/.test(id)) {
                // It's a numeric ID
                where = { LOAN_PROUD_INT_ID: parseInt(id) };
            } else if (/^[0-9a-fA-F]{24}$/.test(id)) {
                // It's a MongoDB-style ObjectId (but using Sequelize's id)
                where = { id };
            } else {
                // It's a code
                where = { code: id.toUpperCase() };
            }
            
            where.STATUS = { [Op.ne]: 'DELETED' };
            where.IS_FLAT_RATE = true;

            const interestRate = await LoanInterestRate.findOne({ where });
            
            if (!interestRate) {
                return res.status(404).json({
                    success: false,
                    message: 'Flat rate interest rate not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Flat rate interest rate retrieved successfully',
                data: interestRate.toJSON(),
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

    // UPDATE INTEREST RATE with Sequelize
    updateInterestRate: asyncHandler(async (req, res) => {
        const transaction = await sequelize.transaction();
        
        try {
            const { id } = req.params;
            const updateData = req.body;
            const userId = req.user?.id || 'SYSTEM';
            const userName = req.user?.name || 'SYSTEM';

            // Find existing rate
            const existingRate = await LoanInterestRate.findOne({
                where: {
                    id,
                    STATUS: { [Op.ne]: 'DELETED' },
                    IS_FLAT_RATE: true
                },
                transaction
            });
            
            if (!existingRate) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Flat rate interest rate not found'
                });
            }

            // Prevent updates to critical flat rate fields
            if (updateData.CALCULATION_METHOD && updateData.CALCULATION_METHOD !== 'FLAT') {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Cannot change calculation method from FLAT'
                });
            }
            
            if (updateData.INTEREST_TYPE && updateData.INTEREST_TYPE !== 'SIMPLE') {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Cannot change interest type from SIMPLE for flat rates'
                });
            }
            
            if (updateData.CAPITALIZE_INTEREST !== undefined && updateData.CAPITALIZE_INTEREST !== false) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Cannot enable capitalization for flat rates'
                });
            }

            // Prevent updates if rate is in use
            if (existingRate.IS_ACTIVE && existingRate.IN_USE) {
                await transaction.rollback();
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
            delete updatePayload.id;
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
                    await transaction.rollback();
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
            await existingRate.update(updatePayload, { transaction });

            // AUDIT TRAIL - FIXED: Using numeric event_id
            const auditTrailData = {
                event_id: generateEventId(),
                user_id: userId,
                user_name: userName,
                event_type: 'UPDATE',
                action: 'UPDATE_LOAN_INTEREST_RATE',
                old_value: oldValues,
                new_value: {
                    name: existingRate.name,
                    code: existingRate.code,
                    DEFAULT_RATE_PER_MONTH: existingRate.DEFAULT_RATE_PER_MONTH,
                    MIN_RATE_PER_MONTH: existingRate.MIN_RATE_PER_MONTH,
                    MAX_RATE_PER_MONTH: existingRate.MAX_RATE_PER_MONTH,
                    STATUS: existingRate.STATUS,
                    VERSION: existingRate.VERSION,
                    IS_FLAT_RATE: existingRate.IS_FLAT_RATE
                },
                ip_address: getClientIp(req),
                user_agent: req.headers['user-agent'],
                entity_id: existingRate.id,
                entity_type: 'LoanInterestRate',
                status: 'SUCCESS',
                description: `Updated flat rate loan interest: ${existingRate.name} (${existingRate.code}) to version ${existingRate.VERSION}`,
                timestamp: new Date(),
                changes: Object.keys(updateData)
            };

            await AuditTrail.create(auditTrailData, { transaction });
            await transaction.commit();

            // Refresh to get updated values
            await existingRate.reload();

            res.status(200).json({
                success: true,
                message: 'Flat rate interest rate updated successfully',
                data: existingRate.toJSON(),
                metadata: {
                    version: existingRate.VERSION,
                    updated_at: existingRate.UPDATED_AT,
                    updated_by: existingRate.LAST_UPDATED_BY,
                    is_flat_rate: existingRate.IS_FLAT_RATE
                }
            });

        } catch (error) {
            await transaction.rollback();
            console.error('Error updating Interest Rate:', error);
            
            if (error.name === 'SequelizeValidationError') {
                const errorMessages = error.errors.map(err => ({
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
        }
    }),

    // DELETE/DEACTIVATE INTEREST RATE with Sequelize
    deleteInterestRate: asyncHandler(async (req, res) => {
        const transaction = await sequelize.transaction();
        
        try {
            const { id } = req.params;
            const { hardDelete = false, reason } = req.body;
            const userId = req.user?.id || 'SYSTEM';
            const userName = req.user?.name || 'SYSTEM';

            // Find the rate
            const interestRate = await LoanInterestRate.findOne({
                where: {
                    id,
                    IS_FLAT_RATE: true
                },
                transaction
            });
            
            if (!interestRate) {
                await transaction.rollback();
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
                    await transaction.rollback();
                    return res.status(400).json({
                        success: false,
                        message: 'Cannot delete a flat rate that is in use'
                    });
                }
                
                result = interestRate;
                await interestRate.destroy({ transaction });
                auditAction = 'DELETE_LOAN_INTEREST_RATE';
                auditDescription = `Hard deleted flat rate: ${interestRate.name} (${interestRate.code})`;
            } else {
                // Soft delete (deactivate)
                await interestRate.update({
                    STATUS: 'DELETED',
                    UPDATED_AT: new Date(),
                    LAST_UPDATED_BY: userId,
                    DEACTIVATION_DATE: new Date(),
                    DEACTIVATION_REASON: reason || 'User requested deactivation'
                }, { transaction });
                
                result = interestRate;
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
                entity_id: interestRate.id,
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

            await AuditTrail.create(auditTrailData, { transaction });
            await transaction.commit();

            res.status(200).json({
                success: true,
                message: hardDelete 
                    ? 'Flat rate interest rate deleted permanently' 
                    : 'Flat rate interest rate deactivated successfully',
                data: hardDelete ? null : result.toJSON()
            });

        } catch (error) {
            await transaction.rollback();
            console.error('Error deleting Interest Rate:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete Interest Rate',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
        }
    }),

    // ACTIVATE INTEREST RATE with Sequelize
    activateInterestRate: asyncHandler(async (req, res) => {
        const transaction = await sequelize.transaction();
        
        try {
            const { id } = req.params;
            const userId = req.user?.id || 'SYSTEM';
            const userName = req.user?.name || 'SYSTEM';

            const interestRate = await LoanInterestRate.findOne({
                where: {
                    id,
                    STATUS: 'INACTIVE',
                    IS_FLAT_RATE: true
                },
                transaction
            });
            
            if (!interestRate) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Inactive flat rate interest rate not found'
                });
            }

            // Update to active
            await interestRate.update({
                STATUS: 'ACTIVE',
                IS_ACTIVE: true,
                UPDATED_AT: new Date(),
                LAST_UPDATED_BY: userId,
                ACTIVATION_DATE: new Date()
            }, { transaction });

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
                    ACTIVATION_DATE: interestRate.ACTIVATION_DATE
                },
                ip_address: getClientIp(req),
                user_agent: req.headers['user-agent'],
                entity_id: interestRate.id,
                entity_type: 'LoanInterestRate',
                status: 'SUCCESS',
                description: `Activated flat rate loan interest: ${interestRate.name} (${interestRate.code})`,
                timestamp: new Date()
            };

            await AuditTrail.create(auditTrailData, { transaction });
            await transaction.commit();

            // Refresh to get updated values
            await interestRate.reload();

            res.status(200).json({
                success: true,
                message: 'Flat rate interest rate activated successfully',
                data: interestRate.toJSON()
            });

        } catch (error) {
            await transaction.rollback();
            console.error('Error activating Interest Rate:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to activate Interest Rate',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
        }
    }),

    // CALCULATE INTEREST - FORCED FLAT RATE CALCULATION with Sequelize
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
                where: {
                    id: rate_id,
                    STATUS: 'ACTIVE',
                    IS_FLAT_RATE: true
                }
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
            const minLoan = parseFloat(interestRate.MIN_LOAN_AMOUNT);
            const maxLoan = parseFloat(interestRate.MAX_LOAN_AMOUNT);
            
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
            const processingFee = parseFloat(interestRate.PROCESSING_FEE_FIXED || '0');
            
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
                    rate_id: interestRate.id,
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

    // MIGRATE EXISTING RATES TO FLAT RATE with Sequelize
    migrateToFlatRate: asyncHandler(async (req, res) => {
        const transaction = await sequelize.transaction();
        
        try {
            const userId = req.user?.id || 'SYSTEM';
            const userName = req.user?.name || 'SYSTEM';
            
            // Update all existing rates to flat rate
            const [updatedCount] = await LoanInterestRate.update(
                {
                    CALCULATION_METHOD: 'FLAT',
                    INTEREST_TYPE: 'SIMPLE',
                    CAPITALIZE_INTEREST: false,
                    IS_FLAT_RATE: true,
                    UPDATED_AT: new Date(),
                    LAST_UPDATED_BY: userId,
                    VERSION: '2.0' // Major version bump
                },
                {
                    where: { STATUS: { [Op.ne]: 'DELETED' } },
                    transaction
                }
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
                    migrated_count: updatedCount,
                    timestamp: new Date()
                },
                ip_address: getClientIp(req),
                user_agent: req.headers['user-agent'],
                entity_type: 'LoanInterestRate',
                status: 'SUCCESS',
                description: `Migrated ${updatedCount} interest rates to flat rate calculation`,
                timestamp: new Date()
            };
            
            await AuditTrail.create(auditTrailData, { transaction });
            await transaction.commit();
            
            res.status(200).json({
                success: true,
                message: `Successfully migrated ${updatedCount} interest rates to flat rate calculation`,
                data: { modifiedCount: updatedCount }
            });
            
        } catch (error) {
            await transaction.rollback();
            console.error('Error migrating to flat rate:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to migrate interest rates',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
        }
    })
};

export default LoanInterestController;