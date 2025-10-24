import mongoose from 'mongoose';
import LoanAccountDetails from '../models/LoanAccountDetails.js';
import CustomerAccount from '../models/CustomerAccount.js';
import Transaction from '../models/Transaction.js';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import AuditTrail from '../models/AuditTrail.js';
import { calculateMaturityDate, generateRepaymentSchedule } from '../utils/loanUtils.js';
import auditLogger from '../utils/AuditLogger.js'; // Import the winston-based logger

// Create Loan Account Details
export const createLoanAccountDetails = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const {
            CUST_ID,
            ACCT_NO,
            CUST_NM,
            PROD_ID,
            APPL_ID,
            CRNCY_ID,
            BU_ID,
            PRIMARY_OFFICER_ID,
            START_DT,
            TERM_CD,
            TERM_VALUE,
            INTEREST_RATE,
            LOAN_AMOUNT,
            TRANSACTION_TYPE,
            CREATED_BY
        } = req.body;

        // Validate required fields
        if (!CUST_ID || !ACCT_NO || !CUST_NM || !PROD_ID || !APPL_ID || 
            !CRNCY_ID || !BU_ID || !PRIMARY_OFFICER_ID || !START_DT || 
            !TERM_CD || !TERM_VALUE || !INTEREST_RATE || !LOAN_AMOUNT || !CREATED_BY) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Check if account already exists
        const existingAccount = await LoanAccountDetails.findOne({ 
            $or: [{ ACCT_NO }, { APPL_ID }] 
        }).session(session);
        
        if (existingAccount) {
            await session.abortTransaction();
            return res.status(409).json({ 
                message: existingAccount.ACCT_NO === ACCT_NO ? 
                    'Loan account already exists' : 'Application ID already in use'
            });
        }

        // Calculate maturity date
        const MATURITY_DT = calculateMaturityDate(START_DT, TERM_VALUE, TERM_CD);

        // Create new loan account details
        const loanAccountDetails = new LoanAccountDetails({
            // Core Identification
            ACCT_NO,
            CUST_ID,
            CUST_NM,
            PROD_ID,
            APPL_ID,
            CRNCY_ID,
            BU_ID,
            PRIMARY_OFFICER_ID,
            
            // Loan Terms
            START_DT,
            TERM_CD,
            TERM_VALUE,
            MATURITY_DT,
            INTEREST_RATE,
            LOAN_AMOUNT,
            
            // Status
            STATUS: 'PENDING',
            LOAN_STATUS: 'APPLICATION',
            APPROVAL_STATUS: 'PENDING',
            
            // Transaction Info
            TRANSACTION_TYPE,
            
            // Audit
            CREATED_BY
        });

        await loanAccountDetails.save({ session });

        // Generate repayment schedule
        await generateRepaymentSchedule({
            ACCT_NO,
            START_DT,
            MATURITY_DT,
            TERM_CD,
            LOAN_AMOUNT,
            INTEREST_RATE,
            CREATED_BY
        }, session);

        // Log audit trail using winston logger
        auditLogger.info('Audit Event', {
            entity_type: 'LOAN_ACCOUNT',
            entity_id: ACCT_NO,
            user_id: CREATED_BY,
            action: 'CREATE',
            old_value: null,
            new_value: {
                accountNumber: ACCT_NO,
                customerId: CUST_ID,
                productId: PROD_ID,
                amount: LOAN_AMOUNT,
                interestRate: INTEREST_RATE,
                term: `${TERM_VALUE} ${TERM_CD}`
            },
            ip_address: req.ip || '127.0.0.1',
            event_type: 'LOAN_ACCOUNT_CREATION',
            outcome: 'SUCCESS'
        });

        await session.commitTransaction();

        res.status(201).json({
            success: true,
            message: 'Loan account created successfully',
            data: loanAccountDetails
        });
    } catch (error) {
        await session.abortTransaction();
        
        // Log failure audit trail
        auditLogger.error('Audit Event', {
            entity_type: 'LOAN_ACCOUNT',
            entity_id: req.body.ACCT_NO,
            user_id: req.body.CREATED_BY || 'UNKNOWN',
            action: 'CREATE',
            old_value: null,
            new_value: null,
            ip_address: req.ip || '127.0.0.1',
            event_type: 'LOAN_ACCOUNT_CREATION',
            outcome: 'FAILURE',
            error: error.message
        });

        console.error('Error creating loan account:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create loan account',
            error: error.message
        });
    } finally {
        session.endSession();
    }
};

