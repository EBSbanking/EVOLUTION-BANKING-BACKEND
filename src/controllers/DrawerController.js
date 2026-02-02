import logger from '../utils/logger.js';
import DrawerCurrencyDenomination from '../models/DrawerCurrencyDenomination.js';
import Branch from '../models/Branch.js';
import sequelize from '../../config/db.js'; // Import Sequelize instance
import { drawerAuditHelper } from '../models/AuditTrail.js';
import Drawer from '../models/Drawer.js';

// IMPORTANT: Remove mongoose imports and use sequelize instead

// Calculate total amount from currency denominations
const calculateTotalFromDenominations = (currency) => {
  if (!currency) return 0;
  
  const denominations = {
    OneThousandNaira: 1000,
    FiveHundredNaira: 500,
    TwoHundredNaira: 200,
    OneHundredNaira: 100,
    FiftyNaira: 50,
    TwentyNaira: 20,
    TenNaira: 10,
    FiveNaira: 5
  };

  let total = 0;
  for (const [denom, value] of Object.entries(denominations)) {
    total += (currency[denom] || 0) * value;
  }
  
  return total;
};

// Helper function to calculate session duration
const calculateSessionDuration = (openDate, closeDate) => {
  if (!openDate || !closeDate) return null;
  
  const durationMs = closeDate - openDate;
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${hours}h ${minutes}m`;
};

// Helper function to create auto-closing denomination for historical data
async function createAutoClosingDenomination(drawer, userId, transaction) {
  try {
    const closingDenomData = {
      drawerCrncyId: Math.floor(Date.now() / 1000), // Use timestamp as ID
      drawerId: drawer.id,
      drawerCrncyDenomId: `DCD-AUTO-${Date.now()}`,
      denominationType: 'CLOSING',
      currencyCount: JSON.stringify({
        '1000': 0,
        '500': 0,
        '200': 0,
        '100': 0,
        '50': 0,
        '20': 0,
        '10': 0,
        '5': 0
      }),
      totalAmount: 0,
      recordedBy: userId,
      verifiedBy: userId,
      notes: 'Auto-created for drawer with missing or invalid closing denomination',
      recordDate: drawer.LAST_DRAWER_CLOSE_DT || new Date(),
      status: 'AUTO_CREATED',
      createdBy: userId,
      createDt: new Date(),
      userId: userId,
      rowTs: new Date(),
      versionNo: 1,
      recSt: 'A'
    };
    
    const savedDenom = await DrawerCurrencyDenomination.create(closingDenomData, { transaction });
    console.log(`Auto-closing denomination created: ${savedDenom.id}`);
    return savedDenom;
  } catch (error) {
    console.error('Error creating auto-closing denomination:', error);
    return null;
  }
}

// Helper function to get sequelize instance
async function getSequelizeInstance(req) {
  // Try to get from request first
  if (req.sequelize) {
    return req.sequelize;
  }
  
  // Try to import from config/db.js
  try {
    const dbImport = await import('../../config/db.js');
    return dbImport.default;
  } catch (error) {
    console.log('Failed to import from config/db.js:', error.message);
  }
  
  // Try to import from models/index.js
  try {
    const modelsImport = await import('../models/index.js');
    return modelsImport.sequelize || modelsImport.default;
  } catch (error) {
    console.log('Failed to import from models/index.js:', error.message);
  }
  
  return null;
}

// Helper function to get Drawer model
async function getDrawerModel() {
  try {
    // Try to get from sequelize models
    if (sequelize.models && sequelize.models.Drawer) {
      return sequelize.models.Drawer;
    }
    
    // Try to import directly
    const DrawerImport = await import('../models/Drawer.js');
    return DrawerImport.default;
  } catch (error) {
    console.error('Error getting Drawer model:', error);
    throw new Error('Drawer model not found');
  }
}

// Create a new Drawer entry (automatically creates as CLOSED)
export const createDrawer = async (req, res) => {
  console.log('🔄 createDrawer function called');
  
  // Get sequelize from request or import directly
  let sequelize;
  
  try {
    // Try to get from request first (if middleware is set up)
    sequelize = req.sequelize;
    
    if (!sequelize) {
      // Try to import directly
      const dbImport = await import('../../config/db.js');
      sequelize = dbImport.default;
    }
    
    // If still no sequelize, try getting from models import
    if (!sequelize) {
      const sequelizeImport = await import('../models/index.js');
      sequelize = sequelizeImport.sequelize || sequelizeImport.default;
    }
    
    console.log('📊 Database check:', {
      hasReqSequelize: !!req.sequelize,
      hasImportedSequelize: !!sequelize,
      sequelizeType: sequelize?.constructor?.name
    });
    
    if (!sequelize) {
      console.error('❌ No sequelize instance available');
      return res.status(500).json({ 
        success: false,
        message: 'Database connection not available',
        debug: {
          error: 'Sequelize instance not found',
          recommendations: [
            'Add middleware: app.use((req, res, next) => { req.sequelize = sequelize; next(); })',
            'Check if config/db.js exports sequelize correctly',
            'Verify models are properly initialized'
          ]
        }
      });
    }

    console.log('✅ Sequelize instance obtained');
    
    // Verify connection
    try {
      await sequelize.authenticate();
      console.log('✅ Database connection authenticated');
    } catch (authError) {
      console.error('❌ Database authentication failed:', authError);
      return res.status(500).json({
        success: false,
        message: 'Database connection failed',
        error: authError.message
      });
    }

    const transaction = await sequelize.transaction();
    
    try {
      // Extract parameters from request body
      const {
        DRAWER_ID,
        DRAWER_NO,
        TOTAL_INSURED_AMT,
        MIN_BAL,
        MAX_BAL,
        EFF_FROM_DT,
        EFF_TO_DT,
        REC_ST,
        USER_ID,
        BU_ID,
        DRAWER_NM,
        GL_ACCT_NO,
        BRANCH_CODE
      } = req.body;

      console.log('📝 Received drawer data:', {
        DRAWER_NO,
        DRAWER_NM,
        USER_ID,
        BU_ID,
        DRAWER_ID
      });

      // Set defaults for optional parameters
      const DRAWER_TY_CD = req.body.DRAWER_TY_CD || 'TELLER';
      const VAULT_TYPE = req.body.VAULT_TYPE || 'BRANCH_VAULT';
      const SECURITY_LEVEL = req.body.SECURITY_LEVEL || 'LEVEL_2';
      const REQUIRES_DUAL_CONTROL = req.body.REQUIRES_DUAL_CONTROL !== false;

      // Get Drawer model using helper function
      const Drawer = await getDrawerModel();

      // Validate required fields
      if (!DRAWER_NO) {
        await transaction.rollback();
        return res.status(400).json({ 
          success: false,
          message: 'DRAWER_NO is required' 
        });
      }

      // Validate drawer number uniqueness
      const existingDrawer = await Drawer.findOne({ 
        where: { DRAWER_NO },
        transaction 
      });
      
      if (existingDrawer) {
        await transaction.rollback();
        return res.status(400).json({ 
          success: false,
          message: 'Drawer number already exists' 
        });
      }

      // Generate a DRAWER_ID if not provided
      const drawerIdValue = DRAWER_ID || Math.floor(Math.random() * 10000) + 1000;

      // New drawers are created as CLOSED by default
      const newDrawerData = {
        DRAWER_ID: drawerIdValue,
        DRAWER_NO,
        DRAWER_NM: DRAWER_NM || `Drawer ${DRAWER_NO}`,
        DRAWER_TY_CD,
        VAULT_TYPE,
        SECURITY_LEVEL,
        REQUIRES_DUAL_CONTROL,
        TOTAL_INSURED_AMT: TOTAL_INSURED_AMT || 0,
        MIN_BAL: MIN_BAL || 0,
        MAX_BAL: MAX_BAL || 0,
        CURRENT_BALANCE: 0.00,
        USER_ID: USER_ID || 'SYSTEM',
        BU_ID: BU_ID || 'DEFAULT',
        GL_ACCT_NO: GL_ACCT_NO || '',
        DRAWER_CASH_LIMIT_FG: 'N',
        DRAWER_INSURED_LIMIT_FG: 'N',
        DRAWER_LIMIT_EXCEED_TM: 0,
        WF_STATUS: 'CLOSED',
        REC_ST: REC_ST || 'A',
        VERSION_NO: 1,
        LAST_DRAWER_CLOSE_DT: new Date(),
        LAST_DRAWER_OPEN_DT: null,
        SESSION_START_BALANCE: 0.00,
        SESSION_END_BALANCE: 0.00,
        OVERAGE_AMT: 0.00,
        SHORTAGE_AMT: 0.00,
        FORCE_CLOSED: false,
        FORCE_CLOSE_REASON: null,
        FORCE_CLOSED_BY: null,
        CREATED_BY: USER_ID || 'SYSTEM',
        CREATE_DT: new Date(),
        CURRENT_ASSIGNEE_ID: 0,
        CURRENT_ASSIGNEE_NAME: null,
        CURRENT_ASSIGNEE_ROLE: 'TELLER',
        VAULT_CAPACITY: MAX_BAL || 0,
        BRANCH_CODE: BRANCH_CODE || null,
        OPENING_CURRENCY: null,
        CLOSING_CURRENCY: null
      };

      console.log('📦 Creating drawer with data:', {
        ...newDrawerData,
        // Don't log sensitive data
        GL_ACCT_NO: GL_ACCT_NO ? '***' : null
      });

      const newDrawer = await Drawer.create(newDrawerData, { transaction });
      console.log('✅ Drawer created with ID:', newDrawer.id);

      // Get IP for audit
      const ipAddress = req.ip || req.connection?.remoteAddress || 
                        req.headers['x-forwarded-for'] || 'unknown';

      // Create audit trail
      try {
        // First check if AuditTrail model exists
        let AuditTrail;
        if (sequelize.models && sequelize.models.AuditTrail) {
          AuditTrail = sequelize.models.AuditTrail;
        } else {
          const AuditTrailImport = await import('../models/AuditTrail.js');
          AuditTrail = AuditTrailImport.default;
        }

        if (AuditTrail) {
          await AuditTrail.create({
            event_id: Math.floor(Date.now() / 1000),
            user_id: USER_ID || 'SYSTEM',
            event_type: 'DRAWER_CREATED',
            action: 'Drawer Created',
            old_value: null,
            new_value: JSON.stringify({
              drawer_id: newDrawer.DRAWER_ID,
              drawer_no: newDrawer.DRAWER_NO,
              drawer_name: newDrawer.DRAWER_NM
            }),
            entity_type: 'Drawer',
            entity_id: newDrawer.id,
            description: `Drawer ${DRAWER_NO} created`,
            reference_no: `DRAWER-CREATE-${Date.now()}`,
            additional_info: JSON.stringify({
              drawer_no: DRAWER_NO,
              drawer_name: DRAWER_NM || `Drawer ${DRAWER_NO}`,
              drawer_type: DRAWER_TY_CD,
              business_unit: BU_ID,
              insured_amt: TOTAL_INSURED_AMT,
              min_bal: MIN_BAL,
              max_bal: MAX_BAL
            }),
            ip_address: ipAddress
          }, { transaction });
          console.log('✅ Audit trail created using model');
        } else {
          // Fallback to raw query
          await sequelize.query(
            `INSERT INTO audit_trails (
              event_id, user_id, event_type, action, old_value, new_value,
              entity_type, entity_id, description, reference_no, additional_info,
              ip_address, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            {
              replacements: [
                Math.floor(Date.now() / 1000),
                USER_ID || 'SYSTEM',
                'DRAWER_CREATED',
                'Drawer Created',
                null,
                JSON.stringify({
                  drawer_id: newDrawer.DRAWER_ID,
                  drawer_no: newDrawer.DRAWER_NO,
                  drawer_name: newDrawer.DRAWER_NM
                }),
                'Drawer',
                newDrawer.id,
                `Drawer ${DRAWER_NO} created`,
                `DRAWER-CREATE-${Date.now()}`,
                JSON.stringify({
                  drawer_no: DRAWER_NO,
                  drawer_name: DRAWER_NM || `Drawer ${DRAWER_NO}`,
                  drawer_type: DRAWER_TY_CD,
                  business_unit: BU_ID,
                  insured_amt: TOTAL_INSURED_AMT,
                  min_bal: MIN_BAL,
                  max_bal: MAX_BAL
                }),
                ipAddress,
                new Date(),
                new Date()
              ],
              transaction
            }
          );
          console.log('✅ Audit trail created using raw query');
        }
      } catch (auditError) {
        console.log('⚠️ Audit trail creation failed:', auditError.message);
        // Continue even if audit fails - don't rollback the drawer creation
      }

      await transaction.commit();
      console.log('✅ Transaction committed');
      
      res.status(201).json({
        success: true,
        message: 'Drawer created successfully (status: CLOSED - must be opened before use)',
        drawer: {
          id: newDrawer.id,
          DRAWER_ID: newDrawer.DRAWER_ID,
          DRAWER_NO: newDrawer.DRAWER_NO,
          DRAWER_NM: newDrawer.DRAWER_NM,
          DRAWER_TY_CD: newDrawer.DRAWER_TY_CD,
          USER_ID: newDrawer.USER_ID,
          BU_ID: newDrawer.BU_ID,
          CURRENT_BALANCE: newDrawer.CURRENT_BALANCE,
          MIN_BAL: newDrawer.MIN_BAL,
          MAX_BAL: newDrawer.MAX_BAL,
          WF_STATUS: newDrawer.WF_STATUS,
          REC_ST: newDrawer.REC_ST,
          VERSION_NO: newDrawer.VERSION_NO,
          createdAt: newDrawer.createdAt || newDrawer.CREATE_DT,
          updatedAt: newDrawer.updatedAt || new Date()
        }
      });
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error creating drawer:', error);
      
      if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({ 
          success: false,
          message: 'Validation failed', 
          errors: error.errors.map(e => ({
            field: e.path,
            message: e.message
          }))
        });
      }
      
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(400).json({ 
          success: false,
          message: 'Unique constraint violation',
          error: error.message,
          fields: error.fields
        });
      }
      
      res.status(500).json({ 
        success: false,
        message: 'Error creating Drawer entry', 
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  } catch (error) {
    console.error('❌ Initialization error in createDrawer:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to initialize database connection',
      error: error.message
    });
  }
};

