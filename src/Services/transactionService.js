// services/transactionService.js - Combined with VAT and WHT narration support
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import CustomerAccount from '../models/CustomerAccount.js';
import DepositAccountApplication from '../models/DepositAccountApplication.js';
import { processDrawerTransaction } from '../controllers/DrawerController.js';
import Charge from '../models/Charge.js';
import ChargeTier from '../models/ChargeTier.js';

export class TransactionService {
  // ==================== EXISTING METHODS ====================
  
  static async createTransaction(transactionData) {
    try {
      const { transactionType, amount, isCashTransaction = true } = transactionData;
      
      if (isCashTransaction) {
        const result = await this.processCashTransaction(transactionData);
        return {
          success: true,
          data: result,
          message: 'Cash transaction created successfully'
        };
      } else {
        const result = await this.processNonCashTransaction(transactionData);
        return {
          success: true,
          data: result,
          message: 'Transaction created successfully'
        };
      }
    } catch (error) {
      console.error('Error creating transaction:', error);
      return {
        success: false,
        message: error.message || 'Failed to create transaction'
      };
    }
  }

  static async processNonCashTransaction(transactionData) {
    const { accountInfo, amount, transactionType, referenceNo, description } = transactionData;
    const t = await sequelize.transaction();
    
    try {
      const accountResult = await this.processAccountTransaction(accountInfo, {
        amount,
        transactionType,
        referenceNo,
        description
      }, t);
      
      await t.commit();
      
      return {
        success: true,
        account: accountResult,
        message: 'Non-cash transaction processed successfully'
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  static async processCashTransaction(transactionData, transaction = null) {
    const {
      drawerId,
      transactionType,
      amount,
      customerAccount,
      referenceNo,
      description,
      userId,
      accountInfo,
      normalizedTransactionType,
      isOpeningCashDeposit = false
    } = transactionData;

    let internalTransaction = transaction;
    let shouldCommitTransaction = false;

    try {
      if (!internalTransaction) {
        internalTransaction = await sequelize.transaction();
        shouldCommitTransaction = true;
      }

      const drawerReq = {
        body: {
          drawerId,
          transactionType: isOpeningCashDeposit ? 'OPENING_DEPOSIT' : 
                          normalizedTransactionType === 'DR' ? 'WITHDRAWAL' : 'DEPOSIT',
          amount,
          customerAccount,
          referenceNo,
          description,
          userId
        }
      };

      const drawerResult = await processDrawerTransaction(drawerReq, {}, internalTransaction);
      
      if (!drawerResult.success) {
        throw new Error(`Drawer transaction failed: ${drawerResult.message}`);
      }

      let accountResult = null;
      if (accountInfo && !isOpeningCashDeposit) {
        accountResult = await this.processAccountTransaction(accountInfo, {
          amount,
          transactionType: normalizedTransactionType,
          referenceNo,
          description
        }, internalTransaction);
      }

      if (shouldCommitTransaction) {
        await internalTransaction.commit();
      }

      return {
        success: true,
        drawer: drawerResult.drawer,
        account: accountResult,
        transaction: drawerResult.transaction
      };

    } catch (error) {
      if (shouldCommitTransaction && internalTransaction) {
        await internalTransaction.rollback();
      }
      throw error;
    }
  }

  /**
   * Process account transaction with all balance types
   * - ledger_balance: Total balance including uncleared items
   * - available_balance: Balance available for withdrawal (ledger - holds)
   * - cleared_balance: Balance of cleared items only
   * - current_balance: Current total balance (same as ledger in most cases)
   */
  static async processAccountTransaction(accountInfo, transactionData, transaction) {
    const { amount, transactionType, referenceNo, description } = transactionData;
    let { 
      ledgerBalance, 
      availableBalance, 
      clearedBalance,
      currentBalance 
    } = accountInfo;
    
    // If currentBalance is not provided, use ledgerBalance
    if (currentBalance === undefined) {
      currentBalance = ledgerBalance;
    }
    
    const isDebit = transactionType === 'DR';
    
    // Check available balance for debits
    if (isDebit) {
      // Use available_balance for withdrawal checks
      const checkBalance = availableBalance !== undefined ? availableBalance : ledgerBalance;
      if (checkBalance < amount) {
        throw new Error(
          `Insufficient account balance. Available: ₦${checkBalance.toFixed(2)}, Required: ₦${amount.toFixed(2)}`
        );
      }
      
      // Update all balances for debit
      ledgerBalance -= amount;
      availableBalance -= amount;
      clearedBalance = Math.max(0, clearedBalance - amount);
      currentBalance -= amount;
    } else {
      // Update all balances for credit
      ledgerBalance += amount;
      availableBalance += amount;
      clearedBalance += amount;
      currentBalance += amount;
    }

    // Update all balance types in the database
    await this.updateAccountBalances(accountInfo, {
      ledgerBalance,
      availableBalance,
      clearedBalance,
      currentBalance
    }, transaction);

    return {
      accountNumber: accountInfo.accountNumber,
      accountName: accountInfo.accountName,
      newBalances: { 
        ledgerBalance, 
        availableBalance, 
        clearedBalance,
        currentBalance 
      },
      transactionType,
      amount,
      referenceNo
    };
  }

  /**
   * Update all balance types in the database
   */
  static async updateAccountBalances(accountInfo, newBalances, transaction) {
    const { model, accountNumber } = accountInfo;
    const { 
      ledgerBalance, 
      availableBalance, 
      clearedBalance,
      currentBalance 
    } = newBalances;
    
    console.log(`🔄 Updating account balances for ${accountNumber} in ${model}:`, {
      ledgerBalance: ledgerBalance.toFixed(2),
      availableBalance: availableBalance.toFixed(2),
      clearedBalance: clearedBalance.toFixed(2),
      currentBalance: currentBalance.toFixed(2)
    });
    
    const updateData = {
      lastActivityDate: new Date(),
      updatedAt: new Date()
    };
    
    // Update all balance fields based on model structure
    switch (model) {
      case 'CustomerAccount':
        // Update both camelCase and snake_case field names for compatibility
        updateData.ledger_balance = ledgerBalance.toFixed(2);
        updateData.available_balance = availableBalance.toFixed(2);
        updateData.cleared_balance = clearedBalance.toFixed(2);
        updateData.current_balance = currentBalance.toFixed(2);
        
        // Also update the uppercase field names used in some queries
        updateData.LEDGER_BAL = ledgerBalance.toFixed(2);
        updateData.AVAILABLE_BALANCE = availableBalance.toFixed(2);
        updateData.CLEARED_BAL = clearedBalance.toFixed(2);
        updateData.CURRENT_BAL = currentBalance.toFixed(2);
        break;
        
      case 'DepositAccountApplication':
        updateData.LEDGER_BAL = ledgerBalance.toFixed(2);
        updateData.AVAILABLE_BALANCE = availableBalance.toFixed(2);
        updateData.CLEARED_BAL = clearedBalance.toFixed(2);
        updateData.CURRENT_BAL = currentBalance.toFixed(2);
        break;
    }
    
    let updateResult;
    
    switch (model) {
      case 'CustomerAccount':
        updateResult = await CustomerAccount.update(
          updateData,
          { 
            where: { 
              [Op.or]: [
                { account_number: accountNumber },
                { ACCT_NO: accountNumber }
              ]
            },
            transaction 
          }
        );
        break;
        
      case 'DepositAccountApplication':
        updateResult = await DepositAccountApplication.update(
          updateData,
          { 
            where: { ACCT_NO: accountNumber },
            transaction 
          }
        );
        break;
    }
    
    if (updateResult[0] === 0) {
      throw new Error(`Account ${accountNumber} not found in ${model} during update`);
    }
    
    console.log(`✅ Updated ${updateResult[0]} record(s) for account ${accountNumber}`);
    return updateResult;
  }

  // ==================== VAT & WHT METHODS ====================

  /**
   * Calculate charge amount based on tier
   * This is the SERVICE FEE/CHARGE amount that VAT applies to
   */
  static calculateChargeAmount(charge, transactionAmount) {
    if (charge.TIER_TY === 'FLAT') {
      return parseFloat(charge.CHRG_AMT);
    } else if (charge.TIER_TY === 'PERCENTAGE') {
      return (parseFloat(charge.CHRG_PCT) / 100) * transactionAmount;
    } else if (charge.TIER_TY === 'RANGE') {
      const tiers = charge.tiers || [];
      if (tiers.length > 0) {
        const sortedTiers = [...tiers].sort((a, b) => a.min_amount - b.min_amount);
        for (const tier of sortedTiers) {
          const min = parseFloat(tier.min_amount);
          const max = tier.max_amount ? parseFloat(tier.max_amount) : Infinity;
          if (transactionAmount >= min && transactionAmount <= max) {
            if (tier.fee_type === 'FIXED') {
              return parseFloat(tier.fee_amount);
            } else if (tier.fee_type === 'PERCENTAGE') {
              return (parseFloat(tier.fee_percentage) / 100) * transactionAmount;
            }
          }
        }
        const lastTier = sortedTiers[sortedTiers.length - 1];
        if (lastTier.fee_type === 'FIXED') {
          return parseFloat(lastTier.fee_amount);
        } else {
          return (parseFloat(lastTier.fee_percentage) / 100) * transactionAmount;
        }
      }
      return 0;
    }
    return 0;
  }

  /**
   * Generate narration for VAT transaction
   * VAT is charged on the SERVICE FEE/CHARGE amount
   */
  static generateVatNarration(customerName, customerAccount, serviceFeeAmount, vatAmount, chargeName, transactionRef) {
    return `VAT (7.5%) ON ${chargeName} - ${customerName} (ACCT: ${customerAccount}) - FEE: ₦${serviceFeeAmount.toFixed(2)} - VAT: ₦${vatAmount.toFixed(2)} - TXN: ${transactionRef}`;
  }

  /**
   * Generate narration for WHT transaction
   * WHT is charged on the SERVICE FEE/CHARGE amount
   */
  static generateWhtNarration(customerName, customerAccount, serviceFeeAmount, whtAmount, chargeName, transactionRef, whtType) {
    return `WHT (${whtType}) ON ${chargeName} - ${customerName} (ACCT: ${customerAccount}) - FEE: ₦${serviceFeeAmount.toFixed(2)} - WHT: ₦${whtAmount.toFixed(2)} - TXN: ${transactionRef}`;
  }

  /**
   * Generate narration for main charge transaction (the service fee)
   */
  static generateChargeNarration(customerName, customerAccount, chargeAmount, chargeName, transactionRef) {
    return `${chargeName} - ${customerName} (ACCT: ${customerAccount}) - ₦${chargeAmount.toFixed(2)} - TXN: ${transactionRef}`;
  }

  /**
   * Process a charge with VAT and WHT
   * VAT (7.5%) applies to the SERVICE FEE/CHARGE amount, not the transaction amount
   */
  static async processChargeWithTax({
    customerId,
    customerName,
    customerAccount,
    chargeCode,
    transactionAmount, // The principal transaction amount (e.g., loan amount, deposit amount)
    transactionRef,
    operationType,
    glAccountMap,
    userId = 'system',
    transaction = null,
    accountInfo = null // Pass account info to check balances
  }) {
    let internalTransaction = transaction;
    let shouldCommitTransaction = false;

    try {
      if (!internalTransaction) {
        internalTransaction = await sequelize.transaction();
        shouldCommitTransaction = true;
      }

      // 1. Get the charge configuration
      const charge = await Charge.findOne({
        where: { 
          CHRG_CD: chargeCode,
          REC_ST: 'A' 
        },
        include: [{ model: ChargeTier, as: 'tiers' }],
        transaction: internalTransaction
      });

      if (!charge) {
        throw new Error(`Charge configuration not found for code: ${chargeCode}`);
      }

      // 2. Calculate service fee/charge amount
      const serviceFeeAmount = this.calculateChargeAmount(charge, transactionAmount);
      if (serviceFeeAmount <= 0) {
        return {
          success: true,
          message: 'No charge applicable',
          serviceFeeAmount: 0,
          vatAmount: 0,
          whtAmount: 0,
          totalDeducted: 0,
          totalChargeWithTax: 0
        };
      }

      // 3. Calculate VAT and WHT
      let vatAmount = 0;
      let whtAmount = 0;
      let totalDeducted = serviceFeeAmount;

      // VAT (7.5%) - APPLIES TO THE SERVICE FEE ONLY
      if (charge.IS_VAT_APPLICABLE) {
        vatAmount = (charge.VAT_RATE / 100) * serviceFeeAmount;
        totalDeducted += vatAmount;
      }

      // WHT - APPLIES TO THE SERVICE FEE ONLY (excluding VAT)
      if (charge.IS_WHT_APPLICABLE) {
        whtAmount = (charge.WHT_RATE / 100) * serviceFeeAmount;
        totalDeducted += whtAmount;
      }

      // 4. Check if customer has sufficient balance for the total deduction
      if (accountInfo) {
        const availableBalance = accountInfo.availableBalance !== undefined 
          ? accountInfo.availableBalance 
          : accountInfo.ledgerBalance;
          
        if (availableBalance < totalDeducted) {
          throw new Error(
            `Insufficient balance for charges. Available: ₦${availableBalance.toFixed(2)}, Required: ₦${totalDeducted.toFixed(2)}`
          );
        }
      }

      // 5. Prepare transaction entries
      const entries = [];
      const chargeGLAccount = charge.INCOME_GL_ACCT_NO || glAccountMap?.chargeIncome || 'NONE';

      // 6. Main service fee entry - Debit customer account for the service fee
      const chargeNarration = this.generateChargeNarration(
        customerName,
        customerAccount,
        serviceFeeAmount,
        charge.CHRG_NM || charge.CHRG_TY,
        transactionRef
      );

      entries.push({
        accountNo: customerAccount,
        amount: serviceFeeAmount,
        transactionType: 'DR',
        narration: chargeNarration,
        glAccount: chargeGLAccount,
        customerId: customerId,
        transactionRef: transactionRef,
        chargeCode: charge.CHRG_CD,
        isCharge: true,
        serviceFeeAmount: serviceFeeAmount,
        balanceType: 'CHARGE'
      });

      // 7. Service fee income entry - Credit income GL
      entries.push({
        accountNo: chargeGLAccount,
        amount: serviceFeeAmount,
        transactionType: 'CR',
        narration: chargeNarration,
        glAccount: chargeGLAccount,
        customerId: customerId,
        transactionRef: transactionRef,
        chargeCode: charge.CHRG_CD,
        isCharge: true,
        serviceFeeAmount: serviceFeeAmount,
        balanceType: 'INCOME'
      });

      // 8. Process VAT (7.5%)
      if (vatAmount > 0) {
        const vatGLAccount = charge.VAT_GL_ACCOUNT_NO || glAccountMap?.vatPayable || 'NONE';
        const vatNarration = this.generateVatNarration(
          customerName,
          customerAccount,
          serviceFeeAmount,
          vatAmount,
          charge.CHRG_NM || charge.CHRG_TY,
          transactionRef
        );

        // Debit customer account for VAT
        entries.push({
          accountNo: customerAccount,
          amount: vatAmount,
          transactionType: 'DR',
          narration: vatNarration,
          glAccount: vatGLAccount,
          customerId: customerId,
          transactionRef: transactionRef,
          isVat: true,
          vatRate: charge.VAT_RATE,
          chargeCode: charge.CHRG_CD,
          serviceFeeAmount: serviceFeeAmount,
          vatAmount: vatAmount,
          balanceType: 'VAT'
        });

        // Credit VAT GL account
        entries.push({
          accountNo: vatGLAccount,
          amount: vatAmount,
          transactionType: 'CR',
          narration: vatNarration,
          glAccount: vatGLAccount,
          customerId: customerId,
          transactionRef: transactionRef,
          isVat: true,
          vatRate: charge.VAT_RATE,
          chargeCode: charge.CHRG_CD,
          serviceFeeAmount: serviceFeeAmount,
          vatAmount: vatAmount,
          balanceType: 'VAT_PAYABLE'
        });
      }

      // 9. Process WHT
      if (whtAmount > 0) {
        const whtGLAccount = charge.WHT_GL_ACCOUNT_NO || glAccountMap?.whtPayable || 'NONE';
        const whtNarration = this.generateWhtNarration(
          customerName,
          customerAccount,
          serviceFeeAmount,
          whtAmount,
          charge.CHRG_NM || charge.CHRG_TY,
          transactionRef,
          charge.WHT_TYPE || 'CORPORATE'
        );

        // Debit customer account for WHT
        entries.push({
          accountNo: customerAccount,
          amount: whtAmount,
          transactionType: 'DR',
          narration: whtNarration,
          glAccount: whtGLAccount,
          customerId: customerId,
          transactionRef: transactionRef,
          isWht: true,
          whtRate: charge.WHT_RATE,
          whtType: charge.WHT_TYPE || 'CORPORATE',
          chargeCode: charge.CHRG_CD,
          serviceFeeAmount: serviceFeeAmount,
          whtAmount: whtAmount,
          balanceType: 'WHT'
        });

        // Credit WHT GL account
        entries.push({
          accountNo: whtGLAccount,
          amount: whtAmount,
          transactionType: 'CR',
          narration: whtNarration,
          glAccount: whtGLAccount,
          customerId: customerId,
          transactionRef: transactionRef,
          isWht: true,
          whtRate: charge.WHT_RATE,
          whtType: charge.WHT_TYPE || 'CORPORATE',
          chargeCode: charge.CHRG_CD,
          serviceFeeAmount: serviceFeeAmount,
          whtAmount: whtAmount,
          balanceType: 'WHT_PAYABLE'
        });
      }

      // 10. Post all entries to GL and update balances
      const postedEntries = await this.postTransactionEntries(entries, userId, internalTransaction);

      // 11. If we started the transaction, commit it
      if (shouldCommitTransaction) {
        await internalTransaction.commit();
      }

      // 12. Return summary
      return {
        success: true,
        message: 'Charge processed successfully',
        serviceFeeAmount: serviceFeeAmount,
        vatAmount: vatAmount,
        whtAmount: whtAmount,
        totalDeducted: totalDeducted,
        totalChargeWithTax: totalDeducted,
        entries: postedEntries,
        chargeConfig: {
          chargeCode: charge.CHRG_CD,
          chargeName: charge.CHRG_NM || charge.CHRG_TY,
          tierType: charge.TIER_TY,
          vatRate: charge.VAT_RATE || 7.5,
          whtRate: charge.WHT_RATE,
          whtType: charge.WHT_TYPE
        }
      };

    } catch (error) {
      if (shouldCommitTransaction && internalTransaction) {
        await internalTransaction.rollback();
      }
      console.error('Process Charge With Tax Error:', error);
      throw error;
    }
  }

  /**
   * Post transaction entries to GL and update account balances
   */
  static async postTransactionEntries(entries, userId, transaction) {
    const postedEntries = [];
    
    for (const entry of entries) {
      // If it's a customer account entry, update the balance
      if (entry.accountNo && entry.balanceType) {
        // Get current account balance
        const account = await CustomerAccount.findOne({
          where: { 
            [Op.or]: [
              { account_number: entry.accountNo },
              { ACCT_NO: entry.accountNo }
            ]
          },
          transaction
        });

        if (account) {
          const currentBalances = {
            ledgerBalance: parseFloat(account.LEDGER_BAL || account.ledger_balance || 0),
            availableBalance: parseFloat(account.AVAILABLE_BALANCE || account.available_balance || 0),
            clearedBalance: parseFloat(account.CLEARED_BAL || account.cleared_balance || 0),
            currentBalance: parseFloat(account.CURRENT_BAL || account.current_balance || 0)
          };

          // Update balances based on transaction type
          if (entry.transactionType === 'DR') {
            currentBalances.ledgerBalance -= entry.amount;
            currentBalances.availableBalance -= entry.amount;
            currentBalances.clearedBalance = Math.max(0, currentBalances.clearedBalance - entry.amount);
            currentBalances.currentBalance -= entry.amount;
          } else if (entry.transactionType === 'CR') {
            currentBalances.ledgerBalance += entry.amount;
            currentBalances.availableBalance += entry.amount;
            currentBalances.clearedBalance += entry.amount;
            currentBalances.currentBalance += entry.amount;
          }

          // Update account balances
          await this.updateAccountBalances(
            { model: 'CustomerAccount', accountNumber: entry.accountNo },
            currentBalances,
            transaction
          );
        }
      }

      const postedEntry = {
        ...entry,
        postedAt: new Date(),
        postedBy: userId,
        status: 'POSTED',
        customerReference: `${entry.customerId}|${entry.customerAccount}`,
        narration: entry.narration
      };
      
      console.log(`📝 GL Entry: ${entry.transactionType} ${entry.amount.toFixed(2)} - ${entry.narration}`);
      postedEntries.push(postedEntry);
    }
    
    return postedEntries;
  }

  /**
   * Process a complete transaction with charges, VAT, and WHT
   */
  static async processFullTransaction(transactionData) {
    const {
      drawerId,
      amount, // Principal transaction amount
      customerAccount,
      customerName,
      customerId,
      referenceNo,
      description,
      userId,
      chargeCode,
      operationType,
      glAccountMap,
      accountInfo,
      isCashTransaction = true
    } = transactionData;

    let transaction = null;
    let shouldCommitTransaction = false;

    try {
      transaction = await sequelize.transaction();
      shouldCommitTransaction = true;

      // 1. Get current account balances
      const account = await CustomerAccount.findOne({
        where: { 
          [Op.or]: [
            { account_number: customerAccount },
            { ACCT_NO: customerAccount }
          ]
        },
        transaction
      });

      if (!account) {
        throw new Error(`Account ${customerAccount} not found`);
      }

      // 2. Prepare account info with all balance types
      const fullAccountInfo = {
        ...accountInfo,
        accountNumber: customerAccount,
        ledgerBalance: parseFloat(account.LEDGER_BAL || account.ledger_balance || 0),
        availableBalance: parseFloat(account.AVAILABLE_BALANCE || account.available_balance || 0),
        clearedBalance: parseFloat(account.CLEARED_BAL || account.cleared_balance || 0),
        currentBalance: parseFloat(account.CURRENT_BAL || account.current_balance || 0)
      };

      // 3. Process the main transaction
      let transactionResult;
      if (isCashTransaction) {
        transactionResult = await this.processCashTransaction({
          drawerId,
          amount,
          customerAccount,
          referenceNo,
          description,
          userId,
          accountInfo: fullAccountInfo,
          normalizedTransactionType: 'DR',
          isOpeningCashDeposit: false
        }, transaction);
      } else {
        transactionResult = await this.processNonCashTransaction({
          accountInfo: fullAccountInfo,
          amount,
          transactionType: 'DR',
          referenceNo,
          description
        });
      }

      // 4. Process charges if charge code is provided
      let chargeResult = null;
      if (chargeCode) {
        chargeResult = await this.processChargeWithTax({
          customerId,
          customerName,
          customerAccount,
          chargeCode,
          transactionAmount: amount,
          transactionRef: referenceNo,
          operationType,
          glAccountMap,
          userId,
          transaction,
          accountInfo: fullAccountInfo
        });
      }

      // 5. Commit the transaction
      if (shouldCommitTransaction) {
        await transaction.commit();
      }

      return {
        success: true,
        message: 'Transaction processed successfully',
        mainTransaction: transactionResult,
        charges: chargeResult,
        totalDeducted: amount + (chargeResult?.totalDeducted || 0)
      };

    } catch (error) {
      if (shouldCommitTransaction && transaction) {
        await transaction.rollback();
      }
      console.error('Process Full Transaction Error:', error);
      throw error;
    }
  }

  /**
   * Get account balances
   */
  static async getAccountBalances(accountNumber) {
    const account = await CustomerAccount.findOne({
      where: { 
        [Op.or]: [
          { account_number: accountNumber },
          { ACCT_NO: accountNumber }
        ]
      }
    });

    if (!account) {
      throw new Error(`Account ${accountNumber} not found`);
    }

    return {
      accountNumber: accountNumber,
      ledgerBalance: parseFloat(account.LEDGER_BAL || account.ledger_balance || 0),
      availableBalance: parseFloat(account.AVAILABLE_BALANCE || account.available_balance || 0),
      clearedBalance: parseFloat(account.CLEARED_BAL || account.cleared_balance || 0),
      currentBalance: parseFloat(account.CURRENT_BAL || account.current_balance || 0)
    };
  }
}

// Export for backward compatibility
export const createTransaction = TransactionService.createTransaction.bind(TransactionService);
export const processChargeWithTax = TransactionService.processChargeWithTax.bind(TransactionService);
export const processFullTransaction = TransactionService.processFullTransaction.bind(TransactionService);
export const getAccountBalances = TransactionService.getAccountBalances.bind(TransactionService);

export default TransactionService;