// Get Loan Account Details by Account Number
export const getLoanAccountDetails = async (req, res) => {
    try {
        const { ACCT_NO } = req.params;
        const loanAccountDetails = await LoanAccountDetails.findOne({ ACCT_NO })
            .populate('CUST_ID', 'CUST_NM CUST_TYPE')
            .populate('PROD_ID', 'PROD_NM PROD_TYPE');

        if (!loanAccountDetails) {
            return res.status(404).json({ message: 'Loan account not found' });
        }

        res.status(200).json({
            success: true,
            data: loanAccountDetails
        });
    } catch (error) {
        console.error('Error fetching loan account:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch loan account',
            error: error.message
        });
    }
};

// Update Loan Account Details
export const updateLoanAccountDetails = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const { ACCT_NO } = req.params;
        const updateData = req.body;
        const { lastModifiedBy } = req.body;

        if (!lastModifiedBy) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Modified by field is required' });
        }

        // Get old values for audit trail
        const oldAccount = await LoanAccountDetails.findOne({ ACCT_NO }).session(session);
        if (!oldAccount) {
            await session.abortTransaction();
            return res.status(404).json({ message: 'Loan account not found' });
        }

        // Prevent updating certain fields
        const restrictedFields = [
            'ACCT_NO', 'CUST_ID', 'PROD_ID', 'APPL_ID', 
            'CREATED_BY', 'CREATED_AT'
        ];
        restrictedFields.forEach(field => delete updateData[field]);

        // Handle status transitions
        if (updateData.STATUS === 'APPROVED' && updateData.LOAN_STATUS !== 'APPROVED') {
            updateData.LOAN_STATUS = 'APPROVED';
        }
        if (updateData.LOAN_STATUS === 'DISBURSED' && updateData.STATUS !== 'ACTIVE') {
            updateData.STATUS = 'ACTIVE';
            updateData.DISBURSEMENT_DATE = updateData.DISBURSEMENT_DATE || new Date();
        }

        const updatedAccount = await LoanAccountDetails.findOneAndUpdate(
            { ACCT_NO },
            { 
                ...updateData,
                lastModifiedAt: new Date(),
                lastModifiedBy
            },
            { new: true, session }
        );

        if (!updatedAccount) {
            await session.abortTransaction();
            return res.status(404).json({ message: 'Loan account not found' });
        }

        // Log audit trail using winston logger
        auditLogger.info('Audit Event', {
            entity_type: 'LOAN_ACCOUNT',
            entity_id: ACCT_NO,
            user_id: lastModifiedBy,
            action: 'UPDATE',
            old_value: oldAccount.toObject(),
            new_value: updatedAccount.toObject(),
            ip_address: req.ip || '127.0.0.1',
            event_type: 'LOAN_ACCOUNT_UPDATE',
            outcome: 'SUCCESS',
            changed_fields: Object.keys(updateData)
        });

        await session.commitTransaction();

        res.status(200).json({
            success: true,
            message: 'Loan account updated successfully',
            data: updatedAccount
        });
    } catch (error) {
        await session.abortTransaction();
        
        // Log failure audit trail
        auditLogger.error('Audit Event', {
            entity_type: 'LOAN_ACCOUNT',
            entity_id: req.params.ACCT_NO,
            user_id: req.body.lastModifiedBy || 'UNKNOWN',
            action: 'UPDATE',
            old_value: null,
            new_value: null,
            ip_address: req.ip || '127.0.0.1',
            event_type: 'LOAN_ACCOUNT_UPDATE',
            outcome: 'FAILURE',
            error: error.message
        });

        console.error('Error updating loan account:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update loan account',
            error: error.message
        });
    } finally {
        session.endSession();
    }
};

// Get Loan Account Balance
export const getLoanAccountBalance = async (req, res) => {
    try {
        const { ACCT_NO } = req.params;
        const account = await LoanAccountDetails.findOne({ ACCT_NO })
            .select('ACCT_NO CUST_NM LOAN_AMOUNT OUTSTANDING_BALANCE LEDGER_BALANCE accruedInterest payOffBalance');

        if (!account) {
            return res.status(404).json({ message: 'Loan account not found' });
        }

        res.status(200).json({
            success: true,
            data: {
                accountNumber: account.ACCT_NO,
                customerName: account.CUST_NM,
                balances: {
                    loanAmount: account.LOAN_AMOUNT,
                    outstandingBalance: account.OUTSTANDING_BALANCE,
                    ledgerBalance: account.LEDGER_BALANCE,
                    payoffBalance: account.payOffBalance,
                    accruedInterest: account.accruedInterest
                },
                asOf: new Date()
            }
        });
    } catch (error) {
        console.error('Error fetching loan account balance:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch loan account balance',
            error: error.message
        });
    }
};

