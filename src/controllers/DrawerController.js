// controllers/DrawerController.js - COMPLETE SEQUELIZE VERSION (NO MONGOOSE)

import logger from '../utils/logger.js';
import DrawerCurrencyDenomination from '../models/DrawerCurrencyDenomination.js';
import Branch from '../models/Branch.js';
import sequelize from '../../config/db.js';
import { drawerAuditHelper } from '../models/AuditTrail.js';
import Drawer from '../models/Drawer.js';
import { Op } from 'sequelize';
import VaultTransaction from '../models/VaultTransaction.js';
import Vault from '../models/Vault.js';

// ============================================
// HELPER FUNCTIONS
// ============================================

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

// ============================================
// ✅ FIND DRAWER BY IDENTIFIER - SEQUELIZE VERSION
// ============================================
const findDrawerByIdentifier = async (identifier, transaction = null) => {
  try {
    const options = {
      where: {
        [Op.or]: [
          { DRAWER_ID: identifier },
          { DRAWER_NO: identifier },
          { id: parseInt(identifier) || 0 }
        ]
      }
    };
    
    if (transaction) {
      options.transaction = transaction;
    }
    
    return await Drawer.findOne(options);
  } catch (error) {
    console.error('Error finding drawer by identifier:', error);
    return null;
  }
};

// ============================================
// ✅ Helper function to create auto-closing denomination
// ============================================
async function createAutoClosingDenomination(drawer, userId, transaction) {
  try {
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 10000);
    const drawerCrncyDenomId = `DCD_AUTO_${timestamp}_${randomSuffix}`;
    const drawerCrncyId = Math.floor(Date.now() / 1000);
    
    const closingDenomData = {
      drawerCrncyId: drawerCrncyId,
      drawerId: drawer.id,
      drawerCrncyDenomId: drawerCrncyDenomId,
      denomCountType: 'T',
      recSt: 'A',
      versionNo: 1,
      rowTs: new Date(),
      userId: userId,
      createDt: new Date(),
      sysCreateTs: new Date(),
      createdBy: userId,
      denomCount: [
        { denomId: 1000, count: 0, amount: 0, Total: 0 },
        { denomId: 500, count: 0, amount: 0, Total: 0 },
        { denomId: 200, count: 0, amount: 0, Total: 0 },
        { denomId: 100, count: 0, amount: 0, Total: 0 },
        { denomId: 50, count: 0, amount: 0, Total: 0 },
        { denomId: 20, count: 0, amount: 0, Total: 0 },
        { denomId: 10, count: 0, amount: 0, Total: 0 },
        { denomId: 5, count: 0, amount: 0, Total: 0 }
      ],
      totalAmount: 0
    };
    
    console.log('📝 Creating auto-closing denomination with data:', closingDenomData);
    
    const savedDenom = await DrawerCurrencyDenomination.create(closingDenomData, { transaction });
    console.log(`✅ Auto-closing denomination created: ${savedDenom.drawerCrncyDenomId}`);
    return savedDenom;
  } catch (error) {
    console.error('❌ Error creating auto-closing denomination:', error);
    console.error('Error details:', error.message);
    return null;
  }
}

// Helper function to get Drawer model
let drawerModel = null;

const getDrawerModel = async () => {
  if (drawerModel) return drawerModel;
  
  try {
    const { default: Drawer } = await import('../models/Drawer.js');
    drawerModel = Drawer;
    return Drawer;
  } catch (error) {
    console.error('❌ Failed to load Drawer model:', error);
    throw error;
  }
};

