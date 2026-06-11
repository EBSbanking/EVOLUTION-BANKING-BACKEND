// src/middleware/decryptPayloadFallback.js
export default async function(req, res, next) {
  console.log('🔓 Fallback decryptPayload - no encryption');
  req.decrypted = false;
  next();
}