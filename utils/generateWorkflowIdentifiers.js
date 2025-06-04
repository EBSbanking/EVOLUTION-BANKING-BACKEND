// utils/generateWorkflowIdentifiers.js

// Function to generate new WORK_ITEM_ID, QUEUE_ID, SUB_PROC_ID, and BUS_PROC_ID
export const generateWorkflowIdentifiers = () => {
    // Generate WORK_ITEM_ID starting from 100000 and incrementing
    const WORK_ITEM_ID = (100000 + Math.floor(Math.random() * 900000)).toString();
  
    // Generate QUEUE_ID starting from 1000 and incrementing
    const QUEUE_ID = (1000 + Math.floor(Math.random() * 9000)).toString();
  
    // Generate SUB_PROC_ID starting from 1000 and incrementing
    const SUB_PROC_ID = (1000 + Math.floor(Math.random() * 9000)).toString();
  
    // Generate BUS_PROC_ID starting from 1000 and incrementing
    const BUS_PROC_ID = (1000 + Math.floor(Math.random() * 9000)).toString();
  
    return { WORK_ITEM_ID, QUEUE_ID, SUB_PROC_ID, BUS_PROC_ID };
  };
  