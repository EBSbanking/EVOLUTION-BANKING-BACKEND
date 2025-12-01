// services/transactionService.js
import mongoose from 'mongoose';
import CustomerAccount from '../models/CustomerAccount.js';
import DepositAccountApplication from '../models/DepositAccountApplication.js';
import { processDrawerTransaction } from '../controllers/DrawerController.js';

export class TransactionService {
  static async processCashTransaction(transactionData, session = null) {
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

    let internalSession = session;
    let shouldEndSession = false;

    try {
      if (!internalSession) {
        internalSession = await mongoose.startSession();
        internalSession.startTransaction();
        shouldEndSession = true;
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

      const drawerResult = await processDrawerTransaction(drawerReq, {}, internalSession);
      
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
        }, internalSession);
      }

      if (shouldEndSession) {
        await internalSession.commitTransaction();
      }

      return {
        success: true,
        drawer: drawerResult.drawer,
        account: accountResult,
        transaction: drawerResult.transaction
      };

    } catch (error) {
      if (shouldEndSession && internalSession) {
        await internalSession.abortTransaction();
      }
      throw error;
    } finally {
      if (shouldEndSession && internalSession) {
        internalSession.endSession();
      }
    }
  }

  static async processAccountTransaction(accountInfo, transactionData, session) {
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
    }, session);

    return {
      accountNumber: accountInfo.accountNumber,
      accountName: accountInfo.accountName,
      newBalances: { ledgerBalance, availableBalance, clearedBalance },
      transactionType,
      amount
    };
  }

  static async updateAccountBalances(accountInfo, newBalances, session) {
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
    switch (model) {
      case 'CustomerAccount':
        updateData.ledger_balance = mongoose.Types.Decimal128.fromString(ledgerBalance.toFixed(2));
        updateData.available_balance = mongoose.Types.Decimal128.fromString(availableBalance.toFixed(2));
        updateData.cleared_balance = mongoose.Types.Decimal128.fromString(clearedBalance.toFixed(2));
        updateData.LEDGER_BAL = mongoose.Types.Decimal128.fromString(ledgerBalance.toFixed(2));
        updateData.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString(availableBalance.toFixed(2));
        updateData.CLEARED_BAL = mongoose.Types.Decimal128.fromString(clearedBalance.toFixed(2));
        break;
        
      case 'DepositAccountApplication':
        updateData.LEDGER_BAL = mongoose.Types.Decimal128.fromString(ledgerBalance.toFixed(2));
        updateData.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString(availableBalance.toFixed(2));
        updateData.CLEARED_BAL = mongoose.Types.Decimal128.fromString(clearedBalance.toFixed(2));
        break;
    }
    
    let updateResult;
    
    switch (model) {
      case 'CustomerAccount':
        updateResult = await CustomerAccount.updateOne(
          { account_number: accountNumber },
          { $set: updateData },
          { session }
        );
        
        if (updateResult.matchedCount === 0) {
          updateResult = await CustomerAccount.updateOne(
            { ACCT_NO: accountNumber },
            { $set: updateData },
            { session }
          );
        }
        break;
        
      case 'DepositAccountApplication':
        updateResult = await DepositAccountApplication.updateOne(
          { ACCT_NO: accountNumber },
          { $set: updateData },
          { session }
        );
        break;
    }
    
    if (updateResult.matchedCount === 0) {
      throw new Error(`Account ${accountNumber} not found in ${model} during update`);
    }
    
    if (updateResult.modifiedCount === 0) {
      console.warn(`No changes made to account ${accountNumber} - balances may be the same`);
    }
    
    return updateResult;
  }
}