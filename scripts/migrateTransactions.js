import mongoose from 'mongoose';
import dotenv from 'dotenv';
import GLAccount from '../models/GLAccount.js';
import GLTransaction from '../models/GLAccountTransaction.js';
import Transaction from '../models/Transaction.js';
import LoanAccount from '../models/LoanAccount.js';
import logger from '../utils/logger.js';

dotenv.config();

const migrateTransactions = async () => {
  let session;
  try {
    // ✅ Use env var or fallback hardcoded connection string
    const mongoUri =
      process.env.MONGO_URI ||
      'mongodb+srv://Administrator:Fo%24th3DR%24%3D083@cluster0.zpuy3.mongodb.net/evolution_banking?retryWrites=true&w=majority&appName=Cluster0';

    console.log('Using Mongo URI:', mongoUri.includes('Administrator') ? '[HIDDEN]' : mongoUri);

    // ✅ Connect to MongoDB first
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info('Connected to MongoDB for migration');

    // ✅ Start session after connection
    session = await mongoose.startSession();
    session.startTransaction();
    logger.info('Starting transaction data migration...');

    // Step 1: Migrate transaction records from GLAccount → GLTransaction
    const transactionDocs = await GLAccount.find({
      $or: [
        { AMOUNT: { $exists: true } },
        { TRANSACTION_TYPE: { $exists: true } },
        { JOURNAL_ID: { $exists: true } },
      ],
    })
      .session(session)
      .lean();

   if (transactionDocs.length > 0) {
  const transactions = transactionDocs.map((doc) => ({
    GL_ACCT_NO: doc.GL_ACCT_NO,
    AMOUNT: doc.AMOUNT || 0,
    TRANSACTION_TYPE:
      doc.TRANSACTION_TYPE?.toUpperCase() === 'CREDIT'
        ? 'CR'
        : doc.TRANSACTION_TYPE?.toUpperCase() === 'DEBIT'
        ? 'DR'
        : doc.TRANSACTION_TYPE,
    CREATED_BY: doc.CREATED_BY || 'system',
    USER_ID: doc.USER_ID || 'system',  // ✅ ensure required field is populated
    SUB_LEDGER_NO: doc.SUB_LEDGER_NO?.toString() || '0000',
    SEG_NO: doc.SEG_NO?.toString() || '001',
    description: doc.ACCT_DESC || 'Migrated transaction',
    JOURNAL_ID:
      doc.JOURNAL_ID ||
      String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0'),
    DRS_ALLOWED_FG:
      doc.DR_ALLOWED || doc.TRANSACTION_TYPE?.toUpperCase() === 'DR',
    CRS_ALLOWED_FG:
      doc.CR_ALLOWED || doc.TRANSACTION_TYPE?.toUpperCase() === 'CR',
    BAL_CD:
      doc.BAL_CD ||
      (doc.TRANSACTION_TYPE?.toUpperCase() === 'CR' ? 1 : 2),
    GL_ACCT_CAT: doc.GL_ACCT_CAT || doc.GL_ACCT_CAT_CD || 'ASSET',
    timestamp: doc.ROW_TS || doc.createdAt || new Date(),
  }));


      await GLTransaction.insertMany(transactions, { session });
      await GLAccount.deleteMany(
        {
          $or: [
            { AMOUNT: { $exists: true } },
            { TRANSACTION_TYPE: { $exists: true } },
            { JOURNAL_ID: { $exists: true } },
          ],
        },
        { session }
      );
      logger.info(
        `Migrated ${transactionDocs.length} transactions from GLAccount to GLTransaction`
      );
    } else {
      logger.info('No transaction records found in GLAccount collection');
    }

    // Step 2: Normalize TRANSACTION_TYPE in Transaction collection
    const txResult = await Transaction.updateMany(
      { TRANSACTION_TYPE: { $exists: true } },
      [
        {
          $set: {
            TRANSACTION_TYPE: {
              $switch: {
                branches: [
                  { case: { $eq: ['$TRANSACTION_TYPE', 'Debit'] }, then: 'DEBIT' },
                  { case: { $eq: ['$TRANSACTION_TYPE', 'Credit'] }, then: 'CREDIT' },
                  {
                    case: { $eq: ['$TRANSACTION_TYPE', 'Loan_Disbursement'] },
                    then: 'LOAN_DISBURSEMENT',
                  },
                ],
                default: { $toUpper: '$TRANSACTION_TYPE' },
              },
            },
            currency: 'NGN',
          },
        },
      ],
      { session }
    );
    logger.info(
      `Updated ${txResult.modifiedCount} documents in Transaction collection`
    );

    // Step 3: Update LoanAccount → set CRNCY_ID = 'NGN'
    const loanResult = await LoanAccount.updateMany(
      {},
      { $set: { CRNCY_ID: 'NGN' } },
      { session }
    );
    logger.info(`Updated ${loanResult.modifiedCount} loan accounts to NGN`);

    // ✅ Commit
    await session.commitTransaction();
    logger.info('Migration completed successfully');
    console.log('Migration completed successfully');
  } catch (error) {
    if (session) {
      await session.abortTransaction();
    }
    logger.error('Migration failed:', { error: error.message, stack: error.stack });
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    if (session) {
      session.endSession();
    }
    await mongoose.disconnect();
    logger.info('MongoDB connection closed');
    process.exit(0);
  }
};

migrateTransactions();
