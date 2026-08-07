import crypto from "crypto";

/**
 * Generates a random 12-byte nonce required by Flutterwave
 *
 * @returns {string}
 */
export function generateNonce() {
    return crypto.randomBytes(12).toString("utf8");
}

/**
 * Encrypt any card field using Flutterwave AES-256-GCM
 *
 * @param {string|number} value
 * @param {string} nonce
 * @returns {string}
 */
export function encryptCardField(value, nonce) {

    const encryptionKey = process.env.FLUTTERWAVE_ENCRYPTION_KEY;

    if (!encryptionKey) {
        throw new Error("FLUTTERWAVE_ENCRYPTION_KEY is missing.");
    }

    if (!nonce || nonce.length !== 12) {
        throw new Error("Nonce must be exactly 12 characters.");
    }

    const key = Buffer.from(encryptionKey, "base64");

    if (key.length !== 32) {
        throw new Error(
            "Flutterwave encryption key must decode to exactly 32 bytes."
        );
    }

    const cipher = crypto.createCipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(nonce, "utf8")
    );

    const encrypted = Buffer.concat([
        cipher.update(String(value), "utf8"),
        cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    return Buffer.concat([
        encrypted,
        authTag
    ]).toString("base64");
}

/**
 * Encrypt Card Number
 */
export function encryptCardNumber(cardNumber, nonce) {
    return encryptCardField(cardNumber, nonce);
}

/**
 * Encrypt Expiry Month
 */
export function encryptExpiryMonth(month, nonce) {
    return encryptCardField(month, nonce);
}

/**
 * Encrypt Expiry Year
 */
export function encryptExpiryYear(year, nonce) {
    return encryptCardField(year, nonce);
}

/**
 * Encrypt CVV
 */
export function encryptCVV(cvv, nonce) {
    return encryptCardField(cvv, nonce);
}

/**
 * Encrypt all card details at once
 *
 * @param {Object} card
 * @returns {Object}
 */
export function encryptCard(card) {

    const nonce = generateNonce();

    return {

        nonce,

        encrypted_card_number: encryptCardNumber(
            card.cardNumber,
            nonce
        ),

        encrypted_expiry_month: encryptExpiryMonth(
            card.expiryMonth,
            nonce
        ),

        encrypted_expiry_year: encryptExpiryYear(
            card.expiryYear,
            nonce
        ),

        encrypted_cvv: encryptCVV(
            card.cvv,
            nonce
        )

    };
}
/**
 * Disable a card for Flutterwave payments
 */
export async function disableCardForFlutterwave(cardId) {
  try {
    const card = await DebitCard.findByPk(cardId);
    
    if (!card) {
      throw new Error('Card not found');
    }
    
    await card.update({
      flutterwaveEnabled: false
    });
    
    logger.info('✅ Card disabled for Flutterwave:', {
      cardId: card.id,
      cardLast4: card.card_last4
    });
    
    return {
      success: true,
      message: 'Card disabled for Flutterwave payments',
      cardId: card.id,
      cardLast4: card.cardLast4
    };
  } catch (error) {
    logger.error('❌ Error disabling card for Flutterwave:', error.message);
    throw error;
  }
}