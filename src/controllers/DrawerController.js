// controllers/DrawerController.js - COMPLETE SEQUELIZE VERSION (NO MONGOOSE)

import logger from '../utils/logger.js';
import DrawerCurrencyDenomination from '../models/DrawerCurrencyDenomination.js';
import Branch from '../models/Branch.js';
import sequelize from '../../config/db.js';
import { drawerAuditHelper } from '../models/AuditTrail.js';
import Drawer from '../models/Drawer.js';
import { Op } from 'sequelize';
// At the top of your drawer controller file
import { QueryTypes } from 'sequelize';
import VaultTransaction from '../models/VaultTransaction.js';
import Vault from '../models/Vault.js';
import Transaction from '../models/Transaction.js';
import DrawerTransaction from '../models/DrawerTransaction.js';
import { getDrawerService } from '../services/drawerService.js';


// Initialize the drawer service
const drawerService = getDrawerService(sequelize);
// ============================================
// HELPER FUNCTIONS
// ============================================

// ================================================================
// ✅ INTERBRANCH HELPER - QUERY GL_ACCOUNTS TABLE ONLY
// ================================================================
async function getInterbranchGlAccount(sourceBranch, destBranch, transaction) {
  try {
    console.log(`🔍 Looking for interbranch GL for branch: ${sourceBranch}`);
    
    // Method 1: Find by account_type = 'INTER_BRANCH_SETTLEMENT' and branch
    const [result] = await sequelize.query(
      `SELECT gl_acct_no, acct_desc, branch_code 
       FROM gl_accounts 
       WHERE account_type = 'INTER_BRANCH_SETTLEMENT' 
         AND branch_code = :sourceBranch
         AND rec_st = 'Active'
       LIMIT 1`,
      {
        replacements: { sourceBranch: sourceBranch || '101' },
        type: QueryTypes.SELECT,
        transaction
      }
    );
    
    if (result) {
      console.log(`✅ Found interbranch GL: ${result.gl_acct_no} (${result.acct_desc})`);
      return result.gl_acct_no;
    }
    
    // Method 2: Find by acct_desc = 'INTER_BRANCH_SETTLEMENT'
    const [resultByDesc] = await sequelize.query(
      `SELECT gl_acct_no, acct_desc, branch_code 
       FROM gl_accounts 
       WHERE acct_desc = 'INTER_BRANCH_SETTLEMENT' 
         AND branch_code = :sourceBranch
         AND rec_st = 'Active'
       LIMIT 1`,
      {
        replacements: { sourceBranch: sourceBranch || '101' },
        type: QueryTypes.SELECT,
        transaction
      }
    );
    
    if (resultByDesc) {
      console.log(`✅ Found interbranch GL by description: ${resultByDesc.gl_acct_no}`);
      return resultByDesc.gl_acct_no;
    }
    
    // Method 3: Find by category_code = '6000'
    const [resultByCategory] = await sequelize.query(
      `SELECT gl_acct_no, acct_desc, branch_code 
       FROM gl_accounts 
       WHERE category_code = '6000' 
         AND branch_code = :sourceBranch
         AND rec_st = 'Active'
       LIMIT 1`,
      {
        replacements: { sourceBranch: sourceBranch || '101' },
        type: QueryTypes.SELECT,
        transaction
      }
    );
    
    if (resultByCategory) {
      console.log(`✅ Found interbranch GL by category: ${resultByCategory.gl_acct_no}`);
      return resultByCategory.gl_acct_no;
    }
    
    // Method 4: Fallback - any interbranch GL regardless of branch
    const [fallbackResult] = await sequelize.query(
      `SELECT gl_acct_no, acct_desc, branch_code 
       FROM gl_accounts 
       WHERE (account_type = 'INTER_BRANCH_SETTLEMENT' 
          OR acct_desc = 'INTER_BRANCH_SETTLEMENT'
          OR acct_desc LIKE '%INTER_BRANCH%'
          OR category_code = '6000')
         AND rec_st = 'Active'
       LIMIT 1`,
      {
        type: QueryTypes.SELECT,
        transaction
      }
    );
    
    if (fallbackResult) {
      console.log(`✅ Found fallback interbranch GL: ${fallbackResult.gl_acct_no}`);
      return fallbackResult.gl_acct_no;
    }
    
    console.warn('⚠️ No interbranch GL account found');
    return null;
    
  } catch (error) {
    console.error('❌ Error getting interbranch GL account:', error.message);
    return null;
  }
};


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

// Fallback function if service fails
const findDrawerByIdentifier = async (identifier) => {
  if (!identifier) return null;
  
  const identifierStr = identifier.toString().trim();
  
  const whereClause = {
    [Op.or]: [
      { DRAWER_NO: identifierStr },
      { USER_ID: identifierStr },
      { DRAWER_ID: parseInt(identifierStr) || 0 },
      { id: parseInt(identifierStr) || 0 }
    ]
  };
  
  try {
    const drawer = await Drawer.findOne({
      where: whereClause
    });
    return drawer;
  } catch (error) {
    console.error('Error finding drawer:', error);
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

      // Build the data object with only the columns that exist in the database
      const newDrawerData = {
        DRAWER_ID: drawerIdValue.toString(),
        DRAWER_NO: DRAWER_NO.toString(),
        DRAWER_NM: DRAWER_NM || `Drawer ${DRAWER_NO}`,
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

      // Remove any columns that don't exist in the database
      // Only include columns that are defined in your model
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
            description: `Drawer ${DRAWER_NO} created`,
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
// DELETE DRAWER (Soft Delete)
// ============================================
export const deleteDrawer = async (req, res) => {
  console.log('🗑️ deleteDrawer function called');
  
  try {
    const { id } = req.params;
    const { hardDelete = false, reason = 'Deletion requested' } = req.body;
    const userId = req.user?.user_name || req.user?.userId || 'SYSTEM';
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Drawer ID is required'
      });
    }
    
    const drawer = await findDrawerByIdentifier(id);
    
    if (!drawer) {
      return res.status(404).json({
        success: false,
        message: `Drawer not found: ${id}`
      });
    }
    
    // Check if drawer is open - prevent deletion of open drawers
    if (drawer.WF_STATUS === 'OPEN' || drawer.WF_STATUS === 'OPENED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete an open drawer. Please close the drawer first.',
        drawerStatus: drawer.WF_STATUS,
        currentBalance: drawer.CURRENT_BALANCE
      });
    }
    
    // Check if drawer has any transactions (optional - prevents deletion if transactions exist)
    // You can add this check if needed
    // const hasTransactions = await Transaction.findOne({ where: { drawer_id: drawer.id } });
    // if (hasTransactions) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Cannot delete drawer with existing transactions. Please archive instead.'
    //   });
    // }
    
    const drawerInfo = {
      DRAWER_ID: drawer.DRAWER_ID,
      DRAWER_NO: drawer.DRAWER_NO,
      DRAWER_NM: drawer.DRAWER_NM,
      USER_ID: drawer.USER_ID,
      BU_ID: drawer.BU_ID,
      WF_STATUS: drawer.WF_STATUS,
      CURRENT_BALANCE: drawer.CURRENT_BALANCE,
      REC_ST: drawer.REC_ST
    };
    
    let deletedDrawer;
    let deletionType = 'soft';
    
    if (hardDelete) {
      // Hard delete - permanently remove from database
      deletedDrawer = await drawer.destroy();
      console.log(`🗑️ Drawer ${drawer.DRAWER_NO} hard deleted`);
      deletionType = 'hard';
    } else {
      // Soft delete - mark as deleted
      await drawer.update({
        REC_ST: 'D', // 'D' for Deleted
        WF_STATUS: 'DELETED',
        deleted_at: new Date(),
        deleted_by: userId,
        deletion_reason: reason || 'Deletion requested',
        updated_at: new Date(),
        VERSION_NO: (drawer.VERSION_NO || 0) + 1
      });
      deletedDrawer = await findDrawerByIdentifier(id);
      console.log(`🗑️ Drawer ${drawer.DRAWER_NO} soft deleted`);
    }
    
    // Create audit trail
    try {
      const ipAddress = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
      
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
          user_id: userId,
          event_type: 'DRAWER_DELETED',
          action: 'Drawer Deleted',
          old_value: JSON.stringify(drawerInfo),
          new_value: JSON.stringify({
            drawer_id: drawer.DRAWER_ID,
            drawer_no: drawer.DRAWER_NO,
            drawer_name: drawer.DRAWER_NM,
            deletion_type: deletionType,
            reason: reason || 'Deletion requested'
          }),
          entity_type: 'Drawer',
          entity_id: drawer.id,
          description: `Drawer ${drawer.DRAWER_NO} ${deletionType} deleted`,
          reference_no: `DRAWER-DELETE-${Date.now()}`,
          additional_info: JSON.stringify({
            drawer_no: drawer.DRAWER_NO,
            drawer_name: drawer.DRAWER_NM,
            deletion_type: deletionType,
            reason: reason || 'Deletion requested',
            deleted_by: userId
          }),
          ip_address: ipAddress
        });
        console.log('✅ Audit trail created for drawer deletion');
      }
    } catch (auditError) {
      console.log('⚠️ Audit trail creation failed:', auditError.message);
    }
    
    return res.status(200).json({
      success: true,
      message: `Drawer ${drawer.DRAWER_NO} ${deletionType} deleted successfully`,
      data: {
        drawer: deletedDrawer || {
          id: drawer.id,
          DRAWER_ID: drawer.DRAWER_ID,
          DRAWER_NO: drawer.DRAWER_NO,
          DRAWER_NM: drawer.DRAWER_NM
        },
        deletionType: deletionType,
        deletedBy: userId,
        deletedAt: new Date(),
        reason: reason || 'Deletion requested'
      }
    });
    
  } catch (error) {
    console.error('❌ Error deleting drawer:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete drawer',
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
// FORCE CLOSE ALL DRAWERS
// ============================================
export const forceCloseAllDrawers = async (req, res) => {
  console.log('🔒 forceCloseAllDrawers function called');
  
  try {
    const { userId, reason, forceClose = true } = req.body;
    const performingUser = userId || req.user?.user_name || req.user?.userId || 'SYSTEM';
    const closeReason = reason || 'Force close all drawers initiated by system administrator';
    
    // Get all open drawers
    const openDrawers = await Drawer.findAll({
      where: {
        WF_STATUS: {
          [Op.in]: ['OPEN', 'OPENED']
        },
        REC_ST: 'A'
      }
    });
    
    if (openDrawers.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No open drawers found to close',
        data: {
          closedCount: 0,
          totalOpenDrawers: 0,
          details: []
        }
      });
    }
    
    console.log(`🔒 Found ${openDrawers.length} open drawer(s) to force close`);
    
    const closedDrawers = [];
    const errors = [];
    
    // Process each open drawer
    for (const drawer of openDrawers) {
      try {
        const startBalance = parseFloat(drawer.SESSION_START_BALANCE || 0);
        const currentBalance = parseFloat(drawer.CURRENT_BALANCE || 0);
        const difference = currentBalance - startBalance;
        
        let overageAmt = 0;
        let shortageAmt = 0;
        
        if (difference > 0) {
          overageAmt = difference;
        } else if (difference < 0) {
          shortageAmt = Math.abs(difference);
        }
        
        // Close the drawer
        await drawer.update({
          WF_STATUS: 'CLOSED',
          SESSION_END_BALANCE: currentBalance,
          LAST_DRAWER_CLOSE_DT: new Date(),
          OVERAGE_AMT: overageAmt,
          SHORTAGE_AMT: shortageAmt,
          FORCE_CLOSED: true,
          FORCE_CLOSE_REASON: closeReason,
          FORCE_CLOSED_BY: performingUser,
          CURRENT_ASSIGNEE_ID: null,
          CURRENT_ASSIGNEE_NAME: null,
          VERSION_NO: (drawer.VERSION_NO || 0) + 1,
          updated_at: new Date()
        });
        
        // Create auto-closing denomination if needed
        try {
          await createAutoClosingDenomination(drawer, performingUser, null);
        } catch (denomError) {
          console.warn(`⚠️ Could not create auto-closing denomination for drawer ${drawer.DRAWER_NO}:`, denomError.message);
        }
        
        closedDrawers.push({
          drawerId: drawer.DRAWER_ID,
          drawerNo: drawer.DRAWER_NO,
          drawerName: drawer.DRAWER_NM,
          startBalance: startBalance,
          currentBalance: currentBalance,
          overage: overageAmt,
          shortage: shortageAmt,
          status: 'CLOSED',
          forced: true
        });
        
        console.log(`✅ Drawer ${drawer.DRAWER_NO} force closed`);
        
      } catch (error) {
        console.error(`❌ Error force closing drawer ${drawer.DRAWER_NO}:`, error.message);
        errors.push({
          drawerId: drawer.DRAWER_ID,
          drawerNo: drawer.DRAWER_NO,
          error: error.message
        });
      }
    }
    
    // Create audit trail for the force close action
    try {
      const ipAddress = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
      
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
          user_id: performingUser,
          event_type: 'DRAWER_FORCE_CLOSE_ALL',
          action: 'Force Close All Drawers',
          old_value: JSON.stringify({
            openDrawers: openDrawers.map(d => ({
              drawer_no: d.DRAWER_NO,
              balance: d.CURRENT_BALANCE
            }))
          }),
          new_value: JSON.stringify({
            closedCount: closedDrawers.length,
            errors: errors.length,
            reason: closeReason
          }),
          entity_type: 'Drawer',
          entity_id: null,
          description: `Force closed ${closedDrawers.length} open drawers`,
          reference_no: `FORCE-CLOSE-ALL-${Date.now()}`,
          additional_info: JSON.stringify({
            totalOpen: openDrawers.length,
            closed: closedDrawers.length,
            errors: errors.length,
            reason: closeReason,
            performedBy: performingUser
          }),
          ip_address: ipAddress
        });
        console.log('✅ Audit trail created for force close all');
      }
    } catch (auditError) {
      console.log('⚠️ Audit trail creation failed:', auditError.message);
    }
    
    return res.status(200).json({
      success: true,
      message: `Force closed ${closedDrawers.length} out of ${openDrawers.length} open drawers`,
      data: {
        totalOpenDrawers: openDrawers.length,
        closedCount: closedDrawers.length,
        errorCount: errors.length,
        closedDrawers: closedDrawers,
        errors: errors,
        performedBy: performingUser,
        performedAt: new Date(),
        reason: closeReason
      }
    });
    
  } catch (error) {
    console.error('❌ Error force closing all drawers:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to force close all drawers',
      error: error.message
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

// ============================================
// GET DRAWER OPENING REPORT
// ============================================
export const getDrawerOpeningReport = async (req, res) => {
  console.log('📊 getDrawerOpeningReport function called');
  
  try {
    const { id } = req.params;
    const { date, includeDenominations = true } = req.query;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Drawer ID is required'
      });
    }
    
    // Find the drawer
    const drawer = await findDrawerByIdentifier(id);
    
    if (!drawer) {
      return res.status(404).json({
        success: false,
        message: `Drawer not found: ${id}`
      });
    }
    
    // Set date range
    let reportDate = date ? new Date(date) : new Date();
    let startDate = new Date(reportDate);
    startDate.setHours(0, 0, 0, 0);
    let endDate = new Date(reportDate);
    endDate.setHours(23, 59, 59, 999);
    
    // Get opening currency denominations
    let openingCurrency = null;
    let closingCurrency = null;
    let denominations = [];
    
    try {
      const DrawerCurrencyDenomination = (await import('../models/DrawerCurrencyDenomination.js')).default;
      
      // Get opening denominations (first of the day)
      const openingDenom = await DrawerCurrencyDenomination.findOne({
        where: {
          drawerId: drawer.id,
          denomCountType: 'O',
          createDt: {
            [Op.between]: [startDate, endDate]
          }
        },
        order: [['createDt', 'ASC']]
      });
      
      if (openingDenom) {
        openingCurrency = openingDenom.denomCount ? JSON.parse(openingDenom.denomCount) : [];
        denominations.push(openingDenom);
      }
      
      // Get closing denominations (last of the day)
      const closingDenom = await DrawerCurrencyDenomination.findOne({
        where: {
          drawerId: drawer.id,
          denomCountType: 'C',
          createDt: {
            [Op.between]: [startDate, endDate]
          }
        },
        order: [['createDt', 'DESC']]
      });
      
      if (closingDenom) {
        closingCurrency = closingDenom.denomCount ? JSON.parse(closingDenom.denomCount) : [];
        denominations.push(closingDenom);
      }
      
      // If no denominations found, use drawer's stored currency
      if (!openingCurrency && drawer.OPENING_CURRENCY) {
        try {
          openingCurrency = JSON.parse(drawer.OPENING_CURRENCY);
        } catch (e) {
          openingCurrency = null;
        }
      }
      
      if (!closingCurrency && drawer.CLOSING_CURRENCY) {
        try {
          closingCurrency = JSON.parse(drawer.CLOSING_CURRENCY);
        } catch (e) {
          closingCurrency = null;
        }
      }
      
    } catch (denomError) {
      console.log('⚠️ Could not fetch denominations:', denomError.message);
      // Use drawer's stored currency as fallback
      if (drawer.OPENING_CURRENCY) {
        try {
          openingCurrency = JSON.parse(drawer.OPENING_CURRENCY);
        } catch (e) {
          openingCurrency = null;
        }
      }
      if (drawer.CLOSING_CURRENCY) {
        try {
          closingCurrency = JSON.parse(drawer.CLOSING_CURRENCY);
        } catch (e) {
          closingCurrency = null;
        }
      }
    }
    
    // Get today's transactions
    let transactions = [];
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    
    try {
      const Transaction = (await import('../models/Transaction.js')).default;
      transactions = await Transaction.findAll({
        where: {
          [Op.or]: [
            { drawer_id: drawer.DRAWER_ID || drawer.id },
            { drawer_no: drawer.DRAWER_NO }
          ],
          created_at: {
            [Op.between]: [startDate, endDate]
          }
        },
        order: [['created_at', 'DESC']]
      });
      
      // Calculate totals
      for (const tx of transactions) {
        const amount = parseFloat(tx.amount || 0);
        if (tx.tx_type === 'DEPOSIT' || tx.transaction_type === 'DEPOSIT' || tx.tx_type === 'CR') {
          totalDeposits += amount;
        } else {
          totalWithdrawals += amount;
        }
      }
    } catch (txError) {
      console.log('⚠️ Could not fetch transactions:', txError.message);
    }
    
    // Calculate opening and closing balances
    const openingBalance = parseFloat(drawer.SESSION_START_BALANCE || 0);
    const closingBalance = parseFloat(drawer.SESSION_END_BALANCE || drawer.CURRENT_BALANCE || 0);
    const currentBalance = parseFloat(drawer.CURRENT_BALANCE || 0);
    const netChange = totalDeposits - totalWithdrawals;
    
    // Calculate expected closing balance
    const expectedClosingBalance = openingBalance + netChange;
    const variance = closingBalance - expectedClosingBalance;
    
    // Get drawer history for the day
    let history = [];
    try {
      const DrawerHistory = (await import('../models/DrawerHistory.js')).default;
      history = await DrawerHistory.findAll({
        where: {
          drawer_id: drawer.DRAWER_ID || drawer.id,
          created_at: {
            [Op.between]: [startDate, endDate]
          }
        },
        order: [['created_at', 'DESC']]
      });
    } catch (historyError) {
      console.log('⚠️ Could not fetch history:', historyError.message);
    }
    
    // Format denomination details
    const formatDenominationDetails = (currency) => {
      if (!currency) return null;
      
      const denomMap = {
        1000: 'One Thousand',
        500: 'Five Hundred',
        200: 'Two Hundred',
        100: 'One Hundred',
        50: 'Fifty',
        20: 'Twenty',
        10: 'Ten',
        5: 'Five'
      };
      
      let total = 0;
      const details = [];
      
      if (Array.isArray(currency)) {
        for (const item of currency) {
          const value = parseInt(item.denomId) || 0;
          const count = parseInt(item.count) || 0;
          const amount = value * count;
          total += amount;
          details.push({
            denomination: value,
            label: denomMap[value] || `₦${value}`,
            count: count,
            amount: amount
          });
        }
      } else if (typeof currency === 'object') {
        for (const [key, count] of Object.entries(currency)) {
          const value = parseInt(key) || 0;
          const countNum = parseInt(count) || 0;
          const amount = value * countNum;
          total += amount;
          details.push({
            denomination: value,
            label: denomMap[value] || `₦${value}`,
            count: countNum,
            amount: amount
          });
        }
      }
      
      return {
        total: total,
        details: details
      };
    };
    
    // Build the report
    const report = {
      drawerInfo: {
        id: drawer.id,
        drawerId: drawer.DRAWER_ID,
        drawerNo: drawer.DRAWER_NO,
        drawerName: drawer.DRAWER_NM || `Drawer ${drawer.DRAWER_NO}`,
        drawerType: drawer.DRAWER_TY_CD || 'TELLER',
        businessUnit: drawer.BU_ID,
        branchCode: drawer.BRANCH_CODE,
        userId: drawer.USER_ID,
        status: drawer.WF_STATUS,
        recordStatus: drawer.REC_ST
      },
      reportDate: {
        date: reportDate.toISOString().split('T')[0],
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      opening: {
        balance: openingBalance,
        currency: formatDenominationDetails(openingCurrency),
        time: drawer.LAST_DRAWER_OPEN_DT,
        openedBy: drawer.CURRENT_ASSIGNEE_NAME || drawer.USER_ID
      },
      closing: {
        balance: closingBalance,
        currency: formatDenominationDetails(closingCurrency),
        time: drawer.LAST_DRAWER_CLOSE_DT || new Date(),
        closedBy: drawer.CURRENT_ASSIGNEE_NAME || drawer.USER_ID
      },
      summary: {
        openingBalance: openingBalance,
        closingBalance: closingBalance,
        currentBalance: currentBalance,
        totalDeposits: totalDeposits,
        totalWithdrawals: totalWithdrawals,
        netChange: netChange,
        expectedClosingBalance: expectedClosingBalance,
        variance: variance,
        isBalanced: Math.abs(variance) < 0.01,
        overage: variance > 0 ? variance : 0,
        shortage: variance < 0 ? Math.abs(variance) : 0,
        transactionCount: transactions.length
      },
      transactions: transactions.slice(0, 20).map(tx => ({
        id: tx.id,
        reference: tx.transaction_ref_no || tx.reference_no,
        type: tx.tx_type || tx.transaction_type,
        amount: parseFloat(tx.amount || 0),
        description: tx.description || tx.narration,
        account: tx.customer_account || tx.account_number,
        time: tx.created_at || tx.createdAt
      })),
      denominations: {
        opening: formatDenominationDetails(openingCurrency),
        closing: formatDenominationDetails(closingCurrency),
        records: denominations.map(d => ({
          id: d.id,
          type: d.denomCountType,
          totalAmount: d.totalAmount,
          count: d.denomCount ? JSON.parse(d.denomCount) : [],
          createdAt: d.createDt || d.createdAt
        }))
      },
      history: history.slice(0, 10).map(h => ({
        action: h.action || h.event_type,
        description: h.description || h.details,
        performedBy: h.performed_by || h.user_id,
        time: h.created_at || h.createdAt
      })),
      limits: {
        minBalance: parseFloat(drawer.MIN_BAL || 0),
        maxBalance: parseFloat(drawer.MAX_BAL || 0),
        insuredAmount: parseFloat(drawer.TOTAL_INSURED_AMT || 0),
        cashLimitFlag: drawer.DRAWER_CASH_LIMIT_FG || 'N',
        insuredLimitFlag: drawer.DRAWER_INSURED_LIMIT_FG || 'N'
      },
      warnings: []
    };
    
    // Add warnings
    if (Math.abs(variance) > 0) {
      report.warnings.push(`Drawer has ${variance > 0 ? 'overage' : 'shortage'} of ₦${Math.abs(variance).toFixed(2)}`);
    }
    if (drawer.FORCE_CLOSED) {
      report.warnings.push(`Drawer was force closed: ${drawer.FORCE_CLOSE_REASON || 'No reason provided'}`);
    }
    if (drawer.WF_STATUS !== 'OPEN' && drawer.WF_STATUS !== 'OPENED') {
      report.warnings.push('Drawer is not currently open');
    }
    if (currentBalance > parseFloat(drawer.MAX_BAL || 0)) {
      report.warnings.push('Drawer balance exceeds maximum limit');
    }
    if (currentBalance < parseFloat(drawer.MIN_BAL || 0)) {
      report.warnings.push('Drawer balance is below minimum limit');
    }
    
    return res.status(200).json({
      success: true,
      message: 'Drawer opening report generated successfully',
      data: report
    });
    
  } catch (error) {
    console.error('❌ Error generating drawer opening report:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate drawer opening report',
      error: error.message
    });
  }
};

