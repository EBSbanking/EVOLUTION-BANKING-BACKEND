// utils/idGenerator.js

// Simple ID generator function
export const generateWorkflowIdentifiers = () => {
  // Generate WORK_ITEM_ID (6 digits)
  const WORK_ITEM_ID = (1000 + Math.floor(Math.random() * 1000));
  
  // Generate QUEUE_ID (4 digits)
  const QUEUE_ID = (1000 + Math.floor(Math.random() * 9000));
  
  // Generate SUB_PROC_ID (4 digits)
  const SUB_PROC_ID = (1000 + Math.floor(Math.random() * 9000));
  
  // Generate BUS_PROC_ID (4 digits)
  const BUS_PROC_ID = (1000 + Math.floor(Math.random() * 9000));
  
  // Generate EVENT_ID (8 chars alphanumeric)
  const EVENT_ID = Date.now() * 10 + Math.floor(Math.random() * 1000);

  
  // Generate JOURNAL_ID (10 digits)
  const JOURNAL_ID = (1000000000 + Math.floor(Math.random() * 9000000000))

  // Generate TRANSACTION_ID (16 digits)
  const TRANSACTION_ID = (1000000000000000 + Math.floor(Math.random() * 9000000000000000))

  return { 
    WORK_ITEM_ID, 
    QUEUE_ID, 
    SUB_PROC_ID, 
    BUS_PROC_ID,
    EVENT_ID,
    JOURNAL_ID,
    TRANSACTION_ID
  };
};

export default generateWorkflowIdentifiers;