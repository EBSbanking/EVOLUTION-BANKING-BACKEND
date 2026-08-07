// config/flutterwave.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, '../.env')
});

// ======================================================
// Environment - Determine if we're in production
// ======================================================

const isProduction = process.env.NODE_ENV === 'production';
const isSandbox = !isProduction;

console.log(`🔧 Flutterwave Environment: ${isProduction ? 'PRODUCTION' : 'SANDBOX'}`);

// ======================================================
// V3 API Configuration (Primary - using Secret Key)
// ======================================================

// Use the direct variables from .env
export const FLW_BASE_URL = process.env.FLW_SANDBOX_BASE_URL || process.env.FLUTTERWAVE_BASE_URL || 'https://api.flutterwave.com/v3';
export const FLW_SECRET_KEY = process.env.FLW_SANDBOX_SECRET_KEY || process.env.FLUTTERWAVE_SECRET_KEY || '';
export const FLW_PUBLIC_KEY = process.env.FLW_SANDBOX_PUBLIC_KEY || process.env.FLUTTERWAVE_PUBLIC_KEY || '';
export const FLW_ENCRYPTION_KEY = process.env.FLW_SANDBOX_ENCRYPTION_KEY || process.env.FLUTTERWAVE_ENCRYPTION_KEY || '';
export const FLW_CALLBACK_URL = process.env.FLW_SANDBOX_CALLBACK_URL || process.env.FLUTTERWAVE_CALLBACK_URL || 'http://localhost:3002/api/flutterwave/callback';
export const FLW_WEBHOOK_URL = process.env.FLW_SANDBOX_WEBHOOK_URL || process.env.FLUTTERWAVE_WEBHOOK_URL || 'http://localhost:3002/api/flutterwave/webhook';
export const FLW_SECRET_HASH = process.env.FLW_SANDBOX_SECRET_HASH || process.env.FLUTTERWAVE_SECRET_HASH || '';

// ======================================================
// Developer Sandbox API (Optional - OAuth2)
// ======================================================

export const FLW_DEV_BASE_URL = process.env.FLW_SANDBOX_DEV_BASE_URL || process.env.FLUTTERWAVE_DEV_BASE_URL || 'https://developersandbox-api.flutterwave.com';
export const FLW_CLIENT_ID = process.env.FLW_SANDBOX_DEV_CLIENT_ID || process.env.FLUTTERWAVE_DEV_CLIENT_ID || '';
export const FLW_CLIENT_SECRET = process.env.FLW_SANDBOX_DEV_CLIENT_SECRET || process.env.FLUTTERWAVE_DEV_CLIENT_SECRET || '';
export const FLW_DEV_ENCRYPTION_KEY = process.env.FLW_SANDBOX_DEV_ENCRYPTION_KEY || process.env.FLUTTERWAVE_DEV_ENCRYPTION_KEY || '';
export const FLW_IDP_URL = process.env.FLW_SANDBOX_DEV_IDP_URL || process.env.FLUTTERWAVE_DEV_IDP_URL || 'https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token';

// ======================================================
// Shared Settings
// ======================================================

export const FLW_TIMEOUT = Number(process.env.FLUTTERWAVE_TIMEOUT || 30000);
export const FLW_ENABLE_3DS = process.env.FLUTTERWAVE_ENABLE_3DS !== 'false';
export const FLW_IS_PROD = isProduction;
export const FLW_IS_SANDBOX = isSandbox;

// ======================================================
// Validation
// ======================================================

function validateConfig() {
  console.log('\n===============================');
  console.log(' Flutterwave Configuration');
  console.log('===============================');
  console.log(`Environment : ${isProduction ? 'LIVE' : 'SANDBOX'}`);
  console.log(`API Type    : V3 API (Secret Key)`);
  console.log(`Base URL    : ${FLW_BASE_URL}`);
  console.log(`Secret Key  : ${FLW_SECRET_KEY ? '✅ Set (' + FLW_SECRET_KEY.substring(0, 15) + '...)' : '❌ Missing'}`);
  console.log(`Encrypt Key : ${FLW_ENCRYPTION_KEY ? '✅ Set (' + FLW_ENCRYPTION_KEY.substring(0, 15) + '...)' : '❌ Missing'}`);
  console.log(`Public Key  : ${FLW_PUBLIC_KEY ? '✅ Set' : '❌ Not Set'}`);
  console.log(`OAuth       : ${FLW_CLIENT_ID && FLW_CLIENT_SECRET ? '✅ Configured' : '❌ Not Configured'}`);
  console.log('===============================\n');

  if (!FLW_SECRET_KEY) {
    console.error('❌ ERROR: Missing Flutterwave Secret Key!');
    console.error('Please set FLW_SANDBOX_SECRET_KEY or FLUTTERWAVE_SECRET_KEY in .env');
  }

  if (!FLW_ENCRYPTION_KEY) {
    console.error('❌ ERROR: Missing Flutterwave Encryption Key!');
    console.error('Please set FLW_SANDBOX_ENCRYPTION_KEY or FLUTTERWAVE_ENCRYPTION_KEY in .env');
  }
}

validateConfig();

export default {
  FLW_IS_PROD,
  FLW_IS_SANDBOX,
  FLW_BASE_URL,
  FLW_SECRET_KEY,
  FLW_PUBLIC_KEY,
  FLW_ENCRYPTION_KEY,
  FLW_CALLBACK_URL,
  FLW_WEBHOOK_URL,
  FLW_SECRET_HASH,
  FLW_DEV_BASE_URL,
  FLW_CLIENT_ID,
  FLW_CLIENT_SECRET,
  FLW_DEV_ENCRYPTION_KEY,
  FLW_IDP_URL,
  FLW_TIMEOUT,
  FLW_ENABLE_3DS
};