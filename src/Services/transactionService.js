// services/transactionService.js
import { Op } from 'sequelize';
import sequelize from '../../config/db.js'; // Adjust the path as needed
import CustomerAccount from '../models/CustomerAccount.js';
import DepositAccountApplication from '../models/DepositAccountApplication.js';
import { processDrawerTransaction } from '../controllers/DrawerController.js';

export class TransactionService {
  static async createTransaction(transactionData) {
    try {
      // Determine which processing method to use based on transaction type
      const { transactionType, amount, isCashTransaction = true } = transactionData;
      
      if (isCashTransaction) {
        // For cash transactions, use processCashTransaction
        const result = await this.processCashTransaction(transactionData);
        
        return {
          success: true,
          data: result,
          message: 'Cash transaction created successfully'
        };
      } else {
        // For non-cash transactions (transfers, etc.)
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
    // Implementation for non-cash transactions (transfers, etc.)
    const { accountInfo, amount, transactionType, referenceNo, description } = transactionData;
    
    // Start a transaction
    const t = await sequelize.transaction();
    
    try {
      // Process account transaction without drawer involvement
      const accountResult = await this.processAccountTransaction(accountInfo, {
        amount,
        transactionType,
        referenceNo,
        description
      }, t);
      
      // Commit the transaction
      await t.commit();
      
      return {
        success: true,
        account: accountResult,
        message: 'Non-cash transaction processed successfully'
      };
    } catch (error) {
      // Rollback transaction on error
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
      // Account transaction data
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

      // 1. Process drawer transaction
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

      // 2. If account transaction is involved, process it
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

  static async processAccountTransaction(accountInfo, transactionData, transaction) {
    const { amount, transactionType, referenceNo, description } = transactionData;
    
    let { ledgerBalance, availableBalance, clearedBalance } = accountInfo;
    
    const isDebit = transactionType === 'DR';
    
    if (isDebit) {
      if (availableBalance < amount) {
        throw new Error(`Insufficient account balance. Available: ₦${availableBalance}, Required: ₦${amount}`);
      }
      ledgerBalance -= amount;
      availableBalance -= amount;
      clearedBalance += amount;
    } else {
      ledgerBalance += amount;
      availableBalance += amount;
      clearedBalance += amount;
    }

    // Update account balances
    await this.updateAccountBalances(accountInfo, {
      ledgerBalance,
      availableBalance,
      clearedBalance
    }, transaction);

    return {
      accountNumber: accountInfo.accountNumber,
      accountName: accountInfo.accountName,
      newBalances: { ledgerBalance, availableBalance, clearedBalance },
      transactionType,
      amount
    };
  }

  static async updateAccountBalances(accountInfo, newBalances, transaction) {
    const { model, accountNumber } = accountInfo;
    const { ledgerBalance, availableBalance, clearedBalance } = newBalances;
    
    console.log(`🔄 Updating account balances for ${accountNumber} in ${model}:`, {
      ledgerBalance,
      availableBalance,
      clearedBalance
    });
    
    const updateData = {
      lastActivityDate: new Date(),
      updatedAt: new Date()
    };
    
    // Add balance fields based on model structure
    // Note: Sequelize automatically handles decimal conversions
    switch (model) {
      case 'CustomerAccount':
        updateData.ledger_balance = ledgerBalance.toFixed(2);
        updateData.available_balance = availableBalance.toFixed(2);
        updateData.cleared_balance = clearedBalance.toFixed(2);
        updateData.LEDGER_BAL = ledgerBalance.toFixed(2);
        updateData.AVAILABLE_BALANCE = availableBalance.toFixed(2);
        updateData.CLEARED_BAL = clearedBalance.toFixed(2);
        break;
        
      case 'DepositAccountApplication':
        updateData.LEDGER_BAL = ledgerBalance.toFixed(2);
        updateData.AVAILABLE_BALANCE = availableBalance.toFixed(2);
        updateData.CLEARED_BAL = clearedBalance.toFixed(2);
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
    
    if (updateResult[0] === 0) { // Sequelize update returns [affectedCount]
      throw new Error(`Account ${accountNumber} not found in ${model} during update`);
    }
    
    console.log(`✅ Updated ${updateResult[0]} record(s) for account ${accountNumber}`);
    
    return updateResult;
  }
}

// Export a named function for backward compatibility
export const createTransaction = TransactionService.createTransaction.bind(TransactionService);