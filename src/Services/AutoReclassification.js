// src/Services/AutoReclassificationService.js
import { Op } from 'sequelize';
import LoanAccount from '../models/LoanAccount.js';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import logger from '../utils/logger.js';

class AutoReclassificationService {
    /**
     * Check loan performance and reclassify if no outstanding installments
     * @param {string} accountNumber - Loan account number
     * @param {object} transaction - Sequelize transaction object (optional)
     * @returns {Promise<object>} Result of reclassification attempt
     */
    static async checkLoanPerformance(accountNumber, transaction = null) {
        const queryOptions = transaction ? { transaction } : {};
        
        try {
            // 1. Find the loan account
            const loan = await LoanAccount.findOne({
                where: { ACCT_NO: accountNumber },
                ...queryOptions
            });
            
            if (!loan) {
                logger.warn(`Loan account ${accountNumber} not found`);
                return {
                    success: false,
                    message: `Loan account ${accountNumber} not found`,
                    reclassified: false
                };
            }

            // 2. Check for any overdue or pending installments
            const hasOutstandingInstallments = await RepaymentSchedule.findOne({
                where: {
                    ACCT_NO: accountNumber,
                    status: { [Op.in]: ['Overdue', 'Pending'] },
                    dueDate: { [Op.lte]: new Date() }
                },
                ...queryOptions
            });

            // 3. Reclassify if no outstanding installments
            if (!hasOutstandingInstallments) {
                const updateData = {
                    status: 'Performing',
                    REC_ST: 'Active',
                    lastReclassificationDate: new Date(),
                    updatedAt: new Date()
                };

                await LoanAccount.update(updateData, {
                    where: { ACCT_NO: accountNumber },
                    ...queryOptions
                });

                logger.info(`Loan ${accountNumber} reclassified to Performing`);
                
                return {
                    success: true,
                    message: `Loan ${accountNumber} reclassified to Performing`,
                    reclassified: true,
                    previousStatus: loan.status,
                    newStatus: 'Performing',
                    accountNumber: accountNumber
                };
            } else {
                logger.info(`Loan ${accountNumber} has outstanding installments, not reclassified`);
                
                return {
                    success: true,
                    message: `Loan ${accountNumber} has outstanding installments`,
                    reclassified: false,
                    accountNumber: accountNumber,
                    outstandingInstallments: true
                };
            }

        } catch (error) {
            logger.error(`Error in checkLoanPerformance for account ${accountNumber}:`, error);
            return {
                success: false,
                message: `Error processing loan ${accountNumber}: ${error.message}`,
                reclassified: false,
                error: error.message
            };
        }
    }