// ============================================
// GET DRAWER CLOSEOUT REPORT
// ============================================
export const getDrawerCloseoutReport = async (req, res) => {
  console.log('📊 getDrawerCloseoutReport function called');
  
  try {
    const { id } = req.params;
    const { startDate, endDate, includeDenominations = true } = req.query;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Drawer ID is required'
      });
    }
    
    // Find the drawer
    const drawer = await findDrawerByIdentifier(id);
    
    if (!drawer) {
      return res.status(404).json({
        success: false,
        message: `Drawer not found: ${id}`
      });
    }
    
    // Build date filters
    let dateFilter = {};
    if (startDate || endDate) {
      if (startDate) {
        dateFilter.created_at = { [Op.gte]: new Date(startDate) };
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        dateFilter.created_at = { ...dateFilter.created_at, [Op.lte]: endDateTime };
      }
    } else {
      // Default: last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      dateFilter.created_at = { [Op.gte]: thirtyDaysAgo };
    }
    
    // Get drawer transactions
    let transactions = [];
    try {
      const Transaction = (await import('../models/Transaction.js')).default;
      transactions = await Transaction.findAll({
        where: {
          [Op.or]: [
            { drawer_id: drawer.DRAWER_ID || drawer.id },
            { drawer_no: drawer.DRAWER_NO }
          ],
          ...dateFilter
        },
        order: [['created_at', 'DESC']]
      });
    } catch (txError) {
      console.log('⚠️ Could not fetch transactions:', txError.message);
    }
    
    // Calculate transaction totals
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let totalTransactions = 0;
    let transactionDetails = [];
    
    if (transactions.length > 0) {
      for (const tx of transactions) {
        const amount = parseFloat(tx.amount || 0);
        totalTransactions++;
        
        if (tx.tx_type === 'DEPOSIT' || tx.transaction_type === 'DEPOSIT' || tx.tx_type === 'CR') {
          totalDeposits += amount;
        } else {
          totalWithdrawals += amount;
        }
        
        transactionDetails.push({
          id: tx.id,
          reference: tx.transaction_ref_no || tx.reference_no,
          type: tx.tx_type || tx.transaction_type,
          amount: amount,
          date: tx.created_at || tx.createdAt,
          description: tx.description || tx.narration,
          account: tx.customer_account || tx.account_number
        });
      }
    }
    
    // Get drawer denomination data
    let closingCurrency = null;
    let openingCurrency = null;
    let denominations = [];
    
    try {
      const DrawerCurrencyDenomination = (await import('../models/DrawerCurrencyDenomination.js')).default;
      
      // Get opening denominations
      if (drawer.OPENING_CURRENCY) {
        try {
          openingCurrency = JSON.parse(drawer.OPENING_CURRENCY);
        } catch (e) {
          openingCurrency = null;
        }
      }
      
      // Get closing denominations
      if (drawer.CLOSING_CURRENCY) {
        try {
          closingCurrency = JSON.parse(drawer.CLOSING_CURRENCY);
        } catch (e) {
          closingCurrency = null;
        }
      }
      
      // Get denominations records
      if (includeDenominations) {
        const denomRecords = await DrawerCurrencyDenomination.findAll({
          where: {
            drawerId: drawer.id,
            ...dateFilter
          },
          order: [['createDt', 'DESC']],
          limit: 10
        });
        
        denominations = denomRecords.map(d => ({
          id: d.id,
          drawerCrncyDenomId: d.drawerCrncyDenomId,
          denomCountType: d.denomCountType,
          totalAmount: d.totalAmount,
          count: d.denomCount ? JSON.parse(d.denomCount) : [],
          createdAt: d.createDt || d.createdAt
        }));
      }
    } catch (denomError) {
      console.log('⚠️ Could not fetch denominations:', denomError.message);
    }
    
    // Calculate drawer session duration
    const sessionDuration = calculateSessionDuration(
      drawer.LAST_DRAWER_OPEN_DT,
      drawer.LAST_DRAWER_CLOSE_DT || new Date()
    );
    
    // Get drawer history summary
    let drawerHistory = [];
    try {
      const DrawerHistory = (await import('../models/DrawerHistory.js')).default;
      drawerHistory = await DrawerHistory.findAll({
        where: {
          drawer_id: drawer.DRAWER_ID || drawer.id
        },
        order: [['created_at', 'DESC']],
        limit: 20
      });
    } catch (historyError) {
      console.log('⚠️ Could not fetch drawer history:', historyError.message);
    }
    
    // Build the closeout report
    const report = {
      drawerInfo: {
        id: drawer.id,
        drawerId: drawer.DRAWER_ID,
        drawerNo: drawer.DRAWER_NO,
        drawerName: drawer.DRAWER_NM || `Drawer ${drawer.DRAWER_NO}`,
        drawerType: drawer.DRAWER_TY_CD || 'TELLER',
        businessUnit: drawer.BU_ID,
        branchCode: drawer.BRANCH_CODE,
        userId: drawer.USER_ID,
        status: drawer.WF_STATUS,
        createdAt: drawer.CREATE_DT,
        updatedAt: drawer.updated_at
      },
      sessionInfo: {
        lastOpened: drawer.LAST_DRAWER_OPEN_DT,
        lastClosed: drawer.LAST_DRAWER_CLOSE_DT || null,
        sessionDuration: sessionDuration,
        startBalance: parseFloat(drawer.SESSION_START_BALANCE || 0),
        endBalance: parseFloat(drawer.SESSION_END_BALANCE || drawer.CURRENT_BALANCE || 0),
        currentBalance: parseFloat(drawer.CURRENT_BALANCE || 0),
        overage: parseFloat(drawer.OVERAGE_AMT || 0),
        shortage: parseFloat(drawer.SHORTAGE_AMT || 0),
        isForceClosed: drawer.FORCE_CLOSED || false,
        forceCloseReason: drawer.FORCE_CLOSE_REASON || null,
        forceClosedBy: drawer.FORCE_CLOSED_BY || null
      },
      limits: {
        minBalance: parseFloat(drawer.MIN_BAL || 0),
        maxBalance: parseFloat(drawer.MAX_BAL || 0),
        insuredAmount: parseFloat(drawer.TOTAL_INSURED_AMT || 0),
        cashLimitFlag: drawer.DRAWER_CASH_LIMIT_FG || 'N',
        insuredLimitFlag: drawer.DRAWER_INSURED_LIMIT_FG || 'N',
        limitExceedCount: drawer.DRAWER_LIMIT_EXCEED_TM || 0
      },
      transactionSummary: {
        totalTransactions: totalTransactions,
        totalDeposits: totalDeposits,
        totalWithdrawals: totalWithdrawals,
        netChange: totalDeposits - totalWithdrawals,
        depositCount: transactions.filter(t => t.tx_type === 'DEPOSIT' || t.transaction_type === 'DEPOSIT' || t.tx_type === 'CR').length,
        withdrawalCount: transactions.filter(t => t.tx_type === 'WITHDRAWAL' || t.transaction_type === 'WITHDRAWAL' || t.tx_type === 'DR').length
      },
      transactions: transactionDetails.slice(0, 50), // Limit to 50 most recent
      denominations: {
        openingCurrency: openingCurrency,
        closingCurrency: closingCurrency,
        records: denominations
      },
      history: drawerHistory.slice(0, 10) // Limit to 10 history records
    };
    
    return res.status(200).json({
      success: true,
      message: 'Drawer closeout report generated successfully',
      data: report
    });
    
  } catch (error) {
    console.error('❌ Error generating drawer closeout report:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate drawer closeout report',
      error: error.message
    });
  }
};