// ============================================
// CREATE DRAWER
// ============================================
export const createDrawer = async (req, res) => {
  console.log('🔄 createDrawer function called');
  
  let sequelizeInstance;
  
  try {
    sequelizeInstance = req.sequelize || sequelize;
    
    if (!sequelizeInstance) {
      console.error('❌ No sequelize instance available');
      return res.status(500).json({ 
        success: false,
        message: 'Database connection not available'
      });
    }

    const transaction = await sequelizeInstance.transaction();
    let drawerCreated = false;
    let newDrawer = null;
    
    try {
      const {
        DRAWER_ID,
        DRAWER_NO,
        DRAWER_TY_CD = 'TELLER',
        DRAWER_NM,
        TOTAL_INSURED_AMT = 0,
        MIN_BAL = 0,
        MAX_BAL = 0,
        REC_ST = 'A',
        USER_ID = 'SYSTEM',
        BU_ID = 'DEFAULT',
        GL_ACCT_NO = null,
        BRANCH_CODE = null,
        VAULT_TYPE = 'BRANCH_VAULT',
        SECURITY_LEVEL = 'LEVEL_2',
        REQUIRES_DUAL_CONTROL = true
      } = req.body;

      console.log('📝 Received drawer data:', { DRAWER_NO, DRAWER_NM, DRAWER_TY_CD, USER_ID, BU_ID });

      const Drawer = await getDrawerModel();

      if (!DRAWER_NO) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'DRAWER_NO is required' });
      }

      const existingDrawer = await Drawer.findOne({ 
        where: { DRAWER_NO },
        transaction 
      });
      
      if (existingDrawer) {
        await transaction.rollback();
        return res.status(409).json({ 
          success: false,
          message: `Drawer number ${DRAWER_NO} already exists`
        });
      }

      let drawerIdValue = DRAWER_ID;
      if (!drawerIdValue) {
        const maxDrawer = await Drawer.findOne({
          attributes: ['DRAWER_ID'],
          order: [['DRAWER_ID', 'DESC']],
          limit: 1,
          transaction
        });
        drawerIdValue = maxDrawer ? parseInt(maxDrawer.DRAWER_ID) + 1 : 1001;
      }

      const newDrawerData = {
        DRAWER_ID: drawerIdValue.toString(),
        DRAWER_NO: DRAWER_NO.toString(),
        DRAWER_NM: DRAWER_NM || `Drawer ${DRAWER_NO}`,
        DRAWER_TY_CD: DRAWER_TY_CD,
        VAULT_TYPE: VAULT_TYPE,
        SECURITY_LEVEL: SECURITY_LEVEL,
        REQUIRES_DUAL_CONTROL: REQUIRES_DUAL_CONTROL,
        TOTAL_INSURED_AMT: parseFloat(TOTAL_INSURED_AMT) || 0,
        MIN_BAL: parseFloat(MIN_BAL) || 0,
        MAX_BAL: parseFloat(MAX_BAL) || 0,
        CURRENT_BALANCE: 0.00,
        USER_ID: USER_ID,
        BU_ID: BU_ID ? BU_ID.toString() : 'DEFAULT',
        GL_ACCT_NO: GL_ACCT_NO || '',
        DRAWER_CASH_LIMIT_FG: 'N',
        DRAWER_INSURED_LIMIT_FG: 'N',
        DRAWER_LIMIT_EXCEED_TM: 0,
        WF_STATUS: 'CLOSED',
        REC_ST: REC_ST,
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
        CREATED_BY: USER_ID,
        CREATE_DT: new Date(),
        CURRENT_ASSIGNEE_ID: '0',
        CURRENT_ASSIGNEE_NAME: null,
        CURRENT_ASSIGNEE_ROLE: 'TELLER',
        VAULT_CAPACITY: parseFloat(MAX_BAL) || 0,
        BRANCH_CODE: BRANCH_CODE || null,
        OPENING_CURRENCY: null,
        CLOSING_CURRENCY: null,
        created_at: new Date(),
        updated_at: new Date()
      };

      newDrawer = await Drawer.create(newDrawerData, { transaction });
      drawerCreated = true;
      console.log('✅ Drawer created with ID:', newDrawer.id);

      const ipAddress = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';

      try {
        let AuditTrail;
        if (sequelizeInstance.models && sequelizeInstance.models.AuditTrail) {
          AuditTrail = sequelizeInstance.models.AuditTrail;
        } else {
          const AuditTrailImport = await import('../models/AuditTrail.js');
          AuditTrail = AuditTrailImport.default;
        }

        if (AuditTrail) {
          await AuditTrail.create({
            event_id: Math.floor(Date.now() / 1000),
            user_id: USER_ID,
            event_type: 'DRAWER_CREATED',
            action: 'Drawer Created',
            old_value: null,
            new_value: JSON.stringify({
              drawer_id: newDrawer.DRAWER_ID,
              drawer_no: newDrawer.DRAWER_NO,
              drawer_name: newDrawer.DRAWER_NM,
              drawer_type: DRAWER_TY_CD
            }),
            entity_type: 'Drawer',
            entity_id: newDrawer.id,
            description: `Drawer ${DRAWER_NO} created (${DRAWER_TY_CD})`,
            reference_no: `DRAWER-CREATE-${Date.now()}`,
            additional_info: JSON.stringify({
              drawer_no: DRAWER_NO,
              drawer_name: DRAWER_NM || `Drawer ${DRAWER_NO}`,
              drawer_type: DRAWER_TY_CD,
              business_unit: BU_ID,
              insured_amt: TOTAL_INSURED_AMT,
              min_bal: MIN_BAL,
              max_bal: MAX_BAL,
              user_id: USER_ID
            }),
            ip_address: ipAddress
          }, { transaction });
          console.log('✅ Audit trail created');
        }
      } catch (auditError) {
        console.log('⚠️ Audit trail creation failed:', auditError.message);
      }

      await transaction.commit();
      console.log('✅ Transaction committed');
      
      const createdDrawer = await Drawer.findByPk(newDrawer.id);
      
      return res.status(201).json({
        success: true,
        message: `Drawer ${DRAWER_NO} created successfully (status: CLOSED - must be opened before use)`,
        data: {
          drawer: {
            id: createdDrawer.id,
            DRAWER_ID: createdDrawer.DRAWER_ID,
            DRAWER_NO: createdDrawer.DRAWER_NO,
            DRAWER_NM: createdDrawer.DRAWER_NM,
            DRAWER_TY_CD: createdDrawer.DRAWER_TY_CD,
            USER_ID: createdDrawer.USER_ID,
            BU_ID: createdDrawer.BU_ID,
            CURRENT_BALANCE: createdDrawer.CURRENT_BALANCE,
            MIN_BAL: createdDrawer.MIN_BAL,
            MAX_BAL: createdDrawer.MAX_BAL,
            WF_STATUS: createdDrawer.WF_STATUS,
            REC_ST: createdDrawer.REC_ST,
            VERSION_NO: createdDrawer.VERSION_NO,
            createdAt: createdDrawer.created_at || createdDrawer.CREATE_DT,
            updatedAt: createdDrawer.updated_at || new Date()
          }
        }
      });
      
    } catch (error) {
      if (transaction && !drawerCreated) {
        try {
          await transaction.rollback();
          console.log('🔄 Transaction rolled back');
        } catch (rollbackError) {
          console.log('⚠️ Could not rollback transaction:', rollbackError.message);
        }
      }
      
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
          error: error.message
        });
      }
      
      if (drawerCreated && newDrawer) {
        return res.status(201).json({
          success: true,
          message: `Drawer ${newDrawer.DRAWER_NO} created successfully`,
          data: {
            drawer: {
              id: newDrawer.id,
              DRAWER_ID: newDrawer.DRAWER_ID,
              DRAWER_NO: newDrawer.DRAWER_NO,
              DRAWER_NM: newDrawer.DRAWER_NM,
              DRAWER_TY_CD: newDrawer.DRAWER_TY_CD,
              USER_ID: newDrawer.USER_ID,
              BU_ID: newDrawer.BU_ID,
              WF_STATUS: newDrawer.WF_STATUS,
              REC_ST: newDrawer.REC_ST
            }
          }
        });
      }
      
      return res.status(500).json({ 
        success: false,
        message: 'Error creating Drawer entry', 
        error: error.message
      });
    }
  } catch (error) {
    console.error('❌ Initialization error in createDrawer:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Failed to initialize database connection',
      error: error.message
    });
  }
};

