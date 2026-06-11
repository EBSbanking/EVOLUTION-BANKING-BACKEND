// services/cardIssuanceService.js
import crypto from 'crypto';
import CustomerAccount from '../models/CustomerAccount.js';
import DebitCard from '../models/DebitCard.js';
import generateCardPan from '../utils/cardPanGenerator.js';
import { getBinInfo } from '../utils/binInfo.js';

/**
 * Issue a new debit card for a customer's account.
 * Uses sequential PAN generation with BIN metadata.
 *
 * @param {number} customerId - ID of the customer
 * @param {string} accountNumber - Account number (e.g., "2973130168")
 * @param {string} cardType - 'PHYSICAL' or 'VIRTUAL' (default 'VIRTUAL')
 * @param {string} issuedBy - Username or system identifier
 * @returns {Promise<Object>} Masked card details
 */
export async function issueDebitCard(customerId, accountNumber, cardType = 'VIRTUAL', issuedBy = 'system') {
  // 1. Fetch the CustomerAccount by account_number
  const customerAccount = await CustomerAccount.findOne({
    where: { account_number: accountNumber, customer_id: customerId, status: 'ACTIVE' }
  });
  if (!customerAccount) {
    throw new Error('Customer account not found or not active for this customer');
  }

  // 2. Generate card details (sequential PAN)
  const pan = await generateCardPan('506099', 16);
  const bin = pan.slice(0, 6);
  const last4 = pan.slice(-4);
  const expiryMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
  const expiryYear = (new Date().getFullYear() + 3).toString();
  const cvv = Math.floor(100 + Math.random() * 900).toString();
  const hashedCVV = crypto.createHash('sha256').update(cvv).digest('hex');

  // 3. Get BIN metadata
  const binInfo = getBinInfo(bin); // static map

  // 4. Create the debit card record (linked to CustomerAccount.id)
  const card = await DebitCard.create({
    customer_id: customerId,
    account_id: customerAccount.id,
    card_pan: pan,
    card_holder_name: customerAccount.account_name || 'Card Holder',
    expiry_month: expiryMonth,
    expiry_year: expiryYear,
    cvv_hash: hashedCVV,
    card_type: cardType,
    card_status: 'ISSUED',
    issued_by: issuedBy,
    issued_at: new Date(),
    card_last4: last4,
    card_bin: bin,
    account_number: customerAccount.account_number,
    // BIN metadata fields (add to DebitCard model first)
    bin_bank_name: binInfo.bankName,
    bin_country: binInfo.country,
    bin_network: binInfo.network,
    bin_card_type: binInfo.cardType
  });

  // 5. Return masked details
  return {
    cardId: card.id,
    maskedPan: `**** **** **** ${card.card_last4}`,
    expiry: `${expiryMonth}/${expiryYear}`,
    cardType: card.card_type,
    status: card.card_status,
    accountNumber: customerAccount.account_number,
    bankName: binInfo.bankName,
    country: binInfo.country,
    network: binInfo.network,
    message: 'Card issued. Please set a PIN before first use.'
  };
}