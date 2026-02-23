import axios from 'axios';

// CORRECT CONFIGURATION
const PREMBLY_SECRET_KEY = process.env.SECRET_KEY || 'test_sk_9b1c2bafe7c3466fb0e433daab2ac87c';
const PREMBLY_PUBLIC_KEY = process.env.PUBLIC_KEY || 'test_pk_82bb7d8fb21f46908b2ac3b7ae5b2d7b';
const PREMBLY_API_URL = 'https://api.prembly.com/v1/verify';  // CORRECT: api.prembly.com

/**
 * Verify BVN with Prembly API
 */
export const verifyBVN = async (req, res) => {
  try {
    const { type, number, bvn } = req.body;
    const bvnNumber = number || bvn;

    // Validate BVN format
    if (!bvnNumber || !/^\d{11}$/.test(bvnNumber)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid BVN. Must be 11 digits.' 
      });
    }

    console.log('🔐 Verifying BVN:', bvnNumber);
    console.log('📡 Calling Prembly URL:', PREMBLY_API_URL);

    // Make request to Prembly
    const response = await axios.post(PREMBLY_API_URL, {
      type: 'bvn',
      number: bvnNumber
    }, {
      headers: { 
        'x-api-key': PREMBLY_SECRET_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    console.log('✅ Prembly Response:', response.data);

    return res.json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error('❌ BVN verification error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });

    // Handle Prembly 404 (BVN not found)
    if (error.response?.status === 404) {
      return res.status(200).json({
        success: true,
        verified: false,
        message: 'BVN not found in database',
        data: null
      });
    }

    return res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.message || error.message
    });
  }
};

/**
 * Health check endpoint
 */
export const healthCheck = (req, res) => {
  res.json({
    success: true,
    message: 'BVN verification service running',
    timestamp: new Date().toISOString(),
    config: {
      apiUrl: PREMBLY_API_URL,
      hasSecretKey: !!PREMBLY_SECRET_KEY,
      hasPublicKey: !!PREMBLY_PUBLIC_KEY
    }
  });
};

/**
 * Webhook handler with signature verification
 */
export const handleWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-prembly-signature'];
    const token = req.headers['token'];
    const payload = req.body;

    console.log('📥 Webhook received:', {
      signature: signature ? 'Present' : 'Missing',
      token: token || 'Missing',
      body: payload
    });

    // Verify signature
    if (!signature) {
      return res.status(401).json({ 
        success: false, 
        error: 'Missing x-prembly-signature header' 
      });
    }

    const expectedSignature = Buffer.from(PREMBLY_PUBLIC_KEY || '').toString('base64');
    
    if (signature !== expectedSignature) {
      console.error('❌ Invalid webhook signature');
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid signature' 
      });
    }

    console.log('✅ Webhook verified successfully');
    
    return res.status(200).json({
      success: true,
      message: 'Webhook received successfully'
    });

  } catch (error) {
    console.error('❌ Webhook processing error:', error.message);
    return res.status(200).json({
      success: false,
      error: 'Webhook processed with errors'
    });
  }
};

/**
 * Simple webhook handler for testing
 */
export const simpleWebhookHandler = (req, res) => {
  console.log('📨 Simple Webhook received:');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  
  res.status(200).json({
    success: true,
    message: 'Webhook received',
    timestamp: new Date().toISOString()
  });
};