// Enhanced Open Drawer with Robust Previous Closing Denomination Check
// Enhanced Open Drawer with Robust Previous Closing Denomination Check - UPDATED VERSION
export const openDrawer = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params; // id is custom DRAWER_ID like "001"
    const { 
      openingBalance, 
      userId, 
      openingCurrency, 
      verifiedBy, 
      notes,
      forceOpen = false
    } = req.body;

    // Validate required fields
    if (!userId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'User ID is required to open drawer' });
    }

    // Get Drawer model
    const Drawer = await import('../models/Drawer.js').then(module => module.default);

    // Use custom DRAWER_ID for lookup (handle string/number)
    const numericId = parseInt(id, 10);
    const drawer = await Drawer.findOne({ 
      where: { DRAWER_ID: numericId },
      transaction 
    });
    
    if (!drawer) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Drawer not found' });
    }

    // Debug log drawer state
    console.log(`Drawer state for ${id}: WF_STATUS: ${drawer.WF_STATUS}, LAST_DRAWER_CLOSE_DT: ${drawer.LAST_DRAWER_CLOSE_DT}, CLOSING_CURRENCY_DENOMINATION: ${drawer.CLOSING_CURRENCY_DENOMINATION}`);

    // Check if drawer is already open
    if (drawer.WF_STATUS === 'OPEN') {
      await transaction.rollback();
      return res.status(400).json({ 
        message: 'Drawer is already open',
        openedAt: drawer.LAST_DRAWER_OPEN_DT,
        openedBy: drawer.USER_ID
      });
    }

    // ENHANCED CHECK: Handle ALL closing denomination issues with forceOpen
    if (drawer.LAST_DRAWER_CLOSE_DT) {
      if (forceOpen) {
        console.warn(`Force opening drawer ${id}. Handling closing denomination issues.`);
        
        let closingDenom = null;
        
        // Check if there's an existing closing denomination
        if (drawer.CLOSING_CURRENCY_DENOMINATION) {
          closingDenom = await DrawerCurrencyDenomination.findByPk(drawer.CLOSING_CURRENCY_DENOMINATION, { transaction });
          
          // If existing denomination has invalid status, replace it
          if (closingDenom && closingDenom.status !== 'ACTIVE' && closingDenom.status !== 'AUTO_CREATED') {
            console.warn(`Force opening: Replacing invalid closing denomination status: ${closingDenom.status}`);
            
            // Create a new active closing denomination
            const newClosingDenom = await createAutoClosingDenomination(drawer, userId, transaction);
            if (newClosingDenom) {
              drawer.CLOSING_CURRENCY_DENOMINATION = newClosingDenom.id;
              await drawer.save({ transaction });
              console.log(`Replaced invalid denomination with new one: ${newClosingDenom.id}`);
              closingDenom = newClosingDenom;
            }
          }
        } else {
          // No closing denomination exists, create one
          console.warn(`Force opening: No closing denomination found. Creating auto-record.`);
          const autoClosingDenom = await createAutoClosingDenomination(drawer, userId, transaction);
          if (autoClosingDenom) {
            drawer.CLOSING_CURRENCY_DENOMINATION = autoClosingDenom.id;
            await drawer.save({ transaction });
            console.log(`Auto-created and linked closing denomination: ${autoClosingDenom.id}`);
            closingDenom = autoClosingDenom;
          }
        }
        
        // If we still don't have a valid closing denomination, proceed without it
        if (!closingDenom || (closingDenom.status !== 'ACTIVE' && closingDenom.status !== 'AUTO_CREATED')) {
          console.warn(`Force opening: Proceeding without valid closing denomination due to forceOpen=true`);
          // Clear the invalid reference and proceed
          drawer.CLOSING_CURRENCY_DENOMINATION = null;
          await drawer.save({ transaction });
        }
        
      } else {
        // Standard validation (no forceOpen)
        if (!drawer.CLOSING_CURRENCY_DENOMINATION) {
          console.log(`Error: LAST_DRAWER_CLOSE_DT exists but no CLOSING_CURRENCY_DENOMINATION for drawer ${id}`);
          await transaction.rollback();
          return res.status(400).json({ 
            message: 'Previous closing currency denomination must be recorded before opening the drawer. Please record the closing count first or use forceOpen=true to override.',
            requiresClosingDenomination: true,
            drawerId: drawer.DRAWER_ID
          });
        } else {
          // Check if existing denomination is valid
          const closingDenom = await DrawerCurrencyDenomination.findByPk(drawer.CLOSING_CURRENCY_DENOMINATION, { transaction });
          if (!closingDenom || (closingDenom.status !== 'ACTIVE' && closingDenom.status !== 'AUTO_CREATED')) {
            console.log(`Error: Invalid closing denom status for drawer ${id}: ${closingDenom ? closingDenom.status : 'null'}`);
            await transaction.rollback();
            return res.status(400).json({ 
              message: 'Invalid previous closing currency denomination status. Please record a new closing count or use forceOpen=true to override.' 
            });
          }
        }
      }
    }

    // If we're here with forceOpen, we've either fixed the issue or decided to proceed
    // For non-forceOpen, the validations above would have caught any issues

    let finalOpeningBalance;
    
    // If openingCurrency is provided, calculate balance from currency
    if (openingCurrency) {
      finalOpeningBalance = calculateTotalFromDenominations(openingCurrency);
    } else if (openingBalance !== undefined && openingBalance !== null) {
      // Use provided opening balance
      finalOpeningBalance = parseFloat(openingBalance);
    } else {
      await transaction.rollback();
      return res.status(400).json({ 
        message: 'Either openingBalance or openingCurrency is required' 
      });
    }

    // Validate opening balance
    if (isNaN(finalOpeningBalance) || finalOpeningBalance < 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Opening balance must be a positive number' });
    }

    // Check against drawer limits
    const maxBalance = parseFloat(drawer.MAX_BAL?.toString() || '0');
    if (finalOpeningBalance > maxBalance) {
      await transaction.rollback();
      return res.status(400).json({ 
        message: `Opening balance ${finalOpeningBalance} exceeds maximum limit of ${maxBalance}`,
        maxBalance: maxBalance
      });
    }

    // Store previous state for audit
    const previousStatus = drawer.WF_STATUS;
    const previousBalance = parseFloat(drawer.CURRENT_BALANCE?.toString() || '0');

    // Reset drawer for new session
    drawer.CURRENT_BALANCE = parseFloat(finalOpeningBalance.toFixed(2));
    drawer.WF_STATUS = 'OPEN';
    drawer.USER_ID = userId;
    drawer.LAST_DRAWER_OPEN_DT = new Date();
    drawer.OVERAGE_AMT = 0.00;
    drawer.SHORTAGE_AMT = 0.00;
    drawer.DRAWER_CASH_LIMIT_FG = 'N';
    drawer.DRAWER_LIMIT_EXCEED_TM = 0;
    drawer.VERSION_NO = (drawer.VERSION_NO || 0) + 1;
    drawer.SESSION_START_BALANCE = parseFloat(finalOpeningBalance.toFixed(2));
    
    // Store opening currency details if provided
    if (openingCurrency) {
      drawer.OPENING_CURRENCY = JSON.stringify(openingCurrency);
    }

    await drawer.save({ transaction });

    // Get IP address for audit trail
    const ipAddress = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';

    // Determine event type based on input method and force open
    let eventType = openingCurrency ? 'DRAWER_OPENED_WITH_CURRENCY' : 'DRAWER_OPENED';
    if (forceOpen) {
      eventType = 'DRAWER_OPENED_FORCED';
    }

    // ✅ UPDATED: Use drawerAuditHelper instead of AuditTrail.create()
    try {
      // Use the helper function you already imported
      await drawerAuditHelper.drawerOpened(
        userId,
        drawer.id, // entity_id
        drawer.DRAWER_NO, // drawer_no
        openingCurrency || {}, // currency breakdown
        ipAddress, // ip address
        {
          openingBalance: finalOpeningBalance,
          verifiedBy: verifiedBy,
          forceOpened: forceOpen
        }
      );
      
      console.log('✅ Audit trail created using drawerAuditHelper');
    } catch (auditError) {
      console.warn('⚠️ Audit trail creation failed, but continuing:', auditError.message);
      // Don't fail the entire operation if audit trail fails
    }

    await transaction.commit();

    // Log drawer opening
    console.log(`✅ Drawer ${drawer.DRAWER_NO} (ID: ${drawer.DRAWER_ID}) opened by user ${userId} with balance ${finalOpeningBalance}`);

    const response = {
      message: 'Drawer opened successfully',
      drawer: {
        id: drawer.id,
        DRAWER_ID: drawer.DRAWER_ID,
        drawerNo: drawer.DRAWER_NO,
        drawerName: drawer.DRAWER_NM,
        openingBalance: finalOpeningBalance,
        openedAt: drawer.LAST_DRAWER_OPEN_DT,
        userId: drawer.USER_ID,
        status: drawer.WF_STATUS,
        limits: {
          min: parseFloat(drawer.MIN_BAL?.toString() || '0'),
          max: maxBalance
        },
        sessionStartBalance: finalOpeningBalance
      }
    };

    // Add currency info if used
    if (openingCurrency) {
      response.calculatedFromCurrency = true;
      response.currencyBreakdown = openingCurrency;
    }

    // Add force open info if used
    if (forceOpen) {
      response.forceOpened = true;
      response.warning = 'Drawer was opened with forceOpen due to previous closing denomination issues';
    }

    res.status(200).json(response);
  } catch (error) {
    await transaction.rollback();
    console.error('Error opening drawer:', error);
    res.status(500).json({ 
      message: 'Error opening drawer', 
      error: error.message 
    });
  }
};


// Enhanced Close Drawer with Mandatory Currency Denomination Check
export const closeDrawer = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { notes, verifiedBy, countedBy, closingCurrency } = req.body;

    if (!verifiedBy) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Verified by field is required' });
    }

    // Get Drawer model using helper function
    const Drawer = await getDrawerModel();

    const numericId = parseInt(id, 10);
    const drawer = await Drawer.findOne({ 
      where: { DRAWER_ID: numericId },
      transaction 
    });
    
    if (!drawer) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Drawer not found' });
    }

    if (drawer.WF_STATUS === 'CLOSED') {
      await transaction.rollback();
      return res.status(400).json({ 
        message: 'Drawer is already closed',
        closedAt: drawer.LAST_DRAWER_CLOSE_DT
      });
    }

    console.log(`Closing drawer ${id} with currency:`, closingCurrency);

    // Calculate closing balance directly from currency
    let finalClosingBalance;
    if (closingCurrency) {
      finalClosingBalance = calculateTotalFromDenominations(closingCurrency);
      console.log(`Calculated closing balance: ${finalClosingBalance}`);
      
      // Update drawer's CLOSING_CURRENCY field
      drawer.CLOSING_CURRENCY = JSON.stringify({
        OneThousandNaira: closingCurrency.OneThousandNaira || 0,
        FiveHundredNaira: closingCurrency.FiveHundredNaira || 0,
        TwoHundredNaira: closingCurrency.TwoHundredNaira || 0,
        OneHundredNaira: closingCurrency.OneHundredNaira || 0,
        FiftyNaira: closingCurrency.FiftyNaira || 0,
        TwentyNaira: closingCurrency.TwentyNaira || 0,
        TenNaira: closingCurrency.TenNaira || 0,
        FiveNaira: closingCurrency.FiveNaira || 0,
        TOTAL_CURRENCY_COUNT: Object.values(closingCurrency).reduce((sum, count) => sum + (count || 0), 0)
      });
    } else {
      await transaction.rollback();
      return res.status(400).json({ 
        message: 'Closing currency must be provided to close the drawer.',
        requiresClosingCurrency: true,
        drawerId: drawer.DRAWER_ID
      });
    }

    // Calculate overage/shortage
    const expectedBalance = parseFloat(drawer.CURRENT_BALANCE?.toString() || '0');
    const actualBalance = finalClosingBalance;
    const difference = actualBalance - expectedBalance;
    const overageAmt = Math.max(0, difference);
    const shortageAmt = Math.max(0, -difference);

    console.log(`Balance check - Expected: ${expectedBalance}, Actual: ${actualBalance}, Difference: ${difference}`);

    // Store previous state for audit
    const previousStatus = drawer.WF_STATUS;
    const previousBalance = parseFloat(drawer.CURRENT_BALANCE?.toString() || '0');

    // Update drawer
    drawer.CURRENT_BALANCE = parseFloat(actualBalance.toFixed(2));
    drawer.OVERAGE_AMT = parseFloat(overageAmt.toFixed(2));
    drawer.SHORTAGE_AMT = parseFloat(shortageAmt.toFixed(2));
    drawer.WF_STATUS = 'CLOSED';
    drawer.LAST_DRAWER_CLOSE_DT = new Date();
    drawer.VERSION_NO = (drawer.VERSION_NO || 0) + 1;
    drawer.SESSION_END_BALANCE = parseFloat(actualBalance.toFixed(2));
    
    if (notes) drawer.CLOSING_NOTES = notes;
    if (verifiedBy) drawer.CLOSING_VERIFIED_BY = verifiedBy;

    await drawer.save({ transaction });

    // Calculate session statistics
    const sessionStartBalance = parseFloat(drawer.SESSION_START_BALANCE?.toString() || '0');
    const totalDeposits = Math.max(0, actualBalance - sessionStartBalance + shortageAmt - overageAmt);
    const totalWithdrawals = Math.max(0, sessionStartBalance - expectedBalance);

    // Get IP for audit
    const ipAddress = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';

    // ✅ UPDATED: Use drawerAuditHelper instead of AuditTrail.create()
    try {
      // Calculate session duration
      const sessionDuration = calculateSessionDuration(drawer.LAST_DRAWER_OPEN_DT, drawer.LAST_DRAWER_CLOSE_DT);
      
      // Use the helper function for audit trail
      await drawerAuditHelper.drawerClosed(
        drawer.USER_ID,
        drawer.id, // entity_id
        drawer.DRAWER_NO, // drawer_no
        closingCurrency, // currency breakdown
        ipAddress, // ip address
        {
          expectedBalance: expectedBalance,
          actualBalance: actualBalance,
          overage: overageAmt,
          shortage: shortageAmt,
          difference: difference,
          verifiedBy: verifiedBy,
          countedBy: countedBy,
          notes: notes,
          sessionStartBalance: sessionStartBalance,
          sessionEndBalance: actualBalance,
          totalDeposits: totalDeposits,
          totalWithdrawals: totalWithdrawals,
          sessionDuration: sessionDuration,
          drawerCustomId: drawer.DRAWER_ID
        }
      );
      
      console.log('✅ Audit trail created using drawerAuditHelper for drawer close');
    } catch (auditError) {
      console.warn('⚠️ Audit trail creation failed for drawer close, but continuing:', auditError.message);
      // Don't fail the entire operation if audit trail fails
    }

    await transaction.commit();
    console.log(`✅ Drawer closed successfully`);

    const response = {
      message: 'Drawer closed successfully',
      closeoutReport: {
        drawerInfo: {
          drawerNo: drawer.DRAWER_NO,
          drawerName: drawer.DRAWER_NM,
          userId: drawer.USER_ID,
          sessionStart: drawer.LAST_DRAWER_OPEN_DT,
          sessionEnd: drawer.LAST_DRAWER_CLOSE_DT,
          sessionDuration: calculateSessionDuration(drawer.LAST_DRAWER_OPEN_DT, drawer.LAST_DRAWER_CLOSE_DT)
        },
        balances: {
          sessionStartBalance: sessionStartBalance,
          expectedBalance: expectedBalance,
          actualBalance: actualBalance,
          difference: difference
        },
        settlement: {
          overage: overageAmt,
          shortage: shortageAmt,
          verifiedBy: verifiedBy,
          countedBy: countedBy
        },
        currency: {
          breakdown: closingCurrency,
          totalAmount: actualBalance
        },
        transactionSummary: {
          totalDeposits: totalDeposits,
          totalWithdrawals: totalWithdrawals,
          netMovement: totalDeposits - totalWithdrawals
        },
        notes: notes
      },
      drawer: {
        id: drawer.id,
        DRAWER_ID: drawer.DRAWER_ID,
        drawerNo: drawer.DRAWER_NO,
        status: drawer.WF_STATUS,
        userId: drawer.USER_ID
      }
    };

    res.status(200).json(response);

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error closing drawer:', error);
    res.status(500).json({ 
      message: 'Error closing drawer', 
      error: error.message 
    });
  }
};

