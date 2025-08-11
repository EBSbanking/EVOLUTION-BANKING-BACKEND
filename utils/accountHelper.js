import Counter from '../models/Counter.js';

// 🔢 Generate 10-digit Account Number
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
  const paddedSequence = String(counter.seq).padStart(7, '0'); // 7-digit suffix
  return `${prefix}${paddedSequence}`; // e.g., 1000001234
}

// 🔐 Generate 6-digit ACCT_ID
// utils/accountHelper.js
export async function generateAccountId() {
  const counter = await Counter.findByIdAndUpdate(
    'ACCT_ID_SEQ',
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  // 🔐 Ensure 6-digit number only
  const rawSeq = counter.seq % 1000000; // Always max 6 digits
  const padded = String(rawSeq).padStart(6, '0');

  return parseInt(padded, 10);
}