// ============================================
// OPEN DRAWER
// ============================================
export const openDrawer = async (req, res) => {
  try {
    const { id } = req.params;
    const { openingBalance, openingCurrency, userId, forceOpen = false } = req.body;
    
    const drawer = await findDrawerByIdentifier(id);
    
    if (!drawer) {
      return res.status(404).json({
        success: false,
        message: 'Drawer not found'
      });
    }
    
    if (drawer.WF_STATUS === 'OPEN' || drawer.WF_STATUS === 'OPENED') {
      return res.status(400).json({
        success: false,
        message: 'Drawer is already open'
      });
    }
    
    let finalOpeningBalance;
    if (openingCurrency) {
      finalOpeningBalance = calculateTotalFromDenominations(openingCurrency);
    } else if (openingBalance !== undefined && openingBalance !== null) {
      finalOpeningBalance = parseFloat(openingBalance);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either openingBalance or openingCurrency is required'
      });
    }
    
    if (isNaN(finalOpeningBalance) || finalOpeningBalance < 0) {
      return res.status(400).json({
        success: false,
        message: 'Opening balance must be a positive number'
      });
    }
    
    const userIdValue = userId || req.user?.user_name || req.user?.userId || 'SYSTEM';
    
    await drawer.update({
      WF_STATUS: 'OPEN',
      CURRENT_BALANCE: finalOpeningBalance,
      SESSION_START_BALANCE: finalOpeningBalance,
      OPENING_CURRENCY: openingCurrency ? JSON.stringify(openingCurrency) : null,
      LAST_DRAWER_OPEN_DT: new Date(),
      CURRENT_ASSIGNEE_ID: userIdValue,
      CURRENT_ASSIGNEE_NAME: req.user?.preferred_name || userIdValue,
      REC_ST: 'A',
      VERSION_NO: (drawer.VERSION_NO || 0) + 1
    });
    
    console.log('✅ Drawer opened successfully');
    
    return res.json({
      success: true,
      message: 'Drawer opened successfully',
      data: {
        drawerId: drawer.DRAWER_ID,
        drawerNumber: drawer.DRAWER_NO,
        status: 'OPEN',
        openingBalance: finalOpeningBalance,
        openedAt: new Date(),
        openedBy: userIdValue,
        currencyBreakdown: openingCurrency || null,
        forceOpened: forceOpen
      }
    });
    
  } catch (error) {
    console.error('❌ Error opening drawer:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to open drawer',
      error: error.message
    });
  }
};

