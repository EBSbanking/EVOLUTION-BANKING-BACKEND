//services/workflowService.js
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import generateNumber  from '../utils/generateNumber.js';
import NotificationService from '../services/NotificationService.js';
import moment from 'moment';

export async function submitWorkflowItem({
  itemValue,
  itemDesc,
  itemClass,
  itemType,
  itemId,
  custId,
  buId,
  userId,
  homeAddress,
  targetRole = '',
  originatorRole = 'LOAN_MANAGER', // ✅ Added for clarity
  amount,
  productName,
  interestRate,
  term,
  fees
}, session = null) {
  try {
    const WORK_ITEM_ID = generateNumber(6);
    const BUS_PROC_ID = generateNumber(4, 'LOAN');
    const SUB_PROC_ID = generateNumber(4, 'APP');
    const QUEUE_ID = generateNumber(4);
    const EVENT_ID = generateNumber(7);
    const ITEM_REF_NO = generateNumber(4);
    const WORK_ITEM_SESSION_ID = generateNumber(8);
    const deadlineDate = moment().add(2, 'days').toDate();
    const escalationDate = moment().add(1, 'day').toDate();

    const workItemData = {
      WORK_ITEM_ID,
      BUS_PROC_ID,
      SUB_PROC_ID,
      QUEUE_ID,
      ITEM_VALUE: Buffer.from(JSON.stringify({
        amount,
        productName,
        interestRate,
        term,
        fees,
        homeAddress
      })),
      ITEM_DESC: itemDesc,
      ITEM_CLASS_NM: itemClass,
      ITEM_TYPE: itemType,
      ITEM_ID: itemId,
      EVENT_ID,
      CUST_ID: custId,
      REC_ST: 'Active',
      VERSION: 1,
      USER_ID: userId,
      BU_ID: buId,
      CREATE_DT: new Date(),
      SYS_CREATE_TS: new Date(),
      WAIT_ST: 'PENDING',
      MAX_DELAY_TM: 48,
      DEADLINE_TM: deadlineDate,
      ORIGINATOR_USER_ROLE_ID: originatorRole, // ✅ Corrected
      WORK_ITEM_SESSION_ID,
      ITEM_REF_NO,
      TARGET_DUR_TM: 24,
      ESCALATION_TM: escalationDate,
      ITEM_BU_ID: buId,
      TARGET_USER_ROLE_ID: targetRole,
      metadata: {
        loanAmount: amount,
        interestRate,
        term,
        productName,
        processingFees: fees
      }
    };

    const options = session ? { session } : {};
    const workflowItem = await WF_WORK_ITEM.create([workItemData], options);

    // ✅ Defensive Logging
    console.log("📨 Notification payload on submit:", {
      ROLE_ID: targetRole,
      WORK_ITEM_ID,
      message: `Loan Application Requires Approval: ${itemDesc}`
    });

    await NotificationService.send({
      ROLE_ID: targetRole,
      message: `Loan Application Requires Approval: ${itemDesc}`,
      WORK_ITEM_ID,
      CUST_ID: custId,
      EVENT_ID,
      status: 'PENDING',
      metadata: {
        amount,
        productName,
        deadline: deadlineDate.toISOString()
      }
    });

    return workflowItem[0];
  } catch (error) {
    console.error('Workflow submission error:', error);
    throw new Error(`Failed to submit workflow item: ${error.message}`);
  }
}


export async function approveLoanWorkItem(workItemId, userId, session = null) {
  try {
    const options = session ? { session } : {};
    const updatedItem = await WF_WORK_ITEM.findOneAndUpdate(
      { WORK_ITEM_ID: workItemId },
      {
        WAIT_ST: 'APPROVED',
        REC_ST: 'COMPLETED',
        USER_ID: userId,
        SYS_CREATE_TS: new Date()
      },
      { new: true, ...options }
    );

    if (!updatedItem) {
      throw new Error('Work item not found');
    }

    const loanDetails = JSON.parse(updatedItem.ITEM_VALUE.toString());

    // ✅ Defensive Logging
    console.log("📨 Notification payload on approval:", {
      ROLE_ID: updatedItem.ORIGINATOR_USER_ROLE_ID,
      message: `Loan Application Approved: ${updatedItem.ITEM_DESC}`,
      WORK_ITEM_ID: workItemId
    });

    await NotificationService.send({
      ROLE_ID: updatedItem.ORIGINATOR_USER_ROLE_ID,
      message: `Loan Application Approved: ${updatedItem.ITEM_DESC}`,
      WORK_ITEM_ID: workItemId,
      CUST_ID: updatedItem.CUST_ID,
      EVENT_ID: updatedItem.EVENT_ID,
      status: 'APPROVED',
      metadata: {
        amount: loanDetails.amount,
        productName: loanDetails.productName
      }
    });

    return {
      success: true,
      workItem: updatedItem,
      loanDetails,
      approvalDate: new Date()
    };
  } catch (error) {
    console.error('Loan approval error:', error);
    throw new Error(`Failed to approve loan: ${error.message}`);
  }
}


export async function rejectLoanWorkItem(workItemId, userId, reason, session = null) {
  try {
    const options = session ? { session } : {};
    const updatedItem = await WF_WORK_ITEM.findOneAndUpdate(
      { WORK_ITEM_ID: workItemId },
      { 
        WAIT_ST: 'Rejected',
        REC_ST: 'Rejected',
        USER_ID: userId,
        SYS_CREATE_TS: new Date(),
        'metadata.rejectionReason': reason
      },
      { new: true, ...options }
    );

    if (!updatedItem) {
      throw new Error('Work item not found');
    }

    await NotificationService.send({
      ROLE_ID: updatedItem.ORIGINATOR_USER_ROLE_ID,
      message: `Loan Application Rejected: ${updatedItem.ITEM_DESC}`,
      WORK_ITEM_ID: workItemId,
      CUST_ID: updatedItem.CUST_ID,
      EVENT_ID: updatedItem.EVENT_ID,
      status: 'Rejected',
      metadata: {
        reason,
        contact: 'loan-support@bank.com'
      }
    });

    return {
      success: true,
      workItem: updatedItem,
      rejectionDate: new Date(),
      reason
    };

  } catch (error) {
    console.error('Loan rejection error:', error);
    throw new Error(`Failed to reject loan: ${error.message}`);
  }
}

export async function getPendingLoanApprovals(roleId) {
  try {
    return await WF_WORK_ITEM.find({
      ITEM_CLASS_NM: 'Loan',
      WAIT_ST: 'Pending',
      TARGET_USER_ROLE_ID: roleId
    }).sort({ DEADLINE_TM: 1 });
  } catch (error) {
    console.error('Error fetching pending loans:', error);
    throw new Error('Failed to retrieve pending loan approvals');
  }
}
export default submitWorkflowItem;