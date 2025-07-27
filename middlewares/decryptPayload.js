import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

export const decryptPayload = (req, res, next) => {
  try {
    console.log("Received payload:", req.body);
    
    // Check for empty body
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ 
        message: "Empty payload received",
        errorCode: "EMPTY_PAYLOAD"
      });
    }

    const { encryptedData, signature, iv } = req.body;

    // Validate required fields with detailed error
    if (!encryptedData || !signature || !iv) {
      return res.status(400).json({
        message: "Invalid encrypted payload - missing required fields",
        requiredFields: ["encryptedData", "signature", "iv"],
        receivedFields: Object.keys(req.body),
        errorCode: "MISSING_ENCRYPTION_FIELDS"
      });
    }

    // Rest of your decryption logic...
    next();
  } catch (err) {
    console.error("Decryption middleware error:", err);
    return res.status(500).json({
      message: "Failed to process encrypted payload",
      error: err.message,
      errorCode: "DECRYPTION_ERROR"
    });
  }
};

export default decryptPayload;