// ============================================
// CLOSE DRAWER
// ============================================
export const closeDrawer = async (req, res) => {
  try {
    const { id } = req.params;
    const { closingBalance, closingCurrency, verifiedBy, userId, notes } = req.body;
    
    const drawer = await findDrawerByIdentifier(id);
    
    if (!drawer) {
      return res.status(404).json({
        success: false,
        message: 'Drawer not found'
      });
    }
    
    if (drawer.WF_STATUS !== 'OPEN' && drawer.WF_STATUS !== 'OPENED') {
      return res.status(400).json({
        success: false,
        message: 'Drawer is already closed'
      });
    }
    
    let finalClosingBalance;
    if (closingCurrency) {
      finalClosingBalance = calculateTotalFromDenominations(closingCurrency);
    } else if (closingBalance !== undefined && closingBalance !== null) {
      finalClosingBalance = parseFloat(closingBalance);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either closingBalance or closingCurrency is required'
      });
    }
    
    const startBalance = parseFloat(drawer.SESSION_START_BALANCE || 0);
    const difference = finalClosingBalance - startBalance;
    
    let overageAmt = 0;
    let shortageAmt = 0;
    
    if (difference > 0) {
      overageAmt = difference;
    } else if (difference < 0) {
      shortageAmt = Math.abs(difference);
    }
    
    const userIdValue = userId || req.user?.user_name || req.user?.userId || 'SYSTEM';
    const verifiedByValue = verifiedBy || userIdValue;
    
    await drawer.update({
      WF_STATUS: 'CLOSED',
      CURRENT_BALANCE: finalClosingBalance,
      SESSION_END_BALANCE: finalClosingBalance,
      CLOSING_CURRENCY: closingCurrency ? JSON.stringify(closingCurrency) : null,
      LAST_DRAWER_CLOSE_DT: new Date(),
      OVERAGE_AMT: overageAmt,
      SHORTAGE_AMT: shortageAmt,
      FORCE_CLOSED: false,
      CURRENT_ASSIGNEE_ID: null,
      CURRENT_ASSIGNEE_NAME: null,
      VERSION_NO: (drawer.VERSION_NO || 0) + 1,
      ...(notes && { CLOSING_NOTES: notes }),
      ...(verifiedByValue && { CLOSING_VERIFIED_BY: verifiedByValue })
    });
    
    console.log('✅ Drawer closed successfully');
    
    return res.json({
      success: true,
      message: 'Drawer closed successfully',
      data: {
        drawerId: drawer.DRAWER_ID,
        drawerNumber: drawer.DRAWER_NO,
        status: 'CLOSED',
        startBalance: startBalance,
        endBalance: finalClosingBalance,
        difference: difference,
        overage: overageAmt,
        shortage: shortageAmt,
        closedAt: new Date(),
        closedBy: userIdValue,
        verifiedBy: verifiedByValue,
        currencyBreakdown: closingCurrency || null,
        sessionDuration: calculateSessionDuration(drawer.LAST_DRAWER_OPEN_DT, new Date()),
        notes: notes || null
      }
    });
    
  } catch (error) {
    console.error('❌ Error closing drawer:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to close drawer',
      error: error.message
    });
  }
};

// ============================================
// GET ALL DRAWERS
// ============================================
export const getAllDrawers = async (req, res) => {
  try {
    const { status, userId, businessUnit } = req.query;
    
    let whereClause = {};
    
    if (status) whereClause.WF_STATUS = status;
    if (userId) whereClause.USER_ID = userId;
    if (businessUnit) whereClause.BU_ID = businessUnit;
    
    const drawers = await Drawer.findAll({
      where: whereClause,
      order: [['CREATE_DT', 'DESC']]
    });
    
    const openDrawers = drawers.filter(d => d.WF_STATUS === 'OPEN' || d.WF_STATUS === 'OPENED').length;
    const closedDrawers = drawers.filter(d => d.WF_STATUS === 'CLOSED').length;
    
    return res.json({
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
    console.error('❌ Error retrieving drawers:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving Drawer entries',
      error: error.message
    });
  }
};

// ============================================
// GET DRAWER BY ID
// ============================================
export const getDrawerById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const drawer = await findDrawerByIdentifier(id);
    
    if (!drawer) {
      return res.status(404).json({
        success: false,
        message: `Drawer not found: ${id}`,
        hint: 'Try using DRAWER_NO (e.g., "1002") or DRAWER_ID (e.g., "2")'
      });
    }
    
    return res.json({
      success: true,
      data: drawer
    });
    
  } catch (error) {
    console.error('❌ Error fetching drawer:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// ============================================
// GET DRAWERS BY USER ID
// ============================================
export const getDrawersByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    const drawers = await Drawer.findAll({
      where: { 
        USER_ID: userId,
        REC_ST: 'A'
      },
      order: [
        ['WF_STATUS', 'DESC'],
        ['CREATE_DT', 'DESC']
      ]
    });
    
    const openDrawers = drawers.filter(d => d.WF_STATUS === 'OPEN' || d.WF_STATUS === 'OPENED');
    const closedDrawers = drawers.filter(d => d.WF_STATUS === 'CLOSED');
    const totalBalance = drawers.reduce((sum, d) => sum + parseFloat(d.CURRENT_BALANCE || 0), 0);
    
    const formattedDrawers = drawers.map(d => ({
      id: d.id,
      DRAWER_ID: d.DRAWER_ID,
      DRAWER_NO: d.DRAWER_NO,
      DRAWER_NM: d.DRAWER_NM,
      DRAWER_TY_CD: d.DRAWER_TY_CD,
      USER_ID: d.USER_ID,
      BU_ID: d.BU_ID,
      BRANCH_CODE: d.BRANCH_CODE,
      WF_STATUS: d.WF_STATUS,
      currentBalance: parseFloat(d.CURRENT_BALANCE || 0),
      minBalance: parseFloat(d.MIN_BAL || 0),
      maxBalance: parseFloat(d.MAX_BAL || 0),
      availableBalance: Math.max(0, parseFloat(d.CURRENT_BALANCE || 0) - parseFloat(d.MIN_BAL || 0)),
      isOpen: d.WF_STATUS === 'OPEN' || d.WF_STATUS === 'OPENED',
      canTransact: (d.WF_STATUS === 'OPEN' || d.WF_STATUS === 'OPENED') && d.REC_ST === 'A',
      lastOpened: d.LAST_DRAWER_OPEN_DT,
      lastClosed: d.LAST_DRAWER_CLOSE_DT,
      openingCurrency: d.OPENING_CURRENCY ? JSON.parse(d.OPENING_CURRENCY) : null,
      closingCurrency: d.CLOSING_CURRENCY ? JSON.parse(d.CLOSING_CURRENCY) : null,
      createdAt: d.CREATE_DT,
      updatedAt: d.updated_at
    }));
    
    return res.json({
      success: true,
      count: drawers.length,
      summary: {
        totalDrawers: drawers.length,
        openDrawers: openDrawers.length,
        closedDrawers: closedDrawers.length,
        totalBalance: Math.round(totalBalance * 100) / 100,
        totalAvailable: Math.round(drawers.reduce((sum, d) => {
          const available = Math.max(0, parseFloat(d.CURRENT_BALANCE || 0) - parseFloat(d.MIN_BAL || 0));
          return sum + available;
        }, 0) * 100) / 100,
        userId: userId
      },
      drawers: formattedDrawers
    });
    
  } catch (error) {
    console.error('❌ Error fetching drawers by user ID:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving drawers',
      error: error.message
    });
  }
};

