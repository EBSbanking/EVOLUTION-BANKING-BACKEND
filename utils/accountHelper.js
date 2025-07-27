import Counter from '../models/Counter.js';

export async function generateAccountNumber(accountType) {
  const prefixMap = {
    'ACCT_LOAN': '300',
    'ACCT_TERM_DEPOSIT': '200',
    'ACCT_SAVINGS': '100'
  };

  if (!prefixMap[accountType]) {
    throw new Error(`Invalid account type: ${accountType}`);
  }

  const counter = await Counter.findByIdAndUpdate(
    accountType,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const prefix = prefixMap[accountType];
  const paddedSequence = String(counter.seq).padStart(9, '0');
  return `${prefix}${paddedSequence}`;
}