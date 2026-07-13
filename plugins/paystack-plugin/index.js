// plugins/paystack-plugin/index.js
export default {
  name: 'Paystack Integration',
  version: '1.0.0',
  description: 'Integrates Paystack payment gateway',
  
  init: async ({ app, registerService, envManager }) => {
    console.log('💰 Initializing Paystack Plugin...');
    
    // Create Paystack service
    const paystackService = {
      initializePayment: async (data) => {
        // Paystack logic here
        return { status: 'success', reference: 'PAY_' + Date.now() };
      },
      verifyPayment: async (reference) => {
        // Verification logic
        return { status: 'verified', reference };
      },
      webhookHandler: async (req, res) => {
        console.log('📨 Paystack webhook received:', req.body);
        return { received: true };
      }
    };

    // Register the service so other plugins can use it
    registerService('paystack', paystackService);

    // Add Paystack routes
    app.post('/api/paystack/initialize', async (req, res) => {
      try {
        const result = await paystackService.initializePayment(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/api/paystack/verify', async (req, res) => {
      try {
        const result = await paystackService.verifyPayment(req.body.reference);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    console.log('✅ Paystack Plugin initialized successfully');
  },

  stop: async () => {
    console.log('🛑 Paystack Plugin stopped');
  }
};