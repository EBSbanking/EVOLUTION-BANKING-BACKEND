// plugins/aml-plugin/index.js
export default {
  name: 'AML Screening Plugin',
  version: '1.0.0',
  description: 'Integrates Prembly AML screening into the system',
  
  init: async ({ app, services, registerWebhook, envManager }) => {
    console.log('🔍 Initializing AML Screening Plugin...');
    
    // Get the AML service
    const amlService = services.aml;
    if (!amlService) {
      console.warn('⚠️ AML service not available');
      return;
    }

    // Add AML routes
    app.post('/api/aml/screen', async (req, res) => {
      try {
        const result = await amlService.fullAMLScreening(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/api/aml/pep-check', async (req, res) => {
      try {
        const result = await amlService.checkPEP(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/api/aml/sanction-check', async (req, res) => {
      try {
        const result = await amlService.checkSanction(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Register a webhook for AML events
    registerWebhook('aml-webhook', {
      handleWebhook: async (req, res) => {
        console.log('📨 AML webhook received:', req.body);
        res.json({ received: true });
      }
    });

    console.log('✅ AML Screening Plugin initialized successfully');
  },

  stop: async () => {
    console.log('🛑 AML Screening Plugin stopped');
  }
};