// Get Loan Account Terms
export const getLoanAccountTerms = async (req, res) => {
    try {
        const { ACCT_NO } = req.params;
        const account = await LoanAccountDetails.findOne({ ACCT_NO })
            .select('ACCT_NO CUST_NM START_DT MATURITY_DT TERM_CD TERM_VALUE INTEREST_RATE');

        if (!account) {
            return res.status(404).json({ message: 'Loan account not found' });
        }

        res.status(200).json({
            success: true,
            data: {
                accountNumber: account.ACCT_NO,
                customerName: account.CUST_NM,
                terms: {
                    startDate: account.START_DT,
                    maturityDate: account.MATURITY_DT,
                    termCode: account.TERM_CD,
                    termValue: account.TERM_VALUE,
                    interestRate: account.INTEREST_RATE
                },
                asOf: new Date()
            }
        });
    } catch (error) {
        console.error('Error fetching loan account terms:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch loan account terms',
            error: error.message
        });
    }
};

// Get Loan Account Status
export const getLoanAccountStatus = async (req, res) => {
    try {
        const { ACCT_NO } = req.params;
        const account = await LoanAccountDetails.findOne({ ACCT_NO })
            .select('ACCT_NO CUST_NM STATUS LOAN_STATUS APPROVAL_STATUS lastSettlementDate nextSettlementDate');

        if (!account) {
            return res.status(404).json({ message: 'Loan account not found' });
        }

        res.status(200).json({
            success: true,
            data: {
                accountNumber: account.ACCT_NO,
                customerName: account.CUST_NM,
                status: account.STATUS,
                loanStatus: account.LOAN_STATUS,
                approvalStatus: account.APPROVAL_STATUS,
                lastSettlementDate: account.lastSettlementDate,
                nextSettlementDate: account.nextSettlementDate,
                asOf: new Date()
            }
        });
    } catch (error) {
        console.error('Error fetching loan account status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch loan account status',
            error: error.message
        });
    }
};

// Get All Loan Accounts for Customer
export const getCustomerLoanAccounts = async (req, res) => {
    try {
        const { CUST_ID } = req.params;
        const accounts = await LoanAccountDetails.find({ CUST_ID })
            .select('ACCT_NO CUST_NM PROD_ID LOAN_AMOUNT STATUS START_DT MATURITY_DT')
            .sort({ START_DT: -1 });

        res.status(200).json({
            success: true,
            count: accounts.length,
            data: accounts
        });
    } catch (error) {
        console.error('Error fetching customer loan accounts:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch customer loan accounts',
            error: error.message
        });
    }
};

// Generate Loan Account Statement
export const generateLoanAccountStatement = async (req, res) => {
    try {
        const { ACCT_NO } = req.params;
        const { startDate, endDate } = req.query;

        // Validate account exists
        const account = await LoanAccountDetails.findOne({ ACCT_NO });
        if (!account) {
            return res.status(404).json({ message: 'Loan account not found' });
        }

        // Build query for transactions
        const query = { 
            $or: [
                { debitAccount: ACCT_NO },
                { creditAccount: ACCT_NO }
            ],
            timestamp: {
                $gte: new Date(startDate || account.START_DT),
                $lte: new Date(endDate || new Date())
            }
        };

        // Get transactions and repayment schedule
        const [transactions, repayments] = await Promise.all([
            Transaction.find(query).sort({ timestamp: 1 }),
            RepaymentSchedule.find({ ACCT_NO, dueDate: { $lte: new Date(endDate || new Date()) } })
                .sort({ dueDate: 1 })
        ]);

        // Calculate summary
        const principalPaid = transactions
            .filter(t => t.TRANSACTION_TYPE === 'LOAN_REPAYMENT_PRINCIPAL')
            .reduce((sum, t) => sum + t.AMOUNT, 0);

        const interestPaid = transactions
            .filter(t => t.TRANSACTION_TYPE === 'LOAN_REPAYMENT_INTEREST')
            .reduce((sum, t) => sum + t.AMOUNT, 0);

        res.status(200).json({
            success: true,
            data: {
                accountNumber: account.ACCT_NO,
                customerName: account.CUST_NM,
                period: {
                    start: startDate || account.START_DT,
                    end: endDate || new Date()
                },
                openingBalance: account.LOAN_AMOUNT,
                currentBalance: account.OUTSTANDING_BALANCE,
                principalPaid,
                interestPaid,
                transactions: transactions.map(t => ({
                    date: t.timestamp,
                    type: t.TRANSACTION_TYPE,
                    amount: t.AMOUNT,
                    reference: t.reference,
                    balance: t.balanceAfter
                })),
                repaymentSchedule: repayments.map(r => ({
                    dueDate: r.dueDate,
                    principalDue: r.principalDue,
                    interestDue: r.interestDue,
                    status: r.status
                }))
            }
        });
    } catch (error) {
        console.error('Error generating loan statement:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate loan statement',
            error: error.message
        });
    }
};

// Helper function to calculate accrued interest
const calculateAccruedInterest = (principal, rate, days) => {
    const dailyRate = rate / 36500; // Convert APR to daily rate (percentage)
    return parseFloat((principal * dailyRate * days).toFixed(2));
};