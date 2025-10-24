export const PERMISSIONS = {
  // Core Transaction Permissions
  DRAWER: {
    VIEW: 'VIEW_DRAWER',
    MANAGE: 'MANAGE_DRAWER',
    RECONCILE: 'RECONCILE_DRAWER'
  },

  // Customer Management
  CUSTOMER: {
    CREATE: 'CREATE_CUSTOMER',
    VIEW: 'VIEW_CUSTOMER',
    UPDATE: 'UPDATE_CUSTOMER',
    DELETE: 'DELETE_CUSTOMER',
    KYC_VERIFY: 'VERIFY_KYC',
    IDENTIFICATION: 'CUSTOMER_IDENTIFICATION', // For customerIdentification module
    PROFILE: 'VIEW_CUSTOMER_PROFILE', // For customerProfile module
    APPROVAL: 'CUSTOMER_APPROVAL'
  },

  // Account Operations
  ACCOUNT: {
    OPEN: 'OPEN_ACCOUNT',
    CLOSE: 'CLOSE_ACCOUNT',
    FREEZE: 'FREEZE_ACCOUNT',
    VIEW_BALANCE: 'VIEW_ACCOUNT_BALANCE',
    VIEW_STATEMENT: 'VIEW_ACCOUNT_STATEMENT',
    DEPOSIT_101: 'DEPOSIT_101', // For deposit101 module
    WITHDRAWAL_102: 'WITHDRAWAL_102', // For withdrawal102 module
    UPDATE: 'UPDATE_ACCOUNT', // For accountUpdate module
    TERM_DEPOSIT: 'CREATE_TERM_DEPOSIT' // For termDeposit module
  },

  // Loan Operations
  LOAN_OPERATIONS: {
    DISBURSE: 'DISBURSE_LOAN',
    APPROVE: 'APPROVE_LOAN',
    REJECT: 'REJECT_LOAN',
    RESTRUCTURE: 'RESTRUCTURE_LOAN',
    WRITE_OFF: 'WRITE_OFF_LOAN',
    COLLECT: 'COLLECT_LOAN',
    RECOVERY: 'RECOVER_LOAN', // Added for recovery actions
    CREATE_CONTRACT: 'CREATE_LOAN_CONTRACT', // For loanMontract module
    VIEW: 'VIEW_LOAN', // For loanApplicationDetails module
    PROCESS: 'PROCESS_LOAN', // For loanCalculator, emiCalculate modules
    CREDIT_APPLICATION: 'CREATE_LOAN_CREDIT_APPLICATION' // For loanCreditApplication module
  },

  // Loan Fees
  LOAN_FEE: {
    CREATE: 'CREATE_LOAN_FEE',
    VIEW: 'VIEW_LOAN_FEES',
    UPDATE: 'UPDATE_LOAN_FEE',
    TOGGLE_STATUS: 'TOGGLE_LOAN_FEE_STATUS',
    WAIVE: 'WAIVE_LOAN_FEE',
    SETUP: 'SETUP_LOAN_FEE' // For loanFeeSetup module
  },

  // Financial Posting
  POSTING: {
    CUSTOMER_POSTING: 'CUSTOMER_POSTING',
    GL_POSTING: 'GL_POSTING',
    REVERSE: 'REVERSE_TRANSACTION',
    ADJUST: 'ADJUST_TRANSACTION',
    CHART_OF_ACCOUNT: 'VIEW_CHART_OF_ACCOUNT', // For chartOfAccount module
    GL_SUBFOLDER: 'VIEW_GL_SUBFOLDER', // For glaSubfolderAccount module
    VIEW_SUBFOLDER: 'VIEW_SUBFOLDER_ACCOUNT', // For viewSubfolderAccount module
    DEPARTMENT: 'MANAGE_DEPARTMENT' // For department module
  },

  // Reports
  REPORT: {
    GENERATE: 'GENERATE_REPORTS',
    VIEW: 'VIEW_REPORTS',
    EXPORT: 'EXPORT_REPORTS',
    CUSTOM: 'CREATE_CUSTOM_REPORTS',
    CUSTOMER: 'VIEW_CUSTOMER_REPORT', // For customerReport module
    TERM_DEPOSIT: 'VIEW_TERM_DEPOSIT_REPORT', // For termDepositReports module
    ACCOUNT_STATEMENT: 'VIEW_ACCOUNT_STATEMENT_REPORT', // For accountStatementReport module
    TRIAL_BALANCE: 'VIEW_TRIAL_BALANCE_REPORT', // For trialBalanceReport module
    INCOME_EXPENSE: 'VIEW_INCOME_EXPENSE_REPORT', // For incomeExpenseReport module
    ALL_REPORTS: 'VIEW_ALL_REPORTS', // For reports module
    TELLER_SUMMARY: 'VIEW_TELLER_SUMMARY_REPORT', // For tellerSummaryReport module
    GUARANTOR: 'VIEW_GUARANTOR_REPORT', // Added for guarantor reports
    PERFORMANCE_METRICS: 'VIEW_PERFORMANCE_METRICS' // ✅ NEW: For teller performance metrics
  },

  // System Administration
  SYSTEM_ADMIN: {
    MANAGE_USERS: 'MANAGE_USERS',
    AUDIT_LOGS: 'VIEW_AUDIT_LOGS', // For auditTrail module
    SYSTEM_CONFIG: 'MANAGE_SYSTEM_CONFIG',
    BACKUP: 'SYSTEM_BACKUP',
    RESTORE: 'SYSTEM_RESTORE',
    SYSTEM_DATE: 'VIEW_SYSTEM_DATE', // For systemDate module
    OS_TRIGGER: 'TRIGGER_OS_OPERATIONS', // For osTrigger module
    LICENSE_DETAILS: 'VIEW_LICENSE_DETAILS' // For licenseDetails module
  },

  // Permission Management
  PERMISSION_MANAGEMENT: {
    CREATE_PERMISSION: 'CREATE_PERMISSION',
    VIEW_PERMISSIONS: 'VIEW_PERMISSIONS',
    UPDATE_PERMISSIONS: 'UPDATE_PERMISSIONS',
    ASSIGN_ROLES: 'ASSIGN_ROLES',
    CLONE_ROLES: 'CLONE_ROLE_PERMISSIONS',
    BUSINESS_ROLE: 'MANAGE_BUSINESS_ROLE', // For businessRole module
    BUSINESS_ROLE_LIST: 'VIEW_BUSINESS_ROLE_LIST', // For businessRoleList module
    BU_ROLE_CREATION: 'CREATE_BUSINESS_ROLE', // For buRoleCreation module
    BUSINESS_ROLE_QUEUE: 'VIEW_BUSINESS_ROLE_QUEUE', // For businessRoleQueue module
    BUSINESS_ROLE_QUEUE_SETUP: 'SETUP_BUSINESS_ROLE_QUEUE' // For businessRoleQueueSetup module
  },

  // Dashboard Access
  DASHBOARD: {
    VIEW: 'VIEW_DASHBOARD',
    CUSTOMIZE: 'CUSTOMIZE_DASHBOARD',
    SHARE: 'SHARE_DASHBOARD',
    TELLER_DASHBOARD: 'VIEW_TELLER_DASHBOARD',
    TRANSACTION_OVERVIEW: 'VIEW_TRANSACTION_OVERVIEW',
    QUICK_ACTIONS: 'ACCESS_QUICK_ACTIONS',
    REAL_TIME_STATS: 'VIEW_REAL_TIME_STATS',
    CREDIT_OFFICER_DASHBOARD: 'VIEW_CREDIT_OFFICER_DASHBOARD', // For creditOfficerDashboard module
    MANAGER_DASHBOARD: 'VIEW_MANAGER_DASHBOARD',
    GUARANTOR_DASHBOARD: 'VIEW_GUARANTOR_DASHBOARD', // Added for guarantor dashboard
    BU_PERFORMANCE: 'VIEW_BU_PERFORMANCE', // ✅ NEW: For business unit performance summary
     DASHBOARDSTATS: 'DASHBOARD_REAL_TIME_STATS'
  },

  // Credit Application
  CREDIT_APPL: {
    CREATE: 'CREATE_CREDIT_APP',
    REVIEW: 'REVIEW_CREDIT_APP',
    APPROVE: 'APPROVE_CREDIT_APP',
    REJECT: 'REJECT_CREDIT_APP'
  },

  // Fixed Assets
  FIXED_ASSET: {
    VIEW: 'VIEW_FIXED_ASSET', // Added for viewing assets
    REGISTER: 'REGISTER_ASSET',
    DEPRECIATE: 'CALC_DEPRECIATION',
    DISPOSE: 'DISPOSE_ASSET',
    TRANSFER: 'TRANSFER_ASSET'
  },

  // Approvals
  APPROVAL: {
    FINANCIAL: 'APPROVE_FINANCIAL',
    TRANSACTION: 'APPROVE_TRANSACTION',
    CUSTOMER_RELATED: 'APPROVE_CUSTOMER_ACTION',
    LOAN: 'APPROVE_LOAN',
    MANAGER: 'MANAGER_APPROVAL', // For managerApproval module
    CASH_DEPOSIT: 'APPROVE_CASH_DEPOSIT', // For cashDepositApproval module
    GL_TRANSACTION: 'APPROVE_GL_TRANSACTION' // For glTransactionApproval module
  },

  // Treasury
  TREASURY: {
    VIEW: 'TREASURY_VIEW',
    MANAGE: 'TREASURY_MANAGE',
    APPROVE: 'TREASURY_APPROVE'
  },

  // Operations
  OPERATIONS: {
    VIEW: 'OPERATIONS_VIEW',
    MANAGE: 'OPERATIONS_MANAGE',
    APPROVE: 'OPERATIONS_APPROVE'
  },

  // Transactions
  TRANSACTION: {
    DEPOSIT: 'MAKE_DEPOSIT', // For cashDeposit module
    WITHDRAWAL: 'MAKE_WITHDRAWAL', // For cashWithdrawal module
    TRANSFER: 'INITIATE_TRANSFER',
    INTERNAL_TRANSFER: 'INTERNAL_TRANSFER',
    EXTERNAL_TRANSFER: 'EXTERNAL_TRANSFER',
    BULK_TRANSACTION: 'PROCESS_BULK_TRANSACTIONS',
    VIEW_HISTORY: 'VIEW_TRANSACTION_HISTORY',
    CANCEL: 'CANCEL_TRANSACTION',
    APPROVE: 'APPROVE_TRANSACTION',
    REJECT: 'REJECT_TRANSACTION',
    OPENING_DEPOSIT: 'MAKE_OPENING_DEPOSIT', // For openingDeposit module
    GL_TO_GL: 'PROCESS_GL_TO_GL', // For glToGlTransaction module
    CREDIT_GL: 'PROCESS_CREDIT_GL', // For creditGlTransaction module
    DEBIT_GL: 'PROCESS_DEBIT_GL', // For debitGlTransaction module
    REPRINT_RECEIPT: 'REPRINT_TRANSACTION_RECEIPT',
    VIEW_RECENT: 'VIEW_RECENT_TRANSACTIONS', // ✅ ENHANCED: For recent transactions in dashboard
    VIEW_STATS: 'VIEW_TRANSACTION_STATS' // ✅ NEW: For transaction statistics
  },

  // Workflow Management
  WORKFLOW: {
    CONFIGURE: 'CONFIGURE_WORKFLOW', // For workflowSetup module
    MANAGE_SUBPROCESS: 'MANAGE_WORKFLOW_SUBPROCESS' // For workflowSubProcess module
  },

  // AML (Anti-Money Laundering)
  AML: {
    VIEW_THRESHOLD: 'VIEW_AML_THRESHOLD', // For amlThreshold module
    APPROVE: 'APPROVE_AML', // For amlApproval module
    CONFIGURE: 'CONFIGURE_AML', // For AML configuration
    MONITOR: 'MONITOR_AML', // For AML transaction monitoring
    REPORT: 'GENERATE_AML_REPORT', // For AML reporting
    SUSPEND: 'SUSPEND_AML_TRANSACTION' // For suspending suspicious transactions
  },

  // Business Unit
  BUSINESS_UNIT: {
    CREATE: 'CREATE_BUSINESS_UNIT', // For createBusinessUnit module
    VIEW: 'VIEW_BUSINESS_UNIT', // For businessUnit module
    SECURITY: 'MANAGE_SECURITY_BUSINESS_UNIT', // For securityBusinessUnit module
    ROLE: 'MANAGE_BUSINESS_UNIT_ROLE' // For businessUnitRole module
  },

  // Security Profile
  SECURITY_PROFILE: {
    ADD_USER: 'ADD_USER', // For addUser module
    ASSIGN_ROLE: 'ASSIGN_USER_ROLE', // For assignUserRole module
    ASSIGN_CSO_RIGHT: 'ASSIGN_CSO_RIGHT', // For assignCsoRight module
    RESET_PASSWORD: 'RESET_PASSWORD', // For passwordReset module
    CONSOLE: 'VIEW_SECURITY_CONSOLE' // For securityConsole module
  },

  // Deposit Management
  DEPOSIT: {
    CREATE: 'CREATE_DEPOSIT', // For depositModule module
    APPLICATION: 'CREATE_DEPOSIT_APPLICATION', // For depositApplication module
    VIEW_DETAILS: 'VIEW_DEPOSIT_DETAILS', // For depositApplicationDetails module
    APPROVAL: 'DEPOSIT_APPLICATION_APPROVAL' // For depositApplicationApproval module
  },

  // Guarantor Management - COMPREHENSIVE PERMISSIONS
  GUARANTOR: {
    // Basic CRUD Operations
    CREATE: 'CREATE_GUARANTOR', // For createGuarantor module
    VIEW: 'VIEW_GUARANTOR', // For viewing guarantor lists
    VIEW_DETAILS: 'VIEW_GUARANTOR_DETAILS', // For detailed guarantor view
    UPDATE: 'UPDATE_GUARANTOR', // For modifying guarantor information
    DELETE: 'DELETE_GUARANTOR', // For removing guarantors
    
    // Search and Access
    SEARCH: 'SEARCH_GUARANTOR', // For searching guarantors by ID/name
    
    // Approval Workflow
    APPROVE: 'APPROVE_GUARANTOR', // For approvedGuarantor module
    REJECT: 'REJECT_GUARANTOR', // For rejecting guarantor applications
    VERIFY: 'VERIFY_GUARANTOR', // For verification process
    
    // Removal Process
    REMOVAL_REQUEST: 'REQUEST_GUARANTOR_REMOVAL', // For submitting removal requests
    APPROVE_REMOVAL: 'APPROVE_GUARANTOR_REMOVAL', // For approving removal requests
    REJECT_REMOVAL: 'REJECT_GUARANTOR_REMOVAL', // For rejecting removal requests
    
    // Status Management
    REACTIVATE: 'REACTIVATE_GUARANTOR', // For reactivating guarantors
    DEACTIVATE: 'DEACTIVATE_GUARANTOR', // For deactivating guarantors
    
    // Bulk Operations
    BULK_ACTIONS: 'PERFORM_GUARANTOR_BULK_ACTIONS', // For bulk updates/actions
    
    // Reporting and Analytics
    REPORTS: 'VIEW_GUARANTOR_REPORTS', // For guarantor reporting
    DASHBOARD: 'VIEW_GUARANTOR_DASHBOARD', // For guarantor dashboard
    AUDIT_LOG: 'VIEW_GUARANTOR_AUDIT_LOG', // For guarantor audit trail
    
    // Export Capabilities
    EXPORT: 'EXPORT_GUARANTOR_DATA' // For exporting guarantor data
  },

  // Rate Management
  RATE: {
    LOAN_INTEREST: 'SETUP_LOAN_INTEREST', // For loanInterestSetup module
    DEPOSIT_INTEREST: 'SETUP_DEPOSIT_INTEREST', // For depositInterestSetup module
    INDEX: 'SETUP_INDEX_RATE' // For indexRate module
  },

  // Product Management
  PRODUCT: {
    VIEW: 'VIEW_PRODUCT', // Added for viewing products
    SETUP: 'SETUP_PRODUCT', // For productSetup module
    LOAN: 'SETUP_LOAN_PRODUCT', // For loanProductSetup module
    MAPPING: 'MANAGE_PRODUCT_MAPPING' // For productMapping module
  },

  // Holiday Management
  HOLIDAY: {
    MANAGE: 'MANAGE_HOLIDAY_CALENDAR' // For holidayCalendar module
  },

  // Marketing
  MARKETING: {
    CREATE_CAMPAIGN: 'CREATE_MARKETING_CAMPAIGN',
    VIEW_ANALYTICS: 'VIEW_MARKETING_ANALYTICS'
  },

  // Agency Banking
  AGENCY: {
    MANAGE_AGENCY: 'MANAGE_AGENCY_BANKING',
    VIEW_AGENCY_REPORT: 'VIEW_AGENCY_REPORT'
  },

  // Analytics
  ANALYTICS: {
    VIEW_BUSINESS_ANALYTICS: 'VIEW_BUSINESS_ANALYTICS',
    EXPORT_ANALYTICS: 'EXPORT_ANALYTICS_DATA',
    VIEW_TELLER_ANALYTICS: 'VIEW_TELLER_ANALYTICS' // ✅ NEW: For teller-specific analytics
  },

  // Risk Management
  RISK: {
    VIEW_RISK_REPORT: 'VIEW_RISK_REPORT',
    MANAGE_RISK_SETTINGS: 'MANAGE_RISK_SETTINGS'
  },

  // Reconciliation
  RECONCILIATION: {
    PROCESS_RECONCILIATION: 'PROCESS_RECONCILIATION',
    VIEW_RECONCILIATION_REPORT: 'VIEW_RECONCILIATION_REPORT'
  },

  // Thrift Management (Added for CSO fallback consistency)
  THRIFT: {
    CREATE: 'CREATE_THRIFT',
    COLLECTION: 'COLLECT_THRIFT',
    WITHDRAWAL: 'WITHDRAWAL_THRIFT'
  },

  // ✅ NEW: Performance & Monitoring Permissions
  PERFORMANCE: {
    VIEW_METRICS: 'VIEW_PERFORMANCE_METRICS',
    VIEW_TELLER_PERFORMANCE: 'VIEW_TELLER_PERFORMANCE',
    VIEW_BRANCH_PERFORMANCE: 'VIEW_BRANCH_PERFORMANCE',
    EXPORT_PERFORMANCE_DATA: 'EXPORT_PERFORMANCE_DATA'
  },

  // ✅ NEW: Dashboard Statistics Permissions
  STATISTICS: {
    VIEW_REAL_TIME: 'VIEW_REAL_TIME_STATISTICS',
    VIEW_HISTORICAL: 'VIEW_HISTORICAL_STATISTICS',
    VIEW_FINANCIAL: 'VIEW_FINANCIAL_STATISTICS',
    VIEW_OPERATIONAL: 'VIEW_OPERATIONAL_STATISTICS'
  }
};

export default PERMISSIONS;