// ============================================
// GET DRAWER BY USER
// ============================================
export const getDrawerByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('📊 Fetching drawer for user:', userId);
    
    const drawer = await Drawer.findOne({
      where: { 
        USER_ID: userId,
        REC_ST: 'A'
      },
      attributes: [
        'id',
        'DRAWER_ID',
        'DRAWER_NO',
        'DRAWER_NM',
        'DRAWER_TY_CD',
        'CURRENT_BALANCE',
        'MIN_BAL',
        'MAX_BAL',
        'WF_STATUS',
        'USER_ID',
        'BU_ID',
        'BRANCH_CODE'
      ]
    });
    
    if (!drawer) {
      return res.status(404).json({
        success: false,
        message: 'No drawer found for this user'
      });
    }
    
    const currentBalance = parseFloat(drawer.CURRENT_BALANCE || 0);
    const minBalance = parseFloat(drawer.MIN_BAL || 0);
    const isOpen = drawer.WF_STATUS === 'OPEN' || drawer.WF_STATUS === 'OPENED';
    
    return res.json({
      success: true,
      data: {
        drawerId: drawer.DRAWER_ID || drawer.id,
        drawerNumber: drawer.DRAWER_NO,
        drawerName: drawer.DRAWER_NM || `Drawer ${drawer.DRAWER_NO}`,
        drawerType: drawer.DRAWER_TY_CD || 'TELLER',
        currentBalance: currentBalance,
        minBalance: minBalance,
        maxBalance: parseFloat(drawer.MAX_BAL || 0),
        availableBalance: Math.max(0, currentBalance - minBalance),
        status: drawer.WF_STATUS || 'CLOSED',
        isOpen: isOpen,
        canTransact: isOpen && drawer.REC_ST === 'A'
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching drawer by user:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch drawer details'
    });
  }
};

// ============================================
// GET OPEN DRAWERS BY USER ID
// ============================================
export const getOpenDrawersByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    const drawers = await Drawer.findAll({
      where: { 
        USER_ID: userId,
        WF_STATUS: 'OPEN',
        REC_ST: 'A'
      },
      order: [['CREATE_DT', 'DESC']]
    });
    
    const formattedDrawers = drawers.map(d => ({
      id: d.id,
      DRAWER_ID: d.DRAWER_ID,
      DRAWER_NO: d.DRAWER_NO,
      DRAWER_NM: d.DRAWER_NM,
      currentBalance: parseFloat(d.CURRENT_BALANCE || 0),
      availableBalance: Math.max(0, parseFloat(d.CURRENT_BALANCE || 0) - parseFloat(d.MIN_BAL || 0)),
      maxBalance: parseFloat(d.MAX_BAL || 0),
      minBalance: parseFloat(d.MIN_BAL || 0),
      isOpen: true,
      canTransact: true,
      branchCode: d.BRANCH_CODE,
      businessUnit: d.BU_ID,
      openingCurrency: d.OPENING_CURRENCY ? JSON.parse(d.OPENING_CURRENCY) : null
    }));
    
    return res.json({
      success: true,
      count: formattedDrawers.length,
      drawers: formattedDrawers
    });
    
  } catch (error) {
    console.error('❌ Error fetching open drawers:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving open drawers',
      error: error.message
    });
  }
};