// Find this function in your DrawerController.js and add "export" before it:
export const getAllDrawers = async (req, res) => {
  try {
    const Drawer = (await import('../models/Drawer.js')).default;
    
    const { status, userId, businessUnit } = req.query;
    let where = {};
    
    if (status) where.WF_STATUS = status;
    if (userId) where.USER_ID = userId;
    if (businessUnit) where.BU_ID = businessUnit;
    
    const drawers = await Drawer.findAll({
      where,
      order: [['CREATE_DT', 'DESC']]
    });
    
    // Add summary information
    const openDrawers = drawers.filter(d => d.WF_STATUS === 'OPEN').length;
    const closedDrawers = drawers.filter(d => d.WF_STATUS === 'CLOSED').length;
    
    res.status(200).json({
      success: true,
      count: drawers.length,
      summary: {
        open: openDrawers,
        closed: closedDrawers,
        total: drawers.length
      },
      drawers
    });
  } catch (error) {
    console.error('Error retrieving drawers:', error);
    res.status(500).json({ 
      message: 'Error retrieving Drawer entries', 
      error: error.message 
    });
  }
};
// Example: Find the getDrawerById function and add "export" before it
export const getDrawerById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Import sequelize
    const dbModule = await import('../../config/db.js');
    const sequelize = dbModule.default || dbModule;
    const { Drawer } = sequelize.models;
    
    // Try DRAWER_NO first (for "1002")
    let drawer = await Drawer.findOne({ where: { DRAWER_NO: id } });
    
    // If not found and id is numeric, try DRAWER_ID (for "2")
    if (!drawer && /^\d+$/.test(id)) {
      drawer = await Drawer.findOne({ where: { DRAWER_ID: parseInt(id) } });
    }
    
    if (!drawer) {
      return res.status(404).json({
        success: false,
        message: `Drawer not found: ${id}`,
        hint: 'Try using DRAWER_NO (e.g., "1002") or DRAWER_ID (e.g., "2")'
      });
    }
    
    res.json({
      success: true,
      data: drawer
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// // Helper function to create auto-closing denomination for historical data
// async function createAutoClosingDenomination(drawer, userId, transaction) {
//   try {
//     const closingDenomData = {
//       drawerCrncyId: Math.floor(Date.now() / 1000),
//       drawerId: drawer.id,
//       drawerCrncyDenomId: `DCD-AUTO-${Date.now()}`,
//       denominationType: 'CLOSING',
//       currencyCount: JSON.stringify({
//         '1000': 0,
//         '500': 0,
//         '200': 0,
//         '100': 0,
//         '50': 0,
//         '20': 0,
//         '10': 0,
//         '5': 0
//       }),
//       totalAmount: 0,
//       recordedBy: userId,
//       verifiedBy: userId,
//       notes: 'Auto-created for drawer with missing or invalid closing denomination',
//       recordDate: drawer.LAST_DRAWER_CLOSE_DT || new Date(),
//       status: 'AUTO_CREATED',
//       createdBy: userId,
//       createDt: new Date(),
//       userId: userId,
//       rowTs: new Date(),
//       versionNo: 1,
//       recSt: 'A'
//     };
    
//     const savedDenom = await DrawerCurrencyDenomination.create(closingDenomData, { transaction });
//     console.log(`Auto-closing denomination created: ${savedDenom.id}`);
//     return savedDenom;
//   } catch (error) {
//     console.error('Error creating auto-closing denomination:', error);
//     return null;
//   }
// }


// Update Drawer Currency (for mid-day adjustments)
export const updateDrawerCurrency = async (req, res, db) => {
  const session = await db.startTransaction();
  
  try {
    const { id } = req.params;
    const { 
      currencyUpdate, 
      reason, 
      userId 
    } = req.body;

    if (!currencyUpdate || !reason || !userId) {
      await session.rollback();
      return res.status(400).json({ 
        message: 'Currency update data, reason, and user ID are required' 
      });
    }

    // Find drawer using database-specific query
    const drawer = await db.queryOne(
      'SELECT * FROM drawers WHERE id = ? FOR UPDATE',
      [id],
      { session }
    );
    
    if (!drawer) {
      await session.rollback();
      return res.status(400).json({ message: 'Drawer not found' });
    }

    if (drawer.WF_STATUS !== 'OPEN') {
      await session.rollback();
      return res.status(400).json({ 
        message: 'Drawer must be open to update currency' 
      });
    }

    const previousBalance = parseFloat(drawer.CURRENT_BALANCE);
    const newBalance = calculateTotalFromDenominations(currencyUpdate);
    
    // Update drawer balance
    await db.execute(
      'UPDATE drawers SET CURRENT_BALANCE = ?, VERSION_NO = VERSION_NO + 1 WHERE id = ?',
      [newBalance.toFixed(2), id],
      { session }
    );

    // Get updated drawer info
    const updatedDrawer = await db.queryOne(
      'SELECT * FROM drawers WHERE id = ?',
      [id],
      { session }
    );

    // Audit trail for currency adjustment
    await db.execute(`
      INSERT INTO audit_trails (
        event_id, user_id, event_type, action, old_value, new_value,
        entity_type, entity_id, description, reference_no, additional_info
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      Date.now(),
      userId,
      'DRAWER_CURRENCY_ADJUSTMENT',
      'Drawer Currency Adjustment',
      JSON.stringify({ balance: previousBalance }),
      JSON.stringify({ balance: newBalance }),
      'Drawer',
      drawer.id,
      `Drawer currency adjusted: ${reason}`,
      `DRAWER-ADJUST-${Date.now()}`,
      JSON.stringify({
        drawer_no: drawer.DRAWER_NO,
        previous_balance: previousBalance,
        new_balance: newBalance,
        adjustment_amount: newBalance - previousBalance,
        currency_update: currencyUpdate,
        reason: reason
      })
    ], { session });

    await session.commit();

    res.status(200).json({
      message: 'Drawer currency updated successfully',
      adjustment: {
        previousBalance: previousBalance,
        newBalance: newBalance,
        difference: newBalance - previousBalance,
        reason: reason
      },
      drawer: {
        id: updatedDrawer.id,
        drawerNo: updatedDrawer.DRAWER_NO,
        currentBalance: newBalance
      }
    });
  } catch (error) {
    await session.rollback();
    console.error('Error updating drawer currency:', error);
    res.status(500).json({ 
      message: 'Error updating drawer currency', 
      error: error.message 
    });
  } finally {
    session.release();
  }
};

export const getDrawerCloseoutReport = async (req, res) => {
  console.log('🎯 getDrawerCloseoutReport EXECUTING!');
  
  try {
    const { id } = req.params;
    
    // OPTION 1: Use sequelize from request (if middleware provides it)
    let sequelize = req.sequelize;
    let Drawer;
    
    if (sequelize) {
      console.log('📦 Using sequelize from request');
      Drawer = sequelize.models.Drawer;
    } else {
      // OPTION 2: Import directly (fallback)
      console.log('📦 Importing sequelize directly');
      const dbModule = await import('../../config/db.js');
      sequelize = dbModule.default || dbModule;
      Drawer = sequelize.models.Drawer;
    }
    
    if (!Drawer) {
      console.error('❌ Drawer model not found');
      return res.status(500).json({
        success: false,
        message: 'Database configuration error'
      });
    }
    
    console.log('🔍 Looking for drawer:', id);
    
    // Try DRAWER_NO first
    let drawer = await Drawer.findOne({ where: { DRAWER_NO: id } });
    
    // If not found, try DRAWER_ID if numeric
    if (!drawer && /^\d+$/.test(id)) {
      console.log('🔄 Trying DRAWER_ID lookup');
      drawer = await Drawer.findOne({ where: { DRAWER_ID: parseInt(id) } });
    }
    
    if (!drawer) {
      console.log('❌ Drawer not found');
      return res.status(404).json({ 
        success: false,
        message: `Drawer ${id} not found`
      });
    }
    
    console.log('✅ Found drawer:', drawer.DRAWER_NO);
    
    // Check if drawer is CLOSED
    if (drawer.WF_STATUS !== 'CLOSED') {
      return res.status(400).json({
        success: false,
        message: `Drawer status is ${drawer.WF_STATUS}. Must be CLOSED for closeout report.`
      });
    }
    
    // Generate report
    const report = {
      success: true,
      drawerInfo: {
        drawerNo: drawer.DRAWER_NO,
        drawerName: drawer.DRAWER_NM,
        status: drawer.WF_STATUS,
        userId: drawer.USER_ID,
        businessUnit: drawer.BU_ID
      },
      timestamp: new Date().toISOString()
    };
    
    res.json(report);
    
  } catch (error) {
    console.error('💥 ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get Drawer Opening Report
export const getDrawerOpeningReport = async (req, res) => {
  try {
    const { id } = req.params;
    const drawer = await Drawer.findById(id);

    if (!drawer) {
      return res.status(404).json({ message: 'Drawer not found' });
    }

    const openingReport = {
      drawerInfo: {
        drawerNo: drawer.DRAWER_NO,
        drawerName: drawer.DRAWER_NM,
        userId: drawer.USER_ID,
        businessUnit: drawer.BU_ID,
        drawerType: drawer.DRAWER_TY_CD,
        status: drawer.WF_STATUS
      },
      openingDetails: {
        lastOpened: drawer.LAST_DRAWER_OPEN_DT,
        lastClosed: drawer.LAST_DRAWER_CLOSE_DT,
        currentBalance: parseFloat(drawer.CURRENT_BALANCE.toString()),
        sessionStartBalance: parseFloat(drawer.SESSION_START_BALANCE?.toString() || '0')
      },
      limits: {
        minBalance: parseFloat(drawer.MIN_BAL.toString()),
        maxBalance: parseFloat(drawer.MAX_BAL.toString()),
        insuredAmount: parseFloat(drawer.TOTAL_INSURED_AMT.toString())
      },
      currency: {
        openingCurrency: drawer.OPENING_CURRENCY
      }
    };

    res.status(200).json({
      success: true,
      openingReport
    });
  } catch (error) {
    console.error('Error generating opening report:', error);
    res.status(500).json({ 
      message: 'Error generating opening report', 
      error: error.message 
    });
  }
};


// Helper function to find drawer by multiple identifiers
const findDrawerByIdentifier = async (identifier, session = null) => {
  let drawer;
  
  // Check if identifier is a valid MongoDB ObjectId
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    drawer = await Drawer.findById(identifier).session(session);
    if (drawer) return drawer;
  }
  
  // Try as DRAWER_NO (string)
  drawer = await Drawer.findOne({ DRAWER_NO: identifier.toString() }).session(session);
  if (drawer) return drawer;
  
  // Try as DRAWER_ID (numeric)
  const numericId = parseInt(identifier);
  if (!isNaN(numericId)) {
    drawer = await Drawer.findOne({ DRAWER_ID: numericId }).session(session);
    if (drawer) return drawer;
  }
  
  return null;
};

// Updated processDrawerTransaction - uses shared service
export const processDrawerTransaction = async (req, res, db, session = null) => {
  let internalSession = session;
  let shouldEndSession = false;
  
  try {
    // Import sequelize and drawer service
    const dbModule = await import('../../config/db.js');
    const sequelize = dbModule.default || dbModule;
    const drawerService = new (await import('../Services/drawerService.js')).DrawerService(sequelize);
    
    // If no session provided, create one
    if (!internalSession) {
      internalSession = await sequelize.transaction();
      shouldEndSession = true;
    }

    const { 
      drawerId, 
      transactionType, 
      amount, 
      customerAccount, 
      referenceNo, 
      description,
      userId 
    } = req.body;

    // Validate required fields
    if (!drawerId || !transactionType || !amount || amount <= 0) {
      if (shouldEndSession) await internalSession.rollback();
      return { 
        success: false,
        message: 'Missing required fields: drawerId, transactionType, amount' 
      };
    }

    // ✅ Use shared drawer service
    const drawer = await drawerService.findDrawerByIdentifier(drawerId, internalSession);
    if (!drawer) {
      if (shouldEndSession) await internalSession.rollback();
      return { 
        success: false,
        message: 'Drawer not found' 
      };
    }

    // ✅ Use shared validation
    const validation = await drawerService.validateDrawerForTransaction(
      drawer, 
      amount, 
      transactionType
    );

    if (!validation.valid) {
      if (shouldEndSession) await internalSession.rollback();
      return { 
        success: false,
        ...validation 
      };
    }

    // ✅ Use shared balance update
    await drawerService.updateDrawerBalance(
      drawer.id, 
      validation.newBalance, 
      internalSession
    );

    // Create transaction record
    const transactionRecord = {
      referenceNo: referenceNo || `TXN${Date.now()}`,
      drawerId: drawer.id,
      drawerNo: drawer.DRAWER_NO,
      transactionType: transactionType.toUpperCase(),
      amount,
      customerAccount,
      description: description || `Drawer transaction: ${transactionType}`,
      effect: ['WITHDRAWAL', 'DEBIT', 'CASH_DISBURSEMENT'].includes(transactionType.toUpperCase()) ? 'DEBIT' : 'CREDIT',
      previousBalance: validation.currentBalance,
      newBalance: validation.newBalance,
      timestamp: new Date(),
      userId: userId || 'system',
      status: 'COMPLETED',
      drawerStatus: 'OPEN'
    };

    // Save to transactions table
    await sequelize.query(
      `INSERT INTO transactions (
        reference_no, drawer_id, drawer_no, transaction_type, amount,
        customer_account, description, effect, previous_balance,
        new_balance, user_id, status, drawer_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      {
        replacements: [
          transactionRecord.referenceNo,
          transactionRecord.drawerId,
          transactionRecord.drawerNo,
          transactionRecord.transactionType,
          transactionRecord.amount,
          transactionRecord.customerAccount,
          transactionRecord.description,
          transactionRecord.effect,
          transactionRecord.previousBalance,
          transactionRecord.newBalance,
          transactionRecord.userId,
          transactionRecord.status,
          transactionRecord.drawerStatus
        ],
        transaction: internalSession
      }
    );

    if (shouldEndSession) {
      await internalSession.commit();
    }

    return {
      success: true,
      message: 'Drawer transaction processed successfully',
      transaction: transactionRecord,
      drawer: {
        id: drawer.id,
        drawerNo: drawer.DRAWER_NO,
        previousBalance: validation.currentBalance,
        newBalance: validation.newBalance,
        transactionEffect: transactionRecord.effect,
        limitExceeded: validation.limitExceeded,
        status: drawer.WF_STATUS
      }
    };

  } catch (error) {
    if (shouldEndSession && internalSession) {
      await internalSession.rollback();
    }
    console.error('Drawer transaction error:', error);
    return { 
      success: false,
      message: 'Error processing drawer transaction', 
      error: error.message 
    };
  }
};

// Get currently open drawers for a user
export const getMyOpenDrawers = async (req, res, db) => {
  try {
    const { userId } = req.params;
    
    const openDrawers = await db.query(
      `SELECT * FROM drawers 
       WHERE USER_ID = ? AND WF_STATUS = 'OPEN'
       ORDER BY LAST_DRAWER_OPEN_DT DESC`,
      [userId]
    );
    
    res.status(200).json({
      success: true,
      count: openDrawers.length,
      drawers: openDrawers
    });
  } catch (error) {
    console.error('Error retrieving user open drawers:', error);
    res.status(500).json({ 
      message: 'Error retrieving open drawers', 
      error: error.message 
    });
  }
};
// Force close all drawers at end of day (admin function)
// Force close all drawers at end of day (admin function)
export const forceCloseAllDrawers = async (req, res, db) => {
  const session = await db.startTransaction();
  
  try {
    const { closedBy, reason } = req.body;
    
    // Get all open drawers with FOR UPDATE lock
    const openDrawers = await db.query(
      `SELECT * FROM drawers 
       WHERE WF_STATUS = 'OPEN'
       FOR UPDATE`,
      [],
      { session }
    );
    
    if (openDrawers.length === 0) {
      await session.rollback();
      return res.status(200).json({ 
        message: 'No open drawers found' 
      });
    }

    const closeResults = [];
    
    for (const drawer of openDrawers) {
      // Store previous state for audit
      const previousBalance = parseFloat(drawer.CURRENT_BALANCE);
      const now = new Date();
      
      // Force close each drawer with current balance as closing balance
      await db.execute(
        `UPDATE drawers SET
           WF_STATUS = 'CLOSED',
           LAST_DRAWER_CLOSE_DT = ?,
           VERSION_NO = VERSION_NO + 1,
           FORCE_CLOSED = true,
           FORCE_CLOSE_REASON = ?,
           FORCE_CLOSED_BY = ?,
           SESSION_END_BALANCE = CURRENT_BALANCE,
           updated_at = ?
         WHERE id = ?`,
        [
          now,
          reason || 'End of day force close',
          closedBy,
          now,
          drawer.id
        ],
        { session }
      );

      // Get the updated drawer
      const updatedDrawer = await db.queryOne(
        'SELECT * FROM drawers WHERE id = ?',
        [drawer.id],
        { session }
      );

      // Audit trail for force close
      await db.execute(
        `INSERT INTO audit_trails (
          event_id, user_id, event_type, action, old_value, new_value,
          entity_type, entity_id, description, reference_no, additional_info
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Date.now(),
          closedBy,
          'DRAWER_FORCE_CLOSED',
          'Drawer Force Closeout',
          JSON.stringify({
            status: 'OPEN',
            balance: previousBalance
          }),
          JSON.stringify({
            status: 'CLOSED',
            balance: previousBalance
          }),
          'Drawer',
          drawer.id,
          `Drawer ${drawer.DRAWER_NO} force closed by ${closedBy}`,
          `DRAWER-FORCE-CLOSE-${Date.now()}`,
          JSON.stringify({
            drawer_no: drawer.DRAWER_NO,
            reason: reason,
            closed_by: closedBy,
            final_balance: previousBalance
          })
        ],
        { session }
      );
      
      closeResults.push({
        drawerNo: drawer.DRAWER_NO,
        userId: drawer.USER_ID,
        finalBalance: previousBalance,
        closedAt: updatedDrawer.LAST_DRAWER_CLOSE_DT
      });
    }

    await session.commit();
    
    // Log the force close action
    console.warn(`Force closed ${closeResults.length} drawers at end of day by ${closedBy}`);

    res.status(200).json({
      message: `Successfully force closed ${closeResults.length} drawers`,
      closedDrawers: closeResults,
      timestamp: new Date()
    });
  } catch (error) {
    await session.rollback();
    console.error('Error force closing drawers:', error);
    res.status(500).json({ 
      message: 'Error force closing drawers', 
      error: error.message 
    });
  } finally {
    session.release();
  }
};

// Get drawer balance with enhanced status check
// Get drawer balance with enhanced status check
// Get drawer balance with enhanced status check
export const getDrawerBalance = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Try to find by DRAWER_ID (string or number) or DRAWER_NO (string)
    let drawer;
    
    // First try as DRAWER_ID (handle as string to match DB storage)
    drawer = await Drawer.findOne({ DRAWER_ID: id });
    
    // If not found, try as DRAWER_NO
    if (!drawer) {
      drawer = await Drawer.findOne({ DRAWER_NO: id });
    }

    if (!drawer) {
      return res.status(404).json({ message: 'Drawer not found' });
    }

    const availableBalance = Math.max(0, parseFloat(drawer.CURRENT_BALANCE.toString()) - parseFloat(drawer.MIN_BAL.toString()));
    const isOverLimit = parseFloat(drawer.CURRENT_BALANCE.toString()) > parseFloat(drawer.MAX_BAL.toString());
    const isUnderLimit = parseFloat(drawer.CURRENT_BALANCE.toString()) < parseFloat(drawer.MIN_BAL.toString());

    res.status(200).json({
      success: true,
      drawer: {
        drawerNo: drawer.DRAWER_NO,
        drawerName: drawer.DRAWER_NM,
        currentBalance: parseFloat(drawer.CURRENT_BALANCE.toString()),
        minBalance: parseFloat(drawer.MIN_BAL.toString()),
        maxBalance: parseFloat(drawer.MAX_BAL.toString()),
        availableBalance,
        status: drawer.WF_STATUS,
        userId: drawer.USER_ID,
        overage: parseFloat(drawer.OVERAGE_AMT.toString()),
        shortage: parseFloat(drawer.SHORTAGE_AMT.toString()),
        limitFlag: drawer.DRAWER_CASH_LIMIT_FG,
        lastOpened: drawer.LAST_DRAWER_OPEN_DT,
        lastClosed: drawer.LAST_DRAWER_CLOSE_DT,
        isOverLimit,
        isUnderLimit,
        canProcessTransactions: drawer.WF_STATUS === 'OPEN' && drawer.REC_ST === 'A'
      }
    });
  } catch (error) {
    console.error('Error retrieving drawer balance:', error);
    res.status(500).json({ 
      message: 'Error retrieving drawer balance', 
      error: error.message 
    });
  }
};

export const updateDrawer = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    
    // Prevent updating critical fields if drawer is open
    const drawer = await Drawer.findById(id);
    if (drawer && drawer.WF_STATUS === 'OPEN') {
      // Don't allow changing user or critical limits during open session
      delete updateData.USER_ID;
      delete updateData.MIN_BAL;
      delete updateData.MAX_BAL;
      delete updateData.TOTAL_INSURED_AMT;
    }
    
    // Increment version number on update
    updateData.VERSION_NO = (drawer?.VERSION_NO || 0) + 1;
    
    const updatedDrawer = await Drawer.findByIdAndUpdate(
      id, 
      updateData, 
      { 
        new: true,
        runValidators: true 
      }
    );

    if (!updatedDrawer) {
      return res.status(404).json({ message: 'Drawer entry not found' });
    }

    res.status(200).json({
      message: 'Drawer updated successfully',
      drawer: updatedDrawer
    });
  } catch (error) {
    console.error('Error updating drawer:', error);
    res.status(500).json({ 
      message: 'Error updating Drawer entry', 
      error: error.message 
    });
  }
};

export const deleteDrawer = async (req, res) => {
  try {
    const { id } = req.params;
    const drawer = await Drawer.findById(id);
    
    if (!drawer) {
      return res.status(404).json({ message: 'Drawer entry not found' });
    }
    
    // Prevent deletion of open drawers
    if (drawer.WF_STATUS === 'OPEN') {
      return res.status(400).json({ 
        message: 'Cannot delete open drawer. Close it first.' 
      });
    }
    
    // Prevent deletion of drawers with balance
    if (parseFloat(drawer.CURRENT_BALANCE.toString()) > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete drawer with positive balance' 
      });
    }

    const deletedDrawer = await Drawer.findByIdAndDelete(id);

    res.status(200).json({ 
      message: 'Drawer entry deleted successfully',
      drawer: deletedDrawer
    });
  } catch (error) {
    console.error('Error deleting drawer:', error);
    res.status(500).json({ 
      message: 'Error deleting Drawer entry', 
      error: error.message 
    });
  }
};

// Get Drawer Transaction History - All transactions that impacted the drawer
// Get Drawer Transaction History - All transactions that impacted the drawer
export const getDrawerTransactionHistory = async (req, res, db) => {
  try {
    const { id } = req.params;
    const { 
      startDate, 
      endDate, 
      eventType, 
      page = 1, 
      limit = 50 
    } = req.query;

    // Try to find drawer by DRAWER_ID or DRAWER_NO
    let drawer;
    const drawerIdNum = parseInt(id);
    
    if (!isNaN(drawerIdNum)) {
      drawer = await db.queryOne(
        'SELECT * FROM drawers WHERE DRAWER_ID = ?',
        [drawerIdNum]
      );
    } else {
      drawer = await db.queryOne(
        'SELECT * FROM drawers WHERE DRAWER_NO = ?',
        [id]
      );
    }

    if (!drawer) {
      return res.status(404).json({ message: 'Drawer not found' });
    }

    // Build filter for audit trail
    let query = `
      SELECT * FROM audit_trails 
      WHERE entity_type = 'Drawer' 
      AND entity_id = ?
    `;
    const params = [drawer.id];

    // Add date range filter if provided
    if (startDate || endDate) {
      if (startDate && endDate) {
        query += ' AND created_at BETWEEN ? AND ?';
        params.push(new Date(startDate), new Date(endDate));
      } else if (startDate) {
        query += ' AND created_at >= ?';
        params.push(new Date(startDate));
      } else if (endDate) {
        query += ' AND created_at <= ?';
        params.push(new Date(endDate));
      }
    }

    // Add event type filter if provided
    if (eventType) {
      query += ' AND event_type = ?';
      params.push(eventType);
    }

    // Calculate pagination
    const offset = (page - 1) * limit;
    
    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const countResult = await db.queryOne(countQuery, params);
    const totalCount = parseInt(countResult.total);

    // Add ordering and pagination
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    // Get audit trails for this drawer
    const auditTrails = await db.query(query, params);

    // Process audit trails to extract transaction information
    const transactions = auditTrails.map(audit => {
      const oldValue = JSON.parse(audit.old_value || '{}');
      const newValue = JSON.parse(audit.new_value || '{}');
      const additionalInfo = JSON.parse(audit.additional_info || '{}');

      const transaction = {
        id: audit.id,
        timestamp: audit.created_at,
        eventType: audit.event_type,
        action: audit.action,
        user: audit.user_id,
        description: audit.description,
        referenceNo: audit.reference_no,
        ipAddress: audit.ip_address
      };

      // Extract financial impact from different event types
      switch (audit.event_type) {
        case 'DRAWER_OPENED':
        case 'DRAWER_OPENED_WITH_CURRENCY':
        case 'DRAWER_OPENED_FORCED':
          transaction.type = 'OPENING';
          transaction.impact = 'BALANCE_SET';
          transaction.amount = newValue?.balance || 0;
          transaction.previousBalance = oldValue?.balance || 0;
          transaction.newBalance = newValue?.balance || 0;
          transaction.currency = additionalInfo?.opening_currency;
          transaction.verifiedBy = additionalInfo?.verified_by;
          break;

        case 'DRAWER_CLOSED_WITH_CURRENCY':
          transaction.type = 'CLOSING';
          transaction.impact = 'BALANCE_SET';
          transaction.amount = newValue?.balance || 0;
          transaction.previousBalance = oldValue?.balance || 0;
          transaction.newBalance = newValue?.balance || 0;
          transaction.expectedBalance = additionalInfo?.expected_balance;
          transaction.difference = additionalInfo?.difference;
          transaction.overage = additionalInfo?.overage;
          transaction.shortage = additionalInfo?.shortage;
          transaction.currency = additionalInfo?.currency_breakdown;
          transaction.verifiedBy = additionalInfo?.verified_by;
          transaction.countedBy = additionalInfo?.counted_by;
          break;

        case 'DRAWER_FORCE_CLOSED':
          transaction.type = 'FORCE_CLOSING';
          transaction.impact = 'BALANCE_SET';
          transaction.amount = newValue?.balance || 0;
          transaction.previousBalance = oldValue?.balance || 0;
          transaction.newBalance = newValue?.balance || 0;
          transaction.reason = additionalInfo?.reason;
          break;

        case 'DRAWER_CURRENCY_ADJUSTMENT':
          transaction.type = 'ADJUSTMENT';
          transaction.impact = 'BALANCE_ADJUSTED';
          transaction.amount = additionalInfo?.adjustment_amount || 0;
          transaction.previousBalance = oldValue?.balance || 0;
          transaction.newBalance = newValue?.balance || 0;
          transaction.reason = additionalInfo?.reason;
          transaction.currency = additionalInfo?.currency_update;
          break;

        case 'TRANSACTION_PROCESSED':
          transaction.type = 'TRANSACTION';
          transaction.impact = additionalInfo?.effect === 'CREDIT' ? 'BALANCE_INCREASE' : 'BALANCE_DECREASE';
          transaction.amount = additionalInfo?.amount || 0;
          transaction.previousBalance = additionalInfo?.previous_balance || 0;
          transaction.newBalance = additionalInfo?.new_balance || 0;
          transaction.transactionType = additionalInfo?.transaction_type;
          transaction.customerAccount = additionalInfo?.customer_account;
          transaction.referenceNo = additionalInfo?.reference_no;
          break;

        default:
          transaction.type = 'SYSTEM';
          transaction.impact = 'NO_CHANGE';
          transaction.amount = 0;
      }

      // Calculate net change
      transaction.netChange = transaction.newBalance - transaction.previousBalance;

      return transaction;
    });

    // Calculate summary statistics
    const summary = {
      totalTransactions: totalCount,
      openingTransactions: transactions.filter(t => t.type === 'OPENING').length,
      closingTransactions: transactions.filter(t => t.type === 'CLOSING').length,
      adjustments: transactions.filter(t => t.type === 'ADJUSTMENT').length,
      financialTransactions: transactions.filter(t => t.type === 'TRANSACTION').length,
      totalCredits: transactions
        .filter(t => t.impact === 'BALANCE_INCREASE')
        .reduce((sum, t) => sum + t.amount, 0),
      totalDebits: transactions
        .filter(t => t.impact === 'BALANCE_DECREASE')
        .reduce((sum, t) => sum + t.amount, 0),
      netMovement: transactions
        .filter(t => ['BALANCE_INCREASE', 'BALANCE_DECREASE'].includes(t.impact))
        .reduce((sum, t) => sum + (t.impact === 'BALANCE_INCREASE' ? t.amount : -t.amount), 0)
    };

    res.status(200).json({
      success: true,
      drawer: {
        id: drawer.id,
        DRAWER_ID: drawer.DRAWER_ID,
        DRAWER_NO: drawer.DRAWER_NO,
        DRAWER_NM: drawer.DRAWER_NM,
        currentBalance: parseFloat(drawer.CURRENT_BALANCE),
        status: drawer.WF_STATUS
      },
      summary,
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      },
      filters: {
        startDate,
        endDate,
        eventType
      }
    });

  } catch (error) {
    console.error('Error retrieving drawer transaction history:', error);
    res.status(500).json({ 
      message: 'Error retrieving drawer transaction history', 
      error: error.message 
    });
  }
};

// Get Drawer Transaction Summary - Daily/Monthly summary
// Get Drawer Transaction Summary - Daily/Monthly summary
export const getDrawerTransactionSummary = async (req, res, db) => {
  try {
    const { id } = req.params;
    const { period = 'daily', startDate, endDate } = req.query;

    // Find drawer
    let drawer;
    const drawerIdNum = parseInt(id);
    
    if (!isNaN(drawerIdNum)) {
      drawer = await db.queryOne(
        'SELECT * FROM drawers WHERE DRAWER_ID = ?',
        [drawerIdNum]
      );
    } else {
      drawer = await db.queryOne(
        'SELECT * FROM drawers WHERE DRAWER_NO = ?',
        [id]
      );
    }

    if (!drawer) {
      return res.status(404).json({ message: 'Drawer not found' });
    }

    // Set date range
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date();
    if (period === 'daily') {
      start.setDate(end.getDate() - 30); // Last 30 days by default
    } else if (period === 'monthly') {
      start.setMonth(end.getMonth() - 12); // Last 12 months by default
    }

    // Get audit trails for the period
    const auditTrails = await db.query(
      `SELECT * FROM audit_trails 
       WHERE entity_type = 'Drawer'
       AND entity_id = ?
       AND created_at BETWEEN ? AND ?
       ORDER BY created_at ASC`,
      [drawer.id, start, end]
    );

    // Group by period
    const summary = {};
    auditTrails.forEach(audit => {
      const additionalInfo = JSON.parse(audit.additional_info || '{}');
      let periodKey;
      const date = new Date(audit.created_at);
      
      if (period === 'daily') {
        periodKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      } else {
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
      }

      if (!summary[periodKey]) {
        summary[periodKey] = {
          date: periodKey,
          openings: 0,
          closings: 0,
          adjustments: 0,
          transactions: 0,
          credits: 0,
          debits: 0,
          netMovement: 0
        };
      }

      // Categorize and count
      switch (audit.event_type) {
        case 'DRAWER_OPENED':
        case 'DRAWER_OPENED_WITH_CURRENCY':
        case 'DRAWER_OPENED_FORCED':
          summary[periodKey].openings++;
          break;
        case 'DRAWER_CLOSED_WITH_CURRENCY':
        case 'DRAWER_FORCE_CLOSED':
          summary[periodKey].closings++;
          break;
        case 'DRAWER_CURRENCY_ADJUSTMENT':
          summary[periodKey].adjustments++;
          const adjAmount = additionalInfo?.adjustment_amount || 0;
          if (adjAmount > 0) {
            summary[periodKey].credits += adjAmount;
          } else {
            summary[periodKey].debits += Math.abs(adjAmount);
          }
          summary[periodKey].netMovement += adjAmount;
          break;
        case 'TRANSACTION_PROCESSED':
          summary[periodKey].transactions++;
          const txnAmount = additionalInfo?.amount || 0;
          if (additionalInfo?.effect === 'CREDIT') {
            summary[periodKey].credits += txnAmount;
          } else {
            summary[periodKey].debits += txnAmount;
          }
          summary[periodKey].netMovement += (additionalInfo?.effect === 'CREDIT' ? txnAmount : -txnAmount);
          break;
      }
    });

    // Convert to array and sort by date
    const summaryArray = Object.values(summary).sort((a, b) => a.date.localeCompare(b.date));

    res.status(200).json({
      success: true,
      drawer: {
        DRAWER_ID: drawer.DRAWER_ID,
        DRAWER_NO: drawer.DRAWER_NO,
        DRAWER_NM: drawer.DRAWER_NM
      },
      period,
      dateRange: { start, end },
      summary: summaryArray
    });

  } catch (error) {
    console.error('Error retrieving drawer transaction summary:', error);
    res.status(500).json({ 
      message: 'Error retrieving drawer transaction summary', 
      error: error.message 
    });
  }
};

// Get comprehensive drawer enquiry with detailed information
// Get comprehensive drawer enquiry with detailed information
export const getDrawerEnquiry = async (req, res, db) => {
  try {
    const { id } = req.params;
    const { includeTransactions = 'false' } = req.query;

    // Find drawer by DRAWER_ID or DRAWER_NO
    let drawer;
    const drawerIdNum = parseInt(id);
    
    if (!isNaN(drawerIdNum)) {
      drawer = await db.queryOne(
        'SELECT * FROM drawers WHERE DRAWER_ID = ?',
        [drawerIdNum]
      );
    } else {
      drawer = await db.queryOne(
        'SELECT * FROM drawers WHERE DRAWER_NO = ?',
        [id]
      );
    }

    if (!drawer) {
      return res.status(404).json({ message: 'Drawer not found' });
    }

    // Helper function to calculate session duration
    const calculateSessionDuration = (opened, closed) => {
      if (!opened) return null;
      const end = closed || new Date();
      const diffMs = end - new Date(opened);
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return `${hours}h ${minutes}m`;
    };

    // Basic drawer information
    const enquiryData = {
      drawerInfo: {
        DRAWER_ID: drawer.DRAWER_ID,
        DRAWER_NO: drawer.DRAWER_NO,
        DRAWER_NM: drawer.DRAWER_NM,
        DRAWER_TY_CD: drawer.DRAWER_TY_CD,
        USER_ID: drawer.USER_ID,
        BU_ID: drawer.BU_ID,
        GL_ACCT_NO: drawer.GL_ACCT_NO,
        STATUS: drawer.WF_STATUS,
        REC_ST: drawer.REC_ST
      },
      balanceInfo: {
        currentBalance: parseFloat(drawer.CURRENT_BALANCE),
        minBalance: parseFloat(drawer.MIN_BAL),
        maxBalance: parseFloat(drawer.MAX_BAL),
        availableBalance: Math.max(0, parseFloat(drawer.CURRENT_BALANCE) - parseFloat(drawer.MIN_BAL)),
        totalInsuredAmt: parseFloat(drawer.TOTAL_INSURED_AMT),
        overageAmt: parseFloat(drawer.OVERAGE_AMT),
        shortageAmt: parseFloat(drawer.SHORTAGE_AMT)
      },
      sessionInfo: {
        lastOpened: drawer.LAST_DRAWER_OPEN_DT,
        lastClosed: drawer.LAST_DRAWER_CLOSE_DT,
        sessionStartBalance: parseFloat(drawer.SESSION_START_BALANCE || '0'),
        sessionEndBalance: parseFloat(drawer.SESSION_END_BALANCE || '0'),
        sessionDuration: calculateSessionDuration(drawer.LAST_DRAWER_OPEN_DT, drawer.LAST_DRAWER_CLOSE_DT)
      },
      limitsInfo: {
        drawerCashLimitFlag: drawer.DRAWER_CASH_LIMIT_FG,
        drawerLimitExceedCount: drawer.DRAWER_LIMIT_EXCEED_TM,
        drawerInsuredLimitFlag: drawer.DRAWER_INSURED_LIMIT_FG,
        isOverLimit: parseFloat(drawer.CURRENT_BALANCE) > parseFloat(drawer.MAX_BAL),
        isUnderLimit: parseFloat(drawer.CURRENT_BALANCE) < parseFloat(drawer.MIN_BAL)
      },
      currencyInfo: {
        openingCurrency: drawer.OPENING_CURRENCY ? JSON.parse(drawer.OPENING_CURRENCY) : null,
        closingCurrency: drawer.CLOSING_CURRENCY ? JSON.parse(drawer.CLOSING_CURRENCY) : null
      },
      operationalInfo: {
        canProcessTransactions: drawer.WF_STATUS === 'OPEN' && drawer.REC_ST === 'A',
        requiresClosingDenomination: drawer.WF_STATUS === 'CLOSED' && drawer.LAST_DRAWER_CLOSE_DT && !drawer.CLOSING_CURRENCY_DENOMINATION,
        versionNo: drawer.VERSION_NO,
        createdDate: drawer.CREATE_DT,
        lastUpdated: drawer.updated_at
      }
    };

    // Include recent transactions if requested
    if (includeTransactions === 'true') {
      const recentTransactions = await db.query(
        `SELECT * FROM audit_trails 
         WHERE entity_type = 'Drawer'
         AND entity_id = ?
         AND event_type IN (
           'TRANSACTION_PROCESSED',
           'DRAWER_TO_DRAWER_TRANSFER',
           'DRAWER_TO_VAULT_TRANSFER',
           'DRAWER_CURRENCY_ADJUSTMENT'
         )
         ORDER BY created_at DESC
         LIMIT 10`,
        [drawer.id]
      );

      enquiryData.recentTransactions = recentTransactions.map(txn => {
        const additionalInfo = JSON.parse(txn.additional_info || '{}');
        return {
          timestamp: txn.created_at,
          eventType: txn.event_type,
          action: txn.action,
          amount: additionalInfo?.amount,
          referenceNo: txn.reference_no,
          description: txn.description
        };
      });
    }

    res.status(200).json({
      success: true,
      enquiry: enquiryData,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Error in drawer enquiry:', error);
    res.status(500).json({ 
      message: 'Error retrieving drawer enquiry', 
      error: error.message 
    });
  }
};

// Get multiple drawers enquiry for comparison
export const getMultipleDrawersEnquiry = async (req, res, db) => {
  try {
    const { drawerIds } = req.body; // Array of drawer IDs/numbers
    const { summaryOnly = 'false' } = req.query;

    if (!drawerIds || !Array.isArray(drawerIds) || drawerIds.length === 0) {
      return res.status(400).json({ message: 'drawerIds array is required' });
    }

    const drawersEnquiry = [];
    
    for (const drawerId of drawerIds) {
      let drawer;
      const drawerIdNum = parseInt(drawerId);
      
      if (!isNaN(drawerIdNum)) {
        drawer = await db.queryOne(
          'SELECT * FROM drawers WHERE DRAWER_ID = ?',
          [drawerIdNum]
        );
      } else {
        drawer = await db.queryOne(
          'SELECT * FROM drawers WHERE DRAWER_NO = ?',
          [drawerId]
        );
      }

      if (drawer) {
        drawersEnquiry.push({
          DRAWER_ID: drawer.DRAWER_ID,
          DRAWER_NO: drawer.DRAWER_NO,
          DRAWER_NM: drawer.DRAWER_NM,
          USER_ID: drawer.USER_ID,
          STATUS: drawer.WF_STATUS,
          currentBalance: parseFloat(drawer.CURRENT_BALANCE),
          minBalance: parseFloat(drawer.MIN_BAL),
          maxBalance: parseFloat(drawer.MAX_BAL),
          availableBalance: Math.max(0, parseFloat(drawer.CURRENT_BALANCE) - parseFloat(drawer.MIN_BAL)),
          lastOpened: drawer.LAST_DRAWER_OPEN_DT,
          lastClosed: drawer.LAST_DRAWER_CLOSE_DT,
          canProcessTransactions: drawer.WF_STATUS === 'OPEN' && drawer.REC_ST === 'A'
        });
      }
    }

    // Calculate summary statistics
    const summary = {
      totalDrawers: drawersEnquiry.length,
      openDrawers: drawersEnquiry.filter(d => d.STATUS === 'OPEN').length,
      closedDrawers: drawersEnquiry.filter(d => d.STATUS === 'CLOSED').length,
      totalBalance: drawersEnquiry.reduce((sum, d) => sum + d.currentBalance, 0),
      totalAvailableBalance: drawersEnquiry.reduce((sum, d) => sum + d.availableBalance, 0),
      averageBalance: drawersEnquiry.length > 0 ? 
        drawersEnquiry.reduce((sum, d) => sum + d.currentBalance, 0) / drawersEnquiry.length : 0
    };

    const response = {
      success: true,
      count: drawersEnquiry.length,
      summary,
      timestamp: new Date()
    };

    if (summaryOnly !== 'true') {
      response.drawers = drawersEnquiry;
    }

    res.status(200).json(response);

  } catch (error) {
    console.error('Error in multiple drawers enquiry:', error);
    res.status(500).json({ 
      message: 'Error retrieving multiple drawers enquiry', 
      error: error.message 
    });
  }
};

// =============================================
// DRAWER TO DRAWER TRANSACTION
// =============================================

// =============================================
// DRAWER TO DRAWER TRANSACTION
// =============================================

// Process Drawer to Drawer Transfer
export const processDrawerToDrawerTransfer = async (req, res, db) => {
  const session = await db.startTransaction();
  
  try {
    const {
      sourceDrawerId,
      targetDrawerId,
      amount,
      currencyBreakdown,
      referenceNo,
      description,
      userId,
      verifiedBy
    } = req.body;

    // Validate required fields
    if (!sourceDrawerId || !targetDrawerId || !amount || amount <= 0 || !userId) {
      await session.rollback();
      return res.status(400).json({ 
        message: 'Missing required fields: sourceDrawerId, targetDrawerId, amount, userId' 
      });
    }

    if (sourceDrawerId === targetDrawerId) {
      await session.rollback();
      return res.status(400).json({ 
        message: 'Source and target drawer cannot be the same' 
      });
    }

    // Helper function to find drawer by identifier
    const findDrawerByIdentifier = async (identifier, dbSession = null) => {
      const drawerIdNum = parseInt(identifier);
      let query = 'SELECT * FROM drawers WHERE ';
      const params = [];
      
      if (!isNaN(drawerIdNum)) {
        query += 'DRAWER_ID = ?';
        params.push(drawerIdNum);
      } else {
        query += 'DRAWER_NO = ?';
        params.push(identifier);
      }
      
      if (dbSession) {
        query += ' FOR UPDATE';
        return await db.queryOne(query, params, { session: dbSession });
      }
      return await db.queryOne(query, params);
    };

    // Helper function to update drawer limit flags
    const updateDrawerLimitFlags = async (drawerId, newBalance, dbSession) => {
      const drawer = await db.queryOne(
        'SELECT MIN_BAL, MAX_BAL FROM drawers WHERE id = ?',
        [drawerId],
        { session: dbSession }
      );
      
      let limitFlag = 'N';
      if (newBalance > parseFloat(drawer.MAX_BAL)) {
        limitFlag = 'Y';
      } else if (newBalance < parseFloat(drawer.MIN_BAL)) {
        limitFlag = 'Y';
      }
      
      await db.execute(
        'UPDATE drawers SET DRAWER_CASH_LIMIT_FG = ? WHERE id = ?',
        [limitFlag, drawerId],
        { session: dbSession }
      );
    };

    // Find both drawers
    const sourceDrawer = await findDrawerByIdentifier(sourceDrawerId, session);
    const targetDrawer = await findDrawerByIdentifier(targetDrawerId, session);

    if (!sourceDrawer) {
      await session.rollback();
      return res.status(404).json({ message: 'Source drawer not found' });
    }

    if (!targetDrawer) {
      await session.rollback();
      return res.status(404).json({ message: 'Target drawer not found' });
    }

    // Validate drawer statuses
    if (sourceDrawer.WF_STATUS !== 'OPEN') {
      await session.rollback();
      return res.status(400).json({ 
        message: 'Source drawer must be open for transfer',
        currentStatus: sourceDrawer.WF_STATUS
      });
    }

    if (targetDrawer.WF_STATUS !== 'OPEN') {
      await session.rollback();
      return res.status(400).json({ 
        message: 'Target drawer must be open for transfer',
        currentStatus: targetDrawer.WF_STATUS
      });
    }

    // Check source drawer balance
    const sourceBalance = parseFloat(sourceDrawer.CURRENT_BALANCE);
    if (sourceBalance < amount) {
      await session.rollback();
      return res.status(400).json({ 
        message: `Insufficient balance in source drawer. Available: ${sourceBalance}, Required: ${amount}` 
      });
    }

    // Check target drawer limits
    const targetBalance = parseFloat(targetDrawer.CURRENT_BALANCE);
    const targetMaxBalance = parseFloat(targetDrawer.MAX_BAL);
    if (targetBalance + amount > targetMaxBalance) {
      await session.rollback();
      return res.status(400).json({ 
        message: `Transfer would exceed target drawer maximum balance. Current: ${targetBalance}, Max: ${targetMaxBalance}, After Transfer: ${targetBalance + amount}` 
      });
    }

    // Store previous balances for audit
    const sourcePreviousBalance = sourceBalance;
    const targetPreviousBalance = targetBalance;

    // Update balances
    const sourceNewBalance = sourceBalance - amount;
    const targetNewBalance = targetBalance + amount;

    await db.execute(
      `UPDATE drawers 
       SET CURRENT_BALANCE = ?, 
           VERSION_NO = VERSION_NO + 1,
           updated_at = NOW()
       WHERE id = ?`,
      [sourceNewBalance.toFixed(2), sourceDrawer.id],
      { session }
    );

    await db.execute(
      `UPDATE drawers 
       SET CURRENT_BALANCE = ?, 
           VERSION_NO = VERSION_NO + 1,
           updated_at = NOW()
       WHERE id = ?`,
      [targetNewBalance.toFixed(2), targetDrawer.id],
      { session }
    );

    // Update limit flags
    await updateDrawerLimitFlags(sourceDrawer.id, sourceNewBalance, session);
    await updateDrawerLimitFlags(targetDrawer.id, targetNewBalance, session);

    // Get IP for audit
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
    const now = new Date();

    // Create unique event IDs
    const baseEventId = Date.now();

    // Create audit trails for both drawers
    const auditTrails = [
      // Source drawer audit
      {
        event_id: baseEventId,
        user_id: userId,
        event_type: 'DRAWER_TO_DRAWER_TRANSFER',
        action: 'Drawer to Drawer Transfer - DEBIT',
        old_value: JSON.stringify({
          balance: sourcePreviousBalance,
          status: sourceDrawer.WF_STATUS
        }),
        new_value: JSON.stringify({
          balance: sourceNewBalance,
          status: sourceDrawer.WF_STATUS
        }),
        entity_type: 'Drawer',
        entity_id: sourceDrawer.id,
        description: `Transfer to drawer ${targetDrawer.DRAWER_NO}: ${description || 'Drawer to drawer transfer'}`,
        reference_no: referenceNo || `D2D-${Date.now()}`,
        additional_info: JSON.stringify({
          source_drawer_no: sourceDrawer.DRAWER_NO,
          target_drawer_no: targetDrawer.DRAWER_NO,
          amount: amount,
          currency_breakdown: currencyBreakdown,
          transfer_type: 'DEBIT',
          verified_by: verifiedBy,
          previous_balance: sourcePreviousBalance,
          new_balance: sourceNewBalance,
          net_change: -amount
        }),
        ip_address: ipAddress,
        created_at: now,
        updated_at: now
      },
      // Target drawer audit
      {
        event_id: baseEventId + 1,
        user_id: userId,
        event_type: 'DRAWER_TO_DRAWER_TRANSFER',
        action: 'Drawer to Drawer Transfer - CREDIT',
        old_value: JSON.stringify({
          balance: targetPreviousBalance,
          status: targetDrawer.WF_STATUS
        }),
        new_value: JSON.stringify({
          balance: targetNewBalance,
          status: targetDrawer.WF_STATUS
        }),
        entity_type: 'Drawer',
        entity_id: targetDrawer.id,
        description: `Transfer from drawer ${sourceDrawer.DRAWER_NO}: ${description || 'Drawer to drawer transfer'}`,
        reference_no: referenceNo || `D2D-${Date.now()}`,
        additional_info: JSON.stringify({
          source_drawer_no: sourceDrawer.DRAWER_NO,
          target_drawer_no: targetDrawer.DRAWER_NO,
          amount: amount,
          currency_breakdown: currencyBreakdown,
          transfer_type: 'CREDIT',
          verified_by: verifiedBy,
          previous_balance: targetPreviousBalance,
          new_balance: targetNewBalance,
          net_change: amount
        }),
        ip_address: ipAddress,
        created_at: now,
        updated_at: now
      }
    ];

    // Insert audit trails
    for (const audit of auditTrails) {
      await db.execute(
        `INSERT INTO audit_trails (
          event_id, user_id, event_type, action, old_value, new_value,
          entity_type, entity_id, description, reference_no, additional_info,
          ip_address, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          audit.event_id,
          audit.user_id,
          audit.event_type,
          audit.action,
          audit.old_value,
          audit.new_value,
          audit.entity_type,
          audit.entity_id,
          audit.description,
          audit.reference_no,
          audit.additional_info,
          audit.ip_address,
          audit.created_at,
          audit.updated_at
        ],
        { session }
      );
    }

    await session.commit();

    // Log the transfer
    console.log(`Drawer to drawer transfer: ${sourceDrawer.DRAWER_NO} -> ${targetDrawer.DRAWER_NO}, Amount: ${amount}, User: ${userId}`);

    res.status(200).json({
      message: 'Drawer to drawer transfer completed successfully',
      transfer: {
        referenceNo: referenceNo || `D2D-${Date.now()}`,
        timestamp: now,
        amount: amount,
        sourceDrawer: {
          drawerNo: sourceDrawer.DRAWER_NO,
          previousBalance: sourcePreviousBalance,
          newBalance: sourceNewBalance,
          netChange: -amount
        },
        targetDrawer: {
          drawerNo: targetDrawer.DRAWER_NO,
          previousBalance: targetPreviousBalance,
          newBalance: targetNewBalance,
          netChange: amount
        },
        currencyBreakdown: currencyBreakdown,
        verifiedBy: verifiedBy,
        processedBy: userId
      }
    });

  } catch (error) {
    await session.rollback();
    console.error('Error in drawer to drawer transfer:', error);
    
    // Log the full error for debugging
    console.error(`Drawer to drawer transfer error: ${error.message}`, {
      error: error.stack,
      body: req.body,
      user: req.body?.userId
    });
    
    res.status(500).json({ 
      message: 'Error processing drawer to drawer transfer', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    session.release();
  }
};

// =============================================
// DRAWER TO VAULT TRANSACTION
// =============================================

export const processDrawerToVaultTransfer = async (req, res, db) => {
  const session = await db.startTransaction();
  
  try {
    const {
      drawerId,
      vaultId, // Could be vault account number or identifier
      amount,
      transferType, // 'DEPOSIT' or 'WITHDRAWAL'
      currencyBreakdown,
      referenceNo,
      description,
      userId,
      verifiedBy
    } = req.body;

    // Validate required fields
    if (!drawerId || !vaultId || !amount || amount <= 0 || !transferType || !userId) {
      await session.rollback();
      return res.status(400).json({ 
        message: 'Missing required fields: drawerId, vaultId, amount, transferType, userId' 
      });
    }

    // Helper function to find drawer by identifier
    const findDrawerByIdentifier = async (identifier, dbSession = null) => {
      const drawerIdNum = parseInt(identifier);
      let query = 'SELECT * FROM drawers WHERE ';
      const params = [];
      
      if (!isNaN(drawerIdNum)) {
        query += 'DRAWER_ID = ?';
        params.push(drawerIdNum);
      } else {
        query += 'DRAWER_NO = ?';
        params.push(identifier);
      }
      
      if (dbSession) {
        query += ' FOR UPDATE';
        return await db.queryOne(query, params, { session: dbSession });
      }
      return await db.queryOne(query, params);
    };

    // Helper function to update drawer limit flags
    const updateDrawerLimitFlags = async (drawerId, newBalance, dbSession) => {
      const drawer = await db.queryOne(
        'SELECT MIN_BAL, MAX_BAL FROM drawers WHERE id = ?',
        [drawerId],
        { session: dbSession }
      );
      
      let limitFlag = 'N';
      let drawerLimitExceedTm = 0;
      
      if (newBalance > parseFloat(drawer.MAX_BAL)) {
        limitFlag = 'Y';
        // Increment exceed count if exceeding max
        const currentExceedCount = await db.queryOne(
          'SELECT DRAWER_LIMIT_EXCEED_TM FROM drawers WHERE id = ?',
          [drawerId],
          { session: dbSession }
        );
        drawerLimitExceedTm = (currentExceedCount.DRAWER_LIMIT_EXCEED_TM || 0) + 1;
      } else if (newBalance < parseFloat(drawer.MIN_BAL)) {
        limitFlag = 'Y';
      }
      
      await db.execute(
        `UPDATE drawers 
         SET DRAWER_CASH_LIMIT_FG = ?,
             DRAWER_LIMIT_EXCEED_TM = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [limitFlag, drawerLimitExceedTm, drawerId],
        { session: dbSession }
      );
    };

    // Find drawer with FOR UPDATE lock
    const drawer = await findDrawerByIdentifier(drawerId, session);
    if (!drawer) {
      await session.rollback();
      return res.status(404).json({ message: 'Drawer not found' });
    }

    // Validate drawer status
    if (drawer.WF_STATUS !== 'OPEN') {
      await session.rollback();
      return res.status(400).json({ 
        message: 'Drawer must be open for vault transfer',
        currentStatus: drawer.WF_STATUS
      });
    }

    const drawerBalance = parseFloat(drawer.CURRENT_BALANCE);
    const previousBalance = drawerBalance;

    let newBalance;
    let transactionEffect;
    let transferDescription;
    const transferTypeUpper = transferType.toUpperCase();

    // Process based on transfer type
    if (transferTypeUpper === 'DEPOSIT') {
      // Drawer -> Vault: Decrease drawer balance
      if (drawerBalance < amount) {
        await session.rollback();
        return res.status(400).json({ 
          message: `Insufficient drawer balance for vault deposit. Available: ${drawerBalance}, Required: ${amount}` 
        });
      }
      newBalance = drawerBalance - amount;
      transactionEffect = 'DEBIT';
      transferDescription = `Vault deposit to ${vaultId}`;
    } else if (transferTypeUpper === 'WITHDRAWAL') {
      // Vault -> Drawer: Increase drawer balance
      const drawerMaxBalance = parseFloat(drawer.MAX_BAL);
      if (drawerBalance + amount > drawerMaxBalance) {
        await session.rollback();
        return res.status(400).json({ 
          message: `Vault withdrawal would exceed drawer maximum balance. Current: ${drawerBalance}, Max: ${drawerMaxBalance}, After Withdrawal: ${drawerBalance + amount}` 
        });
      }
      newBalance = drawerBalance + amount;
      transactionEffect = 'CREDIT';
      transferDescription = `Vault withdrawal from ${vaultId}`;
    } else {
      await session.rollback();
      return res.status(400).json({ 
        message: 'Invalid transfer type. Must be DEPOSIT or WITHDRAWAL' 
      });
    }

    // Update drawer balance
    await db.execute(
      `UPDATE drawers 
       SET CURRENT_BALANCE = ?,
           VERSION_NO = VERSION_NO + 1,
           updated_at = NOW()
       WHERE id = ?`,
      [newBalance.toFixed(2), drawer.id],
      { session }
    );

    // Update drawer limit flags
    await updateDrawerLimitFlags(drawer.id, newBalance, session);

    // Get updated drawer info
    const updatedDrawer = await db.queryOne(
      'SELECT * FROM drawers WHERE id = ?',
      [drawer.id],
      { session }
    );

    // Get IP for audit
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
    const now = new Date();

    // Create audit trail
    await db.execute(
      `INSERT INTO audit_trails (
        event_id, user_id, event_type, action, old_value, new_value,
        entity_type, entity_id, description, reference_no, additional_info,
        ip_address, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Date.now(),
        userId,
        'DRAWER_TO_VAULT_TRANSFER',
        `Drawer to Vault Transfer - ${transactionEffect}`,
        JSON.stringify({
          balance: previousBalance,
          status: drawer.WF_STATUS
        }),
        JSON.stringify({
          balance: newBalance,
          status: updatedDrawer.WF_STATUS
        }),
        'Drawer',
        drawer.id,
        `${transferDescription}: ${description || 'Drawer to vault transfer'}`,
        referenceNo || `D2V-${Date.now()}`,
        JSON.stringify({
          drawer_no: drawer.DRAWER_NO,
          vault_id: vaultId,
          amount: amount,
          transfer_type: transferTypeUpper,
          transaction_effect: transactionEffect,
          currency_breakdown: currencyBreakdown,
          verified_by: verifiedBy,
          previous_balance: previousBalance,
          new_balance: newBalance,
          net_change: transactionEffect === 'CREDIT' ? amount : -amount
        }),
        ipAddress,
        now,
        now
      ],
      { session }
    );

    // Optional: Create vault transaction record if you have a vaults table
    try {
      await db.execute(
        `INSERT INTO vault_transactions (
          reference_no, vault_id, drawer_id, drawer_no,
          transfer_type, amount, transaction_effect,
          description, user_id, verified_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          referenceNo || `D2V-${Date.now()}`,
          vaultId,
          drawer.id,
          drawer.DRAWER_NO,
          transferTypeUpper,
          amount,
          transactionEffect,
          description || 'Drawer to vault transfer',
          userId,
          verifiedBy,
          now
        ],
        { session }
      );
    } catch (vaultError) {
      // Log but don't fail if vault transactions table doesn't exist
      console.log('Note: Vault transactions table not found or error:', vaultError.message);
    }

    await session.commit();

    // Log the vault transfer
    console.log(`Drawer to vault transfer: ${drawer.DRAWER_NO} <-> ${vaultId}, Type: ${transferTypeUpper}, Amount: ${amount}, User: ${userId}`);

    res.status(200).json({
      message: `Drawer to vault ${transferTypeUpper.toLowerCase()} completed successfully`,
      transfer: {
        referenceNo: referenceNo || `D2V-${Date.now()}`,
        timestamp: now,
        amount: amount,
        transferType: transferTypeUpper,
        transactionEffect: transactionEffect,
        drawer: {
          drawerNo: drawer.DRAWER_NO,
          previousBalance: previousBalance,
          newBalance: newBalance,
          netChange: transactionEffect === 'CREDIT' ? amount : -amount
        },
        vault: {
          vaultId: vaultId
        },
        currencyBreakdown: currencyBreakdown,
        verifiedBy: verifiedBy,
        processedBy: userId
      }
    });

  } catch (error) {
    await session.rollback();
    console.error('Error in drawer to vault transfer:', error);
    res.status(500).json({ 
      message: 'Error processing drawer to vault transfer', 
      error: error.message 
    });
  } finally {
    session.release();
  }
};

// =============================================
// HELPER FUNCTIONS
// =============================================

// // Helper function to find drawer by various identifiers
// async function findDrawerByIdentifier(identifier, session = null) {
//   let drawer;
//   const options = session ? { session } : {};
  
//   // Try as DRAWER_ID (numeric)
//   const drawerIdNum = parseInt(identifier);
//   if (!isNaN(drawerIdNum)) {
//     drawer = await Drawer.findOne({ DRAWER_ID: drawerIdNum }, null, options);
//   }
  
//   // If not found, try as DRAWER_NO (string)
//   if (!drawer) {
//     drawer = await Drawer.findOne({ DRAWER_NO: identifier }, null, options);
//   }
  
//   // If still not found, try as MongoDB ObjectId
//   if (!drawer && mongoose.Types.ObjectId.isValid(identifier)) {
//     drawer = await Drawer.findById(identifier, null, options);
//   }
  
//   return drawer;
// }

// Helper function to update drawer limit flags
// Helper function to update drawer limit flags
async function updateDrawerLimitFlags(drawer, newBalance, db, session = null) {
  const minBalance = parseFloat(drawer.MIN_BAL);
  const maxBalance = parseFloat(drawer.MAX_BAL);
  const insuredAmount = parseFloat(drawer.TOTAL_INSURED_AMT);
  
  let drawerCashLimitFg = 'N';
  let drawerInsuredLimitFg = 'N';
  let drawerLimitExceedTm = drawer.DRAWER_LIMIT_EXCEED_TM || 0;
  
  if (newBalance > maxBalance) {
    drawerCashLimitFg = 'Y';
    drawerLimitExceedTm += 1;
  } else if (newBalance < minBalance) {
    drawerCashLimitFg = 'Y';
  }
  
  if (newBalance > insuredAmount) {
    drawerInsuredLimitFg = 'Y';
  }
  
  await db.execute(
    `UPDATE drawers 
     SET DRAWER_CASH_LIMIT_FG = ?,
         DRAWER_INSURED_LIMIT_FG = ?,
         DRAWER_LIMIT_EXCEED_TM = ?,
         updated_at = NOW()
     WHERE id = ?`,
    [
      drawerCashLimitFg,
      drawerInsuredLimitFg,
      drawerLimitExceedTm,
      drawer.id
    ],
    session ? { session } : undefined
  );
}

// =============================================
// BULK DRAWER OPERATIONS
// =============================================

// Get summary of all drawers for dashboard
// =============================================
// BULK DRAWER OPERATIONS
// =============================================

// Get summary of all drawers for dashboard
export const getDrawersSummary = async (req, res, db) => {
  try {
    const { businessUnit, status } = req.query;
    
    // Build query
    let query = 'SELECT * FROM drawers WHERE 1=1';
    const params = [];
    
    if (businessUnit) {
      query += ' AND BU_ID = ?';
      params.push(businessUnit);
    }
    
    if (status) {
      query += ' AND WF_STATUS = ?';
      params.push(status);
    }
    
    const drawers = await db.query(query, params);
    
    const summary = {
      totalDrawers: drawers.length,
      openDrawers: drawers.filter(d => d.WF_STATUS === 'OPEN').length,
      closedDrawers: drawers.filter(d => d.WF_STATUS === 'CLOSED').length,
      totalBalance: drawers.reduce((sum, d) => sum + parseFloat(d.CURRENT_BALANCE), 0),
      totalInsuredAmount: drawers.reduce((sum, d) => sum + parseFloat(d.TOTAL_INSURED_AMT), 0),
      drawersExceedingLimit: drawers.filter(d => d.DRAWER_CASH_LIMIT_FG === 'Y').length,
      businessUnit: businessUnit || 'All'
    };
    
    // Add breakdown by user
    const userBreakdown = {};
    drawers.forEach(drawer => {
      const userId = drawer.USER_ID;
      if (!userBreakdown[userId]) {
        userBreakdown[userId] = {
          openDrawers: 0,
          closedDrawers: 0,
          totalBalance: 0
        };
      }
      
      userBreakdown[userId][drawer.WF_STATUS === 'OPEN' ? 'openDrawers' : 'closedDrawers'] += 1;
      userBreakdown[userId].totalBalance += parseFloat(drawer.CURRENT_BALANCE);
    });
    
    summary.userBreakdown = userBreakdown;
    
    res.status(200).json({
      success: true,
      summary,
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('Error retrieving drawers summary:', error);
    res.status(500).json({ 
      message: 'Error retrieving drawers summary', 
      error: error.message 
    });
  }
};


// Update this function in your DrawerController.js
// Update this function in your DrawerController.js
export const postDrawerTransaction = async (req, res, db) => {
  const session = await db.startTransaction();
  
  try {
    const {
      drawerId,
      transactionType,
      amount,
      customerAccount,
      referenceNo,
      description,
      userId,
      currencyCount,
      businessUnit,
      depositorName
    } = req.body;

    // Validate required fields
    if (!drawerId || !transactionType || !amount || amount <= 0) {
      await session.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: drawerId, transactionType, amount'
      });
    }

    // Helper function to find drawer by identifier
    const findDrawerByIdentifier = async (identifier, dbSession = null) => {
      const drawerIdNum = parseInt(identifier);
      let query = 'SELECT * FROM drawers WHERE ';
      const params = [];
      
      if (!isNaN(drawerIdNum)) {
        query += 'DRAWER_ID = ?';
        params.push(drawerIdNum);
      } else {
        // Check if it's a numeric string for DRAWER_NO
        const numericNo = parseInt(identifier);
        if (!isNaN(numericNo)) {
          query += '(DRAWER_NO = ? OR DRAWER_ID = ?)';
          params.push(identifier, numericNo);
        } else {
          query += 'DRAWER_NO = ?';
          params.push(identifier);
        }
      }
      
      if (dbSession) {
        query += ' FOR UPDATE';
        return await db.queryOne(query, params, { session: dbSession });
      }
      return await db.queryOne(query, params);
    };

    // Find drawer with lock
    const drawer = await findDrawerByIdentifier(drawerId, session);

    if (!drawer) {
      await session.rollback();
      return res.status(404).json({
        success: false,
        message: `Drawer not found for identifier: ${drawerId}`,
        suggestion: 'Use DRAWER_NO (e.g., "1001") or DRAWER_ID (e.g., 1)'
      });
    }

    console.log(`✅ Found drawer: ${drawer.DRAWER_NO} (${drawer.DRAWER_NM})`);

    // Check if drawer is open and active
    if (drawer.WF_STATUS !== 'OPEN') {
      await session.rollback();
      return res.status(400).json({
        success: false,
        message: 'Drawer is not open. Please open the drawer before processing transactions.',
        currentStatus: drawer.WF_STATUS,
        drawerNo: drawer.DRAWER_NO
      });
    }

    if (drawer.REC_ST !== 'A') {
      await session.rollback();
      return res.status(400).json({
        success: false,
        message: 'Drawer is not active',
        drawerNo: drawer.DRAWER_NO,
        recordStatus: drawer.REC_ST
      });
    }

    // Process the transaction using existing function
    const transactionReq = {
      body: {
        drawerId: drawer.id.toString(),
        transactionType,
        amount: parseFloat(amount),
        customerAccount: customerAccount || null,
        referenceNo: referenceNo || `DWTXN${Date.now()}`,
        description: description || 'Drawer transaction',
        userId: userId || req.user?.id || 'system',
        currencyCount: currencyCount || null,
        businessUnit: businessUnit || 'DEFAULT',
        depositorName: depositorName || null
      }
    };

    const result = await processDrawerTransaction(transactionReq, res, db, session);

    if (result.success) {
      await session.commit();
      
      res.status(200).json({
        success: true,
        message: 'Drawer transaction posted successfully',
        data: {
          transaction: result.transaction,
          drawer: {
            drawerId: drawer.id,
            drawerNo: drawer.DRAWER_NO,
            drawerName: drawer.DRAWER_NM,
            previousBalance: result.drawer.previousBalance,
            newBalance: result.drawer.newBalance,
            transactionEffect: result.drawer.transactionEffect
          },
          referenceNo: transactionReq.body.referenceNo,
          timestamp: new Date()
        }
      });
    } else {
      await session.rollback();
      res.status(400).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }

  } catch (error) {
    await session.rollback();
    console.error('Error posting drawer transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to post drawer transaction',
      error: error.message
    });
  } finally {
    session.release();
  }
};

// POST /api/drawer/transactions/post-bulk
// POST /api/drawer/transactions/post-bulk
export const postBulkDrawerTransactions = async (req, res, db) => {
  const session = await db.startTransaction();
  
  try {
    const { transactions } = req.body;

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      await session.rollback();
      return res.status(400).json({
        success: false,
        message: 'Transactions array is required and cannot be empty'
      });
    }

    if (transactions.length > 50) {
      await session.rollback();
      return res.status(400).json({
        success: false,
        message: 'Maximum 50 transactions allowed per bulk request'
      });
    }

    const results = {
      successful: [],
      failed: []
    };

    for (const [index, tx] of transactions.entries()) {
      try {
        const {
          drawerId,
          transactionType,
          amount,
          customerAccount,
          referenceNo,
          description,
          userId,
          currencyCount,
          businessUnit,
          depositorName
        } = tx;

        // Validate transaction
        if (!drawerId || !transactionType || !amount || amount <= 0) {
          results.failed.push({
            index,
            referenceNo: referenceNo || `BULK${index}`,
            error: 'Missing required fields: drawerId, transactionType, amount'
          });
          continue;
        }

        // Process transaction
        const transactionReq = {
          body: {
            drawerId,
            transactionType,
            amount: parseFloat(amount),
            customerAccount: customerAccount || null,
            referenceNo: referenceNo || `BULK${Date.now()}${index}`,
            description: description || `Bulk transaction ${index + 1}`,
            userId: userId || req.user?.id || 'system',
            currencyCount: currencyCount || null,
            businessUnit: businessUnit || 'DEFAULT',
            depositorName: depositorName || null
          }
        };

        const result = await processDrawerTransaction(transactionReq, res, db, session);

        if (result.success) {
          results.successful.push({
            index,
            referenceNo: transactionReq.body.referenceNo,
            transaction: result.transaction,
            drawer: result.drawer
          });
        } else {
          results.failed.push({
            index,
            referenceNo: transactionReq.body.referenceNo,
            error: result.message
          });
        }

      } catch (txError) {
        results.failed.push({
          index,
          referenceNo: tx.referenceNo || `BULK${index}`,
          error: txError.message
        });
      }
    }

    // Commit transaction if there are successful transactions
    if (results.successful.length > 0) {
      await session.commit();
      
      res.status(207).json({
        success: true,
        message: `Processed ${results.successful.length} successful and ${results.failed.length} failed transactions`,
        data: results
      });
    } else {
      await session.rollback();
      res.status(400).json({
        success: false,
        message: 'No transactions were processed successfully',
        data: results
      });
    }

  } catch (error) {
    await session.rollback();
    console.error('Error posting bulk drawer transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process bulk drawer transactions',
      error: error.message
    });
  } finally {
    session.release();
  }
};

// GET /api/drawer/transactions/:transactionId
// GET /api/drawer/transactions/:transactionId
export const getDrawerTransactionById = async (req, res, db) => {
  try {
    const { transactionId } = req.params;

    // Search in AuditTrail for the transaction
    const transaction = await db.queryOne(`
      SELECT * FROM audit_trails 
      WHERE entity_type = 'Drawer'
      AND (
        reference_no = ? 
        OR JSON_EXTRACT(additional_info, '$.transactionId') = ?
        OR id = ?
      )
      LIMIT 1
    `, [transactionId, transactionId, transactionId]);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const additionalInfo = JSON.parse(transaction.additional_info || '{}');
    const oldValue = JSON.parse(transaction.old_value || '{}');
    const newValue = JSON.parse(transaction.new_value || '{}');

    res.status(200).json({
      success: true,
      data: {
        transaction: {
          id: transaction.id,
          referenceNo: transaction.reference_no,
          eventType: transaction.event_type,
          action: transaction.action,
          amount: additionalInfo?.amount,
          description: transaction.description,
          status: transaction.status,
          timestamp: transaction.timestamp || transaction.created_at,
          userId: transaction.user_id,
          drawerId: transaction.entity_id,
          oldValue: oldValue,
          newValue: newValue,
          additionalInfo: additionalInfo
        }
      }
    });

  } catch (error) {
    console.error('Error fetching drawer transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch drawer transaction',
      error: error.message
    });
  }
};

// POST /api/drawer/transactions/:transactionId/reverse
// POST /api/drawer/transactions/:transactionId/reverse
export const reverseDrawerTransaction = async (req, res, db) => {
  const session = await db.startTransaction();
  
  try {
    const { transactionId } = req.params;
    const { reason, userId } = req.body;

    if (!reason) {
      await session.rollback();
      return res.status(400).json({
        success: false,
        message: 'Reversal reason is required'
      });
    }

    // Find the original transaction
    const originalTransaction = await db.queryOne(`
      SELECT * FROM audit_trails 
      WHERE entity_type = 'Drawer'
      AND (
        reference_no = ? 
        OR JSON_EXTRACT(additional_info, '$.transactionId') = ?
        OR id = ?
      )
      LIMIT 1
    `, [transactionId, transactionId, transactionId], { session });

    if (!originalTransaction) {
      await session.rollback();
      return res.status(404).json({
        success: false,
        message: 'Original transaction not found'
      });
    }

    // Check if already reversed
    const existingReversal = await db.queryOne(`
      SELECT * FROM audit_trails 
      WHERE JSON_EXTRACT(additional_info, '$.reversedTransactionId') = ?
      OR JSON_EXTRACT(additional_info, '$.originalTransactionId') = ?
      LIMIT 1
    `, [transactionId, transactionId], { session });

    if (existingReversal) {
      await session.rollback();
      return res.status(400).json({
        success: false,
        message: 'Transaction has already been reversed'
      });
    }

    const drawer = await db.queryOne(
      'SELECT * FROM drawers WHERE id = ? FOR UPDATE',
      [originalTransaction.entity_id],
      { session }
    );
    
    if (!drawer) {
      await session.rollback();
      return res.status(404).json({
        success: false,
        message: 'Drawer not found'
      });
    }

    // Calculate reversal amount (opposite of original)
    const additionalInfo = JSON.parse(originalTransaction.additional_info || '{}');
    const originalAmount = parseFloat(additionalInfo?.amount || 0);
    const reversalAmount = -originalAmount;

    // Determine reversal transaction type
    const originalType = originalTransaction.event_type;
    let reversalType = 'REVERSAL';
    if (originalType.includes('DEPOSIT')) {
      reversalType = 'REVERSAL_DEPOSIT';
    } else if (originalType.includes('WITHDRAWAL')) {
      reversalType = 'REVERSAL_WITHDRAWAL';
    }

    // Process reversal transaction
    const reversalReq = {
      body: {
        drawerId: drawer.id.toString(),
        transactionType: reversalType,
        amount: Math.abs(reversalAmount),
        customerAccount: additionalInfo?.customerAccount,
        referenceNo: `REV${originalTransaction.reference_no}`,
        description: `Reversal: ${originalTransaction.description} - Reason: ${reason}`,
        userId: userId || req.user?.id || 'system'
      }
    };

    const reversalResult = await processDrawerTransaction(reversalReq, res, db, session);

    if (!reversalResult.success) {
      await session.rollback();
      return res.status(400).json({
        success: false,
        message: `Failed to process reversal: ${reversalResult.message}`
      });
    }

    // Create reversal audit record
    const now = new Date();
    const reversalAudit = {
      event_id: Date.now(),
      user_id: userId || req.user?.id || 'system',
      event_type: `REVERSAL_${originalTransaction.event_type}`,
      action: `Reversal: ${originalTransaction.action}`,
      old_value: JSON.stringify(reversalResult.drawer ? { 
        DRAWER_BALANCE: reversalResult.drawer.previousBalance 
      } : {}),
      new_value: JSON.stringify(reversalResult.drawer ? { 
        DRAWER_BALANCE: reversalResult.drawer.newBalance 
      } : {}),
      ip_address: req.ip || 'unknown',
      created_at: now,
      updated_at: now,
      entity_type: 'Drawer',
      entity_id: drawer.id,
      status: 'COMPLETED',
      description: `Reversal of transaction ${originalTransaction.reference_no} - ${reason}`,
      reference_no: reversalReq.body.referenceNo,
      additional_info: JSON.stringify({
        originalTransactionId: transactionId,
        originalReferenceNo: originalTransaction.reference_no,
        reversalReason: reason,
        amount: Math.abs(reversalAmount),
        reversedBy: userId || req.user?.id || 'system'
      })
    };

    await db.execute(
      `INSERT INTO audit_trails (
        event_id, user_id, event_type, action, old_value, new_value,
        ip_address, created_at, updated_at, entity_type, entity_id,
        status, description, reference_no, additional_info
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reversalAudit.event_id,
        reversalAudit.user_id,
        reversalAudit.event_type,
        reversalAudit.action,
        reversalAudit.old_value,
        reversalAudit.new_value,
        reversalAudit.ip_address,
        reversalAudit.created_at,
        reversalAudit.updated_at,
        reversalAudit.entity_type,
        reversalAudit.entity_id,
        reversalAudit.status,
        reversalAudit.description,
        reversalAudit.reference_no,
        reversalAudit.additional_info
      ],
      { session }
    );

    await session.commit();

    res.status(200).json({
      success: true,
      message: 'Transaction reversed successfully',
      data: {
        reversalTransaction: reversalResult.transaction,
        drawer: reversalResult.drawer,
        originalTransaction: {
          referenceNo: originalTransaction.reference_no,
          amount: originalAmount,
          type: originalTransaction.event_type
        }
      }
    });

  } catch (error) {
    await session.rollback();
    console.error('Error reversing drawer transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reverse transaction',
      error: error.message
    });
  } finally {
    session.release();
  }
};

// Export all new functions
export {
  findDrawerByIdentifier,
  updateDrawerLimitFlags
};
// Export helper functions for testing
export {
  calculateTotalFromDenominations,
  calculateSessionDuration,
  createAutoClosingDenomination
};