// ============================================
// GET DRAWER BALANCE - FIXED
// ============================================
export const getDrawerBalance = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Drawer ID is required'
      });
    }
    
    // Find the drawer
    const drawer = await Drawer.findOne({
      where: {
        [Op.or]: [
          { DRAWER_NO: id.toString() },
          { USER_ID: id.toString() },
          { DRAWER_ID: parseInt(id) || 0 },
          { id: parseInt(id) || 0 }
        ]
      }
    });
    
    if (!drawer) {
      return res.status(404).json({
        success: false,
        message: `Drawer not found: ${id}`
      });
    }
    
    // Get drawer transactions summary - FIXED: Use sequelize.literal or QueryTypes
    const [summary] = await sequelize.query(
      `SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN transaction_type IN ('DEPOSIT', 'CR', 'CREDIT') THEN amount ELSE 0 END) as total_deposits,
        SUM(CASE WHEN transaction_type IN ('WITHDRAWAL', 'DR', 'DEBIT') THEN amount ELSE 0 END) as total_withdrawals,
        COUNT(CASE WHEN transaction_type IN ('DEPOSIT', 'CR', 'CREDIT') THEN 1 END) as deposit_count,
        COUNT(CASE WHEN transaction_type IN ('WITHDRAWAL', 'DR', 'DEBIT') THEN 1 END) as withdrawal_count
       FROM drawer_transactions 
       WHERE drawer_id = :drawerId`,
      {
        replacements: { drawerId: drawer.id },
        type: sequelize.QueryTypes.SELECT  // ✅ Use sequelize.QueryTypes instead of QueryTypes
      }
    );
    
    // Get today's transactions
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const [todaySummary] = await sequelize.query(
      `SELECT 
        COUNT(*) as today_transactions,
        SUM(CASE WHEN transaction_type IN ('DEPOSIT', 'CR', 'CREDIT') THEN amount ELSE 0 END) as today_deposits,
        SUM(CASE WHEN transaction_type IN ('WITHDRAWAL', 'DR', 'DEBIT') THEN amount ELSE 0 END) as today_withdrawals
       FROM drawer_transactions 
       WHERE drawer_id = :drawerId
       AND created_at >= :startDate
       AND created_at < :endDate`,
      {
        replacements: { 
          drawerId: drawer.id,
          startDate: today,
          endDate: tomorrow
        },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    // Get drawer status info
    const isOpen = drawer.WF_STATUS === 'OPEN' || drawer.WF_STATUS === 'OPENED';
    const currentBalance = parseFloat(drawer.CURRENT_BALANCE || 0);
    const minBalance = parseFloat(drawer.MIN_BAL || 0);
    const maxBalance = parseFloat(drawer.MAX_BAL || 0);
    
    return res.status(200).json({
      success: true,
      data: {
        drawer: {
          id: drawer.id,
          drawerId: drawer.DRAWER_ID,
          drawerNo: drawer.DRAWER_NO,
          drawerName: drawer.DRAWER_NM || `Drawer ${drawer.DRAWER_NO}`,
          currentBalance: currentBalance,
          status: drawer.WF_STATUS,
          isOpen: isOpen,
          minBalance: minBalance,
          maxBalance: maxBalance,
          availableBalance: Math.max(0, currentBalance - minBalance),
          isOverLimit: currentBalance > maxBalance,
          isUnderLimit: currentBalance < minBalance,
          cashLimitFlag: drawer.DRAWER_CASH_LIMIT_FG || 'N',
          insuredLimitFlag: drawer.DRAWER_INSURED_LIMIT_FG || 'N',
          userId: drawer.USER_ID,
          businessUnit: drawer.BU_ID,
          branchCode: drawer.BRANCH_CODE
        },
        summary: {
          totalTransactions: parseInt(summary?.total_transactions || 0),
          totalDeposits: parseFloat(summary?.total_deposits || 0),
          totalWithdrawals: parseFloat(summary?.total_withdrawals || 0),
          depositCount: parseInt(summary?.deposit_count || 0),
          withdrawalCount: parseInt(summary?.withdrawal_count || 0),
          netChange: parseFloat((summary?.total_deposits || 0) - (summary?.total_withdrawals || 0))
        },
        today: {
          transactions: parseInt(todaySummary?.today_transactions || 0),
          deposits: parseFloat(todaySummary?.today_deposits || 0),
          withdrawals: parseFloat(todaySummary?.today_withdrawals || 0),
          netChange: parseFloat((todaySummary?.today_deposits || 0) - (todaySummary?.today_withdrawals || 0))
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error retrieving drawer balance:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve drawer balance',
      error: error.message,
      stack: error.stack
    });
  }
};

// ============================================
// GET DRAWER ENQUIRY - Comprehensive drawer details
// ============================================
export const getDrawerEnquiry = async (req, res) => {
  console.log('🔍 getDrawerEnquiry function called');
  
  try {
    const { id } = req.params;
    const { includeTransactions = false, includeDenominations = false, limit = 50 } = req.query;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Drawer ID is required'
      });
    }
    
    // Find the drawer
    const drawer = await findDrawerByIdentifier(id);
    
    if (!drawer) {
      return res.status(404).json({
        success: false,
        message: `Drawer not found: ${id}`,
        hint: 'Try using DRAWER_NO (e.g., "1002") or DRAWER_ID (e.g., "2")'
      });
    }
    
    // Build the response object
    const response = {
      drawer: {
        id: drawer.id,
        drawerId: drawer.DRAWER_ID,
        drawerNo: drawer.DRAWER_NO,
        drawerName: drawer.DRAWER_NM || `Drawer ${drawer.DRAWER_NO}`,
        drawerType: drawer.DRAWER_TY_CD || 'TELLER',
        status: drawer.WF_STATUS || 'CLOSED',
        isOpen: drawer.WF_STATUS === 'OPEN' || drawer.WF_STATUS === 'OPENED',
        recordStatus: drawer.REC_ST || 'A',
        version: drawer.VERSION_NO || 1
      },
      balances: {
        currentBalance: parseFloat(drawer.CURRENT_BALANCE || 0),
        sessionStartBalance: parseFloat(drawer.SESSION_START_BALANCE || 0),
        sessionEndBalance: parseFloat(drawer.SESSION_END_BALANCE || 0),
        minBalance: parseFloat(drawer.MIN_BAL || 0),
        maxBalance: parseFloat(drawer.MAX_BAL || 0),
        availableBalance: Math.max(0, parseFloat(drawer.CURRENT_BALANCE || 0) - parseFloat(drawer.MIN_BAL || 0)),
        isOverLimit: parseFloat(drawer.CURRENT_BALANCE || 0) > parseFloat(drawer.MAX_BAL || 0),
        isUnderLimit: parseFloat(drawer.CURRENT_BALANCE || 0) < parseFloat(drawer.MIN_BAL || 0),
        cashLimitFlag: drawer.DRAWER_CASH_LIMIT_FG || 'N',
        insuredAmount: parseFloat(drawer.TOTAL_INSURED_AMT || 0),
        insuredLimitFlag: drawer.DRAWER_INSURED_LIMIT_FG || 'N',
        limitExceedCount: drawer.DRAWER_LIMIT_EXCEED_TM || 0
      },
      assignment: {
        userId: drawer.USER_ID,
        assigneeId: drawer.CURRENT_ASSIGNEE_ID,
        assigneeName: drawer.CURRENT_ASSIGNEE_NAME,
        assigneeRole: drawer.CURRENT_ASSIGNEE_ROLE || 'TELLER'
      },
      location: {
        businessUnit: drawer.BU_ID,
        branchCode: drawer.BRANCH_CODE,
        vaultType: drawer.VAULT_TYPE || 'BRANCH_VAULT'
      },
      session: {
        lastOpened: drawer.LAST_DRAWER_OPEN_DT,
        lastClosed: drawer.LAST_DRAWER_CLOSE_DT,
        sessionDuration: calculateSessionDuration(
          drawer.LAST_DRAWER_OPEN_DT,
          drawer.LAST_DRAWER_CLOSE_DT || new Date()
        ),
        isForceClosed: drawer.FORCE_CLOSED || false,
        forceCloseReason: drawer.FORCE_CLOSE_REASON,
        forceClosedBy: drawer.FORCE_CLOSED_BY,
        overage: parseFloat(drawer.OVERAGE_AMT || 0),
        shortage: parseFloat(drawer.SHORTAGE_AMT || 0)
      },
      currency: {
        openingCurrency: drawer.OPENING_CURRENCY ? JSON.parse(drawer.OPENING_CURRENCY) : null,
        closingCurrency: drawer.CLOSING_CURRENCY ? JSON.parse(drawer.CLOSING_CURRENCY) : null
      },
      timestamps: {
        createdAt: drawer.CREATE_DT || drawer.created_at,
        updatedAt: drawer.updated_at,
        createdBy: drawer.CREATED_BY,
        lastUpdatedBy: drawer.lastUpdatedBy
      }
    };
    
    // Include transactions if requested
    if (includeTransactions === 'true' || includeTransactions === true) {
      try {
        const Transaction = (await import('../models/Transaction.js')).default;
        const transactions = await Transaction.findAll({
          where: {
            [Op.or]: [
              { drawer_id: drawer.DRAWER_ID || drawer.id },
              { drawer_no: drawer.DRAWER_NO }
            ]
          },
          order: [['created_at', 'DESC']],
          limit: parseInt(limit) || 50
        });
        
        response.transactions = transactions.map(tx => ({
          id: tx.id,
          reference: tx.transaction_ref_no || tx.reference_no,
          type: tx.tx_type || tx.transaction_type,
          amount: parseFloat(tx.amount || 0),
          description: tx.description || tx.narration,
          account: tx.customer_account || tx.account_number,
          status: tx.status,
          createdAt: tx.created_at || tx.createdAt
        }));
        
        response.transactionSummary = {
          count: transactions.length,
          totalAmount: transactions.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0),
          deposits: transactions.filter(t => t.tx_type === 'DEPOSIT' || t.transaction_type === 'DEPOSIT').length,
          withdrawals: transactions.filter(t => t.tx_type === 'WITHDRAWAL' || t.transaction_type === 'WITHDRAWAL').length
        };
      } catch (txError) {
        console.log('⚠️ Could not fetch transactions:', txError.message);
        response.transactions = [];
        response.transactionSummary = { count: 0, totalAmount: 0, deposits: 0, withdrawals: 0 };
      }
    }
    
    // Include denominations if requested
    if (includeDenominations === 'true' || includeDenominations === true) {
      try {
        const DrawerCurrencyDenomination = (await import('../models/DrawerCurrencyDenomination.js')).default;
        const denominations = await DrawerCurrencyDenomination.findAll({
          where: {
            drawerId: drawer.id
          },
          order: [['createDt', 'DESC']],
          limit: parseInt(limit) || 10
        });
        
        response.denominations = denominations.map(d => ({
          id: d.id,
          drawerCrncyDenomId: d.drawerCrncyDenomId,
          type: d.denomCountType,
          totalAmount: d.totalAmount,
          count: d.denomCount ? JSON.parse(d.denomCount) : [],
          createdAt: d.createDt || d.createdAt
        }));
      } catch (denomError) {
        console.log('⚠️ Could not fetch denominations:', denomError.message);
        response.denominations = [];
      }
    }
    
    // Check if drawer can transact
    response.canTransact = (
      (drawer.WF_STATUS === 'OPEN' || drawer.WF_STATUS === 'OPENED') &&
      drawer.REC_ST === 'A' &&
      parseFloat(drawer.CURRENT_BALANCE || 0) <= parseFloat(drawer.MAX_BAL || 0)
    );
    
    // Add warning messages
    response.warnings = [];
    if (parseFloat(drawer.CURRENT_BALANCE || 0) > parseFloat(drawer.MAX_BAL || 0)) {
      response.warnings.push('Drawer balance exceeds maximum limit');
    }
    if (parseFloat(drawer.CURRENT_BALANCE || 0) < parseFloat(drawer.MIN_BAL || 0)) {
      response.warnings.push('Drawer balance is below minimum limit');
    }
    if (drawer.FORCE_CLOSED) {
      response.warnings.push(`Drawer was force closed: ${drawer.FORCE_CLOSE_REASON || 'No reason provided'}`);
    }
    if (drawer.WF_STATUS === 'CLOSED') {
      response.warnings.push('Drawer is currently closed');
    }
    
    return res.status(200).json({
      success: true,
      message: 'Drawer enquiry completed successfully',
      data: response
    });
    
  } catch (error) {
    console.error('❌ Error in drawer enquiry:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get drawer enquiry',
      error: error.message
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
};

// ============================================
// GET DRAWER TELLER SUMMARY
// ============================================
export const getDrawerTellerSummary = async (req, res) => {
  console.log('📊 getDrawerTellerSummary function called');
  
  try {
    const { userId } = req.params;
    const { startDate, endDate, includeDetails = false } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    // Find all drawers for this user
    const drawers = await Drawer.findAll({
      where: {
        USER_ID: userId,
        REC_ST: 'A'
      },
      order: [['CREATE_DT', 'DESC']]
    });
    
    if (drawers.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No drawers found for user: ${userId}`
      });
    }
    
    // Set date range
    let startDateTime, endDateTime;
    
    if (startDate && endDate) {
      startDateTime = new Date(startDate);
      startDateTime.setHours(0, 0, 0, 0);
      endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
    } else if (startDate) {
      startDateTime = new Date(startDate);
      startDateTime.setHours(0, 0, 0, 0);
      endDateTime = new Date(startDate);
      endDateTime.setHours(23, 59, 59, 999);
    } else {
      // Default: today
      const today = new Date();
      startDateTime = new Date(today);
      startDateTime.setHours(0, 0, 0, 0);
      endDateTime = new Date(today);
      endDateTime.setHours(23, 59, 59, 999);
    }
    
    // Get transactions for all drawers
    let allTransactions = [];
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let totalEMTL = 0;
    let transactionCount = 0;
    
    try {
      const Transaction = (await import('../models/Transaction.js')).default;
      
      // Get transactions for each drawer
      for (const drawer of drawers) {
        const drawerTransactions = await Transaction.findAll({
          where: {
            [Op.or]: [
              { drawer_id: drawer.DRAWER_ID || drawer.id },
              { drawer_no: drawer.DRAWER_NO }
            ],
            created_at: {
              [Op.between]: [startDateTime, endDateTime]
            }
          },
          order: [['created_at', 'DESC']]
        });
        
        allTransactions = [...allTransactions, ...drawerTransactions];
        
        for (const tx of drawerTransactions) {
          const amount = parseFloat(tx.amount || 0);
          transactionCount++;
          
          if (tx.tx_type === 'DEPOSIT' || tx.transaction_type === 'DEPOSIT' || tx.tx_type === 'CR') {
            totalDeposits += amount;
          } else {
            totalWithdrawals += amount;
          }
          
          // Add EMTL if available
          if (tx.emtl_amount) {
            totalEMTL += parseFloat(tx.emtl_amount || 0);
          }
        }
      }
    } catch (txError) {
      console.log('⚠️ Could not fetch transactions:', txError.message);
    }
    
    // Calculate drawer statistics
    let totalBalance = 0;
    let totalMinBalance = 0;
    let totalMaxBalance = 0;
    let openDrawers = 0;
    let closedDrawers = 0;
    let forceClosedDrawers = 0;
    
    for (const drawer of drawers) {
      totalBalance += parseFloat(drawer.CURRENT_BALANCE || 0);
      totalMinBalance += parseFloat(drawer.MIN_BAL || 0);
      totalMaxBalance += parseFloat(drawer.MAX_BAL || 0);
      
      if (drawer.WF_STATUS === 'OPEN' || drawer.WF_STATUS === 'OPENED') {
        openDrawers++;
      } else if (drawer.WF_STATUS === 'CLOSED') {
        closedDrawers++;
      }
      
      if (drawer.FORCE_CLOSED) {
        forceClosedDrawers++;
      }
    }
    
    const totalAvailable = Math.max(0, totalBalance - totalMinBalance);
    const netChange = totalDeposits - totalWithdrawals;
    
    // Build summary
    const summary = {
      user: {
        userId: userId,
        userName: req.user?.user_name || userId,
        fullName: req.user?.full_name || req.user?.preferred_name || null
      },
      dateRange: {
        start: startDateTime.toISOString(),
        end: endDateTime.toISOString()
      },
      drawerSummary: {
        totalDrawers: drawers.length,
        openDrawers: openDrawers,
        closedDrawers: closedDrawers,
        forceClosedDrawers: forceClosedDrawers,
        totalBalance: Math.round(totalBalance * 100) / 100,
        totalMinBalance: Math.round(totalMinBalance * 100) / 100,
        totalMaxBalance: Math.round(totalMaxBalance * 100) / 100,
        totalAvailable: Math.round(totalAvailable * 100) / 100,
        averageBalance: drawers.length > 0 ? Math.round((totalBalance / drawers.length) * 100) / 100 : 0
      },
      transactionSummary: {
        totalTransactions: transactionCount,
        totalDeposits: Math.round(totalDeposits * 100) / 100,
        totalWithdrawals: Math.round(totalWithdrawals * 100) / 100,
        totalEMTL: Math.round(totalEMTL * 100) / 100,
        netChange: Math.round(netChange * 100) / 100,
        depositCount: 0,
        withdrawalCount: 0
      }
    };
    
    // Count deposit and withdrawal transactions
    if (allTransactions.length > 0) {
      summary.transactionSummary.depositCount = allTransactions.filter(
        t => t.tx_type === 'DEPOSIT' || t.transaction_type === 'DEPOSIT' || t.tx_type === 'CR'
      ).length;
      summary.transactionSummary.withdrawalCount = allTransactions.filter(
        t => t.tx_type === 'WITHDRAWAL' || t.transaction_type === 'WITHDRAWAL' || t.tx_type === 'DR'
      ).length;
    }
    
    // Include detailed drawer information if requested
    let detailedDrawers = [];
    if (includeDetails === 'true' || includeDetails === true) {
      detailedDrawers = drawers.map(d => ({
        id: d.id,
        drawerId: d.DRAWER_ID,
        drawerNo: d.DRAWER_NO,
        drawerName: d.DRAWER_NM || `Drawer ${d.DRAWER_NO}`,
        drawerType: d.DRAWER_TY_CD || 'TELLER',
        status: d.WF_STATUS || 'CLOSED',
        isOpen: d.WF_STATUS === 'OPEN' || d.WF_STATUS === 'OPENED',
        currentBalance: parseFloat(d.CURRENT_BALANCE || 0),
        minBalance: parseFloat(d.MIN_BAL || 0),
        maxBalance: parseFloat(d.MAX_BAL || 0),
        availableBalance: Math.max(0, parseFloat(d.CURRENT_BALANCE || 0) - parseFloat(d.MIN_BAL || 0)),
        isForceClosed: d.FORCE_CLOSED || false,
        forceCloseReason: d.FORCE_CLOSE_REASON,
        lastOpened: d.LAST_DRAWER_OPEN_DT,
        lastClosed: d.LAST_DRAWER_CLOSE_DT,
        overage: parseFloat(d.OVERAGE_AMT || 0),
        shortage: parseFloat(d.SHORTAGE_AMT || 0),
        createdAt: d.CREATE_DT || d.created_at,
        updatedAt: d.updated_at
      }));
    }
    
    // Get top performing drawers
    const topDrawers = drawers
      .map(d => ({
        drawerNo: d.DRAWER_NO,
        drawerName: d.DRAWER_NM || `Drawer ${d.DRAWER_NO}`,
        balance: parseFloat(d.CURRENT_BALANCE || 0),
        status: d.WF_STATUS
      }))
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5);
    
    // Add warnings
    const warnings = [];
    if (totalBalance > totalMaxBalance) {
      warnings.push('Total drawer balance exceeds combined maximum limit');
    }
    if (totalBalance < totalMinBalance) {
      warnings.push('Total drawer balance is below combined minimum limit');
    }
    if (forceClosedDrawers > 0) {
      warnings.push(`${forceClosedDrawers} drawer(s) were force closed`);
    }
    if (openDrawers === 0) {
      warnings.push('No drawers are currently open');
    }
    
    const response = {
      success: true,
      message: 'Drawer teller summary generated successfully',
      data: {
        summary: summary,
        topDrawers: topDrawers,
        warnings: warnings,
        ...(includeDetails === 'true' || includeDetails === true) && { detailedDrawers: detailedDrawers }
      }
    };
    
    // Include recent transactions if available
    if (allTransactions.length > 0 && (includeDetails === 'true' || includeDetails === true)) {
      response.data.recentTransactions = allTransactions.slice(0, 20).map(tx => ({
        id: tx.id,
        reference: tx.transaction_ref_no || tx.reference_no,
        type: tx.tx_type || tx.transaction_type,
        amount: parseFloat(tx.amount || 0),
        description: tx.description || tx.narration,
        account: tx.customer_account || tx.account_number,
        drawer: tx.drawer_no || tx.drawer_id,
        time: tx.created_at || tx.createdAt
      }));
    }
    
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('❌ Error generating drawer teller summary:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate drawer teller summary',
      error: error.message
    });
  }
};

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
};
// ============================================
// GET DRAWER TRANSACTION BY ID
// ============================================
export const getDrawerTransactionById = async (req, res) => {
  console.log('🔍 getDrawerTransactionById function called');
  
  try {
    const { id } = req.params;
    const { transactionId } = req.query;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Drawer ID is required'
      });
    }
    
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }
    
    // Find the drawer
    const drawer = await findDrawerByIdentifier(id);
    
    if (!drawer) {
      return res.status(404).json({
        success: false,
        message: `Drawer not found: ${id}`
      });
    }
    
    // Find the transaction
    let transaction = null;
    let transactionSource = null;
    
    try {
      // Try to find in Transaction model first
      const Transaction = (await import('../models/Transaction.js')).default;
      transaction = await Transaction.findOne({
        where: {
          [Op.or]: [
            { drawer_id: drawer.DRAWER_ID || drawer.id },
            { drawer_no: drawer.DRAWER_NO }
          ],
          [Op.or]: [
            { id: transactionId },
            { transaction_ref_no: transactionId },
            { reference_no: transactionId }
          ]
        }
      });
      
      if (transaction) {
        transactionSource = 'Transaction';
      }
    } catch (txError) {
      console.log('⚠️ Could not search in Transaction model:', txError.message);
    }
    
    // If not found, try DepositTransaction model
    if (!transaction) {
      try {
        const DepositTransaction = (await import('../models/DepositTransaction.js')).default;
        transaction = await DepositTransaction.findOne({
          where: {
            [Op.or]: [
              { drawer_id: drawer.DRAWER_ID || drawer.id },
              { drawer_no: drawer.DRAWER_NO }
            ],
            [Op.or]: [
              { id: transactionId },
              { transaction_ref_no: transactionId },
              { reference_no: transactionId }
            ]
          }
        });
        
        if (transaction) {
          transactionSource = 'DepositTransaction';
        }
      } catch (txError) {
        console.log('⚠️ Could not search in DepositTransaction model:', txError.message);
      }
    }
    
    // If not found, try raw query on drawer_transactions table
    if (!transaction) {
      try {
        const [result] = await sequelize.query(
          `SELECT * FROM drawer_transactions 
           WHERE drawer_id = :drawerId 
           AND (id = :transactionId OR transaction_ref_no = :transactionId)
           LIMIT 1`,
          {
            replacements: {
              drawerId: drawer.id,
              transactionId: transactionId
            },
            type: QueryTypes.SELECT
          }
        );
        
        if (result) {
          transaction = result;
          transactionSource = 'drawer_transactions';
        }
      } catch (rawError) {
        console.log('⚠️ Could not search in drawer_transactions:', rawError.message);
      }
    }
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: `Transaction not found for drawer ${drawer.DRAWER_NO}`,
        searchedId: transactionId
      });
    }
    
    // Build response
    const response = {
      drawer: {
        id: drawer.id,
        drawerId: drawer.DRAWER_ID,
        drawerNo: drawer.DRAWER_NO,
        drawerName: drawer.DRAWER_NM || `Drawer ${drawer.DRAWER_NO}`
      },
      transaction: {
        id: transaction.id,
        reference: transaction.transaction_ref_no || transaction.reference_no || transaction.id,
        type: transaction.tx_type || transaction.transaction_type,
        amount: parseFloat(transaction.amount || 0),
        description: transaction.description || transaction.narration,
        account: transaction.customer_account || transaction.account_number,
        status: transaction.status,
        source: transactionSource,
        createdAt: transaction.created_at || transaction.createdAt || transaction.CREATE_DT,
        updatedAt: transaction.updated_at || transaction.updatedAt
      },
      details: {
        previousBalance: parseFloat(transaction.previous_balance || transaction.balance_before || 0),
        newBalance: parseFloat(transaction.new_balance || transaction.balance_after || 0),
        emtlAmount: parseFloat(transaction.emtl_amount || 0),
        emtlApplicable: transaction.emtl_applicable || false,
        emtlReason: transaction.emtl_reason || null,
        isReversal: transaction.is_reversal || false,
        reversalReason: transaction.reversal_reason || null
      },
      customer: {
        name: transaction.depositor_name || transaction.customer_name || null,
        account: transaction.account_number || transaction.customer_account || null,
        phone: transaction.phone_number || null
      },
      audit: {
        createdBy: transaction.created_by || transaction.CREATED_BY,
        approvedBy: transaction.approved_by || transaction.APPROVED_BY,
        approvedAt: transaction.approved_at || transaction.APPROVED_DT,
        serverProcessingDate: transaction.server_processing_date,
        systemTime: transaction.system_time
      }
    };
    
    return res.status(200).json({
      success: true,
      message: 'Transaction retrieved successfully',
      data: response
    });
    
  } catch (error) {
    console.error('❌ Error retrieving drawer transaction:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve drawer transaction',
      error: error.message
    });
  }
};

// controllers/DrawerController.js - Updated getDrawerTransactionHistory

export const getDrawerTransactionHistory = async (req, res) => {
  console.log('📊 getDrawerTransactionHistory function called');
  console.log('📊 Request params:', req.params);
  console.log('📊 Request query:', req.query);
  
  try {
    const { id } = req.params;
    const { 
      startDate, 
      endDate, 
      limit = 50, 
      offset = 0,
      transactionType,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Drawer ID is required'
      });
    }
    
    // Find the drawer using the service
    const drawer = await drawerService.findDrawerByIdentifier(id);
    
    if (!drawer) {
      return res.status(404).json({
        success: false,
        message: `Drawer not found: ${id}`
      });
    }
    
    console.log('✅ Drawer found:', {
      id: drawer.id,
      DRAWER_NO: drawer.DRAWER_NO,
      USER_ID: drawer.USER_ID,
      CURRENT_BALANCE: drawer.CURRENT_BALANCE
    });
    
    // Build the SQL query - using raw SQL for full control
    let sql = `
      SELECT 
        id,
        drawer_id,
        drawer_no,
        transaction_type,
        amount,
        previous_balance,
        new_balance,
        transaction_ref_no,
        customer_account,
        description,
        user_id,
        created_at
      FROM drawer_transactions 
      WHERE drawer_id = ?
    `;
    
    const replacements = [drawer.id];
    
    // Apply date filters
    if (startDate) {
      sql += ' AND created_at >= ?';
      replacements.push(new Date(startDate));
    }
    if (endDate) {
      sql += ' AND created_at <= ?';
      replacements.push(new Date(endDate));
    }
    
    // Apply type filter
    if (transactionType) {
      const types = transactionType.split(',').map(t => `'${t.trim()}'`).join(',');
      sql += ` AND transaction_type IN (${types})`;
    }
    
    // Get total count
    const countSql = sql.replace(
      'SELECT \n        id,\n        drawer_id,\n        drawer_no,\n        transaction_type,\n        amount,\n        previous_balance,\n        new_balance,\n        transaction_ref_no,\n        customer_account,\n        description,\n        user_id,\n        created_at',
      'SELECT COUNT(*) as total'
    );
    
    const [countResult] = await sequelize.query(countSql, {
      replacements: replacements,
      type: sequelize.QueryTypes.SELECT
    });
    const totalCount = parseInt(countResult.total || 0);
    
    // Add pagination
    sql += ` ORDER BY ${sortBy} ${sortOrder} LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;
    
    const drawerTransactions = await sequelize.query(sql, {
      replacements: replacements,
      type: sequelize.QueryTypes.SELECT
    });
    
    // Calculate summary statistics
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let depositCount = 0;
    let withdrawalCount = 0;
    let totalAmount = 0;
    
    drawerTransactions.forEach((tx) => {
      const amount = parseFloat(tx.amount || 0);
      totalAmount += amount;
      
      const type = tx.transaction_type || '';
      if (type.toUpperCase() === 'DEPOSIT' || type.toUpperCase() === 'CREDIT') {
        totalDeposits += amount;
        depositCount++;
      } else {
        totalWithdrawals += amount;
        withdrawalCount++;
      }
    });
    
    // Format transactions to match expected response
    const formattedTransactions = drawerTransactions.map((tx) => ({
      id: tx.id,
      reference: tx.transaction_ref_no || tx.id,
      type: tx.transaction_type,
      amount: parseFloat(tx.amount || 0),
      description: tx.description || '',
      account: tx.customer_account || '',
      previousBalance: parseFloat(tx.previous_balance || 0),
      newBalance: parseFloat(tx.new_balance || 0),
      createdBy: tx.user_id || '',
      createdAt: tx.created_at,
      drawerNo: tx.drawer_no
    }));
    
    // Build response
    const response = {
      drawer: {
        id: drawer.id,
        drawerId: drawer.DRAWER_ID,
        drawerNo: drawer.DRAWER_NO,
        drawerName: drawer.DRAWER_NM || `Drawer ${drawer.DRAWER_NO}`,
        currentBalance: parseFloat(drawer.CURRENT_BALANCE || 0),
        status: drawer.WF_STATUS
      },
      summary: {
        totalTransactions: totalCount,
        totalDeposits: totalDeposits,
        totalWithdrawals: totalWithdrawals,
        totalAmount: totalAmount,
        depositCount: depositCount,
        withdrawalCount: withdrawalCount,
        netChange: totalDeposits - totalWithdrawals
      },
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        transactionType: transactionType || null
      },
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(totalCount / parseInt(limit))
      },
      transactions: formattedTransactions
    };
    
    return res.status(200).json({
      success: true,
      message: 'Drawer transaction history retrieved successfully',
      data: response
    });
    
  } catch (error) {
    console.error('❌ Error retrieving drawer transaction history:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve drawer transaction history',
      error: error.message,
      stack: error.stack
    });
  }
};