// ============================================
// GET USER DRAWER SUMMARY
// ============================================
export const getUserDrawerSummary = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    const drawers = await Drawer.findAll({
      where: { 
        USER_ID: userId,
        REC_ST: 'A'
      }
    });
    
    const openDrawers = drawers.filter(d => d.WF_STATUS === 'OPEN' || d.WF_STATUS === 'OPENED');
    const closedDrawers = drawers.filter(d => d.WF_STATUS === 'CLOSED');
    
    const totalBalance = drawers.reduce((sum, d) => sum + parseFloat(d.CURRENT_BALANCE || 0), 0);
    const totalAvailable = drawers.reduce((sum, d) => {
      const available = Math.max(0, parseFloat(d.CURRENT_BALANCE || 0) - parseFloat(d.MIN_BAL || 0));
      return sum + available;
    }, 0);
    
    const summary = {
      totalDrawers: drawers.length,
      openDrawers: openDrawers.length,
      closedDrawers: closedDrawers.length,
      totalBalance: Math.round(totalBalance * 100) / 100,
      totalAvailable: Math.round(totalAvailable * 100) / 100
    };
    
    const drawerOptions = drawers.map(d => ({
      value: d.id,
      label: `${d.DRAWER_NO} - ${d.DRAWER_NM}`,
      DRAWER_ID: d.DRAWER_ID,
      DRAWER_NO: d.DRAWER_NO,
      DRAWER_NM: d.DRAWER_NM,
      status: d.WF_STATUS,
      balance: parseFloat(d.CURRENT_BALANCE || 0),
      isOpen: d.WF_STATUS === 'OPEN' || d.WF_STATUS === 'OPENED',
      canTransact: (d.WF_STATUS === 'OPEN' || d.WF_STATUS === 'OPENED') && d.REC_ST === 'A'
    }));
    
    return res.json({
      success: true,
      summary,
      drawers: drawerOptions,
      user: { userId }
    });
    
  } catch (error) {
    console.error('❌ Error getting user drawer summary:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving drawer summary',
      error: error.message
    });
  }
};

// ============================================
// GET DRAWER SUMMARY
// ============================================
export const getDrawerSummary = async (req, res) => {
  try {
    const { userId, status } = req.query;
    
    console.log('📊 Fetching drawer summary');
    
    let whereClause = { REC_ST: 'A' };
    
    if (userId) {
      whereClause.USER_ID = userId;
    }
    
    if (status) {
      whereClause.WF_STATUS = status;
    }
    
    const drawers = await Drawer.findAll({
      where: whereClause,
      attributes: [
        'id',
        'DRAWER_ID',
        'DRAWER_NO',
        'DRAWER_NM',
        'DRAWER_TY_CD',
        'CURRENT_BALANCE',
        'MIN_BAL',
        'MAX_BAL',
        'WF_STATUS',
        'USER_ID',
        'BU_ID',
        'BRANCH_CODE'
      ]
    });
    
    const totalDrawers = drawers.length;
    const openDrawers = drawers.filter(d => d.WF_STATUS === 'OPEN' || d.WF_STATUS === 'OPENED');
    const closedDrawers = drawers.filter(d => d.WF_STATUS === 'CLOSED');
    const totalBalance = drawers.reduce((sum, d) => sum + parseFloat(d.CURRENT_BALANCE || 0), 0);
    
    const statusBreakdown = {
      OPEN: drawers.filter(d => d.WF_STATUS === 'OPEN').length,
      OPENED: drawers.filter(d => d.WF_STATUS === 'OPENED').length,
      CLOSED: drawers.filter(d => d.WF_STATUS === 'CLOSED').length
    };
    
    const summary = {
      totalDrawers,
      openDrawers: openDrawers.length,
      closedDrawers: closedDrawers.length,
      totalBalance: Math.round(totalBalance * 100) / 100,
      averageBalance: totalDrawers > 0 ? Math.round((totalBalance / totalDrawers) * 100) / 100 : 0,
      statusBreakdown,
      drawers: drawers.map(d => ({
        id: d.id,
        drawerId: d.DRAWER_ID,
        drawerNumber: d.DRAWER_NO,
        drawerName: d.DRAWER_NM || d.DRAWER_NO,
        drawerType: d.DRAWER_TY_CD || 'TELLER',
        currentBalance: parseFloat(d.CURRENT_BALANCE || 0),
        minBalance: parseFloat(d.MIN_BAL || 0),
        maxBalance: parseFloat(d.MAX_BAL || 0),
        availableBalance: Math.max(0, parseFloat(d.CURRENT_BALANCE || 0) - parseFloat(d.MIN_BAL || 0)),
        status: d.WF_STATUS || 'CLOSED',
        assignedUser: d.USER_ID,
        businessUnit: d.BU_ID,
        branchCode: d.BRANCH_CODE
      }))
    };
    
    return res.json({
      success: true,
      data: summary
    });
    
  } catch (error) {
    console.error('❌ Error fetching drawer summary:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch drawer summary',
      error: error.message
    });
  }
};


