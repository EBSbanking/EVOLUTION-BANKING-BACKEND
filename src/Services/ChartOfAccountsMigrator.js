// services/ChartOfAccountsMigrator.js
import { Op } from 'sequelize';
import DynamicMigrationConfig, { VALIDATION_RULES } from '../../config/migrationConfig.js';
import GLAccount from '../models/GLAccount.js';

class ChartOfAccountsMigrator {
  constructor(organizationCode, branchCode, customConfig = null) {
    this.organizationCode = organizationCode;
    this.branchCode = branchCode;
    this.config = customConfig || DynamicMigrationConfig;
    this.accountMapping = new Map();
    this.migrationStats = {
      total: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      balanceMigrated: 0,
      balanceErrors: 0,
      zeroBalances: 0,
      negativeBalances: 0,
      errors: []
    };
    this.migrationBatchId = `BATCH_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Validate legacy account data with balance validation
  validateLegacyAccount(account) {
    const errors = [];

    // Check required fields
    VALIDATION_RULES.requiredFields.forEach(field => {
      if (account[field] === undefined || account[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    // Validate type
    if (!VALIDATION_RULES.allowedTypes.includes(account.type)) {
      errors.push(`Invalid type: ${account.type}`);
    }

    // Validate account usage
    if (!VALIDATION_RULES.allowedUsage.includes(account.account_usage)) {
      errors.push(`Invalid account usage: ${account.account_usage}`);
    }

    // Validate GL code format
    if (!VALIDATION_RULES.glCodePattern.test(account.glcode)) {
      errors.push(`Invalid GL code format: ${account.glcode}`);
    }

    // Validate name length
    if (account.name && account.name.length > VALIDATION_RULES.maxNameLength) {
      errors.push(`Name exceeds maximum length: ${account.name}`);
    }

    // Balance-specific validations
    if (account.balance === undefined || account.balance === null) {
      errors.push('Balance field is missing or null');
    } else {
      if (typeof account.balance !== 'number') {
        errors.push('Balance must be a number');
      }
      
      if (account.balance < this.config.config.balanceValidation.minBalance && 
          !this.config.config.balanceMigration.allowNegativeBalances) {
        errors.push(`Balance ${account.balance} is below minimum allowed ${this.config.config.balanceValidation.minBalance}`);
      }
      
      if (account.balance > this.config.config.balanceValidation.maxBalance) {
        errors.push(`Balance ${account.balance} exceeds maximum allowed ${this.config.config.balanceValidation.maxBalance}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Enhanced validation for accounts with balances
  validateAccountsWithBalances(accounts) {
    const results = {
      valid: [],
      invalid: [],
      zeroBalance: [],
      negativeBalance: [],
      highValue: []
    };
    
    accounts.forEach(account => {
      const validation = this.validateLegacyAccount(account);
      
      if (!validation.isValid) {
        results.invalid.push({ account, errors: validation.errors });
        return;
      }
      
      // Balance-specific categorizations
      if (account.balance === 0) {
        results.zeroBalance.push(account);
      }
      
      if (account.balance < 0) {
        results.negativeBalance.push(account);
      }
      
      if (account.balance > 1000000) { // High value threshold
        results.highValue.push(account);
      }
      
      results.valid.push(account);
    });
    
    console.log(`Balance Validation Summary:`);
    console.log(`  Valid accounts: ${results.valid.length}`);
    console.log(`  Invalid accounts: ${results.invalid.length}`);
    console.log(`  Zero balances: ${results.zeroBalance.length}`);
    console.log(`  Negative balances: ${results.negativeBalance.length}`);
    console.log(`  High value accounts (>1M): ${results.highValue.length}`);
    
    return results;
  }

  // Determine account level based on legacy structure
  determineAccountLevel(account) {
    if (account.account_usage === 'GL Group' && account.gl_group === '0') {
      return 1; // Top-level group
    } else if (account.account_usage === 'GL Group') {
      return 2; // Sub-group
    } else if (account.account_usage === 'GL Account') {
      return 3; // Leaf account
    }
    return 3; // Default to leaf
  }

  // Build account hierarchy
  buildAccountHierarchy(accounts) {
    const hierarchy = {
      root: [],
      groups: new Map(),
      accounts: new Map()
    };

    accounts.forEach(account => {
      if (account.account_usage === 'GL Group' && account.gl_group === '0') {
        hierarchy.root.push(account);
      } else if (account.account_usage === 'GL Group') {
        if (!hierarchy.groups.has(account.gl_group)) {
          hierarchy.groups.set(account.gl_group, []);
        }
        hierarchy.groups.get(account.gl_group).push(account);
      } else if (account.account_usage === 'GL Account') {
        if (!hierarchy.accounts.has(account.gl_group)) {
          hierarchy.accounts.set(account.gl_group, []);
        }
        hierarchy.accounts.get(account.gl_group).push(account);
      }
    });

    return hierarchy;
  }

  // Generate GL Account ID
  generateGLAccountId(legacyId, legacyName) {
    const prefix = this.organizationCode.toString().padStart(4, '0');
    const cleanName = legacyName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
    return `${prefix}_${this.branchCode}_${legacyId}_${cleanName}`;
  }

  // Enhanced account creation with complete balance migration
  async createNewAccount(legacyAccount, transaction = null) {
    const queryOptions = transaction ? { transaction } : {};
    
    try {
      const organization = this.config.getOrganization(this.organizationCode);
      const branchName = this.config.getBranch(this.organizationCode, this.branchCode);

      if (!organization || !branchName) {
        throw new Error(`Invalid organization or branch: ${this.organizationCode}/${this.branchCode}`);
      }

      // Determine if balance should be migrated
      const shouldMigrateBalance = this.config.shouldMigrateBalance(legacyAccount);
      const legacyBalance = legacyAccount.balance || 0;
      const hasBalance = legacyBalance !== 0 || this.config.config.balanceMigration.preserveZeroBalances;

      const newAccountData = {
        GL_ACCT_NO: this.config.generateGLAccountNo(legacyAccount.glcode, this.branchCode),
        GL_ACCT_ID: this.generateGLAccountId(legacyAccount.id, legacyAccount.name),
        CREATED_BY: 'system_migration',
        
        // Organization & Branch
        organizationName: organization.name,
        organizationCode: this.organizationCode,
        branchName: branchName,
        branchCode: this.branchCode,
        branchType: 'MAIN',
        
        // Account Classification
        categoryCode: legacyAccount.type,
        categoryName: `${legacyAccount.type} Accounts`,
        level: this.determineAccountLevel(legacyAccount),
        
        // Account Structure
        LEDGER_NO: this.config.generateGLAccountNo(legacyAccount.glcode, this.branchCode),
        SUB_LEDGER_NO: this.config.generateGLAccountNo(legacyAccount.glcode, this.branchCode),
        SEG_NO: 1,
        CHART_OF_ACCT_ID: `CHART_${this.organizationCode}`,
        ACCT_DESC: legacyAccount.description || legacyAccount.name,
        GL_ACCT_CAT: legacyAccount.type,
        
        // Transaction Controls
        TRANSACTION_TYPE: `${legacyAccount.type} Balance`,
        CR_ALLOWED: legacyAccount.type !== 'ASSET',
        DR_ALLOWED: legacyAccount.type !== 'LIABILITY',
        REC_ST: legacyAccount.status === 'Active' ? 'Active' : 'Inactive',
        POST_ALLOW: true,
        POST_FG: false,
        CONTROL_ACCT_FG: legacyAccount.account_usage === 'GL Group',
        SUSPENSE_ACCT_FG: false,
        ALLOW_BAL_SWING_FG: legacyAccount.type === 'ASSET' || legacyAccount.type === 'LIABILITY',
        
        // Enhanced Financial Data with legacy balances
        LEDGER_BALANCE: hasBalance ? legacyBalance : 0,
        AVAILABLE_BALANCE: hasBalance ? legacyBalance : 0,
        OPENING_BALANCE: hasBalance ? legacyBalance : 0,
        CURRENT_BALANCE: hasBalance ? legacyBalance : 0,
        CURRENCY_CODE: 'NGN',
        
        // Initial balance history entry if balance is migrated (stored as JSON)
        balance_history: hasBalance ? JSON.stringify([{
          date: new Date(),
          ledgerBalance: legacyBalance,
          availableBalance: legacyBalance,
          transactionId: `MIG_INIT_${legacyAccount.id}`,
          description: 'Initial balance migration from legacy system',
          changeType: 'MIGRATION',
          createdBy: 'system_migration',
          reference: `Legacy ID: ${legacyAccount.id}`,
          metadata: {
            migrationBatch: this.migrationBatchId,
            legacySystem: 'Chart of Accounts',
            migrationType: 'FULL'
          }
        }]) : null,
        
        // Legacy Reference with complete balance information (stored as JSON)
        legacy_reference: JSON.stringify({
          legacyId: legacyAccount.id.toString(),
          legacyGLCode: legacyAccount.glcode,
          legacyName: legacyAccount.name,
          legacyType: legacyAccount.type,
          legacyAccountUsage: legacyAccount.account_usage,
          legacyGLGroup: legacyAccount.gl_group,
          legacyBalance: legacyBalance,
          legacyUnreconciledBalance: legacyAccount.unreconciled_balance || 0,
          migratedAt: new Date(),
          migrationVersion: '2.0',
          migrationBatchId: this.migrationBatchId,
          balanceMigrated: hasBalance && shouldMigrateBalance
        }),
        
        // System Source
        systemSource: 'MIGRATED',
        
        // Enhanced sync status for balance reconciliation (stored as JSON)
        sync_status: JSON.stringify({
          lastSynced: new Date(),
          syncRequired: false,
          legacyBalance: hasBalance ? legacyBalance : 0,
          currentBalance: hasBalance ? legacyBalance : 0,
          balanceDifference: 0,
          lastSyncError: null,
          syncAttempts: 0,
          balanceReconciled: hasBalance,
          reconciliationDate: hasBalance ? new Date() : null,
          lastReconciliationId: hasBalance ? `INIT_RECON_${legacyAccount.id}` : null
        }),

        // Enhanced metadata with balance settings (stored as JSON)
        metadata: JSON.stringify({
          accountType: this.config.mapAccountType(legacyAccount.type, legacyAccount.name),
          productType: this.determineProductType(legacyAccount),
          branchSpecific: true,
          templateGenerated: false,
          dynamicAccount: false,
          bulkCreated: true,
          consolidationRequired: legacyAccount.account_usage === 'GL Group',
          migrationFlags: {
            requiresValidation: false,
            validationPassed: true,
            balanceValidated: hasBalance,
            migrationNotes: `Migrated from legacy system with${hasBalance ? '' : 'out'} balance - ${new Date().toISOString()}`
          },
          balanceSettings: {
            allowNegative: this.config.config.balanceMigration.allowNegativeBalances,
            minimumBalance: this.config.config.balanceValidation.minBalance,
            maximumBalance: this.config.config.balanceValidation.maxBalance,
            autoReconcile: true
          }
        }),
        
        branchTimezone: 'Africa/Lagos'
      };

      const newAccount = await GLAccount.create(newAccountData, queryOptions);
      
      this.accountMapping.set(legacyAccount.id, newAccount.id);
      this.migrationStats.successful++;
      
      // Track balance migration statistics
      if (hasBalance && shouldMigrateBalance) {
        this.migrationStats.balanceMigrated++;
        
        if (legacyBalance === 0) {
          this.migrationStats.zeroBalances++;
        }
        
        if (legacyBalance < 0) {
          this.migrationStats.negativeBalances++;
        }
      }
      
      console.log(`✓ Migrated: ${legacyAccount.name} (Balance: ${legacyBalance})`);
      return newAccount;

    } catch (error) {
      this.migrationStats.failed++;
      this.migrationStats.errors.push({
        legacyId: legacyAccount.id,
        error: error.message,
        accountName: legacyAccount.name,
        balance: legacyAccount.balance
      });
      
      if (legacyAccount.balance !== undefined && legacyAccount.balance !== null) {
        this.migrationStats.balanceErrors++;
      }
      
      console.error(`✗ Failed: ${legacyAccount.name} - ${error.message}`);
      throw error;
    }
  }

  // Determine product type based on account name and type
  determineProductType(legacyAccount) {
    const productMappings = {
      'Daily Loan': 'PERSONAL_LOAN',
      'Weekly Loan': 'PERSONAL_LOAN',
      'Individual Loan': 'PERSONAL_LOAN',
      'Group Monthly Loan': 'SME_LOAN',
      'Staff Loan': 'PERSONAL_LOAN',
      'Staff Salary Advance': 'PERSONAL_LOAN',
      'Solar Loan': 'CONSUMER_LOAN',
      'Asset Loan': 'BUSINESS_LOAN',
      'RapidCash': 'PERSONAL_LOAN',
      'Savings Account': 'CUSTOMER_ACCOUNT',
      'Thrift Account': 'CUSTOMER_ACCOUNT'
    };
    
    return productMappings[legacyAccount.name] || null;
  }

  // Update parent relationships after all accounts are created
  async updateParentRelationships(accounts, transaction = null) {
    const queryOptions = transaction ? { transaction } : {};
    let updatedCount = 0;

    for (const legacyAccount of accounts) {
      if (legacyAccount.account_usage === 'GL Account' && legacyAccount.gl_group !== '0') {
        try {
          const parentId = this.accountMapping.get(parseInt(legacyAccount.gl_group));
          
          if (parentId) {
            const accountId = this.accountMapping.get(legacyAccount.id);
            
            // Update using Sequelize
            await GLAccount.update({
              parentCode: legacyAccount.gl_group,
              PARENT_ID: parentId,
              updatedAt: new Date()
            }, {
              where: { id: accountId },
              ...queryOptions
            });
            
            updatedCount++;
          } else {
            console.warn(`Parent not found for account ${legacyAccount.id} (${legacyAccount.name}) - parent GL group: ${legacyAccount.gl_group}`);
          }
        } catch (error) {
          console.error(`Failed to update parent for account ${legacyAccount.id}:`, error);
        }
      }
    }

    return updatedCount;
  }

  // New method for bulk balance migration/update
  async migrateBalancesOnly(legacyBalances, transaction = null) {
    const queryOptions = transaction ? { transaction } : {};
    
    console.log('Starting balance-only migration...');
    
    let migrated = 0;
    let errors = 0;
    let notFound = 0;
    
    for (const legacyBalance of legacyBalances) {
      try {
        const account = await GLAccount.findOne({
          where: {
            legacy_reference: {
              [Op.like]: `%"legacyId":"${legacyBalance.id}"%`
            }
          },
          ...queryOptions
        });
        
        if (account) {
          // Parse existing legacy reference
          const legacyRef = JSON.parse(account.legacy_reference || '{}');
          
          // Update account with new balance
          await GLAccount.update({
            LEDGER_BALANCE: legacyBalance.balance,
            AVAILABLE_BALANCE: legacyBalance.balance,
            CURRENT_BALANCE: legacyBalance.balance,
            legacy_reference: JSON.stringify({
              ...legacyRef,
              legacyBalance: legacyBalance.balance,
              balanceUpdatedAt: new Date()
            }),
            metadata: JSON.stringify({
              ...JSON.parse(account.metadata || '{}'),
              lastBalanceUpdate: new Date(),
              updateSource: 'BALANCE_MIGRATION'
            }),
            updatedAt: new Date()
          }, {
            where: { id: account.id },
            ...queryOptions
          });
          
          migrated++;
          console.log(`✓ Balance updated: ${account.GL_ACCT_NO} -> ${legacyBalance.balance}`);
        } else {
          notFound++;
          console.warn(`Account not found for legacy ID: ${legacyBalance.id}`);
        }
      } catch (error) {
        errors++;
        console.error(`Balance migration failed for legacy ID ${legacyBalance.id}:`, error);
      }
    }
    
    console.log(`Balance-only migration completed: ${migrated} updated, ${errors} errors, ${notFound} not found`);
    return { migrated, errors, notFound };
  }

  // Enhanced main migration method with comprehensive balance handling
  async migrate(legacyAccounts) {
    const transaction = await sequelize.transaction();
    
    try {
      console.log(`🚀 Starting migration for organization ${this.organizationCode}, branch ${this.branchCode}`);
      console.log(`📊 Processing ${legacyAccounts.length} accounts with balances...`);

      this.migrationStats.total = legacyAccounts.length;

      // Validate accounts and balances
      const validationResults = this.validateAccountsWithBalances(legacyAccounts);
      
      if (validationResults.invalid.length > 0) {
        console.warn(`❌ Found ${validationResults.invalid.length} invalid accounts:`);
        validationResults.invalid.forEach(({ account, errors }) => {
          console.warn(`   ${account.id} (${account.name}):`, errors.join(', '));
        });
        
        if (this.config.config.behavior.validateBeforeMigrate) {
          await transaction.rollback();
          throw new Error(`Validation failed for ${validationResults.invalid.length} accounts. Migration aborted.`);
        } else {
          console.warn('⚠️  Continuing migration despite validation errors...');
        }
      }

      // Build hierarchy for processing order
      const hierarchy = this.buildAccountHierarchy(legacyAccounts);

      // Process accounts in order: root groups -> subgroups -> accounts
      const processingOrder = [
        ...hierarchy.root,
        ...Array.from(hierarchy.groups.values()).flat(),
        ...Array.from(hierarchy.accounts.values()).flat()
      ];

      console.log('🔨 Creating accounts with balances...');

      // Create accounts with balances
      for (const account of processingOrder) {
        try {
          // Check if account already exists
          if (this.config.config.behavior.skipExisting) {
            const existingAccount = await GLAccount.findOne({
              where: {
                legacy_reference: {
                  [Op.like]: `%"legacyId":"${account.id}"%`
                }
              },
              transaction
            });
            
            if (existingAccount) {
              console.log(`⏭️  Skipping existing account: ${account.name} (${account.id})`);
              this.migrationStats.skipped++;
              this.accountMapping.set(account.id, existingAccount.id);
              continue;
            }
          }

          await this.createNewAccount(account, transaction);
          
        } catch (error) {
          console.error(`💥 Failed to migrate account ${account.id} (${account.name}):`, error.message);
        }
      }

      // Update parent relationships
      console.log('🔗 Updating parent relationships...');
      const updatedRelationships = await this.updateParentRelationships(legacyAccounts, transaction);
      console.log(`✅ Updated ${updatedRelationships} parent relationships`);

      // Commit transaction
      await transaction.commit();

      // Validate balance migration
      console.log('📋 Validating balance migration...');
      const balanceValidation = await this.validateBalanceMigration();

      // Generate migration report
      await this.generateMigrationReport(balanceValidation);

      console.log('🎉 Migration completed!');
      console.log('📈 Final Statistics:', this.migrationStats);

      return {
        success: this.migrationStats.failed === 0,
        statistics: this.migrationStats,
        balanceValidation,
        accountMapping: this.accountMapping,
        batchId: this.migrationBatchId
      };

    } catch (error) {
      await transaction.rollback();
      console.error('Migration failed:', error);
      throw error;
    }
  }

  // Comprehensive balance migration validation
  async validateBalanceMigration() {
    console.log('🔍 Validating balance migration...');
    
    const migratedAccounts = await GLAccount.findAll({
      where: {
        legacy_reference: {
          [Op.like]: `%"migrationBatchId":"${this.migrationBatchId}"%`
        }
      }
    });
    
    let totalLegacyBalance = 0;
    let totalNewBalance = 0;
    let totalOpeningBalance = 0;
    let discrepancies = [];
    let perfectlyMatched = 0;
    
    for (const account of migratedAccounts) {
      const legacyRef = JSON.parse(account.legacy_reference || '{}');
      
      totalLegacyBalance += parseFloat(legacyRef.legacyBalance || 0);
      totalNewBalance += parseFloat(account.LEDGER_BALANCE || 0);
      totalOpeningBalance += parseFloat(account.OPENING_BALANCE || 0);
      
      const difference = parseFloat(account.LEDGER_BALANCE || 0) - parseFloat(legacyRef.legacyBalance || 0);
      
      if (Math.abs(difference) > 0.01) { // Tolerance for floating point
        discrepancies.push({
          accountNo: account.GL_ACCT_NO,
          accountName: account.ACCT_DESC,
          legacyBalance: parseFloat(legacyRef.legacyBalance || 0),
          newBalance: parseFloat(account.LEDGER_BALANCE || 0),
          openingBalance: parseFloat(account.OPENING_BALANCE || 0),
          difference: difference,
          percentageDiff: parseFloat(legacyRef.legacyBalance || 0) !== 0 ? 
            (difference / parseFloat(legacyRef.legacyBalance || 0) * 100) : 0
        });
      } else {
        perfectlyMatched++;
      }
    }
    
    const overallDifference = totalNewBalance - totalLegacyBalance;
    const percentageDifference = totalLegacyBalance !== 0 ? 
      (overallDifference / totalLegacyBalance * 100) : 0;
    
    console.log(`📊 Balance Validation Summary:`);
    console.log(`   Total Legacy Balance: ${totalLegacyBalance.toLocaleString()}`);
    console.log(`   Total New Balance: ${totalNewBalance.toLocaleString()}`);
    console.log(`   Total Opening Balance: ${totalOpeningBalance.toLocaleString()}`);
    console.log(`   Overall Difference: ${overallDifference.toLocaleString()} (${percentageDifference.toFixed(4)}%)`);
    console.log(`   Perfectly matched accounts: ${perfectlyMatched}/${migratedAccounts.length}`);
    console.log(`   Accounts with discrepancies: ${discrepancies.length}`);
    
    if (discrepancies.length > 0) {
      console.log('❌ Balance discrepancies found:');
      discrepancies.slice(0, 10).forEach(d => { // Show first 10 discrepancies
        console.log(`   ${d.accountNo}: ${d.accountName}`);
        console.log(`     Legacy: ${d.legacyBalance.toLocaleString()}, New: ${d.newBalance.toLocaleString()}, Diff: ${d.difference.toLocaleString()} (${d.percentageDiff.toFixed(2)}%)`);
      });
      
      if (discrepancies.length > 10) {
        console.log(`   ... and ${discrepancies.length - 10} more discrepancies`);
      }
    }
    
    return {
      totalLegacyBalance,
      totalNewBalance,
      totalOpeningBalance,
      overallDifference,
      percentageDifference,
      perfectlyMatched,
      discrepanciesCount: discrepancies.length,
      discrepancies
    };
  }

  // Generate comprehensive migration report
  async generateMigrationReport(balanceValidation) {
    // Get balance migration report
    const balanceReport = await GLAccount.getBalanceMigrationReport(this.organizationCode);
    const orgSummary = await GLAccount.getOrganizationBalanceSummary(this.organizationCode);
    
    console.log('\n📄 ===== MIGRATION REPORT =====');
    console.log(`🏢 Organization: ${this.organizationCode}`);
    console.log(`🏷️  Batch ID: ${this.migrationBatchId}`);
    console.log(`📅 Migration Date: ${new Date().toISOString()}`);
    
    console.log('\n📈 MIGRATION STATISTICS:');
    console.log(`   Total Accounts: ${this.migrationStats.total}`);
    console.log(`   Successful: ${this.migrationStats.successful}`);
    console.log(`   Failed: ${this.migrationStats.failed}`);
    console.log(`   Skipped: ${this.migrationStats.skipped}`);
    console.log(`   Balance Migrated: ${this.migrationStats.balanceMigrated}`);
    console.log(`   Balance Errors: ${this.migrationStats.balanceErrors}`);
    console.log(`   Zero Balances: ${this.migrationStats.zeroBalances}`);
    console.log(`   Negative Balances: ${this.migrationStats.negativeBalances}`);
    
    console.log('\n💰 BALANCE SUMMARY:');
    console.log(`   Total Legacy Balance: ${balanceValidation.totalLegacyBalance.toLocaleString()}`);
    console.log(`   Total New Balance: ${balanceValidation.totalNewBalance.toLocaleString()}`);
    console.log(`   Net Difference: ${balanceValidation.overallDifference.toLocaleString()}`);
    console.log(`   Percentage Difference: ${balanceValidation.percentageDifference.toFixed(4)}%`);
    console.log(`   Discrepancies: ${balanceValidation.discrepanciesCount} accounts`);
    
    console.log('\n🏦 BALANCE MIGRATION STATUS:');
    if (balanceReport && Array.isArray(balanceReport)) {
      balanceReport.forEach(report => {
        const status = report.balanceMigrated ? 
          (report.balanceReconciled ? '✅ Migrated & Reconciled' : '⚠️ Migrated Needs Reconciling') : 
          '❌ Not Migrated';
        console.log(`   ${status}: ${report.count} accounts, Net Diff: ${report.netDifference?.toLocaleString() || 0}`);
      });
    }
    
    console.log('\n🌍 ORGANIZATION SUMMARY:');
    if (orgSummary && Array.isArray(orgSummary)) {
      orgSummary.forEach(branch => {
        console.log(`   ${branch.branchName}: ${branch.totalBalance.toLocaleString()} (${branch.accountCount} accounts)`);
        console.log(`     Balance Difference: ${branch.balanceDifference.toLocaleString()}`);
      });
    }
    
    console.log('\n================================\n');
  }

  // Rollback migration with balance tracking
  async rollbackMigration(batchId = null) {
    const transaction = await sequelize.transaction();
    
    try {
      const query = batchId ? {
        legacy_reference: {
          [Op.like]: `%"migrationBatchId":"${batchId}"%`
        }
      } : { systemSource: 'MIGRATED' };
      
      // Get accounts to be deleted for reporting
      const accountsToDelete = await GLAccount.findAll({
        where: query,
        transaction
      });
      
      let totalBalance = 0;
      
      accountsToDelete.forEach(account => {
        totalBalance += parseFloat(account.LEDGER_BALANCE || 0);
      });
      
      const deletedCount = await GLAccount.destroy({
        where: query,
        transaction
      });
      
      await transaction.commit();
      
      console.log(`🔄 Rollback completed:`);
      console.log(`   Deleted accounts: ${deletedCount}`);
      console.log(`   Total balance removed: ${totalBalance.toLocaleString()}`);
      console.log(`   Batch: ${batchId || 'ALL MIGRATED'}`);
      
      return {
        deletedCount,
        totalBalanceRemoved: totalBalance,
        batchId
      };
      
    } catch (error) {
      await transaction.rollback();
      console.error('Rollback failed:', error);
      throw error;
    }
  }

  // Reconcile all migrated accounts with current legacy balances
  async reconcileAllBalances(currentLegacyBalances, transaction = null) {
    const queryOptions = transaction ? { transaction } : {};
    
    console.log('🔄 Starting balance reconciliation...');
    
    let reconciled = 0;
    let discrepanciesFound = 0;
    let errors = 0;
    
    for (const legacyBalance of currentLegacyBalances) {
      try {
        const account = await GLAccount.findOne({
          where: {
            legacy_reference: {
              [Op.like]: `%"legacyId":"${legacyBalance.id}"%`
            }
          },
          ...queryOptions
        });
        
        if (account) {
          const legacyRef = JSON.parse(account.legacy_reference || '{}');
          const difference = parseFloat(account.LEDGER_BALANCE || 0) - parseFloat(legacyRef.legacyBalance || 0);
          
          // Update sync status
          const syncStatus = JSON.parse(account.sync_status || '{}');
          const updatedSyncStatus = {
            ...syncStatus,
            lastSynced: new Date(),
            legacyBalance: parseFloat(legacyBalance.balance || 0),
            currentBalance: parseFloat(account.LEDGER_BALANCE || 0),
            balanceDifference: difference,
            balanceReconciled: Math.abs(difference) <= 0.01,
            reconciliationDate: new Date(),
            lastReconciliationId: `RECON_${Date.now()}`
          };
          
          await GLAccount.update({
            sync_status: JSON.stringify(updatedSyncStatus),
            updatedAt: new Date()
          }, {
            where: { id: account.id },
            ...queryOptions
          });
          
          if (Math.abs(difference) > 0.01) {
            discrepanciesFound++;
            console.warn(`⚠️  Balance discrepancy for ${account.GL_ACCT_NO}: ${difference}`);
          } else {
            reconciled++;
          }
        } else {
          console.warn(`Account not found for legacy ID: ${legacyBalance.id}`);
          errors++;
        }
      } catch (error) {
        errors++;
        console.error(`Reconciliation failed for legacy ID ${legacyBalance.id}:`, error);
      }
    }
    
    console.log(`✅ Reconciliation completed: ${reconciled} reconciled, ${discrepanciesFound} discrepancies, ${errors} errors`);
    return { reconciled, discrepanciesFound, errors };
  }

  // Get migration statistics
  async getMigrationStatistics(batchId = null) {
    const whereClause = batchId ? {
      legacy_reference: {
        [Op.like]: `%"migrationBatchId":"${batchId}"%`
      }
    } : { systemSource: 'MIGRATED' };
    
    const totalAccounts = await GLAccount.count({ where: whereClause });
    const totalBalance = await GLAccount.sum('LEDGER_BALANCE', { where: whereClause });
    
    // Get accounts by category
    const accountsByCategory = await GLAccount.findAll({
      where: whereClause,
      attributes: [
        'GL_ACCT_CAT',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('LEDGER_BALANCE')), 'totalBalance']
      ],
      group: ['GL_ACCT_CAT']
    });
    
