import GLTransactionQueue from '../models/GLTransactionQueue.js';

export const queueGLTransaction = async ({ GL_ACCT_NO, TRANSACTION_TYPE, AMOUNT, CREATED_BY, JOURNAL_ID, SUB_LEDGER_NO, SEG_NO }) => {
  try {
    const queuedTransaction = new GLTransactionQueue({
      GL_ACCT_NO,
      TRANSACTION_TYPE,
      AMOUNT,
      CREATED_BY,
      JOURNAL_ID,
      SUB_LEDGER_NO: SUB_LEDGER_NO || '0000',
      SEG_NO: SEG_NO || 1,
      QUEUE_STATUS: 'Pending',
      CREATED_AT: new Date(),
    });
    await queuedTransaction.save();
    return {
      status: 201,
      message: 'Transaction queued for delayed posting',
      transaction: queuedTransaction.toObject(),
    };
  } catch (error) {
    throw new Error(`Failed to queue GL transaction: ${error.message}`);
  }
};