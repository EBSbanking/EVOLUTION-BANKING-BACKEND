// controllers/DrawerController.js
import Drawer from '../models/Drawer.js';
import mongoose from 'mongoose';
import AuditTrail from '../models/AuditTrail.js';
import logger from '../utils/logger.js';
import DrawerCurrencyDenomination from '../models/DrawerCurrencyDenomination.js';
import Branch from '../models/Branch.js';


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
async function createAutoClosingDenomination(drawer, userId, session) {
  try {
    const closingDenom = new DrawerCurrencyDenomination({
      drawerCrncyId: new mongoose.Types.ObjectId(),
      drawerId: drawer._id,
      drawerCrncyDenomId: `DCD-AUTO-${Date.now()}`,
      denominationType: 'CLOSING',
      currencyCount: {
        '1000': 0,
        '500': 0,
        '200': 0,
        '100': 0,
        '50': 0,
        '20': 0,
        '10': 0,
        '5': 0
      },
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
    });
    
    const savedDenom = await closingDenom.save({ session });
    console.log(`Auto-closing denomination created: ${savedDenom._id}`);
    return savedDenom;
  } catch (error) {
    console.error('Error creating auto-closing denomination:', error);
    return null;
  }
}

// Create a new Drawer entry (automatically creates as CLOSED)
export const createDrawer = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const {
      DRAWER_ID,
      DRAWER_NO,
      TOTAL_INSURED_AMT,
      MIN_BAL,
      MAX_BAL,
      EFF_FROM_DT,
      EFF_TO_DT,
      DRAWER_TY_CD,
      REC_ST,
      USER_ID,
      BU_ID,
      DRAWER_NM,
      GL_ACCT_NO
    } = req.body;

    // Validate drawer number uniqueness
    const existingDrawer = await Drawer.findOne({ DRAWER_NO }).session(session);
    if (existingDrawer) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Drawer number already exists' });
    }

    // New drawers are created as CLOSED by default
    const newDrawer = new Drawer({
      DRAWER_ID,
      DRAWER_NO,
      TOTAL_INSURED_AMT: mongoose.Types.Decimal128.fromString((TOTAL_INSURED_AMT || 0).toString()),
      MIN_BAL: mongoose.Types.Decimal128.fromString((MIN_BAL || 0).toString()),
      MAX_BAL: mongoose.Types.Decimal128.fromString((MAX_BAL || 0).toString()),
      EFF_FROM_DT: EFF_FROM_DT || new Date(),
      EFF_TO_DT,
      DRAWER_TY_CD,
      REC_ST: REC_ST || 'A',
      VERSION_NO: 1,
      USER_ID,
      BU_ID,
      CREATE_DT: new Date(),
      SYS_CREATE_TS: new Date(),
      CREATED_BY: USER_ID,
      OVERAGE_AMT: mongoose.Types.Decimal128.fromString('0.00'),
      SHORTAGE_AMT: mongoose.Types.Decimal128.fromString('0.00'),
      DRAWER_CASH_LIMIT_FG: 'N',
      DRAWER_LIMIT_EXCEED_TM: 0,
      DRAWER_INSURED_LIMIT_FG: 'N',
      LAST_DRAWER_CLOSE_DT: new Date(),
      LAST_DRAWER_OPEN_DT: null,
      GL_ACCT_NO: GL_ACCT_NO || '',
      SP_ACCT_NO: null,
      SP_ACCT_FG: 'N',
      WF_STATUS: 'CLOSED',
      DRAWER_NM,
      CURRENT_BALANCE: mongoose.Types.Decimal128.fromString('0.00')
    });

    await newDrawer.save({ session });

    // Audit trail for drawer creation
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
    const newValue = JSON.stringify({
      drawer_no: DRAWER_NO,
      drawer_name: DRAWER_NM,
      drawer_type: DRAWER_TY_CD,
      business_unit: BU_ID,
      insured_amt: TOTAL_INSURED_AMT,
      min_bal: MIN_BAL,
      max_bal: MAX_BAL
    });

    await AuditTrail.create([{
      event_id: Date.now(),
      user_id: USER_ID,
      event_type: 'DRAWER_CREATED',
      action: 'Drawer Created',
      entity_type: 'Drawer',
      entity_id: newDrawer._id,
      description: `Drawer ${DRAWER_NO} created`,
      reference_no: `DRAWER-CREATE-${Date.now()}`,
      additional_info: {
        drawer_no: DRAWER_NO,
        drawer_name: DRAWER_NM,
        drawer_type: DRAWER_TY_CD,
        business_unit: BU_ID
      },
      ip_address: ipAddress,
      new_value: newValue
    }], { session });

    await session.commitTransaction();
    
    res.status(201).json({
      message: 'Drawer created successfully (status: CLOSED - must be opened before use)',
      drawer: newDrawer
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error creating drawer:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        message: 'Validation failed', 
        error: Object.values(error.errors).map(e => `${e.path}: ${e.message}`).join(', ')
      });
    }
    
    res.status(500).json({ 
      message: 'Error creating Drawer entry', 
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};

// Get all Drawer entries with status filter
export const getAllDrawers = async (req, res) => {
  try {
    const { status, userId, businessUnit } = req.query;
    let filter = {};
    
    if (status) filter.WF_STATUS = status;
    if (userId) filter.USER_ID = userId;
    if (businessUnit) filter.BU_ID = businessUnit;
    
    const drawers = await Drawer.find(filter).sort({ CREATE_DT: -1 });
    
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

// Get drawers by userId (e.g., for PCO03)
export const getDrawerByUserId = async (req, res) => {
  try {
    const { userId } = req.params; // e.g., /drawer/user/PCO03
    const { status = 'OPEN' } = req.query; // Default to open drawers; optional param for all/closed

    const filter = {
      USER_ID: userId,
      WF_STATUS: status
    };

    const drawers = await Drawer.find(filter).sort({ LAST_DRAWER_OPEN_DT: -1 });
    
    if (drawers.length === 0) {
      return res.status(404).json({ 
        message: `No ${status.toLowerCase()} drawers found for user ${userId}` 
      });
    }

    res.status(200).json({
      success: true,
      count: drawers.length,
      userId: userId,
      status: status,
      drawers: drawers.map(drawer => ({
        id: drawer._id,
        DRAWER_ID: drawer.DRAWER_ID,
        DRAWER_NO: drawer.DRAWER_NO,
        DRAWER_NM: drawer.DRAWER_NM,
        WF_STATUS: drawer.WF_STATUS,
        CURRENT_BALANCE: parseFloat(drawer.CURRENT_BALANCE.toString()),
        LAST_DRAWER_OPEN_DT: drawer.LAST_DRAWER_OPEN_DT,
        LAST_DRAWER_CLOSE_DT: drawer.LAST_DRAWER_CLOSE_DT,
        BU_ID: drawer.BU_ID,
        USER_ID: drawer.USER_ID
      }))
    });
  } catch (error) {
    console.error('Error retrieving drawers by userId:', error);
    res.status(500).json({ 
      message: 'Error retrieving drawers by user', 
      error: error.message 
    });
  }
};

// Debug endpoint to check drawer state
export const debugDrawerState = async (req, res) => {
  try {
    const { id } = req.params;
    const numericId = parseInt(id, 10);
    const drawer = await Drawer.findOne({ DRAWER_ID: numericId });
    
    if (!drawer) {
      return res.status(404).json({ message: 'Drawer not found' });
    }

    let closingDenom = null;
    if (drawer.CLOSING_CURRENCY_DENOMINATION) {
      closingDenom = await DrawerCurrencyDenomination.findById(drawer.CLOSING_CURRENCY_DENOMINATION);
    }

    res.status(200).json({
      drawer: {
        DRAWER_ID: drawer.DRAWER_ID,
        DRAWER_NO: drawer.DRAWER_NO,
        WF_STATUS: drawer.WF_STATUS,
        LAST_DRAWER_CLOSE_DT: drawer.LAST_DRAWER_CLOSE_DT,
        CLOSING_CURRENCY_DENOMINATION: drawer.CLOSING_CURRENCY_DENOMINATION,
        CURRENT_BALANCE: drawer.CURRENT_BALANCE
      },
      closingDenomination: closingDenom,
      hasCloseDate: !!drawer.LAST_DRAWER_CLOSE_DT,
      hasClosingDenom: !!drawer.CLOSING_CURRENCY_DENOMINATION,
      requiresClosingDenom: !!drawer.LAST_DRAWER_CLOSE_DT && !drawer.CLOSING_CURRENCY_DENOMINATION
    });
  } catch (error) {
    res.status(500).json({ message: 'Debug error', error: error.message });
  }
};


// Enhanced version with multiple search criteria
export const getDrawerById = async (req, res) => {
  try {
    const { id } = req.params;
    
    let drawer;

    // Check if id is a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      drawer = await Drawer.findById(id);
    } else {
      // Try multiple search criteria in order of likelihood
      const searchCriteria = [
        { DRAWER_NO: id },                    // Most likely: "1002"
        { DRAWER_ID: parseInt(id) },          // If numeric: 2
        { DRAWER_NM: { $regex: id, $options: 'i' } } // Name search
      ];

      // Try each search criteria until we find a match
      for (const criteria of searchCriteria) {
        drawer = await Drawer.findOne(criteria);
        if (drawer) break;
      }
    }

    if (!drawer) {
      return res.status(404).json({ 
        success: false,
        message: `Drawer entry not found for identifier: ${id}`,
        suggestion: 'Try searching by DRAWER_NO (e.g., "1002"), DRAWER_ID (e.g., "2"), or MongoDB ObjectId'
      });
    }

    res.status(200).json({
      success: true,
      data: drawer
    });
  } catch (error) {
    console.error('Error retrieving drawer:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error retrieving Drawer entry', 
      error: error.message 
    });
  }
};

// Enhanced Open Drawer with Robust Previous Closing Denomination Check
export const openDrawer = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
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
      await session.abortTransaction();
      return res.status(400).json({ message: 'User ID is required to open drawer' });
    }

    // Use custom DRAWER_ID for lookup (handle string/number)
    const numericId = parseInt(id, 10);
    const drawer = await Drawer.findOne({ DRAWER_ID: numericId }).session(session);
    if (!drawer) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Drawer not found' });
    }

    // Debug log drawer state
    console.log(`Drawer state for ${id}: WF_STATUS: ${drawer.WF_STATUS}, LAST_DRAWER_CLOSE_DT: ${drawer.LAST_DRAWER_CLOSE_DT}, CLOSING_CURRENCY_DENOMINATION: ${drawer.CLOSING_CURRENCY_DENOMINATION}`);

    // Check if drawer is already open
    if (drawer.WF_STATUS === 'OPEN') {
      await session.abortTransaction();
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
          closingDenom = await DrawerCurrencyDenomination.findById(drawer.CLOSING_CURRENCY_DENOMINATION).session(session);
          
          // If existing denomination has invalid status, replace it
          if (closingDenom && closingDenom.status !== 'ACTIVE' && closingDenom.status !== 'AUTO_CREATED') {
            console.warn(`Force opening: Replacing invalid closing denomination status: ${closingDenom.status}`);
            
            // Create a new active closing denomination
            const newClosingDenom = await createAutoClosingDenomination(drawer, userId, session);
            if (newClosingDenom) {
              drawer.CLOSING_CURRENCY_DENOMINATION = newClosingDenom._id;
              await drawer.save({ session });
              console.log(`Replaced invalid denomination with new one: ${newClosingDenom._id}`);
              closingDenom = newClosingDenom;
            }
          }
        } else {
          // No closing denomination exists, create one
          console.warn(`Force opening: No closing denomination found. Creating auto-record.`);
          const autoClosingDenom = await createAutoClosingDenomination(drawer, userId, session);
          if (autoClosingDenom) {
            drawer.CLOSING_CURRENCY_DENOMINATION = autoClosingDenom._id;
            await drawer.save({ session });
            console.log(`Auto-created and linked closing denomination: ${autoClosingDenom._id}`);
            closingDenom = autoClosingDenom;
          }
        }
        
        // If we still don't have a valid closing denomination, proceed without it
        if (!closingDenom || (closingDenom.status !== 'ACTIVE' && closingDenom.status !== 'AUTO_CREATED')) {
          console.warn(`Force opening: Proceeding without valid closing denomination due to forceOpen=true`);
          // Clear the invalid reference and proceed
          drawer.CLOSING_CURRENCY_DENOMINATION = null;
          await drawer.save({ session });
        }
        
      } else {
        // Standard validation (no forceOpen)
        if (!drawer.CLOSING_CURRENCY_DENOMINATION) {
          console.log(`Error: LAST_DRAWER_CLOSE_DT exists but no CLOSING_CURRENCY_DENOMINATION for drawer ${id}`);
          await session.abortTransaction();
          return res.status(400).json({ 
            message: 'Previous closing currency denomination must be recorded before opening the drawer. Please record the closing count first or use forceOpen=true to override.',
            requiresClosingDenomination: true,
            drawerId: drawer.DRAWER_ID
          });
        } else {
          // Check if existing denomination is valid
          const closingDenom = await DrawerCurrencyDenomination.findById(drawer.CLOSING_CURRENCY_DENOMINATION).session(session);
          if (!closingDenom || (closingDenom.status !== 'ACTIVE' && closingDenom.status !== 'AUTO_CREATED')) {
            console.log(`Error: Invalid closing denom status for drawer ${id}: ${closingDenom ? closingDenom.status : 'null'}`);
            await session.abortTransaction();
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
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Either openingBalance or openingCurrency is required' 
      });
    }

    // Validate opening balance
    if (isNaN(finalOpeningBalance) || finalOpeningBalance < 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Opening balance must be a positive number' });
    }

    // Check against drawer limits
    const maxBalance = parseFloat(drawer.MAX_BAL.toString());
    if (finalOpeningBalance > maxBalance) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: `Opening balance ${finalOpeningBalance} exceeds maximum limit of ${maxBalance}`,
        maxBalance: maxBalance
      });
    }

    // Store previous state for audit
    const previousStatus = drawer.WF_STATUS;
    const previousBalance = parseFloat(drawer.CURRENT_BALANCE.toString());

    // Reset drawer for new session
    drawer.CURRENT_BALANCE = mongoose.Types.Decimal128.fromString(finalOpeningBalance.toFixed(2));
    drawer.WF_STATUS = 'OPEN';
    drawer.USER_ID = userId;
    drawer.LAST_DRAWER_OPEN_DT = new Date();
    drawer.OVERAGE_AMT = mongoose.Types.Decimal128.fromString('0.00');
    drawer.SHORTAGE_AMT = mongoose.Types.Decimal128.fromString('0.00');
    drawer.DRAWER_CASH_LIMIT_FG = 'N';
    drawer.DRAWER_LIMIT_EXCEED_TM = 0;
    drawer.VERSION_NO += 1;
    drawer.SESSION_START_BALANCE = mongoose.Types.Decimal128.fromString(finalOpeningBalance.toFixed(2));
    
    // Store opening currency details if provided
    if (openingCurrency) {
      drawer.OPENING_CURRENCY = openingCurrency;
    }

    await drawer.save({ session });

    // Get IP address for audit trail
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';

    // Determine event type based on input method and force open
    let eventType = openingCurrency ? 'DRAWER_OPENED_WITH_CURRENCY' : 'DRAWER_OPENED';
    if (forceOpen) {
      eventType = 'DRAWER_OPENED_FORCED';
    }

    // Audit trail for drawer opening
    await AuditTrail.create([{
      event_id: Date.now(),
      user_id: userId,
      event_type: eventType,
      action: 'Drawer Opening',
      old_value: {
        status: previousStatus,
        balance: previousBalance,
        user_id: drawer.USER_ID
      },
      new_value: {
        status: 'OPEN',
        balance: finalOpeningBalance,
        user_id: userId
      },
      entity_type: 'Drawer',
      entity_id: drawer._id,
      description: `Drawer ${drawer.DRAWER_NO} opened by user ${userId}`,
      reference_no: `DRAWER-OPEN-${Date.now()}`,
      additional_info: {
        drawer_no: drawer.DRAWER_NO,
        opening_balance: finalOpeningBalance,
        opening_currency: openingCurrency,
        calculated_from_currency: !!openingCurrency,
        verified_by: verifiedBy,
        notes: notes,
        session_start: drawer.LAST_DRAWER_OPEN_DT,
        previous_closing_denom_id: drawer.CLOSING_CURRENCY_DENOMINATION,
        force_opened: forceOpen,
        drawer_custom_id: drawer.DRAWER_ID,
        auto_denomination_created: forceOpen
      },
      ip_address: ipAddress // ADDED: Required field for AuditTrail
    }], { session });

    await session.commitTransaction();

    // Log drawer opening
    logger.info(`Drawer ${drawer.DRAWER_NO} (ID: ${drawer.DRAWER_ID}) opened by user ${userId} with balance ${finalOpeningBalance}`);

    const response = {
      message: 'Drawer opened successfully',
      drawer: {
        id: drawer._id,
        DRAWER_ID: drawer.DRAWER_ID,
        drawerNo: drawer.DRAWER_NO,
        drawerName: drawer.DRAWER_NM,
        openingBalance: finalOpeningBalance,
        openedAt: drawer.LAST_DRAWER_OPEN_DT,
        userId: drawer.USER_ID,
        status: drawer.WF_STATUS,
        limits: {
          min: parseFloat(drawer.MIN_BAL.toString()),
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
    await session.abortTransaction();
    console.error('Error opening drawer:', error);
    res.status(500).json({ 
      message: 'Error opening drawer', 
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};

// Enhanced Close Drawer with Mandatory Currency Denomination Check
export const closeDrawer = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const { notes, verifiedBy, countedBy, closingCurrency } = req.body;

    if (!verifiedBy) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Verified by field is required' });
    }

    const numericId = parseInt(id, 10);
    const drawer = await Drawer.findOne({ DRAWER_ID: numericId }).session(session);
    if (!drawer) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Drawer not found' });
    }

    if (drawer.WF_STATUS === 'CLOSED') {
      await session.abortTransaction();
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
      
      // Update drawer's CLOSING_CURRENCY field (which exists in your model)
      drawer.CLOSING_CURRENCY = {
        OneThousandNaira: closingCurrency.OneThousandNaira || 0,
        FiveHundredNaira: closingCurrency.FiveHundredNaira || 0,
        TwoHundredNaira: closingCurrency.TwoHundredNaira || 0,
        OneHundredNaira: closingCurrency.OneHundredNaira || 0,
        FiftyNaira: closingCurrency.FiftyNaira || 0,
        TwentyNaira: closingCurrency.TwentyNaira || 0,
        TenNaira: closingCurrency.TenNaira || 0,
        FiveNaira: closingCurrency.FiveNaira || 0,
        TOTAL_CURRENCY_COUNT: Object.values(closingCurrency).reduce((sum, count) => sum + (count || 0), 0)
      };
    } else {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Closing currency must be provided to close the drawer.',
        requiresClosingCurrency: true,
        drawerId: drawer.DRAWER_ID
      });
    }

    // Calculate overage/shortage
    const expectedBalance = parseFloat(drawer.CURRENT_BALANCE.toString());
    const actualBalance = finalClosingBalance;
    const difference = actualBalance - expectedBalance;
    const overageAmt = Math.max(0, difference);
    const shortageAmt = Math.max(0, -difference);

    console.log(`Balance check - Expected: ${expectedBalance}, Actual: ${actualBalance}, Difference: ${difference}`);

    // Update drawer
    drawer.CURRENT_BALANCE = mongoose.Types.Decimal128.fromString(actualBalance.toFixed(2));
    drawer.OVERAGE_AMT = mongoose.Types.Decimal128.fromString(overageAmt.toFixed(2));
    drawer.SHORTAGE_AMT = mongoose.Types.Decimal128.fromString(shortageAmt.toFixed(2));
    drawer.WF_STATUS = 'CLOSED';
    drawer.LAST_DRAWER_CLOSE_DT = new Date();
    drawer.VERSION_NO += 1;
    drawer.SESSION_END_BALANCE = mongoose.Types.Decimal128.fromString(actualBalance.toFixed(2));
    
    if (notes) drawer.CLOSING_NOTES = notes;
    if (verifiedBy) drawer.CLOSING_VERIFIED_BY = verifiedBy;

    await drawer.save({ session });

    // Calculate session statistics
    const sessionStartBalance = parseFloat(drawer.SESSION_START_BALANCE?.toString() || '0');
    const totalDeposits = Math.max(0, actualBalance - sessionStartBalance + shortageAmt - overageAmt);
    const totalWithdrawals = Math.max(0, sessionStartBalance - expectedBalance);

    // Get IP for audit
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';

    // Audit trail
    await AuditTrail.create([{
      event_id: Date.now(),
      user_id: drawer.USER_ID,
      event_type: 'DRAWER_CLOSED_WITH_CURRENCY',
      action: 'Drawer Closeout',
      old_value: { 
        status: 'OPEN', 
        balance: expectedBalance,
        user_id: drawer.USER_ID
      },
      new_value: { 
        status: 'CLOSED', 
        balance: actualBalance,
        user_id: drawer.USER_ID
      },
      entity_type: 'Drawer',
      entity_id: drawer._id,
      description: `Drawer ${drawer.DRAWER_NO} closed by user ${drawer.USER_ID}`,
      reference_no: `DRAWER-CLOSE-${Date.now()}`,
      additional_info: {
        drawer_no: drawer.DRAWER_NO,
        expected_balance: expectedBalance,
        actual_balance: actualBalance,
        overage: overageAmt,
        shortage: shortageAmt,
        difference: difference,
        currency_breakdown: closingCurrency,
        verified_by: verifiedBy,
        counted_by: countedBy,
        notes: notes,
        session_start_balance: sessionStartBalance,
        session_end_balance: actualBalance,
        total_deposits: totalDeposits,
        total_withdrawals: totalWithdrawals,
        session_duration: calculateSessionDuration(drawer.LAST_DRAWER_OPEN_DT, drawer.LAST_DRAWER_CLOSE_DT),
        drawer_custom_id: drawer.DRAWER_ID
      },
      ip_address: ipAddress
    }], { session });

    await session.commitTransaction();
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
        id: drawer._id,
        DRAWER_ID: drawer.DRAWER_ID,
        drawerNo: drawer.DRAWER_NO,
        status: drawer.WF_STATUS,
        userId: drawer.USER_ID
      }
    };

    res.status(200).json(response);

  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Error closing drawer:', error);
    res.status(500).json({ 
      message: 'Error closing drawer', 
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};

// ULTRA-DEBUG createClosingDenominationDuringClose function
async function createClosingDenominationDuringClose(drawer, closingCurrency, verifiedBy, countedBy, notes, session) {
  try {
    console.log('=== CREATE CLOSING DENOMINATION DEBUG ===');
    console.log('Input closingCurrency:', JSON.stringify(closingCurrency, null, 2));
    
    const totalAmount = calculateTotalFromDenominations(closingCurrency);
    console.log(`Total amount calculated: ${totalAmount}`);
    
    // Create the denomination object
    const denominationData = {
      drawerCrncyId: new mongoose.Types.ObjectId(),
      drawerId: drawer._id,
      drawerCrncyDenomId: `DCD-CLOSE-${Date.now()}`,
      denominationType: 'CLOSING',
      currencyCount: closingCurrency,
      totalAmount: totalAmount,
      recordedBy: countedBy || verifiedBy,
      verifiedBy: verifiedBy,
      notes: notes || 'Created during drawer close operation',
      recordDate: new Date(),
      status: 'ACTIVE', // Explicitly set to ACTIVE
      createdBy: verifiedBy,
      createDt: new Date(),
      userId: verifiedBy,
      rowTs: new Date(),
      versionNo: 1,
      recSt: 'A'
    };
    
    console.log('Denomination data to save:', JSON.stringify(denominationData, null, 2));
    
    const closingDenom = new DrawerCurrencyDenomination(denominationData);
    console.log('Mongoose model created');
    
    const savedDenom = await closingDenom.save({ session });
    console.log('Denomination saved to database');
    console.log('Saved denomination ID:', savedDenom._id);
    console.log('Saved denomination status:', savedDenom.status);
    console.log('Saved denomination totalAmount:', savedDenom.totalAmount);
    
    return savedDenom;
  } catch (error) {
    console.error('❌ Error in createClosingDenominationDuringClose:', error);
    console.error('Error stack:', error.stack);
    throw new Error('Failed to create closing denomination: ' + error.message);
  }
}

// Export helper functions for testing
export {
  calculateTotalFromDenominations,
  calculateSessionDuration,
  createAutoClosingDenomination
};

// Update Drawer Currency (for mid-day adjustments)
export const updateDrawerCurrency = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const { 
      currencyUpdate, 
      reason, 
      userId 
    } = req.body;

    if (!currencyUpdate || !reason || !userId) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Currency update data, reason, and user ID are required' 
      });
    }

    const drawer = await Drawer.findById(id).session(session);
    if (!drawer) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Drawer not found' });
    }

    if (drawer.WF_STATUS !== 'OPEN') {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Drawer must be open to update currency' 
      });
    }

    const previousBalance = parseFloat(drawer.CURRENT_BALANCE.toString());
    const newBalance = calculateTotalFromDenominations(currencyUpdate);
    
    // Update drawer balance
    drawer.CURRENT_BALANCE = mongoose.Types.Decimal128.fromString(newBalance.toFixed(2));
    drawer.VERSION_NO += 1;

    await drawer.save({ session });

    // Audit trail for currency adjustment
    await AuditTrail.create([{
      event_id: Date.now(),
      user_id: userId,
      event_type: 'DRAWER_CURRENCY_ADJUSTMENT',
      action: 'Drawer Currency Adjustment',
      old_value: {
        balance: previousBalance
      },
      new_value: {
        balance: newBalance
      },
      entity_type: 'Drawer',
      entity_id: drawer._id,
      description: `Drawer currency adjusted: ${reason}`,
      reference_no: `DRAWER-ADJUST-${Date.now()}`,
      additional_info: {
        drawer_no: drawer.DRAWER_NO,
        previous_balance: previousBalance,
        new_balance: newBalance,
        adjustment_amount: newBalance - previousBalance,
        currency_update: currencyUpdate,
        reason: reason
      }
    }], { session });

    await session.commitTransaction();

    res.status(200).json({
      message: 'Drawer currency updated successfully',
      adjustment: {
        previousBalance: previousBalance,
        newBalance: newBalance,
        difference: newBalance - previousBalance,
        reason: reason
      },
      drawer: {
        id: drawer._id,
        drawerNo: drawer.DRAWER_NO,
        currentBalance: newBalance
      }
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error updating drawer currency:', error);
    res.status(500).json({ 
      message: 'Error updating drawer currency', 
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};

// Get Drawer Closeout Report
export const getDrawerCloseoutReport = async (req, res) => {
  try {
    const { id } = req.params;
    const drawer = await Drawer.findById(id);

    if (!drawer) {
      return res.status(404).json({ message: 'Drawer not found' });
    }

    if (drawer.WF_STATUS !== 'CLOSED') {
      return res.status(400).json({ 
        message: 'Drawer is not closed. Closeout report is only available for closed drawers.' 
      });
    }

    const sessionStartBalance = parseFloat(drawer.SESSION_START_BALANCE?.toString() || '0');
    const sessionEndBalance = parseFloat(drawer.SESSION_END_BALANCE?.toString() || '0');
    const expectedBalance = parseFloat(drawer.CURRENT_BALANCE.toString());
    const overage = parseFloat(drawer.OVERAGE_AMT.toString());
    const shortage = parseFloat(drawer.SHORTAGE_AMT.toString());

    const closeoutReport = {
      drawerInfo: {
        drawerNo: drawer.DRAWER_NO,
        drawerName: drawer.DRAWER_NM,
        userId: drawer.USER_ID,
        businessUnit: drawer.BU_ID,
        sessionStart: drawer.LAST_DRAWER_OPEN_DT,
        sessionEnd: drawer.LAST_DRAWER_CLOSE_DT,
        sessionDuration: calculateSessionDuration(drawer.LAST_DRAWER_OPEN_DT, drawer.LAST_DRAWER_CLOSE_DT)
      },
      financialSummary: {
        openingBalance: sessionStartBalance,
        closingBalance: sessionEndBalance,
        expectedBalance: expectedBalance,
        overage: overage,
        shortage: shortage,
        difference: sessionEndBalance - expectedBalance
      },
      verification: {
        verifiedBy: drawer.CLOSING_VERIFIED_BY,
        notes: drawer.CLOSING_NOTES,
        closingCurrency: drawer.CLOSING_CURRENCY
      },
      limits: {
        minBalance: parseFloat(drawer.MIN_BAL.toString()),
        maxBalance: parseFloat(drawer.MAX_BAL.toString()),
        insuredAmount: parseFloat(drawer.TOTAL_INSURED_AMT.toString()),
        limitExceeded: drawer.DRAWER_CASH_LIMIT_FG === 'Y'
      }
    };

    res.status(200).json({
      success: true,
      closeoutReport
    });
  } catch (error) {
    console.error('Error generating closeout report:', error);
    res.status(500).json({ 
      message: 'Error generating closeout report', 
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

// Main transaction processing function
export const processDrawerTransaction = async (req, res, session = null) => {
  let internalSession = session;
  let shouldEndSession = false;
  
  try {
    // If no session provided, create one
    if (!internalSession) {
      internalSession = await mongoose.startSession();
      internalSession.startTransaction();
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
      if (shouldEndSession) await internalSession.abortTransaction();
      return { 
        success: false,
        message: 'Missing required fields: drawerId, transactionType, amount' 
      };
    }

    // Use the helper function to find drawer by multiple identifiers
    const drawer = await findDrawerByIdentifier(drawerId, internalSession);
    if (!drawer) {
      if (shouldEndSession) await internalSession.abortTransaction();
      return { 
        success: false,
        message: 'Drawer not found' 
      };
    }

    // CRITICAL: Check if drawer is OPEN before processing transaction
    if (drawer.WF_STATUS !== 'OPEN') {
      if (shouldEndSession) await internalSession.abortTransaction();
      return { 
        success: false,
        message: 'Drawer is not open. Please open the drawer before processing transactions.',
        currentStatus: drawer.WF_STATUS,
        lastOpened: drawer.LAST_DRAWER_OPEN_DT,
        lastClosed: drawer.LAST_DRAWER_CLOSE_DT
      };
    }

    // Check if drawer is active
    if (drawer.REC_ST !== 'A') {
      if (shouldEndSession) await internalSession.abortTransaction();
      return { 
        success: false,
        message: 'Drawer is not active' 
      };
    }

    let updatedBalance;
    let transactionEffect;
    let transactionDescription = '';

    // Standard Banking Rules
    const normalizedType = transactionType.toUpperCase();
    
    switch (normalizedType) {
      case 'DEPOSIT': 
      case 'OPENING_DEPOSIT':
        // Customer DEPOSITS cash: CREDIT customer account, CREDIT drawer (cash IN)
        updatedBalance = parseFloat(drawer.CURRENT_BALANCE.toString()) + amount;
        transactionEffect = 'CREDIT';
        transactionDescription = normalizedType === 'OPENING_DEPOSIT' 
          ? 'Opening cash deposit' 
          : `Cash deposit from account ${customerAccount}`;
        break;

      case 'WITHDRAWAL': 
        // Customer WITHDRAWS cash: DEBIT customer account, DEBIT drawer (cash OUT)
        if (parseFloat(drawer.CURRENT_BALANCE.toString()) < amount) {
          if (shouldEndSession) await internalSession.abortTransaction();
          return { 
            success: false,
            message: `Insufficient drawer balance. Available: ₦${parseFloat(drawer.CURRENT_BALANCE.toString())}, Required: ₦${amount}` 
          };
        }
        updatedBalance = parseFloat(drawer.CURRENT_BALANCE.toString()) - amount;
        transactionEffect = 'DEBIT';
        transactionDescription = `Cash withdrawal to account ${customerAccount}`;
        break;

      case 'CASH_RECEIPT': 
        updatedBalance = parseFloat(drawer.CURRENT_BALANCE.toString()) + amount;
        transactionEffect = 'CREDIT';
        transactionDescription = description || 'Cash receipt';
        break;

      case 'CASH_DISBURSEMENT': 
        if (parseFloat(drawer.CURRENT_BALANCE.toString()) < amount) {
          if (shouldEndSession) await internalSession.abortTransaction();
          return { 
            success: false,
            message: `Insufficient drawer balance for disbursement. Available: ₦${parseFloat(drawer.CURRENT_BALANCE.toString())}, Required: ₦${amount}` 
          };
        }
        updatedBalance = parseFloat(drawer.CURRENT_BALANCE.toString()) - amount;
        transactionEffect = 'DEBIT';
        transactionDescription = description || 'Cash disbursement';
        break;

      default:
        if (shouldEndSession) await internalSession.abortTransaction();
        return { 
          success: false,
          message: 'Invalid transaction type' 
        };
    }

    // Check and update drawer limits
    let limitFlag = 'N';
    if (updatedBalance > drawer.MAX_BAL) {
      limitFlag = 'Y';
      drawer.DRAWER_LIMIT_EXCEED_TM += 1;
    } else if (updatedBalance < drawer.MIN_BAL) {
      limitFlag = 'Y';
    }

    // Update drawer balance and flags
    const previousBalance = parseFloat(drawer.CURRENT_BALANCE.toString());
    drawer.CURRENT_BALANCE = mongoose.Types.Decimal128.fromString(updatedBalance.toFixed(2));
    drawer.DRAWER_CASH_LIMIT_FG = limitFlag;
    drawer.VERSION_NO += 1;
    drawer.updatedAt = new Date();

    await drawer.save({ session: internalSession });

    // ✅ ADDED: Verify the update immediately after save
    const verifiedDrawer = await Drawer.findById(drawer._id).session(internalSession);
    console.log(`🔍 Drawer ${drawer.DRAWER_NO} balance after ${normalizedType}: ₦${parseFloat(verifiedDrawer.CURRENT_BALANCE.toString())}`);

    // Create transaction record
    const transactionRecord = {
      referenceNo: referenceNo || `TXN${Date.now()}`,
      drawerId: drawer._id,
      drawerNo: drawer.DRAWER_NO,
      transactionType: normalizedType,
      amount,
      customerAccount,
      description: transactionDescription,
      effect: transactionEffect,
      previousBalance,
      newBalance: updatedBalance,
      timestamp: new Date(),
      userId: userId || 'system',
      status: 'COMPLETED',
      drawerStatus: 'OPEN'
    };

    if (shouldEndSession) {
      await internalSession.commitTransaction();
    }

    return {
      success: true,
      message: 'Transaction processed successfully',
      transaction: transactionRecord,
      drawer: {
        id: drawer._id,
        drawerNo: drawer.DRAWER_NO,
        previousBalance,
        newBalance: updatedBalance,
        transactionEffect,
        limitExceeded: limitFlag === 'Y',
        status: drawer.WF_STATUS,
        CURRENT_BALANCE: updatedBalance
      }
    };

  } catch (error) {
    if (shouldEndSession && internalSession) {
      await internalSession.abortTransaction();
    }
    console.error('Transaction processing error:', error);
    return { 
      success: false,
      message: 'Error processing transaction', 
      error: error.message 
    };
  } finally {
    if (shouldEndSession && internalSession) {
      internalSession.endSession();
    }
  }
};

// Get currently open drawers for a user
export const getMyOpenDrawers = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const openDrawers = await Drawer.find({ 
      USER_ID: userId,
      WF_STATUS: 'OPEN' 
    }).sort({ LAST_DRAWER_OPEN_DT: -1 });
    
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
export const forceCloseAllDrawers = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { closedBy, reason } = req.body;
    
    const openDrawers = await Drawer.find({ WF_STATUS: 'OPEN' }).session(session);
    
    if (openDrawers.length === 0) {
      await session.abortTransaction();
      return res.status(200).json({ 
        message: 'No open drawers found' 
      });
    }

    const closeResults = [];
    
    for (const drawer of openDrawers) {
      // Store previous state for audit
      const previousBalance = parseFloat(drawer.CURRENT_BALANCE.toString());
      
      // Force close each drawer with current balance as closing balance
      drawer.WF_STATUS = 'CLOSED';
      drawer.LAST_DRAWER_CLOSE_DT = new Date();
      drawer.VERSION_NO += 1;
      drawer.FORCE_CLOSED = true;
      drawer.FORCE_CLOSE_REASON = reason || 'End of day force close';
      drawer.FORCE_CLOSED_BY = closedBy;
      drawer.SESSION_END_BALANCE = drawer.CURRENT_BALANCE;
      
      await drawer.save({ session });

      // Audit trail for force close
      await AuditTrail.create([{
        event_id: Date.now(),
        user_id: closedBy,
        event_type: 'DRAWER_FORCE_CLOSED',
        action: 'Drawer Force Closeout',
        old_value: {
          status: 'OPEN',
          balance: previousBalance
        },
        new_value: {
          status: 'CLOSED',
          balance: previousBalance
        },
        entity_type: 'Drawer',
        entity_id: drawer._id,
        description: `Drawer ${drawer.DRAWER_NO} force closed by ${closedBy}`,
        reference_no: `DRAWER-FORCE-CLOSE-${Date.now()}`,
        additional_info: {
          drawer_no: drawer.DRAWER_NO,
          reason: reason,
          closed_by: closedBy,
          final_balance: previousBalance
        }
      }], { session });
      
      closeResults.push({
        drawerNo: drawer.DRAWER_NO,
        userId: drawer.USER_ID,
        finalBalance: previousBalance,
        closedAt: drawer.LAST_DRAWER_CLOSE_DT
      });
    }

    await session.commitTransaction();
    
    logger.warn(`Force closed ${closeResults.length} drawers at end of day by ${closedBy}`);

    res.status(200).json({
      message: `Successfully force closed ${closeResults.length} drawers`,
      closedDrawers: closeResults,
      timestamp: new Date()
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error force closing drawers:', error);
    res.status(500).json({ 
      message: 'Error force closing drawers', 
      error: error.message 
    });
  } finally {
    session.endSession();
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
export const getDrawerTransactionHistory = async (req, res) => {
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
      drawer = await Drawer.findOne({ DRAWER_ID: drawerIdNum });
    } else {
      drawer = await Drawer.findOne({ DRAWER_NO: id });
    }

    if (!drawer) {
      return res.status(404).json({ message: 'Drawer not found' });
    }

    // Build filter for audit trail
    const filter = {
      entity_type: 'Drawer',
      entity_id: drawer._id
    };

    // Add date range filter if provided
    if (startDate || endDate) {
      filter.createDt = {};
      if (startDate) filter.createDt.$gte = new Date(startDate);
      if (endDate) filter.createDt.$lte = new Date(endDate);
    }

    // Add event type filter if provided
    if (eventType) {
      filter.event_type = eventType;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get audit trails for this drawer
    const auditTrails = await AuditTrail.find(filter)
      .sort({ createDt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const totalCount = await AuditTrail.countDocuments(filter);

    // Process audit trails to extract transaction information
    const transactions = auditTrails.map(audit => {
      const transaction = {
        id: audit._id,
        timestamp: audit.createDt,
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
          transaction.amount = audit.new_value?.balance || 0;
          transaction.previousBalance = audit.old_value?.balance || 0;
          transaction.newBalance = audit.new_value?.balance || 0;
          transaction.currency = audit.additional_info?.opening_currency;
          transaction.verifiedBy = audit.additional_info?.verified_by;
          break;

        case 'DRAWER_CLOSED_WITH_CURRENCY':
          transaction.type = 'CLOSING';
          transaction.impact = 'BALANCE_SET';
          transaction.amount = audit.new_value?.balance || 0;
          transaction.previousBalance = audit.old_value?.balance || 0;
          transaction.newBalance = audit.new_value?.balance || 0;
          transaction.expectedBalance = audit.additional_info?.expected_balance;
          transaction.difference = audit.additional_info?.difference;
          transaction.overage = audit.additional_info?.overage;
          transaction.shortage = audit.additional_info?.shortage;
          transaction.currency = audit.additional_info?.currency_breakdown;
          transaction.verifiedBy = audit.additional_info?.verified_by;
          transaction.countedBy = audit.additional_info?.counted_by;
          break;

        case 'DRAWER_FORCE_CLOSED':
          transaction.type = 'FORCE_CLOSING';
          transaction.impact = 'BALANCE_SET';
          transaction.amount = audit.new_value?.balance || 0;
          transaction.previousBalance = audit.old_value?.balance || 0;
          transaction.newBalance = audit.new_value?.balance || 0;
          transaction.reason = audit.additional_info?.reason;
          break;

        case 'DRAWER_CURRENCY_ADJUSTMENT':
          transaction.type = 'ADJUSTMENT';
          transaction.impact = 'BALANCE_ADJUSTED';
          transaction.amount = audit.additional_info?.adjustment_amount || 0;
          transaction.previousBalance = audit.old_value?.balance || 0;
          transaction.newBalance = audit.new_value?.balance || 0;
          transaction.reason = audit.additional_info?.reason;
          transaction.currency = audit.additional_info?.currency_update;
          break;

        case 'TRANSACTION_PROCESSED':
          transaction.type = 'TRANSACTION';
          transaction.impact = audit.additional_info?.effect === 'CREDIT' ? 'BALANCE_INCREASE' : 'BALANCE_DECREASE';
          transaction.amount = audit.additional_info?.amount || 0;
          transaction.previousBalance = audit.additional_info?.previous_balance || 0;
          transaction.newBalance = audit.additional_info?.new_balance || 0;
          transaction.transactionType = audit.additional_info?.transaction_type;
          transaction.customerAccount = audit.additional_info?.customer_account;
          transaction.referenceNo = audit.additional_info?.reference_no;
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
        id: drawer._id,
        DRAWER_ID: drawer.DRAWER_ID,
        DRAWER_NO: drawer.DRAWER_NO,
        DRAWER_NM: drawer.DRAWER_NM,
        currentBalance: parseFloat(drawer.CURRENT_BALANCE.toString()),
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
export const getDrawerTransactionSummary = async (req, res) => {
  try {
    const { id } = req.params;
    const { period = 'daily', startDate, endDate } = req.query;

    // Find drawer
    let drawer;
    const drawerIdNum = parseInt(id);
    if (!isNaN(drawerIdNum)) {
      drawer = await Drawer.findOne({ DRAWER_ID: drawerIdNum });
    } else {
      drawer = await Drawer.findOne({ DRAWER_NO: id });
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
    const auditTrails = await AuditTrail.find({
      entity_type: 'Drawer',
      entity_id: drawer._id,
      createDt: { $gte: start, $lte: end }
    }).sort({ createDt: 1 }).lean();

    // Group by period
    const summary = {};
    auditTrails.forEach(audit => {
      let periodKey;
      const date = new Date(audit.createDt);
      
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
          const adjAmount = audit.additional_info?.adjustment_amount || 0;
          if (adjAmount > 0) {
            summary[periodKey].credits += adjAmount;
          } else {
            summary[periodKey].debits += Math.abs(adjAmount);
          }
          summary[periodKey].netMovement += adjAmount;
          break;
        case 'TRANSACTION_PROCESSED':
          summary[periodKey].transactions++;
          const txnAmount = audit.additional_info?.amount || 0;
          if (audit.additional_info?.effect === 'CREDIT') {
            summary[periodKey].credits += txnAmount;
          } else {
            summary[periodKey].debits += txnAmount;
          }
          summary[periodKey].netMovement += (audit.additional_info?.effect === 'CREDIT' ? txnAmount : -txnAmount);
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
export const getDrawerEnquiry = async (req, res) => {
  try {
    const { id } = req.params;
    const { includeTransactions = 'false' } = req.query;

    // Find drawer by DRAWER_ID or DRAWER_NO
    let drawer;
    const drawerIdNum = parseInt(id);
    if (!isNaN(drawerIdNum)) {
      drawer = await Drawer.findOne({ DRAWER_ID: drawerIdNum });
    } else {
      drawer = await Drawer.findOne({ DRAWER_NO: id });
    }

    if (!drawer) {
      return res.status(404).json({ message: 'Drawer not found' });
    }

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
        currentBalance: parseFloat(drawer.CURRENT_BALANCE.toString()),
        minBalance: parseFloat(drawer.MIN_BAL.toString()),
        maxBalance: parseFloat(drawer.MAX_BAL.toString()),
        availableBalance: Math.max(0, parseFloat(drawer.CURRENT_BALANCE.toString()) - parseFloat(drawer.MIN_BAL.toString())),
        totalInsuredAmt: parseFloat(drawer.TOTAL_INSURED_AMT.toString()),
        overageAmt: parseFloat(drawer.OVERAGE_AMT.toString()),
        shortageAmt: parseFloat(drawer.SHORTAGE_AMT.toString())
      },
      sessionInfo: {
        lastOpened: drawer.LAST_DRAWER_OPEN_DT,
        lastClosed: drawer.LAST_DRAWER_CLOSE_DT,
        sessionStartBalance: parseFloat(drawer.SESSION_START_BALANCE?.toString() || '0'),
        sessionEndBalance: parseFloat(drawer.SESSION_END_BALANCE?.toString() || '0'),
        sessionDuration: calculateSessionDuration(drawer.LAST_DRAWER_OPEN_DT, drawer.LAST_DRAWER_CLOSE_DT)
      },
      limitsInfo: {
        drawerCashLimitFlag: drawer.DRAWER_CASH_LIMIT_FG,
        drawerLimitExceedCount: drawer.DRAWER_LIMIT_EXCEED_TM,
        drawerInsuredLimitFlag: drawer.DRAWER_INSURED_LIMIT_FG,
        isOverLimit: parseFloat(drawer.CURRENT_BALANCE.toString()) > parseFloat(drawer.MAX_BAL.toString()),
        isUnderLimit: parseFloat(drawer.CURRENT_BALANCE.toString()) < parseFloat(drawer.MIN_BAL.toString())
      },
      currencyInfo: {
        openingCurrency: drawer.OPENING_CURRENCY,
        closingCurrency: drawer.CLOSING_CURRENCY
      },
      operationalInfo: {
        canProcessTransactions: drawer.WF_STATUS === 'OPEN' && drawer.REC_ST === 'A',
        requiresClosingDenomination: drawer.WF_STATUS === 'CLOSED' && drawer.LAST_DRAWER_CLOSE_DT && !drawer.CLOSING_CURRENCY_DENOMINATION,
        versionNo: drawer.VERSION_NO,
        createdDate: drawer.CREATE_DT,
        lastUpdated: drawer.SYS_CREATE_TS
      }
    };

    // Include recent transactions if requested
    if (includeTransactions === 'true') {
      const recentTransactions = await AuditTrail.find({
        entity_type: 'Drawer',
        entity_id: drawer._id,
        event_type: { 
          $in: [
            'TRANSACTION_PROCESSED',
            'DRAWER_TO_DRAWER_TRANSFER',
            'DRAWER_TO_VAULT_TRANSFER',
            'DRAWER_CURRENCY_ADJUSTMENT'
          ]
        }
      })
      .sort({ createDt: -1 })
      .limit(10)
      .lean();

      enquiryData.recentTransactions = recentTransactions.map(txn => ({
        timestamp: txn.createDt,
        eventType: txn.event_type,
        action: txn.action,
        amount: txn.additional_info?.amount,
        referenceNo: txn.reference_no,
        description: txn.description
      }));
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
export const getMultipleDrawersEnquiry = async (req, res) => {
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
        drawer = await Drawer.findOne({ DRAWER_ID: drawerIdNum });
      } else {
        drawer = await Drawer.findOne({ DRAWER_NO: drawerId });
      }

      if (drawer) {
        drawersEnquiry.push({
          DRAWER_ID: drawer.DRAWER_ID,
          DRAWER_NO: drawer.DRAWER_NO,
          DRAWER_NM: drawer.DRAWER_NM,
          USER_ID: drawer.USER_ID,
          STATUS: drawer.WF_STATUS,
          currentBalance: parseFloat(drawer.CURRENT_BALANCE.toString()),
          minBalance: parseFloat(drawer.MIN_BAL.toString()),
          maxBalance: parseFloat(drawer.MAX_BAL.toString()),
          availableBalance: Math.max(0, parseFloat(drawer.CURRENT_BALANCE.toString()) - parseFloat(drawer.MIN_BAL.toString())),
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

export const processDrawerToDrawerTransfer = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

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
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Missing required fields: sourceDrawerId, targetDrawerId, amount, userId' 
      });
    }

    if (sourceDrawerId === targetDrawerId) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Source and target drawer cannot be the same' 
      });
    }

    // Find both drawers
    const sourceDrawer = await findDrawerByIdentifier(sourceDrawerId, session);
    const targetDrawer = await findDrawerByIdentifier(targetDrawerId, session);

    if (!sourceDrawer) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Source drawer not found' });
    }

    if (!targetDrawer) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Target drawer not found' });
    }

    // Validate drawer statuses
    if (sourceDrawer.WF_STATUS !== 'OPEN') {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Source drawer must be open for transfer',
        currentStatus: sourceDrawer.WF_STATUS
      });
    }

    if (targetDrawer.WF_STATUS !== 'OPEN') {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Target drawer must be open for transfer',
        currentStatus: targetDrawer.WF_STATUS
      });
    }

    // Check source drawer balance
    const sourceBalance = parseFloat(sourceDrawer.CURRENT_BALANCE.toString());
    if (sourceBalance < amount) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: `Insufficient balance in source drawer. Available: ${sourceBalance}, Required: ${amount}` 
      });
    }

    // Check target drawer limits
    const targetBalance = parseFloat(targetDrawer.CURRENT_BALANCE.toString());
    const targetMaxBalance = parseFloat(targetDrawer.MAX_BAL.toString());
    if (targetBalance + amount > targetMaxBalance) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: `Transfer would exceed target drawer maximum balance. Current: ${targetBalance}, Max: ${targetMaxBalance}, After Transfer: ${targetBalance + amount}` 
      });
    }

    // Store previous balances for audit
    const sourcePreviousBalance = sourceBalance;
    const targetPreviousBalance = targetBalance;

    // Update balances
    sourceDrawer.CURRENT_BALANCE = mongoose.Types.Decimal128.fromString((sourceBalance - amount).toFixed(2));
    targetDrawer.CURRENT_BALANCE = mongoose.Types.Decimal128.fromString((targetBalance + amount).toFixed(2));

    // Update version numbers
    sourceDrawer.VERSION_NO += 1;
    targetDrawer.VERSION_NO += 1;

    // Check and update limit flags
    updateDrawerLimitFlags(sourceDrawer);
    updateDrawerLimitFlags(targetDrawer);

    await sourceDrawer.save({ session });
    await targetDrawer.save({ session });

    // Get IP for audit
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';

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
        old_value: {
          balance: sourcePreviousBalance,
          status: sourceDrawer.WF_STATUS
        },
        new_value: {
          balance: sourceBalance - amount,
          status: sourceDrawer.WF_STATUS
        },
        entity_type: 'Drawer',
        entity_id: sourceDrawer._id,
        description: `Transfer to drawer ${targetDrawer.DRAWER_NO}: ${description || 'Drawer to drawer transfer'}`,
        reference_no: referenceNo || `D2D-${Date.now()}`,
        additional_info: {
          source_drawer_no: sourceDrawer.DRAWER_NO,
          target_drawer_no: targetDrawer.DRAWER_NO,
          amount: amount,
          currency_breakdown: currencyBreakdown,
          transfer_type: 'DEBIT',
          verified_by: verifiedBy,
          previous_balance: sourcePreviousBalance,
          new_balance: sourceBalance - amount,
          net_change: -amount
        },
        ip_address: ipAddress,
        created_at: new Date(),
        updated_at: new Date()
      },
      // Target drawer audit
      {
        event_id: baseEventId + 1,
        user_id: userId,
        event_type: 'DRAWER_TO_DRAWER_TRANSFER',
        action: 'Drawer to Drawer Transfer - CREDIT',
        old_value: {
          balance: targetPreviousBalance,
          status: targetDrawer.WF_STATUS
        },
        new_value: {
          balance: targetBalance + amount,
          status: targetDrawer.WF_STATUS
        },
        entity_type: 'Drawer',
        entity_id: targetDrawer._id,
        description: `Transfer from drawer ${sourceDrawer.DRAWER_NO}: ${description || 'Drawer to drawer transfer'}`,
        reference_no: referenceNo || `D2D-${Date.now()}`,
        additional_info: {
          source_drawer_no: sourceDrawer.DRAWER_NO,
          target_drawer_no: targetDrawer.DRAWER_NO,
          amount: amount,
          currency_breakdown: currencyBreakdown,
          transfer_type: 'CREDIT',
          verified_by: verifiedBy,
          previous_balance: targetPreviousBalance,
          new_balance: targetBalance + amount,
          net_change: amount
        },
        ip_address: ipAddress,
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    // FIX: Added ordered: true to fix the session error
    await AuditTrail.create(auditTrails, { session, ordered: true });

    await session.commitTransaction();

    // Log the transfer
    logger.info(`Drawer to drawer transfer: ${sourceDrawer.DRAWER_NO} -> ${targetDrawer.DRAWER_NO}, Amount: ${amount}, User: ${userId}`);

    res.status(200).json({
      message: 'Drawer to drawer transfer completed successfully',
      transfer: {
        referenceNo: referenceNo || `D2D-${Date.now()}`,
        timestamp: new Date(),
        amount: amount,
        sourceDrawer: {
          drawerNo: sourceDrawer.DRAWER_NO,
          previousBalance: sourcePreviousBalance,
          newBalance: sourceBalance - amount,
          netChange: -amount
        },
        targetDrawer: {
          drawerNo: targetDrawer.DRAWER_NO,
          previousBalance: targetPreviousBalance,
          newBalance: targetBalance + amount,
          netChange: amount
        },
        currencyBreakdown: currencyBreakdown,
        verifiedBy: verifiedBy,
        processedBy: userId
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error in drawer to drawer transfer:', error);
    
    // Log the full error for debugging
    logger.error(`Drawer to drawer transfer error: ${error.message}`, {
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
    session.endSession();
  }
};

// =============================================
// DRAWER TO VAULT TRANSACTION
// =============================================

export const processDrawerToVaultTransfer = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

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
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Missing required fields: drawerId, vaultId, amount, transferType, userId' 
      });
    }

    // Find drawer
    const drawer = await findDrawerByIdentifier(drawerId, session);
    if (!drawer) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Drawer not found' });
    }

    // Validate drawer status
    if (drawer.WF_STATUS !== 'OPEN') {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Drawer must be open for vault transfer',
        currentStatus: drawer.WF_STATUS
      });
    }

    const drawerBalance = parseFloat(drawer.CURRENT_BALANCE.toString());
    const previousBalance = drawerBalance;

    let newBalance;
    let transactionEffect;
    let transferDescription;

    // Process based on transfer type
    if (transferType.toUpperCase() === 'DEPOSIT') {
      // Drawer -> Vault: Decrease drawer balance
      if (drawerBalance < amount) {
        await session.abortTransaction();
        return res.status(400).json({ 
          message: `Insufficient drawer balance for vault deposit. Available: ${drawerBalance}, Required: ${amount}` 
        });
      }
      newBalance = drawerBalance - amount;
      transactionEffect = 'DEBIT';
      transferDescription = `Vault deposit to ${vaultId}`;
    } else if (transferType.toUpperCase() === 'WITHDRAWAL') {
      // Vault -> Drawer: Increase drawer balance
      const drawerMaxBalance = parseFloat(drawer.MAX_BAL.toString());
      if (drawerBalance + amount > drawerMaxBalance) {
        await session.abortTransaction();
        return res.status(400).json({ 
          message: `Vault withdrawal would exceed drawer maximum balance. Current: ${drawerBalance}, Max: ${drawerMaxBalance}, After Withdrawal: ${drawerBalance + amount}` 
        });
      }
      newBalance = drawerBalance + amount;
      transactionEffect = 'CREDIT';
      transferDescription = `Vault withdrawal from ${vaultId}`;
    } else {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Invalid transfer type. Must be DEPOSIT or WITHDRAWAL' 
      });
    }

    // Update drawer balance
    drawer.CURRENT_BALANCE = mongoose.Types.Decimal128.fromString(newBalance.toFixed(2));
    drawer.VERSION_NO += 1;
    updateDrawerLimitFlags(drawer);

    await drawer.save({ session });

    // Get IP for audit
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';

    // Create audit trail
    await AuditTrail.create([{
      event_id: Date.now(),
      user_id: userId,
      event_type: 'DRAWER_TO_VAULT_TRANSFER',
      action: `Drawer to Vault Transfer - ${transactionEffect}`,
      old_value: {
        balance: previousBalance,
        status: drawer.WF_STATUS
      },
      new_value: {
        balance: newBalance,
        status: drawer.WF_STATUS
      },
      entity_type: 'Drawer',
      entity_id: drawer._id,
      description: `${transferDescription}: ${description || 'Drawer to vault transfer'}`,
      reference_no: referenceNo || `D2V-${Date.now()}`,
      additional_info: {
        drawer_no: drawer.DRAWER_NO,
        vault_id: vaultId,
        amount: amount,
        transfer_type: transferType.toUpperCase(),
        transaction_effect: transactionEffect,
        currency_breakdown: currencyBreakdown,
        verified_by: verifiedBy,
        previous_balance: previousBalance,
        new_balance: newBalance,
        net_change: transactionEffect === 'CREDIT' ? amount : -amount
      },
      ip_address: ipAddress
    }], { session });

    await session.commitTransaction();

    // Log the vault transfer
    logger.info(`Drawer to vault transfer: ${drawer.DRAWER_NO} <-> ${vaultId}, Type: ${transferType}, Amount: ${amount}, User: ${userId}`);

    res.status(200).json({
      message: `Drawer to vault ${transferType.toLowerCase()} completed successfully`,
      transfer: {
        referenceNo: referenceNo || `D2V-${Date.now()}`,
        timestamp: new Date(),
        amount: amount,
        transferType: transferType.toUpperCase(),
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
    await session.abortTransaction();
    console.error('Error in drawer to vault transfer:', error);
    res.status(500).json({ 
      message: 'Error processing drawer to vault transfer', 
      error: error.message 
    });
  } finally {
    session.endSession();
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
function updateDrawerLimitFlags(drawer) {
  const balance = parseFloat(drawer.CURRENT_BALANCE.toString());
  const minBalance = parseFloat(drawer.MIN_BAL.toString());
  const maxBalance = parseFloat(drawer.MAX_BAL.toString());
  
  if (balance > maxBalance) {
    drawer.DRAWER_CASH_LIMIT_FG = 'Y';
    drawer.DRAWER_LIMIT_EXCEED_TM += 1;
  } else if (balance < minBalance) {
    drawer.DRAWER_CASH_LIMIT_FG = 'Y';
  } else {
    drawer.DRAWER_CASH_LIMIT_FG = 'N';
  }
  
  // Check insured amount limit
  const insuredAmount = parseFloat(drawer.TOTAL_INSURED_AMT.toString());
  if (balance > insuredAmount) {
    drawer.DRAWER_INSURED_LIMIT_FG = 'Y';
  } else {
    drawer.DRAWER_INSURED_LIMIT_FG = 'N';
  }
}

// =============================================
// BULK DRAWER OPERATIONS
// =============================================

// Get summary of all drawers for dashboard
export const getDrawersSummary = async (req, res) => {
  try {
    const { businessUnit, status } = req.query;
    
    const filter = {};
    if (businessUnit) filter.BU_ID = businessUnit;
    if (status) filter.WF_STATUS = status;
    
    const drawers = await Drawer.find(filter);
    
    const summary = {
      totalDrawers: drawers.length,
      openDrawers: drawers.filter(d => d.WF_STATUS === 'OPEN').length,
      closedDrawers: drawers.filter(d => d.WF_STATUS === 'CLOSED').length,
      totalBalance: drawers.reduce((sum, d) => sum + parseFloat(d.CURRENT_BALANCE.toString()), 0),
      totalInsuredAmount: drawers.reduce((sum, d) => sum + parseFloat(d.TOTAL_INSURED_AMT.toString()), 0),
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
      userBreakdown[userId].totalBalance += parseFloat(drawer.CURRENT_BALANCE.toString());
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
export const postDrawerTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

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
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: drawerId, transactionType, amount'
      });
    }

    let drawer;

    // Handle different drawer ID formats
    if (mongoose.Types.ObjectId.isValid(drawerId)) {
      // Search by MongoDB ObjectId
      drawer = await Drawer.findById(drawerId).session(session);
    } else {
      // Search by DRAWER_NO or DRAWER_ID
      const numericId = parseInt(drawerId);
      if (!isNaN(numericId)) {
        // Try DRAWER_ID first (numeric)
        drawer = await Drawer.findOne({ DRAWER_ID: numericId }).session(session);
        
        // If not found by DRAWER_ID, try DRAWER_NO
        if (!drawer) {
          drawer = await Drawer.findOne({ DRAWER_NO: drawerId.toString() }).session(session);
        }
      } else {
        // Try DRAWER_NO (string)
        drawer = await Drawer.findOne({ DRAWER_NO: drawerId }).session(session);
      }
    }

    if (!drawer) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: `Drawer not found for identifier: ${drawerId}`,
        suggestion: 'Use DRAWER_NO (e.g., "1001"), DRAWER_ID (e.g., 1), or MongoDB ObjectId'
      });
    }

    console.log(`✅ Found drawer: ${drawer.DRAWER_NO} (${drawer.DRAWER_NM})`);

    // Check if drawer is open and active
    if (drawer.WF_STATUS !== 'OPEN') {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Drawer is not open. Please open the drawer before processing transactions.',
        currentStatus: drawer.WF_STATUS,
        drawerNo: drawer.DRAWER_NO
      });
    }

    if (drawer.REC_ST !== 'A') {
      await session.abortTransaction();
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
        drawerId: drawer._id.toString(), // Use the actual ObjectId
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

    const result = await processDrawerTransaction(transactionReq, res, session);

    if (result.success) {
      await session.commitTransaction();
      
      res.status(200).json({
        success: true,
        message: 'Drawer transaction posted successfully',
        data: {
          transaction: result.transaction,
          drawer: {
            drawerId: drawer._id,
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
      await session.abortTransaction();
      res.status(400).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }

  } catch (error) {
    await session.abortTransaction();
    console.error('Error posting drawer transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to post drawer transaction',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// POST /api/drawer/transactions/post-bulk
export const postBulkDrawerTransactions = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactions } = req.body;

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Transactions array is required and cannot be empty'
      });
    }

    if (transactions.length > 50) {
      await session.abortTransaction();
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

        const result = await processDrawerTransaction(transactionReq, res, session);

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
      await session.commitTransaction();
      
      res.status(207).json({
        success: true,
        message: `Processed ${results.successful.length} successful and ${results.failed.length} failed transactions`,
        data: results
      });
    } else {
      await session.abortTransaction();
      res.status(400).json({
        success: false,
        message: 'No transactions were processed successfully',
        data: results
      });
    }

  } catch (error) {
    await session.abortTransaction();
    console.error('Error posting bulk drawer transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process bulk drawer transactions',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// GET /api/drawer/transactions/:transactionId
export const getDrawerTransactionById = async (req, res) => {
  try {
    const { transactionId } = req.params;

    // Search in AuditTrail for the transaction
    const transaction = await AuditTrail.findOne({
      $or: [
        { reference_no: transactionId },
        { 'additional_info.transactionId': transactionId },
        { _id: transactionId }
      ],
      entity_type: 'Drawer'
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        transaction: {
          id: transaction._id,
          referenceNo: transaction.reference_no,
          eventType: transaction.event_type,
          action: transaction.action,
          amount: transaction.additional_info?.amount,
          description: transaction.description,
          status: transaction.status,
          timestamp: transaction.timestamp,
          userId: transaction.user_id,
          drawerId: transaction.entity_id,
          oldValue: transaction.old_value,
          newValue: transaction.new_value,
          additionalInfo: transaction.additional_info
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
export const reverseDrawerTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactionId } = req.params;
    const { reason, userId } = req.body;

    if (!reason) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Reversal reason is required'
      });
    }

    // Find the original transaction
    const originalTransaction = await AuditTrail.findOne({
      $or: [
        { reference_no: transactionId },
        { 'additional_info.transactionId': transactionId },
        { _id: transactionId }
      ],
      entity_type: 'Drawer'
    }).session(session);

    if (!originalTransaction) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Original transaction not found'
      });
    }

    // Check if already reversed
    const existingReversal = await AuditTrail.findOne({
      'additional_info.reversedTransactionId': transactionId
    }).session(session);

    if (existingReversal) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Transaction has already been reversed'
      });
    }

    const drawer = await Drawer.findById(originalTransaction.entity_id).session(session);
    if (!drawer) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Drawer not found'
      });
    }

    // Calculate reversal amount (opposite of original)
    const originalAmount = parseFloat(originalTransaction.additional_info?.amount || 0);
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
        drawerId: drawer._id.toString(),
        transactionType: reversalType,
        amount: Math.abs(reversalAmount),
        customerAccount: originalTransaction.additional_info?.customerAccount,
        referenceNo: `REV${originalTransaction.reference_no}`,
        description: `Reversal: ${originalTransaction.description} - Reason: ${reason}`,
        userId: userId || req.user?.id || 'system'
      }
    };

    const reversalResult = await processDrawerTransaction(reversalReq, res, session);

    if (!reversalResult.success) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Failed to process reversal: ${reversalResult.message}`
      });
    }

    // Create reversal audit record
    const reversalAudit = new AuditTrail({
      event_id: Date.now(),
      user_id: userId || req.user?.id || 'system',
      event_type: `REVERSAL_${originalTransaction.event_type}`,
      action: `Reversal: ${originalTransaction.action}`,
      old_value: reversalResult.drawer ? { 
        DRAWER_BALANCE: reversalResult.drawer.previousBalance 
      } : {},
      new_value: reversalResult.drawer ? { 
        DRAWER_BALANCE: reversalResult.drawer.newBalance 
      } : {},
      ip_address: req.ip || 'unknown',
      timestamp: new Date(),
      entity_type: 'Drawer',
      entity_id: drawer._id,
      status: 'COMPLETED',
      description: `Reversal of transaction ${originalTransaction.reference_no} - ${reason}`,
      reference_no: reversalReq.body.referenceNo,
      additional_info: {
        originalTransactionId: transactionId,
        originalReferenceNo: originalTransaction.reference_no,
        reversalReason: reason,
        amount: Math.abs(reversalAmount),
        reversedBy: userId || req.user?.id || 'system'
      }
    });

    await reversalAudit.save({ session });

    await session.commitTransaction();

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
    await session.abortTransaction();
    console.error('Error reversing drawer transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reverse transaction',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// Export all new functions
export {
  findDrawerByIdentifier,
  updateDrawerLimitFlags
};