// ============================================
// GET DRAWER TRANSACTION SUMMARY
// ============================================
export const getDrawerTransactionSummary = async (req, res) => {
  console.log('📊 getDrawerTransactionSummary function called');
  
  try {
    const { id } = req.params;
    const { 
      startDate, 
      endDate, 
      period = 'today', // today, yesterday, week, month, custom
      groupBy = 'day' // day, week, month, type
    } = req.query;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Drawer ID is required'
      });
    }
    
    // Find the drawer
    const drawer = await findDrawerByIdentifier(id);
    
    if (!drawer) {
      return res.status(404).json({
        success: false,
        message: `Drawer not found: ${id}`
      });
    }
    
    // Set date range based on period
    let startDateTime, endDateTime;
    const now = new Date();
    
    switch (period) {
      case 'today':
        startDateTime = new Date(now);
        startDateTime.setHours(0, 0, 0, 0);
        endDateTime = new Date(now);
        endDateTime.setHours(23, 59, 59, 999);
        break;
      case 'yesterday':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        startDateTime = new Date(yesterday);
        startDateTime.setHours(0, 0, 0, 0);
        endDateTime = new Date(yesterday);
        endDateTime.setHours(23, 59, 59, 999);
        break;
      case 'week':
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - 7);
        startDateTime = new Date(weekStart);
        startDateTime.setHours(0, 0, 0, 0);
        endDateTime = new Date(now);
        endDateTime.setHours(23, 59, 59, 999);
        break;
      case 'month':
        const monthStart = new Date(now);
        monthStart.setDate(monthStart.getDate() - 30);
        startDateTime = new Date(monthStart);
        startDateTime.setHours(0, 0, 0, 0);
        endDateTime = new Date(now);
        endDateTime.setHours(23, 59, 59, 999);
        break;
      case 'custom':
        if (startDate) {
          startDateTime = new Date(startDate);
          startDateTime.setHours(0, 0, 0, 0);
        } else {
          startDateTime = new Date(now);
          startDateTime.setHours(0, 0, 0, 0);
        }
        if (endDate) {
          endDateTime = new Date(endDate);
          endDateTime.setHours(23, 59, 59, 999);
        } else {
          endDateTime = new Date(now);
          endDateTime.setHours(23, 59, 59, 999);
        }
        break;
      default:
        startDateTime = new Date(now);
        startDateTime.setHours(0, 0, 0, 0);
        endDateTime = new Date(now);
        endDateTime.setHours(23, 59, 59, 999);
    }
    
    // Get all transactions for the period
    let allTransactions = [];
    try {
      const [results] = await sequelize.query(
        `SELECT * FROM drawer_transactions 
         WHERE drawer_id = :drawerId
         AND created_at BETWEEN :startDate AND :endDate
         ORDER BY created_at ASC`,
        {
          replacements: {
            drawerId: drawer.id,
            startDate: startDateTime,
            endDate: endDateTime
          },
          type: QueryTypes.SELECT
        }
      );
      allTransactions = results || [];
    } catch (err) {
      console.log('⚠️ Could not fetch transactions for summary:', err.message);
    }
    
    // If no transactions found, try Transaction model
    if (allTransactions.length === 0) {
      try {
        const Transaction = (await import('../models/Transaction.js')).default;
        const transactions = await Transaction.findAll({
          where: {
            [Op.or]: [
              { drawer_id: drawer.DRAWER_ID || drawer.id },
              { drawer_no: drawer.DRAWER_NO }
            ],
            created_at: {
              [Op.between]: [startDateTime, endDateTime]
            }
          },
          order: [['created_at', 'ASC']]
        });
        allTransactions = transactions;
      } catch (txError) {
        console.log('⚠️ Could not fetch from Transaction model:', txError.message);
      }
    }
    
    // Calculate summary
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let totalEMTL = 0;
    let depositCount = 0;
    let withdrawalCount = 0;
    let totalTransactions = allTransactions.length;
    let totalAmount = 0;
    
    // Group by day/week/month/type
    let groupedData = {};
    let hourlyData = {};
    let typeBreakdown = {
      DEPOSIT: { count: 0, amount: 0 },
      WITHDRAWAL: { count: 0, amount: 0 },
      TRANSFER: { count: 0, amount: 0 },
      OTHER: { count: 0, amount: 0 }
    };
    
    for (const tx of allTransactions) {
      const amount = parseFloat(tx.amount || 0);
      const type = tx.transaction_type || tx.tx_type || 'OTHER';
      const date = new Date(tx.created_at || tx.CREATE_DT);
      
      totalAmount += amount;
      
      // Type breakdown
      if (type === 'DEPOSIT' || type === 'CR') {
        totalDeposits += amount;
        depositCount++;
        typeBreakdown.DEPOSIT.count++;
        typeBreakdown.DEPOSIT.amount += amount;
      } else if (type === 'WITHDRAWAL' || type === 'DR') {
        totalWithdrawals += amount;
        withdrawalCount++;
        typeBreakdown.WITHDRAWAL.count++;
        typeBreakdown.WITHDRAWAL.amount += amount;
      } else if (type === 'TRANSFER') {
        typeBreakdown.TRANSFER.count++;
        typeBreakdown.TRANSFER.amount += amount;
      } else {
        typeBreakdown.OTHER.count++;
        typeBreakdown.OTHER.amount += amount;
      }
      
      // EMTL
      const emtl = parseFloat(tx.emtl_amount || 0);
      totalEMTL += emtl;
      
      // Group by day
      const dayKey = date.toISOString().split('T')[0];
      if (!groupedData[dayKey]) {
        groupedData[dayKey] = {
          date: dayKey,
          deposits: 0,
          withdrawals: 0,
          depositCount: 0,
          withdrawalCount: 0,
          total: 0,
          emtl: 0
        };
      }
      if (type === 'DEPOSIT' || type === 'CR') {
        groupedData[dayKey].deposits += amount;
        groupedData[dayKey].depositCount++;
      } else {
        groupedData[dayKey].withdrawals += amount;
        groupedData[dayKey].withdrawalCount++;
      }
      groupedData[dayKey].total += amount;
      groupedData[dayKey].emtl += emtl;
      
      // Group by hour
      const hourKey = date.getHours();
      if (!hourlyData[hourKey]) {
        hourlyData[hourKey] = {
          hour: hourKey,
          label: `${hourKey}:00 - ${hourKey + 1}:00`,
          deposits: 0,
          withdrawals: 0,
          total: 0
        };
      }
      if (type === 'DEPOSIT' || type === 'CR') {
        hourlyData[hourKey].deposits += amount;
      } else {
        hourlyData[hourKey].withdrawals += amount;
      }
      hourlyData[hourKey].total += amount;
    }
    
    // Convert grouped data to array and sort
    const dailySummary = Object.values(groupedData).sort((a, b) => a.date.localeCompare(b.date));
    const hourlySummary = Object.values(hourlyData).sort((a, b) => a.hour - b.hour);
    
    // Get drawer information
    const drawerInfo = {
      id: drawer.id,
      drawerId: drawer.DRAWER_ID,
      drawerNo: drawer.DRAWER_NO,
      drawerName: drawer.DRAWER_NM || `Drawer ${drawer.DRAWER_NO}`,
      currentBalance: parseFloat(drawer.CURRENT_BALANCE || 0),
      startBalance: parseFloat(drawer.SESSION_START_BALANCE || 0),
      endBalance: parseFloat(drawer.SESSION_END_BALANCE || drawer.CURRENT_BALANCE || 0),
      status: drawer.WF_STATUS,
      isOpen: drawer.WF_STATUS === 'OPEN' || drawer.WF_STATUS === 'OPENED'
    };
    
    // Calculate averages
    const avgDeposit = depositCount > 0 ? totalDeposits / depositCount : 0;
    const avgWithdrawal = withdrawalCount > 0 ? totalWithdrawals / withdrawalCount : 0;
    const avgTransaction = totalTransactions > 0 ? totalAmount / totalTransactions : 0;
    
    // Build response
    const response = {
      drawer: drawerInfo,
      period: {
        start: startDateTime.toISOString(),
        end: endDateTime.toISOString(),
        label: period,
        days: Math.ceil((endDateTime - startDateTime) / (1000 * 60 * 60 * 24)) + 1
      },
      summary: {
        totalTransactions: totalTransactions,
        totalDeposits: totalDeposits,
        totalWithdrawals: totalWithdrawals,
        totalEMTL: totalEMTL,
        totalAmount: totalAmount,
        depositCount: depositCount,
        withdrawalCount: withdrawalCount,
        netChange: totalDeposits - totalWithdrawals,
        avgDeposit: avgDeposit,
        avgWithdrawal: avgWithdrawal,
        avgTransaction: avgTransaction,
        successRate: totalTransactions > 0 ? 100 : 0 // Could be enhanced with failed transactions
      },
      breakdown: {
        byType: typeBreakdown,
        byDay: dailySummary,
        byHour: hourlySummary
      },
      dailyAverage: {
        deposits: dailySummary.length > 0 ? totalDeposits / dailySummary.length : 0,
        withdrawals: dailySummary.length > 0 ? totalWithdrawals / dailySummary.length : 0,
        transactions: dailySummary.length > 0 ? totalTransactions / dailySummary.length : 0
      }
    };
    
    return res.status(200).json({
      success: true,
      message: 'Drawer transaction summary generated successfully',
      data: response
    });
    
  } catch (error) {
    console.error('❌ Error generating drawer transaction summary:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate drawer transaction summary',
      error: error.message
    });
  }
};

