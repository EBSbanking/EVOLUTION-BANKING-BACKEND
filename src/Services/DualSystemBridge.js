// services/DualSystemBridge.js
class DualSystemBridge {
  constructor(legacyDBConnection, mongooseConnection) {
    this.legacyDB = legacyDBConnection;
    this.mongoose = mongooseConnection;
  }

  async syncAccountBalances(organizationCode, branchCode) {
    const GLAccount = this.mongoose.model('GLAccount');
    const migratedAccounts = await GLAccount.find({
      organizationCode,
      branchCode,
      systemSource: 'MIGRATED'
    });

    const syncResults = {
      synced: 0,
      errors: 0,
      differences: []
    };

    for (const account of migratedAccounts) {
      try {
        const legacyBalance = await this.getLegacyBalance(
          account.legacyReference.legacyId
        );

        if (legacyBalance !== account.LEDGER_BALANCE) {
          await account.completeSync(legacyBalance);
          syncResults.differences.push({
            accountNo: account.GL_ACCT_NO,
            newSystemBalance: account.LEDGER_BALANCE,
            legacyBalance,
            difference: account.LEDGER_BALANCE - legacyBalance
          });
        }

        syncResults.synced++;
      } catch (error) {
        console.error(`Sync failed for account ${account.GL_ACCT_NO}:`, error);
        syncResults.errors++;
      }
    }

    return syncResults;
  }

  async getLegacyBalance(legacyId) {
    // Query legacy database
    const query = 'SELECT balance FROM account_charts WHERE id = ?';
    const [result] = await this.legacyDB.execute(query, [legacyId]);
    return result[0]?.balance || 0;
  }

  async createTransactionInBothSystems(transactionData) {
    const { legacyAccountId, newSystemAccountNo, amount, type, narration } = transactionData;

    try {
      // Create in new system
      const newSystemResult = await this.createNewSystemTransaction({
        accountNo: newSystemAccountNo,
        amount,
        type,
        narration
      });

      // Create in legacy system
      const legacyResult = await this.createLegacyTransaction({
        accountId: legacyAccountId,
        amount,
        type,
        narration
      });

      return {
        success: true,
        newSystemId: newSystemResult.transactionId,
        legacyId: legacyResult.transactionId,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('Dual system transaction failed:', error);
      // Implement rollback logic here
      throw error;
    }
  }
}

export default DualSystemBridge;