export const getDrawerBalance = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('📊 Fetching drawer balance for:', id);
    
    // Try to find drawer by multiple identifiers
    let drawer = await Drawer.findOne({
      where: {
        [Op.or]: [
          { DRAWER_ID: id },
          { DRAWER_NO: id },
          { id: parseInt(id) || 0 }
        ]
      }
    });
    
    if (!drawer) {
      // Try to get drawer by user ID if no drawer found
      const userId = req.query.userId || req.user?.user_name;
      if (userId) {
        drawer = await Drawer.findOne({
          where: { USER_ID: userId }
        });
      }
    }
    
    if (!drawer) {
      // Return a default response instead of 404 to prevent UI errors
      return res.json({
        success: true,
        data: {
          drawerId: 'N/A',
          drawerNumber: 'N/A',
          drawerName: 'No Drawer Found',
          drawerType: 'TELLER',
          currentBalance: 0,
          minBalance: 0,
          maxBalance: 0,
          availableBalance: 0,
          status: 'CLOSED',
          isOpen: false,
          canTransact: false,
          recordStatus: 'A',
          userId: req.user?.user_name || 'SYSTEM',
          businessUnitId: null,
          branchCode: null,
          sessionStartBalance: 0,
          sessionEndBalance: 0,
          todaySummary: {
            transactionCount: 0,
            totalAmount: 0,
            totalDeposits: 0,
            totalWithdrawals: 0
          },
          isOverLimit: false,
          isUnderLimit: false,
          lastOpenDate: null,
          lastCloseDate: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
    }
    
    // Get today's transactions summary
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const transactionSummary = await Transaction.findAll({
      where: {
        drawer_id: drawer.DRAWER_ID || drawer.id,
        created_at: {
          [Op.gte]: today,
          [Op.lt]: tomorrow
        },
        status: 'COMPLETED'
      },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'transactionCount'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN tx_type = 'DEPOSIT' THEN amount ELSE 0 END")), 'totalDeposits'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN tx_type = 'WITHDRAWAL' THEN amount ELSE 0 END")), 'totalWithdrawals']
      ],
      raw: true
    });
    
    const currentBalance = parseFloat(drawer.CURRENT_BALANCE || 0);
    const minBalance = parseFloat(drawer.MIN_BAL || 0);
    const maxBalance = parseFloat(drawer.MAX_BAL || 0);
    const isOpen = drawer.WF_STATUS === 'OPEN' || drawer.WF_STATUS === 'OPENED';
    
    return res.json({
      success: true,
      data: {
        drawerId: drawer.DRAWER_ID || drawer.id,
        drawerNumber: drawer.DRAWER_NO,
        drawerName: drawer.DRAWER_NM || `Drawer ${drawer.DRAWER_NO}`,
        drawerType: drawer.DRAWER_TY_CD || 'TELLER',
        currentBalance: currentBalance,
        minBalance: minBalance,
        maxBalance: maxBalance,
        availableBalance: Math.max(0, currentBalance - minBalance),
        status: drawer.WF_STATUS || 'CLOSED',
        isOpen: isOpen,
        canTransact: isOpen && drawer.REC_ST === 'A',
        recordStatus: drawer.REC_ST || 'A',
        userId: drawer.USER_ID,
        businessUnitId: drawer.BU_ID,
        branchCode: drawer.BRANCH_CODE,
        sessionStartBalance: parseFloat(drawer.SESSION_START_BALANCE || 0),
        sessionEndBalance: parseFloat(drawer.SESSION_END_BALANCE || 0),
        todaySummary: {
          transactionCount: parseInt(transactionSummary[0]?.transactionCount || 0),
          totalAmount: parseFloat(transactionSummary[0]?.totalAmount || 0),
          totalDeposits: parseFloat(transactionSummary[0]?.totalDeposits || 0),
          totalWithdrawals: parseFloat(transactionSummary[0]?.totalWithdrawals || 0)
        },
        isOverLimit: currentBalance > maxBalance,
        isUnderLimit: currentBalance < minBalance,
        lastOpenDate: drawer.LAST_DRAWER_OPEN_DT,
        lastCloseDate: drawer.LAST_DRAWER_CLOSE_DT,
        createdAt: drawer.createdAt || drawer.CREATE_DT,
        updatedAt: drawer.updatedAt
      }
    });
    
  } catch (error) {
    console.error('❌ Error retrieving drawer balance:', error);
    // Return a default response instead of 500 error
    return res.json({
      success: true,
      data: {
        drawerId: 'N/A',
        drawerNumber: 'N/A',
        drawerName: 'Drawer Unavailable',
        drawerType: 'TELLER',
        currentBalance: 0,
        minBalance: 0,
        maxBalance: 0,
        availableBalance: 0,
        status: 'CLOSED',
        isOpen: false,
        canTransact: false,
        todaySummary: {
          transactionCount: 0,
          totalAmount: 0,
          totalDeposits: 0,
          totalWithdrawals: 0
        },
        isOverLimit: false,
        isUnderLimit: false
      }
    });
  }
};

// ============================================
// ✅ UPDATE DRAWER LIMIT FLAGS
// ============================================

/**
 * Updates the drawer limit flags based on current balance
 * @param {Object} drawer - The drawer object
 * @param {number} newBalance - The new balance to check against limits
 * @param {Object} db - Database connection (optional)
 * @param {Object} session - Transaction session (optional)
 */