// ============================================
// GET DRAWER TRANSACTIONS
// ============================================
export const getDrawerTransactions = async (req, res) => {
  console.log('📊 getDrawerTransactions function called');
  
  try {
    const { id } = req.params;
    const { 
      limit = 50, 
      offset = 0,
      startDate,
      endDate,
      transactionType,
      status,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Drawer ID is required'
      });
    }
    
    // Find the drawer
    const drawer = await findDrawerByIdentifier(id);
    
    if (!drawer) {
      return res.status(404).json({
        success: false,
        message: `Drawer not found: ${id}`
      });
    }
    
    // Build date filters
    let dateFilter = {};
    if (startDate || endDate) {
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        dateFilter.created_at = { [Op.gte]: start };
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.created_at = { ...dateFilter.created_at, [Op.lte]: end };
      }
    }
    
    // Build type filter
    let typeFilter = {};
    if (transactionType) {
      const types = transactionType.split(',').map(t => t.trim().toUpperCase());
      typeFilter.transaction_type = { [Op.in]: types };
    }
    
    // Build status filter
    let statusFilter = {};
    if (status) {
      const statuses = status.split(',').map(s => s.trim().toUpperCase());
      statusFilter.status = { [Op.in]: statuses };
    }
    
    // Try to get transactions from drawer_transactions table first
    let transactions = [];
    let totalCount = 0;
    
    try {
      // Build where clause for raw query
      let whereClause = 'drawer_id = :drawerId';
      const replacements = { drawerId: drawer.id };
      
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        whereClause += ' AND created_at >= :startDate';
        replacements.startDate = start;
      }
      
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        whereClause += ' AND created_at <= :endDate';
        replacements.endDate = end;
      }
      
      if (transactionType) {
        const types = transactionType.split(',').map(t => `'${t.trim().toUpperCase()}'`).join(',');
        whereClause += ` AND UPPER(transaction_type) IN (${types})`;
      }
      
      if (status) {
        const statuses = status.split(',').map(s => `'${s.trim().toUpperCase()}'`).join(',');
        whereClause += ` AND UPPER(status) IN (${statuses})`;
      }
      
      // Get total count
      const [countResult] = await sequelize.query(
        `SELECT COUNT(*) as total FROM drawer_transactions WHERE ${whereClause}`,
        {
          replacements: replacements,
          type: QueryTypes.SELECT
        }
      );
      totalCount = parseInt(countResult.total || 0);
      
      // Get paginated results
      const orderClause = `ORDER BY ${sortBy} ${sortOrder}`;
      const limitClause = `LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;
      
      const results = await sequelize.query(
        `SELECT * FROM drawer_transactions WHERE ${whereClause} ${orderClause} ${limitClause}`,
        {
          replacements: replacements,
          type: QueryTypes.SELECT
        }
      );
      
      transactions = results;
      
    } catch (rawError) {
      console.log('⚠️ Could not fetch from drawer_transactions:', rawError.message);
    }
    
    // If no transactions found, try Transaction model
    if (transactions.length === 0) {
      try {
        const Transaction = (await import('../models/Transaction.js')).default;
        
        const where = {
          [Op.or]: [
            { drawer_id: drawer.DRAWER_ID || drawer.id },
            { drawer_no: drawer.DRAWER_NO }
          ],
          ...dateFilter,
          ...typeFilter,
          ...statusFilter
        };
        
        const result = await Transaction.findAndCountAll({
          where: where,
          order: [[sortBy, sortOrder]],
          limit: parseInt(limit),
          offset: parseInt(offset)
        });
        
        transactions = result.rows;
        totalCount = result.count;
        
      } catch (txError) {
        console.log('⚠️ Could not fetch from Transaction model:', txError.message);
      }
    }
    
    // Format transactions
    const formattedTransactions = transactions.map(tx => ({
      id: tx.id,
      reference: tx.transaction_ref_no || tx.reference_no || tx.id,
      type: tx.transaction_type || tx.tx_type,
      amount: parseFloat(tx.amount || 0),
      description: tx.description || tx.narration || '',
      account: tx.customer_account || tx.account_number || '',
      previousBalance: parseFloat(tx.previous_balance || 0),
      newBalance: parseFloat(tx.new_balance || 0),
      status: tx.status || 'COMPLETED',
      createdBy: tx.user_id || tx.created_by || tx.CREATED_BY,
      createdAt: tx.created_at || tx.CREATE_DT,
      updatedAt: tx.updated_at || tx.updatedAt,
      emtlAmount: parseFloat(tx.emtl_amount || 0),
      emtlApplicable: tx.emtl_applicable || false,
      emtlReason: tx.emtl_reason || null,
      isReversal: tx.is_reversal || false,
      reversalReason: tx.reversal_reason || null,
      approvedBy: tx.approved_by || tx.APPROVED_BY,
      approvedAt: tx.approved_at || tx.APPROVED_DT,
      serverProcessingDate: tx.server_processing_date,
      systemTime: tx.system_time
    }));
    
    // Build response
    const response = {
      drawer: {
        id: drawer.id,
        drawerId: drawer.DRAWER_ID,
        drawerNo: drawer.DRAWER_NO,
        drawerName: drawer.DRAWER_NM || `Drawer ${drawer.DRAWER_NO}`,
        currentBalance: parseFloat(drawer.CURRENT_BALANCE || 0),
        status: drawer.WF_STATUS,
        isOpen: drawer.WF_STATUS === 'OPEN' || drawer.WF_STATUS === 'OPENED'
      },
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(totalCount / parseInt(limit))
      },
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        transactionType: transactionType || null,
        status: status || null
      },
      transactions: formattedTransactions
    };
    
    // Add summary if transactions exist
    if (formattedTransactions.length > 0) {
      const totalDeposits = formattedTransactions
        .filter(t => t.type === 'DEPOSIT' || t.type === 'CR')
        .reduce((sum, t) => sum + t.amount, 0);
      
      const totalWithdrawals = formattedTransactions
        .filter(t => t.type === 'WITHDRAWAL' || t.type === 'DR')
        .reduce((sum, t) => sum + t.amount, 0);
      
      const totalEMTL = formattedTransactions.reduce((sum, t) => sum + t.emtlAmount, 0);
      
      response.summary = {
        totalTransactions: formattedTransactions.length,
        totalDeposits: totalDeposits,
        totalWithdrawals: totalWithdrawals,
        totalEMTL: totalEMTL,
        netChange: totalDeposits - totalWithdrawals,
        depositCount: formattedTransactions.filter(t => t.type === 'DEPOSIT' || t.type === 'CR').length,
        withdrawalCount: formattedTransactions.filter(t => t.type === 'WITHDRAWAL' || t.type === 'DR').length
      };
    }
    
    return res.status(200).json({
      success: true,
      message: 'Drawer transactions retrieved successfully',
      data: response
    });
    
  } catch (error) {
    console.error('❌ Error retrieving drawer transactions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve drawer transactions',
      error: error.message
    });
  }
};
// ============================================
// GET MULTIPLE DRAWERS ENQUIRY
// ============================================
export const getMultipleDrawersEnquiry = async (req, res) => {
  console.log('🔍 getMultipleDrawersEnquiry function called');
  
  try {
    const { ids } = req.query;
    const { includeTransactions = false, includeDenominations = false, limit = 10 } = req.query;
    
    if (!ids) {
      return res.status(400).json({
        success: false,
        message: 'Drawer IDs are required. Provide as comma-separated list: ?ids=1001,1002,1003'
      });
    }
    
    // Parse IDs
    const drawerIds = ids.split(',').map(id => id.trim());
    
    if (drawerIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one valid drawer ID is required'
      });
    }
    
    // Find all drawers
    const drawers = [];
    const notFound = [];
    const errors = [];
    
    for (const id of drawerIds) {
      try {
        const drawer = await findDrawerByIdentifier(id);
        if (drawer) {
          drawers.push(drawer);
        } else {
          notFound.push(id);
        }
      } catch (error) {
        errors.push({ id, error: error.message });
      }
    }
    
    if (drawers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No drawers found',
        notFound: notFound,
        errors: errors
      });
    }
    
    // Build response for each drawer
    const drawerResponses = [];
    let totalBalance = 0;
    let totalAvailable = 0;
    let openCount = 0;
    let closedCount = 0;
    
    for (const drawer of drawers) {
      const currentBalance = parseFloat(drawer.CURRENT_BALANCE || 0);
      const minBalance = parseFloat(drawer.MIN_BAL || 0);
      const maxBalance = parseFloat(drawer.MAX_BAL || 0);
      const isOpen = drawer.WF_STATUS === 'OPEN' || drawer.WF_STATUS === 'OPENED';
      
      totalBalance += currentBalance;
      totalAvailable += Math.max(0, currentBalance - minBalance);
      
      if (isOpen) {
        openCount++;
      } else {
        closedCount++;
      }
      
      const drawerData = {
        id: drawer.id,
        drawerId: drawer.DRAWER_ID,
        drawerNo: drawer.DRAWER_NO,
        drawerName: drawer.DRAWER_NM || `Drawer ${drawer.DRAWER_NO}`,
        drawerType: drawer.DRAWER_TY_CD || 'TELLER',
        status: drawer.WF_STATUS || 'CLOSED',
        isOpen: isOpen,
        recordStatus: drawer.REC_ST || 'A',
        balances: {
          currentBalance: currentBalance,
          sessionStartBalance: parseFloat(drawer.SESSION_START_BALANCE || 0),
          sessionEndBalance: parseFloat(drawer.SESSION_END_BALANCE || 0),
          minBalance: minBalance,
          maxBalance: maxBalance,
          availableBalance: Math.max(0, currentBalance - minBalance),
          isOverLimit: currentBalance > maxBalance,
          isUnderLimit: currentBalance < minBalance,
          cashLimitFlag: drawer.DRAWER_CASH_LIMIT_FG || 'N',
          insuredAmount: parseFloat(drawer.TOTAL_INSURED_AMT || 0),
          insuredLimitFlag: drawer.DRAWER_INSURED_LIMIT_FG || 'N'
        },
        assignment: {
          userId: drawer.USER_ID,
          assigneeId: drawer.CURRENT_ASSIGNEE_ID,
          assigneeName: drawer.CURRENT_ASSIGNEE_NAME,
          assigneeRole: drawer.CURRENT_ASSIGNEE_ROLE || 'TELLER'
        },
        location: {
          businessUnit: drawer.BU_ID,
          branchCode: drawer.BRANCH_CODE,
          vaultType: drawer.VAULT_TYPE || 'BRANCH_VAULT'
        },
        session: {
          lastOpened: drawer.LAST_DRAWER_OPEN_DT,
          lastClosed: drawer.LAST_DRAWER_CLOSE_DT,
          sessionDuration: calculateSessionDuration(
            drawer.LAST_DRAWER_OPEN_DT,
            drawer.LAST_DRAWER_CLOSE_DT || new Date()
          ),
          isForceClosed: drawer.FORCE_CLOSED || false,
          forceCloseReason: drawer.FORCE_CLOSE_REASON,
          forceClosedBy: drawer.FORCE_CLOSED_BY,
          overage: parseFloat(drawer.OVERAGE_AMT || 0),
          shortage: parseFloat(drawer.SHORTAGE_AMT || 0)
        },
        currency: {
          openingCurrency: drawer.OPENING_CURRENCY ? JSON.parse(drawer.OPENING_CURRENCY) : null,
          closingCurrency: drawer.CLOSING_CURRENCY ? JSON.parse(drawer.CLOSING_CURRENCY) : null
        },
        timestamps: {
          createdAt: drawer.CREATE_DT || drawer.created_at,
          updatedAt: drawer.updated_at,
          createdBy: drawer.CREATED_BY
        },
        canTransact: isOpen && drawer.REC_ST === 'A' && currentBalance <= maxBalance
      };
      
      // Add warnings
      drawerData.warnings = [];
      if (currentBalance > maxBalance) {
        drawerData.warnings.push('Drawer balance exceeds maximum limit');
      }
      if (currentBalance < minBalance) {
        drawerData.warnings.push('Drawer balance is below minimum limit');
      }
      if (drawer.FORCE_CLOSED) {
        drawerData.warnings.push(`Drawer was force closed: ${drawer.FORCE_CLOSE_REASON || 'No reason provided'}`);
      }
      if (!isOpen) {
        drawerData.warnings.push('Drawer is currently closed');
      }
      
      // Include transactions if requested
      if (includeTransactions === 'true' || includeTransactions === true) {
        try {
          const Transaction = (await import('../models/Transaction.js')).default;
          const transactions = await Transaction.findAll({
            where: {
              [Op.or]: [
                { drawer_id: drawer.DRAWER_ID || drawer.id },
                { drawer_no: drawer.DRAWER_NO }
              ]
            },
            order: [['created_at', 'DESC']],
            limit: parseInt(limit) || 10
          });
          
          drawerData.transactions = transactions.map(tx => ({
            id: tx.id,
            reference: tx.transaction_ref_no || tx.reference_no,
            type: tx.tx_type || tx.transaction_type,
            amount: parseFloat(tx.amount || 0),
            description: tx.description || tx.narration,
            account: tx.customer_account || tx.account_number,
            status: tx.status,
            createdAt: tx.created_at || tx.createdAt
          }));
          
          drawerData.transactionSummary = {
            count: transactions.length,
            totalAmount: transactions.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0),
            deposits: transactions.filter(t => t.tx_type === 'DEPOSIT' || t.transaction_type === 'DEPOSIT').length,
            withdrawals: transactions.filter(t => t.tx_type === 'WITHDRAWAL' || t.transaction_type === 'WITHDRAWAL').length
          };
        } catch (txError) {
          console.log('⚠️ Could not fetch transactions for drawer:', drawer.DRAWER_NO, txError.message);
          drawerData.transactions = [];
          drawerData.transactionSummary = { count: 0, totalAmount: 0, deposits: 0, withdrawals: 0 };
        }
      }
      
      // Include denominations if requested
      if (includeDenominations === 'true' || includeDenominations === true) {
        try {
          const DrawerCurrencyDenomination = (await import('../models/DrawerCurrencyDenomination.js')).default;
          const denominations = await DrawerCurrencyDenomination.findAll({
            where: {
              drawerId: drawer.id
            },
            order: [['createDt', 'DESC']],
            limit: parseInt(limit) || 5
          });
          
          drawerData.denominations = denominations.map(d => ({
            id: d.id,
            drawerCrncyDenomId: d.drawerCrncyDenomId,
            type: d.denomCountType,
            totalAmount: d.totalAmount,
            count: d.denomCount ? JSON.parse(d.denomCount) : [],
            createdAt: d.createDt || d.createdAt
          }));
        } catch (denomError) {
          console.log('⚠️ Could not fetch denominations for drawer:', drawer.DRAWER_NO, denomError.message);
          drawerData.denominations = [];
        }
      }
      
      drawerResponses.push(drawerData);
    }
    
    // Build summary
    const summary = {
      totalDrawers: drawers.length,
      openDrawers: openCount,
      closedDrawers: closedCount,
      totalBalance: Math.round(totalBalance * 100) / 100,
      totalAvailable: Math.round(totalAvailable * 100) / 100,
      notFound: notFound,
      errors: errors
    };
    
    return res.status(200).json({
      success: true,
      message: `Retrieved ${drawers.length} drawer(s)`,
      summary: summary,
      data: drawerResponses
    });
    
  } catch (error) {
    console.error('❌ Error in multiple drawers enquiry:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get multiple drawers enquiry',
      error: error.message
    });
  }
};
// ============================================
// GET MY OPEN DRAWERS
// ============================================
export const getMyOpenDrawers = async (req, res) => {
  console.log('🔍 getMyOpenDrawers function called');
  
  try {
    // Get user ID from request (authenticated user)
    const userId = req.user?.user_name || req.user?.userId || req.user?.id || req.query.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated. Please provide user ID.'
      });
    }
    
    console.log(`👤 Fetching open drawers for user: ${userId}`);
    
    // Find all open drawers for this user
    const openDrawers = await Drawer.findAll({
      where: {
        USER_ID: userId,
        WF_STATUS: {
          [Op.in]: ['OPEN', 'OPENED']
        },
        REC_ST: 'A'
      },
      order: [['CREATE_DT', 'DESC']]
    });
    
    if (openDrawers.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No open drawers found for this user',
        data: {
          count: 0,
          drawers: [],
          summary: {
            totalBalance: 0,
            totalAvailable: 0,
            canTransact: false
          }
        }
      });
    }
    
    // Format drawer data
    const formattedDrawers = openDrawers.map(drawer => {
      const currentBalance = parseFloat(drawer.CURRENT_BALANCE || 0);
      const minBalance = parseFloat(drawer.MIN_BAL || 0);
      const maxBalance = parseFloat(drawer.MAX_BAL || 0);
      const isOpen = drawer.WF_STATUS === 'OPEN' || drawer.WF_STATUS === 'OPENED';
      
      return {
        id: drawer.id,
        drawerId: drawer.DRAWER_ID,
        drawerNo: drawer.DRAWER_NO,
        drawerName: drawer.DRAWER_NM || `Drawer ${drawer.DRAWER_NO}`,
        drawerType: drawer.DRAWER_TY_CD || 'TELLER',
        status: drawer.WF_STATUS,
        isOpen: isOpen,
        currentBalance: currentBalance,
        minBalance: minBalance,
        maxBalance: maxBalance,
        availableBalance: Math.max(0, currentBalance - minBalance),
        isOverLimit: currentBalance > maxBalance,
        isUnderLimit: currentBalance < minBalance,
        cashLimitFlag: drawer.DRAWER_CASH_LIMIT_FG || 'N',
        insuredLimitFlag: drawer.DRAWER_INSURED_LIMIT_FG || 'N',
        canTransact: isOpen && drawer.REC_ST === 'A' && currentBalance <= maxBalance,
        businessUnit: drawer.BU_ID,
        branchCode: drawer.BRANCH_CODE,
        openedAt: drawer.LAST_DRAWER_OPEN_DT,
        createdAt: drawer.CREATE_DT || drawer.created_at,
        updatedAt: drawer.updated_at
      };
    });
    
    // Calculate summary
    const totalBalance = formattedDrawers.reduce((sum, d) => sum + d.currentBalance, 0);
    const totalAvailable = formattedDrawers.reduce((sum, d) => sum + d.availableBalance, 0);
    const canTransact = formattedDrawers.some(d => d.canTransact);
    
    return res.status(200).json({
      success: true,
      message: `Found ${openDrawers.length} open drawer(s) for user`,
      data: {
        count: openDrawers.length,
        user: {
          id: userId,
          name: req.user?.preferred_name || req.user?.full_name || userId
        },
        summary: {
          totalBalance: Math.round(totalBalance * 100) / 100,
          totalAvailable: Math.round(totalAvailable * 100) / 100,
          canTransact: canTransact,
          overLimitCount: formattedDrawers.filter(d => d.isOverLimit).length,
          underLimitCount: formattedDrawers.filter(d => d.isUnderLimit).length
        },
        drawers: formattedDrawers
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching open drawers:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch open drawers',
      error: error.message
    });
  }
};
// ============================================
// POST BULK DRAWER TRANSACTIONS
// ============================================
export const postBulkDrawerTransactions = async (req, res) => {
  console.log('📊 postBulkDrawerTransactions function called');
  
  let transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { transactions, userId, notes } = req.body;
    
    if (!id) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Drawer ID is required'
      });
    }
    
    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'At least one transaction is required'
      });
    }
    
    // Find the drawer
    const drawer = await findDrawerByIdentifier(id);
    
    if (!drawer) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Drawer not found: ${id}`
      });
    }
    
    // Check if drawer is open
    if (drawer.WF_STATUS !== 'OPEN' && drawer.WF_STATUS !== 'OPENED') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Drawer must be open to process transactions'
      });
    }
    
    // Get user ID
    const userIdValue = userId || req.user?.user_name || req.user?.userId || 'SYSTEM';
    const performingUser = req.user?.preferred_name || userIdValue;
    
    let processedCount = 0;
    let failedCount = 0;
    const processedTransactions = [];
    const failedTransactions = [];
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let currentBalance = parseFloat(drawer.CURRENT_BALANCE || 0);
    
    // Process each transaction
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const rowNumber = i + 1;
      
      try {
        // Validate transaction
        const amount = parseFloat(tx.amount);
        const transactionType = (tx.type || tx.transaction_type || '').toUpperCase();
        const description = tx.description || tx.narration || `Bulk transaction ${rowNumber}`;
        const accountNumber = tx.account_number || tx.account || null;
        
        if (!amount || isNaN(amount) || amount <= 0) {
          throw new Error(`Row ${rowNumber}: Invalid amount`);
        }
        
        if (!transactionType || !['DEPOSIT', 'WITHDRAWAL', 'CR', 'DR'].includes(transactionType)) {
          throw new Error(`Row ${rowNumber}: Invalid transaction type. Must be DEPOSIT or WITHDRAWAL`);
        }
        
        const isDeposit = transactionType === 'DEPOSIT' || transactionType === 'CR';
        const isWithdrawal = transactionType === 'WITHDRAWAL' || transactionType === 'DR';
        
        // Check balance for withdrawal
        if (isWithdrawal && currentBalance < amount) {
          throw new Error(`Row ${rowNumber}: Insufficient balance. Available: ${currentBalance}, Required: ${amount}`);
        }
        
        // Calculate new balance
        const previousBalance = currentBalance;
        if (isDeposit) {
          currentBalance += amount;
          totalDeposits += amount;
        } else {
          currentBalance -= amount;
          totalWithdrawals += amount;
        }
        
        // Generate reference number
        const timestamp = Date.now().toString();
        const randomDigits = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
        const referenceNo = (timestamp + randomDigits).slice(0, 18);
        
        // Insert into drawer_transactions table
        await sequelize.query(
          `INSERT INTO drawer_transactions (
            drawer_id, drawer_no, transaction_type, amount,
            previous_balance, new_balance, transaction_ref_no,
            customer_account, description, user_id, created_at
          ) VALUES (
            :drawerId, :drawerNo, :transactionType, :amount,
            :previousBalance, :newBalance, :referenceNo,
            :customerAccount, :description, :userId, NOW()
          )`,
          {
            replacements: {
              drawerId: drawer.id,
              drawerNo: drawer.DRAWER_NO,
              transactionType: isDeposit ? 'DEPOSIT' : 'WITHDRAWAL',
              amount: amount.toFixed(2),
              previousBalance: previousBalance.toFixed(2),
              newBalance: currentBalance.toFixed(2),
              referenceNo: referenceNo,
              customerAccount: accountNumber || null,
              description: description,
              userId: userIdValue
            },
            transaction
          }
        );
        
        processedCount++;
        processedTransactions.push({
          row: rowNumber,
          reference: referenceNo,
          type: transactionType,
          amount: amount,
          description: description,
          account: accountNumber,
          previousBalance: previousBalance,
          newBalance: currentBalance,
          status: 'SUCCESS'
        });
        
      } catch (error) {
        failedCount++;
        failedTransactions.push({
          row: rowNumber,
          transaction: tx,
          error: error.message
        });
      }
    }
    
    // Update drawer balance if any transactions were processed
    if (processedCount > 0) {
      await Drawer.update(
        {
          CURRENT_BALANCE: currentBalance,
          VERSION_NO: sequelize.literal('VERSION_NO + 1'),
          updated_at: new Date()
        },
        {
          where: { id: drawer.id },
          transaction
        }
      );
      
      // Update drawer limit flags
      await updateDrawerLimitFlagsSimple(drawer, currentBalance);
    }
    
    await transaction.commit();
    
    // Log the bulk operation
    console.log(`✅ Bulk transaction completed: ${processedCount} processed, ${failedCount} failed`);
    
    // Build response
    const response = {
      drawer: {
        id: drawer.id,
        drawerId: drawer.DRAWER_ID,
        drawerNo: drawer.DRAWER_NO,
        drawerName: drawer.DRAWER_NM || `Drawer ${drawer.DRAWER_NO}`,
        previousBalance: parseFloat(drawer.CURRENT_BALANCE || 0),
        newBalance: currentBalance,
        netChange: currentBalance - parseFloat(drawer.CURRENT_BALANCE || 0)
      },
      summary: {
        totalTransactions: transactions.length,
        processed: processedCount,
        failed: failedCount,
        totalDeposits: totalDeposits,
        totalWithdrawals: totalWithdrawals,
        totalAmount: totalDeposits + totalWithdrawals
      },
      processedTransactions: processedTransactions,
      failedTransactions: failedTransactions
    };
    
    // Add notes if provided
    if (notes) {
      response.notes = notes;
    }
    
    // Add performed by
    response.performedBy = performingUser;
    response.performedAt = new Date();
    
    return res.status(200).json({
      success: true,
      message: `Bulk transaction completed: ${processedCount} successful, ${failedCount} failed`,
      data: response
    });
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error in bulk transaction:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process bulk transactions',
      error: error.message
    });
  }
};
// ============================================
// POST DRAWER TRANSACTION - FULL COMPLETE VERSION
// ============================================
export const postDrawerTransaction = async (req, res) => {
  console.log('📊 postDrawerTransaction function called');
  console.log('📊 Request body:', req.body);
  
  let transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { 
      type, 
      amount, 
      description, 
      account_number,
      userId,
      referenceNo,
      customerName,
      emtlAmount,
      emtlApplicable,
      emtlReason
    } = req.body;
    
    // ============================================
    // VALIDATION
    // ============================================
    
    if (!id) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Drawer ID is required'
      });
    }
    
    if (!type) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Transaction type is required (DEPOSIT or WITHDRAWAL)'
      });
    }
    
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }
    
    if (!account_number) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Account number is required'
      });
    }
    
    // ============================================
    // FIND DRAWER
    // ============================================
    
    const drawer = await findDrawerByIdentifier(id);
    
    if (!drawer) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Drawer not found: ${id}`
      });
    }
    
    // Check if drawer is open
    if (drawer.WF_STATUS !== 'OPEN' && drawer.WF_STATUS !== 'OPENED') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Drawer must be open to process transactions',
        currentStatus: drawer.WF_STATUS
      });
    }
    
    // Normalize transaction type
    const transactionType = type.toUpperCase();
    const isDeposit = transactionType === 'DEPOSIT' || transactionType === 'CR' || transactionType === 'CREDIT';
    const isWithdrawal = transactionType === 'WITHDRAWAL' || transactionType === 'DR' || transactionType === 'DEBIT';
    
    if (!isDeposit && !isWithdrawal) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction type. Must be DEPOSIT or WITHDRAWAL'
      });
    }
    
    // ============================================
    // FIND CUSTOMER ACCOUNT
    // ============================================
    
    const account = await Account.findOne({
      where: { account_number: account_number },
      transaction
    });
    
    if (!account) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Account not found: ${account_number}`
      });
    }
    
    // ============================================
    // CALCULATE BALANCES
    // ============================================
    
    const amountValue = parseFloat(amount);
    const currentDrawerBalance = parseFloat(drawer.CURRENT_BALANCE || 0);
    const currentAccountBalance = parseFloat(account.current_balance || 0);
    
    // Check balance for withdrawal
    if (isWithdrawal) {
      if (currentDrawerBalance < amountValue) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Insufficient drawer balance',
          available: currentDrawerBalance,
          required: amountValue,
          shortfall: amountValue - currentDrawerBalance
        });
      }
      
      if (currentAccountBalance < amountValue) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Insufficient account balance',
          available: currentAccountBalance,
          required: amountValue,
          shortfall: amountValue - currentAccountBalance
        });
      }
    }
    
    // Calculate new balances
    const previousDrawerBalance = currentDrawerBalance;
    let newDrawerBalance, newAccountBalance;
    
    if (isDeposit) {
      newDrawerBalance = currentDrawerBalance + amountValue;
      newAccountBalance = currentAccountBalance + amountValue;
    } else {
      newDrawerBalance = currentDrawerBalance - amountValue;
      newAccountBalance = currentAccountBalance - amountValue;
    }
    
    // Generate reference number if not provided
    const finalReference = referenceNo || generateReferenceNumber();
    
    // Get user ID
    const userIdValue = userId || req.user?.user_name || req.user?.userId || 'SYSTEM';
    const performingUser = req.user?.preferred_name || userIdValue;
    
    // ============================================
    // FIND ALL GL ACCOUNTS
    // ============================================
    
    // 1. Drawer GL Account (Cash account)
    const drawerGlAccount = await GlAccount.findOne({
      where: { gl_acct_no: drawer.GL_ACCT_NO },
      transaction
    });
    
    if (!drawerGlAccount) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Drawer GL Account not found: ${drawer.GL_ACCT_NO}`
      });
    }
    
    // 2. Customer GL Account (Liability account)
    const customerGlAccount = await GlAccount.findOne({
      where: { 
        [Op.or]: [
          { gl_acct_no: account.gl_acct_no },
          { acct_desc: 'CUSTOMER_DEPOSITS' }
        ]
      },
      transaction
    });
    
    if (!customerGlAccount) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Customer GL Account not found for account: ${account_number}`
      });
    }
    
    // 3. Inter-Branch GL Account (For branch settlement)
    let interBranchGlAccountNo = null;
    const interBranchGlAccount = await GlAccount.findOne({
      where: { 
        acct_desc: 'INTER_BRANCH_SETTLEMENT',
        branch_code: drawer.BRANCH_CODE || '101'
      },
      transaction
    });
    
    if (interBranchGlAccount) {
      interBranchGlAccountNo = interBranchGlAccount.gl_acct_no;
    } else {
      // Try to find a general inter-branch account
      const defaultInterBranch = await GlAccount.findOne({
        where: { 
          [Op.or]: [
            { acct_desc: 'INTER_BRANCH' },
            { gl_acct_no: '01101230010001' }
          ]
        },
        transaction
      });
      
      if (defaultInterBranch) {
        interBranchGlAccountNo = defaultInterBranch.gl_acct_no;
      }
    }
    
    // ============================================
    // PERFORM DOUBLE-ENTRY GL POSTING
    // ============================================
    
    const currentDrawerGlBalance = parseFloat(drawerGlAccount.ledger_balance || 0);
    const currentCustomerGlBalance = parseFloat(customerGlAccount.ledger_balance || 0);
    
    let newDrawerGlBalance, newCustomerGlBalance;
    let drawerGlDirection, customerGlDirection;
    
    if (isDeposit) {
      // DEPOSIT: Debit Drawer GL (Cash increases), Credit Customer GL (Liability increases)
      newDrawerGlBalance = currentDrawerGlBalance + amountValue;
      newCustomerGlBalance = currentCustomerGlBalance + amountValue;
      drawerGlDirection = 'DEBIT';
      customerGlDirection = 'CREDIT';
    } else {
      // WITHDRAWAL: Credit Drawer GL (Cash decreases), Debit Customer GL (Liability decreases)
      newDrawerGlBalance = currentDrawerGlBalance - amountValue;
      newCustomerGlBalance = currentCustomerGlBalance - amountValue;
      drawerGlDirection = 'CREDIT';
      customerGlDirection = 'DEBIT';
    }
    
    // Update Drawer GL Account
    await GlAccount.update(
      {
        ledger_balance: newDrawerGlBalance,
        current_balance: newDrawerGlBalance,
        available_balance: newDrawerGlBalance,
        updated_at: new Date()
      },
      {
        where: { gl_acct_no: drawer.GL_ACCT_NO },
        transaction
      }
    );
    
    // Update Customer GL Account
    await GlAccount.update(
      {
        ledger_balance: newCustomerGlBalance,
        current_balance: newCustomerGlBalance,
        available_balance: newCustomerGlBalance,
        updated_at: new Date()
      },
      {
        where: { gl_acct_no: customerGlAccount.gl_acct_no },
        transaction
      }
    );
    
    // Update Inter-Branch GL Account (if exists)
    if (interBranchGlAccountNo) {
      const interBranchAccount = await GlAccount.findOne({
        where: { gl_acct_no: interBranchGlAccountNo },
        transaction
      });
      
      if (interBranchAccount) {
        const currentInterBranchBalance = parseFloat(interBranchAccount.ledger_balance || 0);
        let newInterBranchBalance;
        let interBranchDirection;
        
        if (isDeposit) {
          newInterBranchBalance = currentInterBranchBalance + amountValue;
          interBranchDirection = 'CREDIT';
        } else {
          newInterBranchBalance = currentInterBranchBalance - amountValue;
          interBranchDirection = 'DEBIT';
        }
        
        await GlAccount.update(
          {
            ledger_balance: newInterBranchBalance,
            current_balance: newInterBranchBalance,
            available_balance: newInterBranchBalance,
            updated_at: new Date()
          },
          {
            where: { gl_acct_no: interBranchGlAccountNo },
            transaction
          }
        );
        
        // Record Inter-Branch GL Transaction
        const ibReference = `IB-${finalReference}`;
        await sequelize.query(
          `INSERT INTO gl_transactions (
            gl_account_no, transaction_type, amount,
            previous_balance, new_balance, reference_no,
            drawer_id, drawer_no, account_number,
            description, created_by, created_at,
            transaction_date, source_reference
          ) VALUES (
            :glAccountNo, :direction, :amount,
            :prevBalance, :newBalance, :referenceNo,
            :drawerId, :drawerNo, :accountNumber,
            :description, :createdBy, NOW(),
            NOW(), :sourceRef
          )`,
          {
            replacements: {
              glAccountNo: interBranchGlAccountNo,
              direction: interBranchDirection,
              amount: amountValue.toFixed(2),
              prevBalance: currentInterBranchBalance.toFixed(2),
              newBalance: newInterBranchBalance.toFixed(2),
              referenceNo: ibReference,
              drawerId: drawer.id,
              drawerNo: drawer.DRAWER_NO,
              accountNumber: account_number,
              description: `${isDeposit ? 'Branch Credit' : 'Branch Debit'} - ${account_number}`,
              createdBy: userIdValue,
              sourceRef: finalReference
            },
            transaction
          }
        );
      }
    }
    
    // Record Drawer GL Transaction
    await sequelize.query(
      `INSERT INTO gl_transactions (
        gl_account_no, transaction_type, amount,
        previous_balance, new_balance, reference_no,
        drawer_id, drawer_no, account_number,
        description, created_by, created_at,
        transaction_date, source_reference
      ) VALUES (
        :glAccountNo, :direction, :amount,
        :prevBalance, :newBalance, :referenceNo,
        :drawerId, :drawerNo, :accountNumber,
        :description, :createdBy, NOW(),
        NOW(), :sourceRef
      )`,
      {
        replacements: {
          glAccountNo: drawer.GL_ACCT_NO,
          direction: drawerGlDirection,
          amount: amountValue.toFixed(2),
          prevBalance: currentDrawerGlBalance.toFixed(2),
          newBalance: newDrawerGlBalance.toFixed(2),
          referenceNo: `GL-${finalReference}`,
          drawerId: drawer.id,
          drawerNo: drawer.DRAWER_NO,
          accountNumber: account_number,
          description: `${isDeposit ? 'Cash Deposit' : 'Cash Withdrawal'} - ${account_number}`,
          createdBy: userIdValue,
          sourceRef: finalReference
        },
        transaction
      }
    );
    
    // Record Customer GL Transaction
    await sequelize.query(
      `INSERT INTO gl_transactions (
        gl_account_no, transaction_type, amount,
        previous_balance, new_balance, reference_no,
        drawer_id, drawer_no, account_number,
        description, created_by, created_at,
        transaction_date, source_reference
      ) VALUES (
        :glAccountNo, :direction, :amount,
        :prevBalance, :newBalance, :referenceNo,
        :drawerId, :drawerNo, :accountNumber,
        :description, :createdBy, NOW(),
        NOW(), :sourceRef
      )`,
      {
        replacements: {
          glAccountNo: customerGlAccount.gl_acct_no,
          direction: customerGlDirection,
          amount: amountValue.toFixed(2),
          prevBalance: currentCustomerGlBalance.toFixed(2),
          newBalance: newCustomerGlBalance.toFixed(2),
          referenceNo: `GL-CUST-${finalReference}`,
          drawerId: drawer.id,
          drawerNo: drawer.DRAWER_NO,
          accountNumber: account_number,
          description: `${isDeposit ? 'Customer Deposit' : 'Customer Withdrawal'} - ${account_number}`,
          createdBy: userIdValue,
          sourceRef: finalReference
        },
        transaction
      }
    );
    
    // ============================================
    // INSERT INTO DRAWER TRANSACTIONS
    // ============================================
    
    await sequelize.query(
      `INSERT INTO drawer_transactions (
        drawer_id, drawer_no, transaction_type, amount,
        previous_balance, new_balance, transaction_ref_no,
        customer_account, description, user_id, created_at,
        emtl_amount, emtl_applicable, emtl_reason,
        depositor_name
      ) VALUES (
        :drawerId, :drawerNo, :transactionType, :amount,
        :previousBalance, :newBalance, :referenceNo,
        :customerAccount, :description, :userId, NOW(),
        :emtlAmount, :emtlApplicable, :emtlReason,
        :customerName
      )`,
      {
        replacements: {
          drawerId: drawer.id,
          drawerNo: drawer.DRAWER_NO,
          transactionType: isDeposit ? 'DEPOSIT' : 'WITHDRAWAL',
          amount: amountValue.toFixed(2),
          previousBalance: previousDrawerBalance.toFixed(2),
          newBalance: newDrawerBalance.toFixed(2),
          referenceNo: finalReference,
          customerAccount: account_number,
          description: description || `${isDeposit ? 'Deposit' : 'Withdrawal'} of ${amountValue}`,
          userId: userIdValue,
          emtlAmount: parseFloat(emtlAmount || 0).toFixed(2),
          emtlApplicable: emtlApplicable || false,
          emtlReason: emtlReason || null,
          customerName: customerName || null
        },
        transaction
      }
    );
    
    // ============================================
    // UPDATE DRAWER BALANCE
    // ============================================
    
    await Drawer.update(
      {
        CURRENT_BALANCE: newDrawerBalance,
        VERSION_NO: sequelize.literal('VERSION_NO + 1'),
        updated_at: new Date()
      },
      {
        where: { id: drawer.id },
        transaction
      }
    );
    
    // ============================================
    // UPDATE ACCOUNT BALANCE
    // ============================================
    
    await Account.update(
      {
        current_balance: newAccountBalance,
        ledger_balance: newAccountBalance,
        available_balance: newAccountBalance,
        cleared_balance: newAccountBalance,
        updated_at: new Date()
      },
      {
        where: { account_number: account_number },
        transaction
      }
    );
    
    // ============================================
    // INSERT INTO TRANSACTIONS TABLE (Account Ledger)
    // ============================================
    
    await sequelize.query(
      `INSERT INTO transactions (
        account_number, account_id, drawer_id, drawer_no,
        bu_id, customer_id, account_name, amount,
        transaction_direction, transaction_date, transaction_type,
        transaction_identifier, event_id, journal_id,
        reference, description, currency, created_by,
        status, created_at
      ) VALUES (
        :accountNumber, :accountId, :drawerId, :drawerNo,
        :buId, :customerId, :accountName, :amount,
        :direction, NOW(), :transactionType,
        :transactionIdentifier, :eventId, :journalId,
        :reference, :description, :currency, :createdBy,
        :status, NOW()
      )`,
      {
        replacements: {
          accountNumber: account_number,
          accountId: account.id,
          drawerId: drawer.id,
          drawerNo: drawer.DRAWER_NO,
          buId: drawer.BU_ID || account.bu_id || 101,
          customerId: account.customer_id || null,
          accountName: account.account_name,
          amount: amountValue.toFixed(2),
          direction: isDeposit ? 'CREDIT' : 'DEBIT',
          transactionType: isDeposit ? 'DEPOSIT' : 'WITHDRAWAL',
          transactionIdentifier: finalReference,
          eventId: `EVT-${Date.now()}`,
          journalId: `JRN-${Date.now()}`,
          reference: finalReference,
          description: description || `${isDeposit ? 'Deposit' : 'Withdrawal'} via drawer ${drawer.DRAWER_NO}`,
          currency: account.currency || 'NGN',
          createdBy: userIdValue,
          status: 'COMPLETED'
        },
        transaction
      }
    );
    
    // ============================================
    // UPDATE DRAWER LIMIT FLAGS
    // ============================================
    
    await updateDrawerLimitFlagsSimple(drawer, newDrawerBalance);
    
    // ============================================
    // COMMIT TRANSACTION
    // ============================================
    
    await transaction.commit();
    
    console.log(`✅ Transaction ${finalReference} processed successfully`);
    console.log(`   Account ${account_number}: ${currentAccountBalance} -> ${newAccountBalance}`);
    console.log(`   Drawer ${drawer.DRAWER_NO}: ${previousDrawerBalance} -> ${newDrawerBalance}`);
    console.log(`   GL Drawer ${drawer.GL_ACCT_NO}: ${currentDrawerGlBalance} -> ${newDrawerGlBalance}`);
    console.log(`   GL Customer ${customerGlAccount.gl_acct_no}: ${currentCustomerGlBalance} -> ${newCustomerGlBalance}`);
    
    // ============================================
    // BUILD RESPONSE
    // ============================================
    
    const response = {
      transaction: {
        id: finalReference,
        reference: finalReference,
        type: isDeposit ? 'DEPOSIT' : 'WITHDRAWAL',
        amount: amountValue,
        description: description || `${isDeposit ? 'Deposit' : 'Withdrawal'}`,
        account: account_number,
        customerName: customerName || account.account_name
      },
      drawer: {
        id: drawer.id,
        drawerId: drawer.DRAWER_ID,
        drawerNo: drawer.DRAWER_NO,
        drawerName: drawer.DRAWER_NM || `Drawer ${drawer.DRAWER_NO}`,
        previousBalance: previousDrawerBalance,
        newBalance: newDrawerBalance,
        netChange: newDrawerBalance - previousDrawerBalance
      },
      account: {
        accountNumber: account_number,
        accountName: account.account_name,
        previousBalance: currentAccountBalance,
        newBalance: newAccountBalance,
        netChange: newAccountBalance - currentAccountBalance
      },
      glPosting: {
        drawerGlAccount: {
          accountNo: drawer.GL_ACCT_NO,
          direction: drawerGlDirection,
          previousBalance: currentDrawerGlBalance,
          newBalance: newDrawerGlBalance,
          netChange: newDrawerGlBalance - currentDrawerGlBalance
        },
        customerGlAccount: {
          accountNo: customerGlAccount.gl_acct_no,
          direction: customerGlDirection,
          previousBalance: currentCustomerGlBalance,
          newBalance: newCustomerGlBalance,
          netChange: newCustomerGlBalance - currentCustomerGlBalance
        },
        interBranchGlAccount: interBranchGlAccountNo ? {
          accountNo: interBranchGlAccountNo,
          direction: isDeposit ? 'CREDIT' : 'DEBIT'
        } : null
      },
      emtl: {
        amount: parseFloat(emtlAmount || 0),
        applicable: emtlApplicable || false,
        reason: emtlReason || null
      },
      metadata: {
        performedBy: performingUser,
        performedAt: new Date(),
        status: 'SUCCESS'
      }
    };
    
    return res.status(200).json({
      success: true,
      message: 'Transaction processed successfully with full GL posting',
      data: response
    });
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error processing transaction:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process transaction',
      error: error.message,
      stack: error.stack
    });
  }
};