    // Get accounts with balance discrepancies
    const accountsWithDiscrepancies = await GLAccount.findAll({
      where: {
        ...whereClause,
        sync_status: {
          [Op.like]: '%"balanceDifference"%'
        }
      },
      attributes: ['GL_ACCT_NO', 'ACCT_DESC', 'LEDGER_BALANCE', 'sync_status', 'legacy_reference']
    });
    
    return {
      totalAccounts,
      totalBalance: totalBalance || 0,
      accountsByCategory: accountsByCategory.map(item => ({
        category: item.GL_ACCT_CAT,
        count: item.get('count'),
        totalBalance: item.get('totalBalance')
      })),
      accountsWithDiscrepancies: accountsWithDiscrepancies.map(account => {
        const syncStatus = JSON.parse(account.sync_status || '{}');
        const legacyRef = JSON.parse(account.legacy_reference || '{}');
        
        return {
          accountNo: account.GL_ACCT_NO,
          accountName: account.ACCT_DESC,
          currentBalance: account.LEDGER_BALANCE,
          legacyBalance: legacyRef.legacyBalance || 0,
          difference: syncStatus.balanceDifference || 0,
          reconciled: syncStatus.balanceReconciled || false
        };
      })
    };
  }

  // Export migration data for reporting
  async exportMigrationData(batchId = null, format = 'json') {
    const whereClause = batchId ? {
      legacy_reference: {
        [Op.like]: `%"migrationBatchId":"${batchId}"%`
      }
    } : { systemSource: 'MIGRATED' };
    
    const accounts = await GLAccount.findAll({
      where: whereClause,
      attributes: [
        'id',
        'GL_ACCT_NO',
        'GL_ACCT_ID',
        'ACCT_DESC',
        'GL_ACCT_CAT',
        'LEDGER_BALANCE',
        'AVAILABLE_BALANCE',
        'OPENING_BALANCE',
        'CURRENT_BALANCE',
        'REC_ST',
        'organizationName',
        'organizationCode',
        'branchName',
        'branchCode',
        'legacy_reference',
        'sync_status',
        'metadata',
        'createdAt',
        'updatedAt'
      ],
      order: [['GL_ACCT_CAT', 'ASC'], ['GL_ACCT_NO', 'ASC']]
    });
    
    const exportData = accounts.map(account => {
      const legacyRef = JSON.parse(account.legacy_reference || '{}');
      const syncStatus = JSON.parse(account.sync_status || '{}');
      const metadata = JSON.parse(account.metadata || '{}');
      
      return {
        id: account.id,
        GL_ACCT_NO: account.GL_ACCT_NO,
        GL_ACCT_ID: account.GL_ACCT_ID,
        ACCT_DESC: account.ACCT_DESC,
        GL_ACCT_CAT: account.GL_ACCT_CAT,
        LEDGER_BALANCE: account.LEDGER_BALANCE,
        AVAILABLE_BALANCE: account.AVAILABLE_BALANCE,
        OPENING_BALANCE: account.OPENING_BALANCE,
        CURRENT_BALANCE: account.CURRENT_BALANCE,
        REC_ST: account.REC_ST,
        organizationName: account.organizationName,
        organizationCode: account.organizationCode,
        branchName: account.branchName,
        branchCode: account.branchCode,
        legacyId: legacyRef.legacyId,
        legacyGLCode: legacyRef.legacyGLCode,
        legacyName: legacyRef.legacyName,
        legacyBalance: legacyRef.legacyBalance,
        migrationBatchId: legacyRef.migrationBatchId,
        balanceMigrated: legacyRef.balanceMigrated,
        balanceReconciled: syncStatus.balanceReconciled,
        balanceDifference: syncStatus.balanceDifference,
        accountType: metadata.accountType,
        productType: metadata.productType,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt
      };
    });
    
    if (format === 'csv') {
      // Convert to CSV format
      const csvRows = [];
      
      // Add header
      if (exportData.length > 0) {
        const headers = Object.keys(exportData[0]);
        csvRows.push(headers.join(','));
        
        // Add data rows
        exportData.forEach(item => {
          const row = headers.map(header => {
            const value = item[header];
            // Escape quotes and wrap in quotes if contains comma
            const escaped = String(value || '').replace(/"/g, '""');
            return escaped.includes(',') ? `"${escaped}"` : escaped;
          });
          csvRows.push(row.join(','));
        });
      }
      
      return csvRows.join('\n');
    }
    
    // Default to JSON
    return exportData;
  }
}

export default ChartOfAccountsMigrator;