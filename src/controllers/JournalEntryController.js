import sequelize from '../../config/db.js';
import JournalEntry from '../models/JournalEntry.js';
import JournalEntryLine from '../models/JournalEntryLine.js';
import GLAccount from '../models/GLAccount.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import { generateWorkflowIdentifiers } from '../utils/generateWorkflowIdentifiers.js';
import logAuditTrail from '../utils/auditHelper.js';
import NotificationService from '../Services/NotificationService.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import { createRootSubfolder } from './SubfolderController.js';

// ------------------------------------------------------------------
// CREATE JOURNAL ENTRY
// ------------------------------------------------------------------
export const createJournalEntry = async (req, res) => {
  const dbTransaction = await sequelize.transaction();
  try {
    const {
      entryDate,
      description,
      reference,
      branchCode,
      lines,
      transactionId,
    } = req.body;

    // --- Input validation ---
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      await dbTransaction.rollback();
      return res.status(400).json({ success: false, message: 'Lines are required' });
    }

    let totalDebit = 0, totalCredit = 0;
    const validatedLines = [];
    for (const line of lines) {
      const debit = parseFloat(line.debitAmount) || 0;
      const credit = parseFloat(line.creditAmount) || 0;
      if (debit === 0 && credit === 0) {
        await dbTransaction.rollback();
        return res.status(400).json({ success: false, message: 'Each line must have debit or credit > 0' });
      }
      if (debit > 0 && credit > 0) {
        await dbTransaction.rollback();
        return res.status(400).json({ success: false, message: 'Line cannot have both debit and credit' });
      }
      const account = await GLAccount.findOne({
        where: { GL_ACCT_ID: line.glAccountId },
        transaction: dbTransaction
      });
      if (!account) {
        await dbTransaction.rollback();
        return res.status(400).json({
          success: false,
          message: `GL account with GL_ACCT_ID ${line.glAccountId} not found`
        });
      }
      totalDebit += debit;
      totalCredit += credit;
      validatedLines.push({
        glAccountId: account.id,
        glAcctNo: account.GL_ACCT_NO,
        debitAmount: debit,
        creditAmount: credit,
        description: line.description || null,
        branchCode: line.branchCode || branchCode,
      });
    }

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      await dbTransaction.rollback();
      return res.status(400).json({ success: false, message: 'Total debits must equal total credits' });
    }

    // --- Generate workflow identifiers ---
    const identifiers = await generateWorkflowIdentifiers();
    let { TRANSACTION_ID, WORK_ITEM_ID, BUS_PROC_ID, SUB_PROC_ID, QUEUE_ID, EVENT_ID, JOURNAL_ID } = identifiers;

    // ✅ Ensure WORK_ITEM_ID is unique (primary key)
    const maxWorkItemId = await WF_WORK_ITEM.max('WORK_ITEM_ID', { transaction: dbTransaction });
    WORK_ITEM_ID = (maxWorkItemId || 0) + 1;

    // --- Create Journal Entry header ---
    const entryNumber = `JE${new Date().getFullYear()}${String(TRANSACTION_ID).padStart(6, '0')}`;
    const journalEntry = await JournalEntry.create({
      entryNumber,
      entryDate: entryDate || new Date(),
      description,
      reference,
      branchCode,
      status: 'PENDING',
      totalDebit,
      totalCredit,
      createdBy: req.user?.id || 'system',
      transactionId: transactionId || null,
    }, { transaction: dbTransaction });

    // --- Create lines ---
    for (const line of validatedLines) {
      await JournalEntryLine.create({
        journalEntryId: journalEntry.id,
        glAccountId: line.glAccountId,
        debitAmount: line.debitAmount,
        creditAmount: line.creditAmount,
        description: line.description,
        branchCode: line.branchCode,
      }, { transaction: dbTransaction });
    }

    // --- Workflow item ---
    const user = req.user || {};
    const userId = user.id || 0;
    const buId = user.businessUnitId || 100;

    await WF_WORK_ITEM.create({
      WORK_ITEM_ID,
      BUS_PROC_ID,
      SUB_PROC_ID,
      QUEUE_ID,
      EVENT_ID,
      JOURNAL_ID,
      TRANSACTION_ID,
      entityId: journalEntry.id,
      ITEM_TYPE: 'JOURNAL_ENTRY',
      ITEM_REF_NO: TRANSACTION_ID,
      ITEM_ID: WORK_ITEM_ID,
      ITEM_CLASS_NM: 'JOURNAL_ENTRY',
      ITEM_DESC: `Journal Entry ${entryNumber}: ${description || 'GL Entry'}`,
      assignedTo: 'GL_APPROVER',
      TARGET_USER_ROLE_ID: 'GL_APPROVER',
      status: 'PENDING',
      REC_ST: 'Active',
      USER_ID: userId,
      CUST_ID: 0,
      BU_ID: buId,
      ITEM_BU_ID: buId,
      createdBy: userId,
      VERSION: 1,
      ROW_TS: new Date(),
      CREATE_DT: new Date(),
      SYS_CREATE_TS: new Date(),
      metadata: { entryNumber, totalDebit, totalCredit, lines: lines.length }
    }, { transaction: dbTransaction });

    // --- Notification ---
    await NotificationService.send({
      ROLE_ID: 'GL_APPROVER',
      message: `New Journal Entry ${entryNumber} requires approval (${totalDebit} NGN)`,
      WORK_ITEM_ID,
      EVENT_ID,
      status: 'pending',
      notificationType: 'system',
      metadata: { entryNumber, amount: totalDebit }
    }, { transaction: dbTransaction });

    // --- Optional subfolder (with fallback) ---
    try {
      await createRootSubfolder(TRANSACTION_ID, {
        GL_ACCT_NO: 'JE',
        createdBy: req.user?.id || 'system',
        description: description || 'Journal Entry Subfolder'
      }, { transaction: dbTransaction });
    } catch (subfolderError) {
      console.error('⚠️ Subfolder creation failed (non-critical):', subfolderError.message);
    }

    // --- Audit log ---
    await logAuditTrail(
      'JOURNAL_ENTRY',
      journalEntry.id,
      req.user?.id || 'system',
      'JOURNAL_ENTRY_CREATED',
      null,
      { entryNumber, totalDebit, totalCredit, lines: lines.length },
      req.ip || '0.0.0.0',
      'GENERAL',
      { source: 'createJournalEntry' }
    );

    await dbTransaction.commit();

    return res.status(201).json({
      success: true,
      message: 'Journal entry created, pending approval',
      data: { journalEntry, workItemId: WORK_ITEM_ID }
    });

  } catch (error) {
    await dbTransaction.rollback();
    console.error('Journal Entry creation error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ------------------------------------------------------------------
// GET PENDING JOURNAL ENTRIES (with BU filtering)
// ------------------------------------------------------------------
// ------------------------------------------------------------------
// GET PENDING JOURNAL ENTRIES (direct from JournalEntry table)
// ------------------------------------------------------------------
export const getPendingJournalEntries = async (req, res) => {
  try {
    const user = req.user || {};
    const isAdmin = user.isAdmin || false;
    const userBranchCode = user.branchCode || user.businessUnitId || null;

    // Build where clause for pending journal entries
    const whereClause = {
      status: 'PENDING'   // only pending entries
    };

    // If user is not admin, filter by branch code
    if (!isAdmin && userBranchCode) {
      whereClause.branch_code = userBranchCode;
    }

    // Fetch pending journal entries with their lines and GL accounts
    const journalEntries = await JournalEntry.findAll({
      where: whereClause,
      include: [
        {
          model: JournalEntryLine,
          as: 'lines',
          include: [
            {
              model: GLAccount,
              as: 'glAccount',
              attributes: ['GL_ACCT_NO', 'GL_ACCT_ID', 'acct_desc', 'account_type']
            }
          ]
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Map to response format (no workflow info needed)
    const result = journalEntries.map(entry => ({
      journalEntry: entry,
      // No workItemId / assignedTo because we're not using workflow
    }));

    return res.status(200).json({
      success: true,
      data: result,
      total: result.length
    });

  } catch (error) {
    console.error('Error fetching pending journal entries:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch pending journal entries',
      error: error.message
    });
  }
};

// ------------------------------------------------------------------
// APPROVE JOURNAL ENTRY BY ID (no workflow)
// ------------------------------------------------------------------
// ------------------------------------------------------------------
// APPROVE JOURNAL ENTRY BY ID (with GLAccountTransaction)
// ------------------------------------------------------------------
export const approveJournalEntryDirect = async (req, res) => {
  const dbTransaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { approvalNotes = '' } = req.body;
    const approverId = req.user?.id || 'system';

    const journalEntry = await JournalEntry.findByPk(id, { transaction: dbTransaction });
    if (!journalEntry) {
      throw new Error('Journal entry not found');
    }
    if (journalEntry.status !== 'PENDING') {
      throw new Error(`Journal entry is not pending (status: ${journalEntry.status})`);
    }

    const lines = await JournalEntryLine.findAll({
      where: { journalEntryId: journalEntry.id },
      include: [{ model: GLAccount, as: 'glAccount' }],
      transaction: dbTransaction
    });

    if (!lines.length) throw new Error('No lines found for this journal entry');

    let lineIndex = 1;
    for (const line of lines) {
      const account = line.glAccount;
      if (!account) continue;

      const adjustment = (parseFloat(line.debitAmount) || 0) - (parseFloat(line.creditAmount) || 0);
      account.currentBalance = parseFloat(account.currentBalance || 0) + adjustment;
      account.ledger_balance = parseFloat(account.ledger_balance || 0) + adjustment;
      account.available_balance = parseFloat(account.available_balance || 0) + adjustment;
      await account.save({ transaction: dbTransaction });

      // Update Ledger (if it exists)
      try {
        const Ledger = sequelize.models.Ledger;
        if (Ledger) {
          const ledger = await Ledger.findOne({
            where: { GL_ACCT_NO: account.GL_ACCT_NO },
            transaction: dbTransaction
          });
          if (ledger) {
            ledger.LEDGER_BALANCE = parseFloat(ledger.LEDGER_BALANCE || 0) + adjustment;
            ledger.CURRENT_BALANCE = parseFloat(ledger.CURRENT_BALANCE || 0) + adjustment;
            ledger.AVAILABLE_BALANCE = parseFloat(ledger.AVAILABLE_BALANCE || 0) + adjustment;
            await ledger.save({ transaction: dbTransaction });
          }
        }
      } catch (ledgerError) {
        // optional, ignore
      }

      // ✅ Insert into GLAccountTransaction (now that triggers are dropped)
      const isDebit = parseFloat(line.debitAmount) > 0;
      const amount = isDebit ? line.debitAmount : line.creditAmount;
      const transactionId = `${journalEntry.entryNumber}_${lineIndex}`;

      await GLAccountTransaction.create({
        JOURNAL_ID: journalEntry.entryNumber,
        TRANSACTION_ID: transactionId,
        DR_ACCT_NO: isDebit ? account.GL_ACCT_NO : '0',
        CR_ACCT_NO: isDebit ? '0' : account.GL_ACCT_NO,
        AMOUNT: amount,
        CURRENCY_CODE: 'NGN',
        NARRATION: `Journal entry ${journalEntry.entryNumber} - Line ${lineIndex}`,
        TRANSACTION_TYPE: 'JOURNAL_ENTRY',
        STATUS: 'POSTED',
        CREATED_BY: approverId,
        UPDATED_BY: approverId,
      }, { transaction: dbTransaction });

      lineIndex++;
    }

    journalEntry.status = 'POSTED';
    journalEntry.approvedBy = approverId;
    journalEntry.approvalDate = new Date();
    journalEntry.APPROVAL_NOTES = approvalNotes;
    await journalEntry.save({ transaction: dbTransaction });

    await dbTransaction.commit();

    await logAuditTrail(
      'JOURNAL_ENTRY_DIRECT_APPROVAL',
      journalEntry.id,
      approverId,
      'DIRECT_APPROVED',
      null,
      { entryNumber: journalEntry.entryNumber, status: journalEntry.status },
      req.ip || '0.0.0.0',
      'GENERAL',
      { source: 'approveJournalEntryDirect' }
    );

    return res.status(200).json({
      success: true,
      message: 'Journal entry approved successfully',
      data: { journalEntry }
    });

  } catch (error) {
    await dbTransaction.rollback();
    console.error('Direct approval error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to approve journal entry',
      error: error.message
    });
  }
};


// ------------------------------------------------------------------
// REVERSE JOURNAL ENTRY (creates a reversal entry)
// ------------------------------------------------------------------
export const reverseJournalEntry = async (req, res) => {
  const { journalEntryId, reversalDate, description } = req.body;
  const dbTransaction = await sequelize.transaction();
  try {
    const original = await JournalEntry.findByPk(journalEntryId, {
      include: [{ model: JournalEntryLine, as: 'lines', include: [{ model: GLAccount, as: 'glAccount' }] }],
      transaction: dbTransaction
    });
    if (!original) throw new Error('Original journal entry not found');
    if (original.status !== 'POSTED') throw new Error('Only posted entries can be reversed');

    const reversedLines = original.lines.map(line => ({
      glAccountId: line.glAccountId,
      debitAmount: line.creditAmount,
      creditAmount: line.debitAmount,
      description: `Reversal of ${original.entryNumber}`,
      branchCode: line.branchCode,
    }));

    const identifiers = await generateWorkflowIdentifiers();
    let { TRANSACTION_ID, WORK_ITEM_ID, BUS_PROC_ID, SUB_PROC_ID, QUEUE_ID, EVENT_ID, JOURNAL_ID } = identifiers;

    // Unique WORK_ITEM_ID for reversal
    const maxWorkItemId = await WF_WORK_ITEM.max('WORK_ITEM_ID', { transaction: dbTransaction });
    WORK_ITEM_ID = (maxWorkItemId || 0) + 1;

    const entryNumber = `REV${Date.now()}`;
    const reversedHeader = await JournalEntry.create({
      entryNumber,
      entryDate: reversalDate || new Date(),
      description: description || `Reversal of ${original.entryNumber}`,
      reference: original.reference,
      branchCode: original.branchCode,
      status: 'PENDING',
      totalDebit: original.totalCredit,
      totalCredit: original.totalDebit,
      createdBy: req.user?.id || 'system',
      transactionId: original.transactionId,
      reversedFromId: original.id,
    }, { transaction: dbTransaction });

    for (const line of reversedLines) {
      await JournalEntryLine.create({
        journalEntryId: reversedHeader.id,
        glAccountId: line.glAccountId,
        debitAmount: line.debitAmount,
        creditAmount: line.creditAmount,
        description: line.description,
        branchCode: line.branchCode,
      }, { transaction: dbTransaction });
    }

    const user = req.user || {};
    const userId = user.id || 0;
    const buId = user.businessUnitId || 100;

    await WF_WORK_ITEM.create({
      WORK_ITEM_ID,
      BUS_PROC_ID,
      SUB_PROC_ID,
      QUEUE_ID,
      EVENT_ID,
      JOURNAL_ID,
      TRANSACTION_ID,
      entityId: reversedHeader.id,
      ITEM_TYPE: 'JOURNAL_ENTRY',
      ITEM_REF_NO: TRANSACTION_ID,
      ITEM_ID: WORK_ITEM_ID,
      ITEM_CLASS_NM: 'JOURNAL_ENTRY',
      ITEM_DESC: `Reversal of ${original.entryNumber}`,
      assignedTo: 'GL_APPROVER',
      TARGET_USER_ROLE_ID: 'GL_APPROVER',
      status: 'PENDING',
      REC_ST: 'Active',
      USER_ID: userId,
      CUST_ID: 0,
      BU_ID: buId,
      ITEM_BU_ID: buId,
      createdBy: userId,
      VERSION: 1,
      ROW_TS: new Date(),
      CREATE_DT: new Date(),
      SYS_CREATE_TS: new Date(),
      metadata: { entryNumber, totalDebit: reversedHeader.totalDebit, totalCredit: reversedHeader.totalCredit, reversedFrom: original.id }
    }, { transaction: dbTransaction });

    await NotificationService.send({
      ROLE_ID: 'GL_APPROVER',
      message: `Reversal Journal Entry ${entryNumber} requires approval`,
      WORK_ITEM_ID,
      EVENT_ID,
      status: 'pending',
      notificationType: 'system',
      metadata: { entryNumber, original: original.entryNumber }
    }, { transaction: dbTransaction });

    await dbTransaction.commit();

    return res.status(201).json({
      success: true,
      message: 'Reversal journal entry created, pending approval',
      data: { reversedHeader }
    });

  } catch (error) {
    await dbTransaction.rollback();
    console.error('Reversal error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};