// Helper function to generate reference number
const generateReferenceNumber = () => {
  const timestamp = Date.now().toString();
  const randomDigits = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return (timestamp + randomDigits).slice(0, 18);
};
// ============================================
// PROCESS DRAWER TRANSACTION
// ============================================
export const processDrawerTransaction = async (req, res) => {
  console.log('📊 processDrawerTransaction function called');
  
  let transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { 
      type, 
      amount, 
      description, 
      account_number,
      userId,
      referenceNo,
      customerName,
      emtlAmount,
      emtlApplicable,
      emtlReason,
      currency
    } = req.body;
    
    if (!id) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Drawer ID is required'
      });
    }
    
    // Validate required fields
    if (!type) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Transaction type is required (DEPOSIT or WITHDRAWAL)'
      });
    }
    
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }
    
    // Find the drawer
    const drawer = await findDrawerByIdentifier(id);
    
    if (!drawer) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Drawer not found: ${id}`
      });
    }
    
    // Check if drawer is open
    if (drawer.WF_STATUS !== 'OPEN' && drawer.WF_STATUS !== 'OPENED') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Drawer must be open to process transactions',
        currentStatus: drawer.WF_STATUS
      });
    }
    
    // Normalize transaction type
    const transactionType = type.toUpperCase();
    const isDeposit = transactionType === 'DEPOSIT' || transactionType === 'CR';
    const isWithdrawal = transactionType === 'WITHDRAWAL' || transactionType === 'DR';
    
    if (!isDeposit && !isWithdrawal) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction type. Must be DEPOSIT or WITHDRAWAL'
      });
    }
    
    const amountValue = parseFloat(amount);
    const currentBalance = parseFloat(drawer.CURRENT_BALANCE || 0);
    
    // Check balance for withdrawal
    if (isWithdrawal && currentBalance < amountValue) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance',
        available: currentBalance,
        required: amountValue,
        shortfall: amountValue - currentBalance
      });
    }
    
    // Calculate new balance
    const previousBalance = currentBalance;
    let newBalance;
    if (isDeposit) {
      newBalance = currentBalance + amountValue;
    } else {
      newBalance = currentBalance - amountValue;
    }
    
    // Generate reference number if not provided
    const finalReference = referenceNo || generateReferenceNumber();
    
    // Get user ID
    const userIdValue = userId || req.user?.user_name || req.user?.userId || 'SYSTEM';
    const performingUser = req.user?.preferred_name || userIdValue;
    
    // Process currency denominations if provided
    let currencyDetails = null;
    if (currency && typeof currency === 'object') {
      currencyDetails = currency;
    }
    
    // Insert into drawer_transactions table
    await sequelize.query(
      `INSERT INTO drawer_transactions (
        drawer_id, drawer_no, transaction_type, amount,
        previous_balance, new_balance, transaction_ref_no,
        customer_account, description, user_id, created_at,
        emtl_amount, emtl_applicable, emtl_reason,
        depositor_name, currency_details, processed_at
      ) VALUES (
        :drawerId, :drawerNo, :transactionType, :amount,
        :previousBalance, :newBalance, :referenceNo,
        :customerAccount, :description, :userId, NOW(),
        :emtlAmount, :emtlApplicable, :emtlReason,
        :customerName, :currencyDetails, NOW()
      )`,
      {
        replacements: {
          drawerId: drawer.id,
          drawerNo: drawer.DRAWER_NO,
          transactionType: isDeposit ? 'DEPOSIT' : 'WITHDRAWAL',
          amount: amountValue.toFixed(2),
          previousBalance: previousBalance.toFixed(2),
          newBalance: newBalance.toFixed(2),
          referenceNo: finalReference,
          customerAccount: account_number || null,
          description: description || `${isDeposit ? 'Deposit' : 'Withdrawal'} of ${amountValue}`,
          userId: userIdValue,
          emtlAmount: parseFloat(emtlAmount || 0).toFixed(2),
          emtlApplicable: emtlApplicable || false,
          emtlReason: emtlReason || null,
          customerName: customerName || null,
          currencyDetails: currencyDetails ? JSON.stringify(currencyDetails) : null
        },
        transaction
      }
    );
    
    // Update drawer balance
    await Drawer.update(
      {
        CURRENT_BALANCE: newBalance,
        VERSION_NO: sequelize.literal('VERSION_NO + 1'),
        updated_at: new Date()
      },
      {
        where: { id: drawer.id },
        transaction
      }
    );
    
    // Update drawer limit flags
    await updateDrawerLimitFlagsSimple(drawer, newBalance);
    
    await transaction.commit();
    
    console.log(`✅ Transaction ${finalReference} processed successfully`);
    
    // Build response
    const response = {
      transaction: {
        id: finalReference,
        reference: finalReference,
        type: isDeposit ? 'DEPOSIT' : 'WITHDRAWAL',
        amount: amountValue,
        description: description || `${isDeposit ? 'Deposit' : 'Withdrawal'}`,
        account: account_number || null,
        customerName: customerName || null,
        processedAt: new Date()
      },
      drawer: {
        id: drawer.id,
        drawerId: drawer.DRAWER_ID,
        drawerNo: drawer.DRAWER_NO,
        drawerName: drawer.DRAWER_NM || `Drawer ${drawer.DRAWER_NO}`,
        previousBalance: previousBalance,
        newBalance: newBalance,
        netChange: newBalance - previousBalance
      },
      emtl: {
        amount: parseFloat(emtlAmount || 0),
        applicable: emtlApplicable || false,
        reason: emtlReason || null
      },
      metadata: {
        performedBy: performingUser,
        performedAt: new Date(),
        status: 'SUCCESS'
      }
    };
    
    if (currencyDetails) {
      response.transaction.currency = currencyDetails;
    }
    
    return res.status(200).json({
      success: true,
      message: 'Transaction processed successfully',
      data: response
    });
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error processing transaction:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process transaction',
      error: error.message
    });
  }
};

// ============================================
// UPDATE DRAWER
// ============================================
export const updateDrawer = async (req, res) => {
  console.log('📝 updateDrawer function called');
  
  let transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const {
      DRAWER_NM,
      DRAWER_TY_CD,
      MIN_BAL,
      MAX_BAL,
      TOTAL_INSURED_AMT,
      BU_ID,
      BRANCH_CODE,
      VAULT_TYPE,
      SECURITY_LEVEL,
      REQUIRES_DUAL_CONTROL,
      USER_ID,
      GL_ACCT_NO
    } = req.body;
    
    if (!id) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Drawer ID is required'
      });
    }
    
    // Find the drawer
    const drawer = await findDrawerByIdentifier(id);
    
    if (!drawer) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Drawer not found: ${id}`
      });
    }
    
    // Build update data
    const updateData = {};
    let hasChanges = false;
    
    if (DRAWER_NM !== undefined) {
      updateData.DRAWER_NM = DRAWER_NM;
      hasChanges = true;
    }
    if (DRAWER_TY_CD !== undefined) {
      updateData.DRAWER_TY_CD = DRAWER_TY_CD;
      hasChanges = true;
    }
    if (MIN_BAL !== undefined) {
      updateData.MIN_BAL = parseFloat(MIN_BAL);
      hasChanges = true;
    }
    if (MAX_BAL !== undefined) {
      updateData.MAX_BAL = parseFloat(MAX_BAL);
      hasChanges = true;
    }
    if (TOTAL_INSURED_AMT !== undefined) {
      updateData.TOTAL_INSURED_AMT = parseFloat(TOTAL_INSURED_AMT);
      hasChanges = true;
    }
    if (BU_ID !== undefined) {
      updateData.BU_ID = BU_ID;
      hasChanges = true;
    }
    if (BRANCH_CODE !== undefined) {
      updateData.BRANCH_CODE = BRANCH_CODE;
      hasChanges = true;
    }
    if (VAULT_TYPE !== undefined) {
      updateData.VAULT_TYPE = VAULT_TYPE;
      hasChanges = true;
    }
    if (SECURITY_LEVEL !== undefined) {
      updateData.SECURITY_LEVEL = SECURITY_LEVEL;
      hasChanges = true;
    }
    if (REQUIRES_DUAL_CONTROL !== undefined) {
      updateData.REQUIRES_DUAL_CONTROL = REQUIRES_DUAL_CONTROL === 'Y' || REQUIRES_DUAL_CONTROL === true;
      hasChanges = true;
    }
    if (USER_ID !== undefined) {
      updateData.USER_ID = USER_ID;
      hasChanges = true;
    }
    if (GL_ACCT_NO !== undefined) {
      updateData.GL_ACCT_NO = GL_ACCT_NO;
      hasChanges = true;
    }
    
    if (!hasChanges) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }
    
    // Add version and timestamp
    updateData.VERSION_NO = (drawer.VERSION_NO || 0) + 1;
    updateData.updated_at = new Date();
    
    // Update the drawer
    await Drawer.update(
      updateData,
      {
        where: { id: drawer.id },
        transaction
      }
    );
    
    await transaction.commit();
    
    // Fetch updated drawer
    const updatedDrawer = await findDrawerByIdentifier(id);
    
    console.log(`✅ Drawer ${drawer.DRAWER_NO} updated successfully`);
    
    return res.status(200).json({
      success: true,
      message: `Drawer ${drawer.DRAWER_NO} updated successfully`,
      data: {
        previous: {
          DRAWER_NM: drawer.DRAWER_NM,
          MIN_BAL: drawer.MIN_BAL,
          MAX_BAL: drawer.MAX_BAL,
          TOTAL_INSURED_AMT: drawer.TOTAL_INSURED_AMT
        },
        updated: {
          DRAWER_NM: updatedDrawer.DRAWER_NM,
          MIN_BAL: updatedDrawer.MIN_BAL,
          MAX_BAL: updatedDrawer.MAX_BAL,
          TOTAL_INSURED_AMT: updatedDrawer.TOTAL_INSURED_AMT,
          VERSION_NO: updatedDrawer.VERSION_NO
        },
        drawer: updatedDrawer
      }
    });
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error updating drawer:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update drawer',
      error: error.message
    });
  }
};