async function updateDrawerLimitFlags(drawer, newBalance, db = null, session = null) {
  try {
    // Get the drawer's limits
    const minBalance = parseFloat(drawer.MIN_BAL || 0);
    const maxBalance = parseFloat(drawer.MAX_BAL || 0);
    const insuredAmount = parseFloat(drawer.TOTAL_INSURED_AMT || 0);
    
    let drawerCashLimitFg = 'N';
    let drawerInsuredLimitFg = 'N';
    let drawerLimitExceedTm = drawer.DRAWER_LIMIT_EXCEED_TM || 0;
    
    // Check cash limit
    if (newBalance > maxBalance) {
      drawerCashLimitFg = 'Y';
      drawerLimitExceedTm += 1;
    } else if (newBalance < minBalance) {
      drawerCashLimitFg = 'Y';
    }
    
    // Check insured limit
    if (newBalance > insuredAmount && insuredAmount > 0) {
      drawerInsuredLimitFg = 'Y';
    }
    
    // If db and session are provided, use them
    if (db && session) {
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
        { session }
      );
      console.log('✅ Drawer limit flags updated via db.execute');
      return;
    }
    
    // If session is provided without db, use Drawer model
    if (session) {
      await Drawer.update(
        {
          DRAWER_CASH_LIMIT_FG: drawerCashLimitFg,
          DRAWER_INSURED_LIMIT_FG: drawerInsuredLimitFg,
          DRAWER_LIMIT_EXCEED_TM: drawerLimitExceedTm,
          updated_at: new Date()
        },
        {
          where: { id: drawer.id },
          transaction: session
        }
      );
      console.log('✅ Drawer limit flags updated via Drawer.update with transaction');
      return;
    }
    
    // No session, direct update
    await Drawer.update(
      {
        DRAWER_CASH_LIMIT_FG: drawerCashLimitFg,
        DRAWER_INSURED_LIMIT_FG: drawerInsuredLimitFg,
        DRAWER_LIMIT_EXCEED_TM: drawerLimitExceedTm,
        updated_at: new Date()
      },
      {
        where: { id: drawer.id }
      }
    );
    console.log('✅ Drawer limit flags updated via Drawer.update');
    
  } catch (error) {
    console.error('❌ Error updating drawer limit flags:', error);
    throw error;
  }
}

// ============================================
// ✅ SIMPLIFIED VERSION (without db parameter)
// ============================================

/**
 * Simplified version - updates drawer limit flags using Sequelize directly
 * @param {Object} drawer - The drawer object
 * @param {number} newBalance - The new balance to check against limits
 */
async function updateDrawerLimitFlagsSimple(drawer, newBalance) {
  try {
    const minBalance = parseFloat(drawer.MIN_BAL || 0);
    const maxBalance = parseFloat(drawer.MAX_BAL || 0);
    const insuredAmount = parseFloat(drawer.TOTAL_INSURED_AMT || 0);
    
    let drawerCashLimitFg = 'N';
    let drawerInsuredLimitFg = 'N';
    let drawerLimitExceedTm = drawer.DRAWER_LIMIT_EXCEED_TM || 0;
    
    // Check cash limit
    if (newBalance > maxBalance) {
      drawerCashLimitFg = 'Y';
      drawerLimitExceedTm += 1;
    } else if (newBalance < minBalance) {
      drawerCashLimitFg = 'Y';
    }
    
    // Check insured limit
    if (newBalance > insuredAmount && insuredAmount > 0) {
      drawerInsuredLimitFg = 'Y';
    }
    
    // Update the drawer
    await Drawer.update(
      {
        DRAWER_CASH_LIMIT_FG: drawerCashLimitFg,
        DRAWER_INSURED_LIMIT_FG: drawerInsuredLimitFg,
        DRAWER_LIMIT_EXCEED_TM: drawerLimitExceedTm,
        updated_at: new Date()
      },
      {
        where: { id: drawer.id }
      }
    );
    
    return {
      drawerCashLimitFg,
      drawerInsuredLimitFg,
      drawerLimitExceedTm
    };
    
  } catch (error) {
    console.error('❌ Error updating drawer limit flags:', error);
    throw error;
  }
}

// ============================================
// EXPORT HELPER FUNCTIONS
// ============================================
export {
  findDrawerByIdentifier,
  updateDrawerLimitFlags,
  updateDrawerLimitFlagsSimple,
  calculateTotalFromDenominations,
  calculateSessionDuration,
  createAutoClosingDenomination
};

// ============================================
// DEFAULT EXPORT
// ============================================
export default {
  createDrawer,
  openDrawer,
  closeDrawer,
  getAllDrawers,
  getDrawerById,
  getDrawersByUserId,
  getDrawerByUser,
  getOpenDrawersByUserId,
  getUserDrawerSummary,
  getDrawerSummary,
  getDrawerBalance,
  findDrawerByIdentifier,
  updateDrawerLimitFlags,
  updateDrawerLimitFlagsSimple,
  calculateTotalFromDenominations,
  calculateSessionDuration,
  createAutoClosingDenomination
};