    /**
     * Batch reclassification for multiple loans
     * @param {Array<string>} accountNumbers - Array of loan account numbers
     * @param {object} transaction - Sequelize transaction object (optional)
     * @returns {Promise<object>} Batch reclassification results
     */
    static async batchCheckLoanPerformance(accountNumbers, transaction = null) {
        const queryOptions = transaction ? { transaction } : {};
        const results = {
            total: accountNumbers.length,
            reclassified: 0,
            failed: 0,
            skipped: 0,
            details: []
        };

        try {
            for (const accountNumber of accountNumbers) {
                try {
                    const result = await this.checkLoanPerformance(accountNumber, transaction);
                    
                    if (result.reclassified) {
                        results.reclassified++;
                    } else if (result.outstandingInstallments) {
                        results.skipped++;
                    } else {
                        results.failed++;
                    }
                    
                    results.details.push(result);
                    
                } catch (error) {
                    logger.error(`Error processing account ${accountNumber}:`, error);
                    results.failed++;
                    results.details.push({
                        accountNumber,
                        success: false,
                        error: error.message
                    });
                }
            }

            logger.info(`Batch reclassification completed: ${results.reclassified} reclassified, ${results.skipped} skipped, ${results.failed} failed`);
            
            return {
                success: true,
                summary: results,
                details: results.details
            };

        } catch (error) {
            logger.error('Error in batchCheckLoanPerformance:', error);
            return {
                success: false,
                message: `Batch reclassification failed: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Reclassify loans by criteria (e.g., by product type, date range)
     * @param {object} criteria - Search criteria for loans
     * @param {object} transaction - Sequelize transaction object (optional)
     * @returns {Promise<object>} Reclassification results
     */
    static async reclassifyLoansByCriteria(criteria = {}, transaction = null) {
        const queryOptions = transaction ? { transaction } : {};
        
        try {
            // Build where clause based on criteria
            const whereClause = this.buildReclassificationCriteria(criteria);
            
            // Find eligible loans
            const eligibleLoans = await LoanAccount.findAll({
                where: whereClause,
                attributes: ['id', 'ACCT_NO', 'status', 'REC_ST', 'lastReclassificationDate'],
                ...queryOptions
            });

            if (eligibleLoans.length === 0) {
                logger.info('No eligible loans found for reclassification');
                return {
                    success: true,
                    message: 'No eligible loans found',
                    total: 0,
                    reclassified: 0
                };
            }

            const accountNumbers = eligibleLoans.map(loan => loan.ACCT_NO);
            logger.info(`Found ${eligibleLoans.length} eligible loans for reclassification`);

            // Process batch reclassification
            const batchResult = await this.batchCheckLoanPerformance(accountNumbers, transaction);
            
            return {
                success: true,
                total: eligibleLoans.length,
                reclassified: batchResult.summary?.reclassified || 0,
                details: batchResult.details
            };

        } catch (error) {
            logger.error('Error in reclassifyLoansByCriteria:', error);
            return {
                success: false,
                message: `Reclassification by criteria failed: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Build where clause for reclassification criteria
     * @param {object} criteria - Reclassification criteria
     * @returns {object} Sequelize where clause
     */
    static buildReclassificationCriteria(criteria) {
        const whereClause = {
            status: { [Op.ne]: 'Performing' }, // Only reclassify non-performing loans
            REC_ST: { [Op.in]: ['Active', 'A'] } // Only active records
        };

        // Add optional criteria
        if (criteria.productType) {
            whereClause.PRODUCT_TYPE = criteria.productType;
        }

        if (criteria.branchCode) {
            whereClause.BRANCH_CODE = criteria.branchCode;
        }

        if (criteria.startDate || criteria.endDate) {
            whereClause.createdAt = {};
            if (criteria.startDate) {
                whereClause.createdAt[Op.gte] = new Date(criteria.startDate);
            }
            if (criteria.endDate) {
                whereClause.createdAt[Op.lte] = new Date(criteria.endDate);
            }
        }

        if (criteria.lastReclassificationDate) {
            whereClause.lastReclassificationDate = {
                [Op.lte]: new Date(criteria.lastReclassificationDate)
            };
        }

        return whereClause;
    }

    /**
     * Get reclassification statistics
     * @param {Date} startDate - Start date for statistics
     * @param {Date} endDate - End date for statistics
     * @returns {Promise<object>} Reclassification statistics
     */
    static async getReclassificationStats(startDate = null, endDate = null) {
        try {
            const whereClause = {};
            
            if (startDate || endDate) {
                whereClause.lastReclassificationDate = {};
                if (startDate) {
                    whereClause.lastReclassificationDate[Op.gte] = new Date(startDate);
                }
                if (endDate) {
                    whereClause.lastReclassificationDate[Op.lte] = new Date(endDate);
                }
            }

            // Get reclassification statistics
            const stats = await LoanAccount.findAll({
                where: whereClause,
                attributes: [
                    'status',
                    [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                    [sequelize.fn('MAX', sequelize.col('lastReclassificationDate')), 'lastReclassified'],
                    [sequelize.fn('MIN', sequelize.col('lastReclassificationDate')), 'firstReclassified']
                ],
                group: ['status'],
                raw: true
            });

            // Get total loans by status
            const totalByStatus = await LoanAccount.findAll({
                attributes: [
                    'status',
                    [sequelize.fn('COUNT', sequelize.col('id')), 'total']
                ],
                group: ['status'],
                raw: true
            });

            // Calculate percentages
            const totalLoans = totalByStatus.reduce((sum, item) => sum + parseInt(item.total), 0);
            const performingLoans = totalByStatus.find(item => item.status === 'Performing')?.total || 0;
            const performingPercentage = totalLoans > 0 ? (performingLoans / totalLoans * 100).toFixed(2) : 0;

            return {
                success: true,
                stats: {
                    reclassificationHistory: stats,
                    currentDistribution: totalByStatus,
                    totals: {
                        totalLoans,
                        performingLoans: parseInt(performingLoans),
                        performingPercentage: parseFloat(performingPercentage),
                        nonPerformingLoans: totalLoans - parseInt(performingLoans)
                    }
                }
            };

        } catch (error) {
            logger.error('Error getting reclassification stats:', error);
            return {
                success: false,
                message: `Failed to get reclassification statistics: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Scheduled job for automatic loan reclassification
     * @returns {Promise<object>} Job execution results
     */
    static async runScheduledReclassification() {
        const transaction = await sequelize.transaction();
        
        try {
            logger.info('🚀 Starting scheduled loan reclassification job...');
            
            // Criteria for reclassification (e.g., loans older than 30 days without issues)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const criteria = {
                startDate: thirtyDaysAgo,
                status: { [Op.ne]: 'Performing' }
            };

            const result = await this.reclassifyLoansByCriteria(criteria, transaction);
            
            await transaction.commit();
            
            logger.info('✅ Scheduled reclassification job completed', {
                total: result.total,
                reclassified: result.reclassified
            });

            return {
                success: true,
                job: 'scheduled_reclassification',
                timestamp: new Date(),
                ...result
            };

        } catch (error) {
            await transaction.rollback();
            logger.error('❌ Scheduled reclassification job failed:', error);
            
            return {
                success: false,
                job: 'scheduled_reclassification',
                timestamp: new Date(),
                error: error.message
            };
        }
    }

    /**
     * Manually reclassify a loan with additional validation
     * @param {string} accountNumber - Loan account number
     * @param {string} newStatus - New status to assign
     * @param {string} reason - Reason for manual reclassification
     * @param {string} performedBy - User who performed the reclassification
     * @returns {Promise<object>} Manual reclassification result
     */
    static async manualReclassification(accountNumber, newStatus, reason, performedBy) {
        const transaction = await sequelize.transaction();
        
        try {
            // Validate new status
            const validStatuses = ['Performing', 'Watch', 'Substandard', 'Doubtful', 'Loss'];
            if (!validStatuses.includes(newStatus)) {
                throw new Error(`Invalid status: ${newStatus}. Valid statuses are: ${validStatuses.join(', ')}`);
            }

            // Get loan with current status
            const loan = await LoanAccount.findOne({
                where: { ACCT_NO: accountNumber },
                transaction
            });

            if (!loan) {
                throw new Error(`Loan account ${accountNumber} not found`);
            }

            const previousStatus = loan.status;

            // Update loan status
            await LoanAccount.update({
                status: newStatus,
                lastReclassificationDate: new Date(),
                lastManualReclassification: {
                    date: new Date(),
                    fromStatus: previousStatus,
                    toStatus: newStatus,
                    reason: reason,
                    performedBy: performedBy
                },
                updatedAt: new Date()
            }, {
                where: { ACCT_NO: accountNumber },
                transaction
            });

            // Create audit trail (if you have an audit trail service)
            await this.createReclassificationAudit({
                accountNumber,
                previousStatus,
                newStatus,
                reason,
                performedBy,
                type: 'MANUAL'
            });

            await transaction.commit();
            
            logger.info(`Manual reclassification completed for ${accountNumber}`, {
                from: previousStatus,
                to: newStatus,
                performedBy
            });

            return {
                success: true,
                accountNumber,
                previousStatus,
                newStatus,
                reason,
                performedBy,
                timestamp: new Date()
            };

        } catch (error) {
            await transaction.rollback();
            logger.error(`Manual reclassification failed for ${accountNumber}:`, error);
            
            return {
                success: false,
                accountNumber,
                error: error.message
            };
        }
    }

    /**
     * Create audit trail for reclassification (placeholder - implement based on your audit system)
     */
    static async createReclassificationAudit(auditData) {
        try {
            // This is a placeholder - implement based on your audit system
            // You might want to use your AuditTrail model here
            logger.info('Reclassification audit:', auditData);
            return true;
        } catch (error) {
            logger.error('Error creating reclassification audit:', error);
            return false;
        }
    }

    /**
     * Get loans eligible for reclassification
     * @param {object} filters - Optional filters
     * @returns {Promise<object>} Eligible loans
     */
    static async getEligibleLoans(filters = {}) {
        try {
            const whereClause = this.buildReclassificationCriteria(filters);
            
            const eligibleLoans = await LoanAccount.findAll({
                where: whereClause,
                attributes: [
                    'id',
                    'ACCT_NO',
                    'ACCT_NM',
                    'PRODUCT_TYPE',
                    'status',
                    'OUTSTANDING_PRINCIPAL',
                    'TOTAL_REPAID_AMOUNT',
                    'createdAt',
                    'lastReclassificationDate'
                ],
                include: [{
                    model: RepaymentSchedule,
                    as: 'RepaymentSchedules',
                    attributes: ['id', 'dueDate', 'status', 'amountDue'],
                    where: {
                        status: { [Op.in]: ['Overdue', 'Pending'] },
                        dueDate: { [Op.lte]: new Date() }
                    },
                    required: false
                }],
                order: [['createdAt', 'DESC']],
                limit: filters.limit || 100
            });

            // Filter loans that have no overdue/pending installments
            const trulyEligible = eligibleLoans.filter(loan => 
                !loan.RepaymentSchedules || loan.RepaymentSchedules.length === 0
            );

            return {
                success: true,
                totalFound: eligibleLoans.length,
                eligibleForReclassification: trulyEligible.length,
                loans: trulyEligible.map(loan => ({
                    accountNumber: loan.ACCT_NO,
                    accountName: loan.ACCT_NM,
                    productType: loan.PRODUCT_TYPE,
                    currentStatus: loan.status,
                    outstandingPrincipal: loan.OUTSTANDING_PRINCIPAL,
                    totalRepaid: loan.TOTAL_REPAID_AMOUNT,
                    lastReclassified: loan.lastReclassificationDate,
                    daysSinceLastReclassification: loan.lastReclassificationDate 
                        ? Math.floor((new Date() - new Date(loan.lastReclassificationDate)) / (1000 * 60 * 60 * 24))
                        : null
                }))
            };

        } catch (error) {
            logger.error('Error getting eligible loans:', error);
            return {
                success: false,
                message: `Failed to get eligible loans: ${error.message}`,
                error: error.message
            };
        }
    }
}

export default AutoReclassificationService;