// ============================================
// UPDATE DRAWER CURRENCY
// ============================================
export const updateDrawerCurrency = async (req, res) => {
  console.log('💰 updateDrawerCurrency function called');
  
  let transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { 
      openingCurrency, 
      closingCurrency,
      currencyType = 'OPENING', // OPENING, CLOSING, or BOTH
      userId
    } = req.body;
    
    if (!id) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Drawer ID is required'
      });
    }
    
    // Find the drawer
    const drawer = await findDrawerByIdentifier(id);
    
    if (!drawer) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Drawer not found: ${id}`
      });
    }
    
    const userIdValue = userId || req.user?.user_name || req.user?.userId || 'SYSTEM';
    const updateData = {};
    let hasChanges = false;
    
    // Process opening currency
    if (currencyType === 'OPENING' || currencyType === 'BOTH') {
      if (openingCurrency) {
        updateData.OPENING_CURRENCY = typeof openingCurrency === 'string' 
          ? openingCurrency 
          : JSON.stringify(openingCurrency);
        hasChanges = true;
      }
    }
    
    // Process closing currency
    if (currencyType === 'CLOSING' || currencyType === 'BOTH') {
      if (closingCurrency) {
        updateData.CLOSING_CURRENCY = typeof closingCurrency === 'string' 
          ? closingCurrency 
          : JSON.stringify(closingCurrency);
        hasChanges = true;
      }
    }
    
    if (!hasChanges) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'No currency data provided'
      });
    }
    
    // Add version and timestamp
    updateData.VERSION_NO = (drawer.VERSION_NO || 0) + 1;
    updateData.updated_at = new Date();
    
    // Update the drawer
    await Drawer.update(
      updateData,
      {
        where: { id: drawer.id },
        transaction
      }
    );
    
    // Also save to DrawerCurrencyDenomination table
    try {
      const timestamp = Date.now();
      const drawerCrncyDenomId = `DCD_${timestamp}_${Math.floor(Math.random() * 10000)}`;
      const drawerCrncyId = Math.floor(Date.now() / 1000);
      
      let denomCount = [];
      let totalAmount = 0;
      
      const currencyData = currencyType === 'OPENING' || currencyType === 'BOTH' 
        ? openingCurrency 
        : closingCurrency;
      
      if (currencyData) {
        const parsedCurrency = typeof currencyData === 'string' 
          ? JSON.parse(currencyData) 
          : currencyData;
        
        if (Array.isArray(parsedCurrency)) {
          denomCount = parsedCurrency;
        } else if (typeof parsedCurrency === 'object') {
          denomCount = Object.entries(parsedCurrency).map(([denomId, count]) => ({
            denomId: parseInt(denomId),
            count: parseInt(count),
            amount: parseInt(denomId) * parseInt(count),
            Total: parseInt(denomId) * parseInt(count)
          }));
        }
        
        totalAmount = denomCount.reduce((sum, item) => sum + (item.amount || item.Total || 0), 0);
      }
      
      await DrawerCurrencyDenomination.create({
        drawerCrncyId: drawerCrncyId,
        drawerId: drawer.id,
        drawerCrncyDenomId: drawerCrncyDenomId,
        denomCountType: currencyType === 'OPENING' ? 'O' : 'C',
        recSt: 'A',
        versionNo: 1,
        rowTs: new Date(),
        userId: userIdValue,
        createDt: new Date(),
        sysCreateTs: new Date(),
        createdBy: userIdValue,
        denomCount: denomCount,
        totalAmount: totalAmount
      }, { transaction });
      
      console.log(`✅ Currency denomination saved to history`);
    } catch (denomError) {
      console.warn('⚠️ Could not save currency denomination to history:', denomError.message);
    }
    
    await transaction.commit();
    
    // Fetch updated drawer
    const updatedDrawer = await findDrawerByIdentifier(id);
    
    console.log(`✅ Drawer ${drawer.DRAWER_NO} currency updated successfully`);
    
    // Parse currency for response
    let openingCurrencyParsed = null;
    let closingCurrencyParsed = null;
    
    if (updatedDrawer.OPENING_CURRENCY) {
      try {
        openingCurrencyParsed = typeof updatedDrawer.OPENING_CURRENCY === 'string'
          ? JSON.parse(updatedDrawer.OPENING_CURRENCY)
          : updatedDrawer.OPENING_CURRENCY;
      } catch (e) {
        openingCurrencyParsed = updatedDrawer.OPENING_CURRENCY;
      }
    }
    
    if (updatedDrawer.CLOSING_CURRENCY) {
      try {
        closingCurrencyParsed = typeof updatedDrawer.CLOSING_CURRENCY === 'string'
          ? JSON.parse(updatedDrawer.CLOSING_CURRENCY)
          : updatedDrawer.CLOSING_CURRENCY;
      } catch (e) {
        closingCurrencyParsed = updatedDrawer.CLOSING_CURRENCY;
      }
    }
    
    return res.status(200).json({
      success: true,
      message: `Drawer ${drawer.DRAWER_NO} currency updated successfully`,
      data: {
        drawer: {
          id: updatedDrawer.id,
          drawerId: updatedDrawer.DRAWER_ID,
          drawerNo: updatedDrawer.DRAWER_NO,
          drawerName: updatedDrawer.DRAWER_NM
        },
        currency: {
          opening: openingCurrencyParsed,
          closing: closingCurrencyParsed,
          updatedType: currencyType
        },
        metadata: {
          updatedBy: userIdValue,
          updatedAt: new Date(),
          version: updatedDrawer.VERSION_NO
        }
      }
    });
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error updating drawer currency:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update drawer currency',
      error: error.message
    });
  }
};

// ============================================
// PROCESS DRAWER TO VAULT TRANSFER
// ============================================
export const processDrawerToVaultTransfer = async (req, res) => {
  console.log('🏦 processDrawerToVaultTransfer function called');
  
  let transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { 
      vaultId,
      amount,
      description,
      userId,
      referenceNo,
      currency
    } = req.body;
    
    if (!id) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Drawer ID is required'
      });
    }
    
    if (!vaultId) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Vault ID is required'
      });
    }
    
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }
    
    // Find the drawer
    const drawer = await findDrawerByIdentifier(id);
    
    if (!drawer) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Drawer not found: ${id}`
      });
    }
    
    // Check if drawer is open
    if (drawer.WF_STATUS !== 'OPEN' && drawer.WF_STATUS !== 'OPENED') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Drawer must be open to transfer to vault'
      });
    }
    
    // Find the vault
    const Vault = (await import('../models/Vault.js')).default;
    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { VAULT_ID: vaultId },
          { VAULT_NO: vaultId },
          { id: parseInt(vaultId) || 0 }
        ]
      }
    });
    
    if (!vault) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Vault not found: ${vaultId}`
      });
    }
    
    const amountValue = parseFloat(amount);
    const drawerBalance = parseFloat(drawer.CURRENT_BALANCE || 0);
    
    // Check drawer balance
    if (drawerBalance < amountValue) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Insufficient drawer balance',
        drawerBalance: drawerBalance,
        required: amountValue,
        shortfall: amountValue - drawerBalance
      });
    }
    
    // Get user ID
    const userIdValue = userId || req.user?.user_name || req.user?.userId || 'SYSTEM';
    const performingUser = req.user?.preferred_name || userIdValue;
    
    // Generate reference number
    const finalReference = referenceNo || generateReferenceNumber();
    
    // Calculate new balances
    const drawerNewBalance = drawerBalance - amountValue;
    const vaultCurrentBalance = parseFloat(vault.CURRENT_BALANCE || 0);
    const vaultNewBalance = vaultCurrentBalance + amountValue;
    
    // Update drawer
    await Drawer.update(
      {
        CURRENT_BALANCE: drawerNewBalance,
        VERSION_NO: sequelize.literal('VERSION_NO + 1'),
        updated_at: new Date()
      },
      {
        where: { id: drawer.id },
        transaction
      }
    );
    
    // Update vault
    await Vault.update(
      {
        CURRENT_BALANCE: vaultNewBalance,
        VERSION_NO: sequelize.literal('VERSION_NO + 1'),
        updated_at: new Date()
      },
      {
        where: { id: vault.id },
        transaction
      }
    );
    
    // Update drawer limit flags
    await updateDrawerLimitFlagsSimple(drawer, drawerNewBalance);
    
    // Log drawer transaction
    await sequelize.query(
      `INSERT INTO drawer_transactions (
        drawer_id, drawer_no, transaction_type, amount,
        previous_balance, new_balance, transaction_ref_no,
        description, user_id, created_at,
        vault_id, vault_no, transfer_type
      ) VALUES (
        :drawerId, :drawerNo, 'VAULT_TRANSFER', :amount,
        :previousBalance, :newBalance, :referenceNo,
        :description, :userId, NOW(),
        :vaultId, :vaultNo, 'DRAWER_TO_VAULT'
      )`,
      {
        replacements: {
          drawerId: drawer.id,
          drawerNo: drawer.DRAWER_NO,
          amount: amountValue.toFixed(2),
          previousBalance: drawerBalance.toFixed(2),
          newBalance: drawerNewBalance.toFixed(2),
          referenceNo: finalReference,
          description: description || `Transfer from drawer to vault ${vault.VAULT_NO}`,
          userId: userIdValue,
          vaultId: vault.id,
          vaultNo: vault.VAULT_NO
        },
        transaction
      }
    );
    
    // Log vault transaction
    await sequelize.query(
      `INSERT INTO vault_transactions (
        vault_id, vault_no, transaction_type, amount,
        previous_balance, new_balance, transaction_ref_no,
        description, user_id, created_at,
        drawer_id, drawer_no, transfer_type
      ) VALUES (
        :vaultId, :vaultNo, 'DRAWER_TRANSFER', :amount,
        :previousBalance, :newBalance, :referenceNo,
        :description, :userId, NOW(),
        :drawerId, :drawerNo, 'DRAWER_TO_VAULT'
      )`,
      {
        replacements: {
          vaultId: vault.id,
          vaultNo: vault.VAULT_NO,
          amount: amountValue.toFixed(2),
          previousBalance: vaultCurrentBalance.toFixed(2),
          newBalance: vaultNewBalance.toFixed(2),
          referenceNo: finalReference,
          description: description || `Transfer from drawer ${drawer.DRAWER_NO} to vault`,
          userId: userIdValue,
          drawerId: drawer.id,
          drawerNo: drawer.DRAWER_NO
        },
        transaction
      }
    );
    
    await transaction.commit();
    
    console.log(`✅ Transfer of ${amountValue} from drawer ${drawer.DRAWER_NO} to vault ${vault.VAULT_NO} completed`);
    
    return res.status(200).json({
      success: true,
      message: 'Drawer to vault transfer completed successfully',
      data: {
        reference: finalReference,
        transfer: {
          from: 'DRAWER',
          fromId: drawer.DRAWER_ID,
          fromName: drawer.DRAWER_NM || `Drawer ${drawer.DRAWER_NO}`,
          to: 'VAULT',
          toId: vault.VAULT_ID,
          toName: vault.VAULT_NM || `Vault ${vault.VAULT_NO}`,
          amount: amountValue,
          description: description || `Transfer from drawer to vault`,
          timestamp: new Date()
        },
        drawer: {
          previousBalance: drawerBalance,
          newBalance: drawerNewBalance,
          netChange: -amountValue
        },
        vault: {
          previousBalance: vaultCurrentBalance,
          newBalance: vaultNewBalance,
          netChange: amountValue
        },
        performedBy: performingUser,
        currency: currency || null
      }
    });
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error processing drawer to vault transfer:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process drawer to vault transfer',
      error: error.message
    });
  }
};

// ============================================
// PROCESS DRAWER TO DRAWER TRANSFER
// ============================================
export const processDrawerToDrawerTransfer = async (req, res) => {
  console.log('🔄 processDrawerToDrawerTransfer function called');
  
  let transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { 
      targetDrawerId,
      amount,
      description,
      userId,
      referenceNo,
      currency
    } = req.body;
    
    if (!id) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Source drawer ID is required'
      });
    }
    
    if (!targetDrawerId) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Target drawer ID is required'
      });
    }
    
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }
    
    // Find source drawer
    const sourceDrawer = await findDrawerByIdentifier(id);
    
    if (!sourceDrawer) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Source drawer not found: ${id}`
      });
    }
    
    // Check if source drawer is open
    if (sourceDrawer.WF_STATUS !== 'OPEN' && sourceDrawer.WF_STATUS !== 'OPENED') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Source drawer must be open for transfer'
      });
    }
    
    // Find target drawer
    const targetDrawer = await findDrawerByIdentifier(targetDrawerId);
    
    if (!targetDrawer) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Target drawer not found: ${targetDrawerId}`
      });
    }
    
    // Check if target drawer is open
    if (targetDrawer.WF_STATUS !== 'OPEN' && targetDrawer.WF_STATUS !== 'OPENED') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Target drawer must be open for transfer'
      });
    }
    
    const amountValue = parseFloat(amount);
    const sourceBalance = parseFloat(sourceDrawer.CURRENT_BALANCE || 0);
    
    // Check source drawer balance
    if (sourceBalance < amountValue) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance in source drawer',
        sourceBalance: sourceBalance,
        required: amountValue,
        shortfall: amountValue - sourceBalance
      });
    }
    
    // Get user ID
    const userIdValue = userId || req.user?.user_name || req.user?.userId || 'SYSTEM';
    const performingUser = req.user?.preferred_name || userIdValue;
    
    // Generate reference number
    const finalReference = referenceNo || generateReferenceNumber();
    
    // Calculate new balances
    const sourceNewBalance = sourceBalance - amountValue;
    const targetBalance = parseFloat(targetDrawer.CURRENT_BALANCE || 0);
    const targetNewBalance = targetBalance + amountValue;
    
    // Update source drawer
    await Drawer.update(
      {
        CURRENT_BALANCE: sourceNewBalance,
        VERSION_NO: sequelize.literal('VERSION_NO + 1'),
        updated_at: new Date()
      },
      {
        where: { id: sourceDrawer.id },
        transaction
      }
    );
    
    // Update target drawer
    await Drawer.update(
      {
        CURRENT_BALANCE: targetNewBalance,
        VERSION_NO: sequelize.literal('VERSION_NO + 1'),
        updated_at: new Date()
      },
      {
        where: { id: targetDrawer.id },
        transaction
      }
    );
    
    // Update source drawer limit flags
    await updateDrawerLimitFlagsSimple(sourceDrawer, sourceNewBalance);
    await updateDrawerLimitFlagsSimple(targetDrawer, targetNewBalance);
    
    // Log source drawer transaction
    await sequelize.query(
      `INSERT INTO drawer_transactions (
        drawer_id, drawer_no, transaction_type, amount,
        previous_balance, new_balance, transaction_ref_no,
        description, user_id, created_at,
        target_drawer_id, target_drawer_no, transfer_type
      ) VALUES (
        :drawerId, :drawerNo, 'DRAWER_TRANSFER', :amount,
        :previousBalance, :newBalance, :referenceNo,
        :description, :userId, NOW(),
        :targetId, :targetNo, 'DRAWER_TO_DRAWER'
      )`,
      {
        replacements: {
          drawerId: sourceDrawer.id,
          drawerNo: sourceDrawer.DRAWER_NO,
          amount: amountValue.toFixed(2),
          previousBalance: sourceBalance.toFixed(2),
          newBalance: sourceNewBalance.toFixed(2),
          referenceNo: finalReference,
          description: description || `Transfer to drawer ${targetDrawer.DRAWER_NO}`,
          userId: userIdValue,
          targetId: targetDrawer.id,
          targetNo: targetDrawer.DRAWER_NO
        },
        transaction
      }
    );
    
    // Log target drawer transaction
    await sequelize.query(
      `INSERT INTO drawer_transactions (
        drawer_id, drawer_no, transaction_type, amount,
        previous_balance, new_balance, transaction_ref_no,
        description, user_id, created_at,
        source_drawer_id, source_drawer_no, transfer_type
      ) VALUES (
        :drawerId, :drawerNo, 'DRAWER_TRANSFER', :amount,
        :previousBalance, :newBalance, :referenceNo,
        :description, :userId, NOW(),
        :sourceId, :sourceNo, 'DRAWER_TO_DRAWER'
      )`,
      {
        replacements: {
          drawerId: targetDrawer.id,
          drawerNo: targetDrawer.DRAWER_NO,
          amount: amountValue.toFixed(2),
          previousBalance: targetBalance.toFixed(2),
          newBalance: targetNewBalance.toFixed(2),
          referenceNo: finalReference,
          description: description || `Transfer from drawer ${sourceDrawer.DRAWER_NO}`,
          userId: userIdValue,
          sourceId: sourceDrawer.id,
          sourceNo: sourceDrawer.DRAWER_NO
        },
        transaction
      }
    );
    
    await transaction.commit();
    
    console.log(`✅ Transfer of ${amountValue} from drawer ${sourceDrawer.DRAWER_NO} to drawer ${targetDrawer.DRAWER_NO} completed`);
    
    return res.status(200).json({
      success: true,
      message: 'Drawer to drawer transfer completed successfully',
      data: {
        reference: finalReference,
        transfer: {
          from: {
            drawerId: sourceDrawer.DRAWER_ID,
            drawerNo: sourceDrawer.DRAWER_NO,
            drawerName: sourceDrawer.DRAWER_NM || `Drawer ${sourceDrawer.DRAWER_NO}`
          },
          to: {
            drawerId: targetDrawer.DRAWER_ID,
            drawerNo: targetDrawer.DRAWER_NO,
            drawerName: targetDrawer.DRAWER_NM || `Drawer ${targetDrawer.DRAWER_NO}`
          },
          amount: amountValue,
          description: description || `Transfer between drawers`,
          timestamp: new Date()
        },
        sourceDrawer: {
          previousBalance: sourceBalance,
          newBalance: sourceNewBalance,
          netChange: -amountValue
        },
        targetDrawer: {
          previousBalance: targetBalance,
          newBalance: targetNewBalance,
          netChange: amountValue
        },
        performedBy: performingUser,
        currency: currency || null
      }
    });
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error processing drawer to drawer transfer:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process drawer to drawer transfer',
      error: error.message
    });
  }
};

// ============================================
// REVERSE DRAWER TRANSACTION
// ============================================
export const reverseDrawerTransaction = async (req, res) => {
  console.log('↩️ reverseDrawerTransaction function called');
  
  let transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { 
      transactionReference,
      reason,
      userId,
      notes
    } = req.body;
    
    if (!id) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Drawer ID is required'
      });
    }
    
    if (!transactionReference) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Transaction reference is required'
      });
    }
    
    if (!reason) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Reason for reversal is required'
      });
    }
    
    // Find the drawer
    const drawer = await findDrawerByIdentifier(id);
    
    if (!drawer) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Drawer not found: ${id}`
      });
    }
    
    // Find the original transaction
    let originalTransaction = null;
    
    try {
      const [result] = await sequelize.query(
        `SELECT * FROM drawer_transactions 
         WHERE drawer_id = :drawerId 
         AND (transaction_ref_no = :reference OR id = :reference)
         AND is_reversal = 0
         LIMIT 1`,
        {
          replacements: {
            drawerId: drawer.id,
            reference: transactionReference
          },
          type: QueryTypes.SELECT
        }
      );
      originalTransaction = result;
    } catch (err) {
      console.log('⚠️ Could not find original transaction:', err.message);
    }
    
    if (!originalTransaction) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Original transaction not found: ${transactionReference}`
      });
    }
    
    // Check if already reversed
    if (originalTransaction.is_reversal) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Transaction has already been reversed'
      });
    }
    
    const amount = parseFloat(originalTransaction.amount || 0);
    const transactionType = originalTransaction.transaction_type || 'DEPOSIT';
    const isDeposit = transactionType === 'DEPOSIT' || transactionType === 'CR';
    
    // Calculate reversal amount and type
    const reversalAmount = amount;
    const reversalType = isDeposit ? 'WITHDRAWAL' : 'DEPOSIT';
    
    const currentBalance = parseFloat(drawer.CURRENT_BALANCE || 0);
    
    // Check balance for reversal (if original was deposit, reversal is withdrawal)
    if (isDeposit && currentBalance < reversalAmount) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance to reverse transaction',
        currentBalance: currentBalance,
        required: reversalAmount
      });
    }
    
    // Get user ID
    const userIdValue = userId || req.user?.user_name || req.user?.userId || 'SYSTEM';
    const performingUser = req.user?.preferred_name || userIdValue;
    
    // Calculate new balance
    const previousBalance = currentBalance;
    let newBalance;
    if (isDeposit) {
      // Reversing a deposit - subtract amount
      newBalance = currentBalance - reversalAmount;
    } else {
      // Reversing a withdrawal - add amount back
      newBalance = currentBalance + reversalAmount;
    }
    
    // Generate reversal reference
    const reversalReference = `REV-${originalTransaction.transaction_ref_no || originalTransaction.id}-${Date.now()}`;
    
    // Insert reversal transaction
    await sequelize.query(
      `INSERT INTO drawer_transactions (
        drawer_id, drawer_no, transaction_type, amount,
        previous_balance, new_balance, transaction_ref_no,
        customer_account, description, user_id, created_at,
        is_reversal, original_transaction_ref, reversal_reason
      ) VALUES (
        :drawerId, :drawerNo, :transactionType, :amount,
        :previousBalance, :newBalance, :referenceNo,
        :customerAccount, :description, :userId, NOW(),
        1, :originalRef, :reason
      )`,
      {
        replacements: {
          drawerId: drawer.id,
          drawerNo: drawer.DRAWER_NO,
          transactionType: reversalType,
          amount: reversalAmount.toFixed(2),
          previousBalance: previousBalance.toFixed(2),
          newBalance: newBalance.toFixed(2),
          referenceNo: reversalReference,
          customerAccount: originalTransaction.customer_account || null,
          description: `REVERSAL: ${reason} - Original: ${originalTransaction.description || originalTransaction.id}`,
          userId: userIdValue,
          originalRef: originalTransaction.transaction_ref_no || originalTransaction.id,
          reason: reason
        },
        transaction
      }
    );
    
    // Update original transaction as reversed
    await sequelize.query(
      `UPDATE drawer_transactions 
       SET is_reversal = 1,
           reversal_reference = :reversalRef,
           reversal_reason = :reason,
           reversed_at = NOW(),
           reversed_by = :userId
       WHERE id = :originalId`,
      {
        replacements: {
          reversalRef: reversalReference,
          reason: reason,
          userId: userIdValue,
          originalId: originalTransaction.id
        },
        transaction
      }
    );
    
    // Update drawer balance
    await Drawer.update(
      {
        CURRENT_BALANCE: newBalance,
        VERSION_NO: sequelize.literal('VERSION_NO + 1'),
        updated_at: new Date()
      },
      {
        where: { id: drawer.id },
        transaction
      }
    );
    
    // Update drawer limit flags
    await updateDrawerLimitFlagsSimple(drawer, newBalance);
    
    await transaction.commit();
    
    console.log(`✅ Transaction ${transactionReference} reversed successfully`);
    
    return res.status(200).json({
      success: true,
      message: `Transaction ${transactionReference} reversed successfully`,
      data: {
        reversal: {
          reference: reversalReference,
          originalReference: transactionReference,
          amount: reversalAmount,
          type: reversalType,
          reason: reason,
          timestamp: new Date()
        },
        originalTransaction: {
          id: originalTransaction.id,
          reference: originalTransaction.transaction_ref_no,
          type: originalTransaction.transaction_type,
          amount: parseFloat(originalTransaction.amount || 0),
          description: originalTransaction.description
        },
        drawer: {
          id: drawer.id,
          drawerId: drawer.DRAWER_ID,
          drawerNo: drawer.DRAWER_NO,
          drawerName: drawer.DRAWER_NM || `Drawer ${drawer.DRAWER_NO}`,
          previousBalance: previousBalance,
          newBalance: newBalance,
          netChange: newBalance - previousBalance
        },
        performedBy: performingUser,
        notes: notes || null
      }
    });
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error reversing transaction:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reverse transaction',
      error: error.message
    });
  }
};

// // ============================================
// // HELPER: Generate Reference Number
// // ============================================
// const generateReferenceNumber = () => {
//   const timestamp = Date.now().toString();
//   const randomDigits = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
//   return (timestamp + randomDigits).slice(0, 18);
// };

// ============================================
// EXPORT HELPER FUNCTIONS
// ============================================
// export {
//   findDrawerByIdentifier,
//   updateDrawerLimitFlags,
//   updateDrawerLimitFlagsSimple,
//   calculateTotalFromDenominations,
//   calculateSessionDuration,
//   createAutoClosingDenomination
// };

// // ============================================
// // DEFAULT EXPORT
// // ============================================
// export default {
//   createDrawer,
//   openDrawer,
//   closeDrawer,
//   getAllDrawers,
//   getDrawerById,
//   getDrawersByUserId,
//   getDrawerByUser,
//    deleteDrawer,
//   getOpenDrawersByUserId,
//   getDrawerTransactionById,
//   getUserDrawerSummary,
//    getDrawerTellerSummary,
//   getDrawerSummary,
//   getDrawerBalance,
//    forceCloseAllDrawers,
//    getDrawerOpeningReport,
//   findDrawerByIdentifier,
//   updateDrawerLimitFlags,
//   getDrawerEnquiry,
//   getDrawerCloseoutReport,
//   updateDrawerLimitFlagsSimple,
//   calculateTotalFromDenominations,
//    getDrawerTransactionHistory,
//     getDrawerTransactionSummary,
//     getDrawerTransactions,
//   calculateSessionDuration,
//   createAutoClosingDenomination,
//    getMultipleDrawersEnquiry,
//    getMyOpenDrawers,
//    postBulkDrawerTransactions,
//    postDrawerTransaction,
//    processDrawerTransaction,
//    updateDrawer,
//    updateDrawerCurrency,
//    processDrawerToVaultTransfer,
//     processDrawerToDrawerTransfer,
//     reverseDrawerTransaction

// };