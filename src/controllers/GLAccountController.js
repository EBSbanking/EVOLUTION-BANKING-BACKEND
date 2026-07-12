// src/controllers/GLAccountController.js

import { logger } from '../utils/logger.js';
import ChartofAccount from '../models/ChartofAccount.js';
import Ledger, { TRANSACTION_TYPES } from '../models/Ledger.js';
import GLAccount from '../models/GLAccount.js';
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';

// ==================== COMPREHENSIVE BANKING CHART OF ACCOUNTS ====================
// utils/ChartOfAccounts.js

// ==================== COMPREHENSIVE BANKING CHART OF ACCOUNTS ====================
const ACCOUNT_TYPE_CODES = {
  // ==================== ASSET ACCOUNTS (1000-1999) ====================
  
  // Cash and Cash Equivalents (1000-1099)
  'CASH_IN_HAND': '1000',
  'CASH_IN_VAULT': '1001',
  'CASH_IN_TILL': '1002',
  'CASH_ATM': '1003',
  'CASH_IN_TRANSIT': '1004',
  'PETTY_CASH': '1005',
  'CASH_RESERVE': '1006',
  'FOREIGN_CURRENCY_CASH': '1007',
  
  // Bank Accounts (1100-1199)
  'BANK_ACCOUNT': '1100',
  'BANK_ACCOUNT_OPERATIONS': '1101',
  'BANK_ACCOUNT_COLLECTION': '1102',
  'BANK_ACCOUNT_DISBURSEMENT': '1103',
  'BANK_ACCOUNT_SALARY': '1104',
  'BANK_ACCOUNT_FOREIGN': '1105',
  'BANK_ACCOUNT_NOSTRO': '1106',
  'BANK_ACCOUNT_VOSTRO': '1107',
  'BANK_ACCOUNT_ESCROW': '1108',
  'BANK_ACCOUNT_SUSPENSE': '1109',
  
  // Loans and Advances (1200-1299)
  'LOAN_PORTFOLIO': '1200',
  'LOAN_ASSET': '1201',
  'LOAN_PRINCIPAL': '1202',
  'LOAN_INTEREST_RECEIVABLE': '1203',
  'LOAN_FEES_RECEIVABLE': '1204',
  'LOAN_OVERDUE': '1205',
  'LOAN_NON_PERFORMING': '1206',
  'LOAN_IMPAIRED': '1207',
  'LOAN_PROVISION': '1208',
  'LOAN_WRITE_OFF': '1209',
  'LOAN_WRITE_OFF_BALANCE': '1210',
  'LOAN_BAD_DEBT_BALANCE': '1211',
  'LOAN_ACCOUNT_CHARGE_RECEIVABLE': '1212',
  'LOAN_DELINQUENT_BALANCE': '1213',
  'LOAN_NON_ACCRUAL_BALANCE': '1214',
  'ADVANCES_TO_CUSTOMERS': '1215',
  'ADVANCES_TO_STAFF': '1216',
  'ADVANCES_TO_SUPPLIERS': '1217',
  
  // Specific Loan Types (1300-1399)
  'MORTGAGE_LOAN': '1300',
  'PERSONAL_LOAN': '1301',
  'BUSINESS_LOAN': '1302',
  'MICROFINANCE_LOAN': '1303',
  'AGRICULTURAL_LOAN': '1304',
  'VEHICLE_LOAN': '1305',
  'EDUCATION_LOAN': '1306',
  'CONSUMER_LOAN': '1307',
  'CREDIT_CARD_RECEIVABLE': '1308',
  'OVERDRAFT_ACCOUNT': '1309',
  'TERM_LOAN': '1310',
  'REVOLVING_CREDIT': '1311',
  
  // Provision Related Asset Accounts (1320-1339)
  'LOAN_PROVISION_ACCOUNT': '1320',
  'LOAN_PROVISION_ACCOUNT_OFFSET': '1321',
  'LOAN_PROVISION_RESERVE_ACCOUNT': '1322',
  'LOAN_PROVISION_EXPENSE_ACCOUNT': '1323',
  'AFTER_MATURITY_BALANCE': '1324',
  'CHARGE_OFF_BALANCE': '1325',
  
  // Receivables (1400-1499)
  'ACCOUNTS_RECEIVABLE': '1400',
  'INTEREST_RECEIVABLE': '1401',
  'FEES_RECEIVABLE': '1402',
  'COMMISSION_RECEIVABLE': '1403',
  'DIVIDEND_RECEIVABLE': '1404',
  'RENT_RECEIVABLE': '1405',
  'INSURANCE_RECEIVABLE': '1406',
  'TAX_RECEIVABLE': '1407',
  'CUSTOMER_RECEIVABLE': '1408',
  'EMPLOYEE_RECEIVABLE': '1409',
  'SUNDRY_RECEIVABLE': '1410',
  'RECOVERIES': '1411',
  
  // Suspense and Clearing (1420-1439)
  'LOAN_SUSPENSE_ACCOUNT': '1420',
  'LOAN_SUSPENSE_CHARGE_ACCOUNT': '1421',
  'THIRD_PARTY_SUSPENSE_ACCOUNT': '1422',
  'UNAPPLIED_FUNDS': '1423',
  'LOAN_UNCLEARED_BALANCE': '1424',
  'UNEARNED_INTEREST': '1425',
  
  // Investments (1500-1599)
  'INVESTMENT_ASSET': '1500',
  'GOVERNMENT_SECURITIES': '1501',
  'TREASURY_BILLS': '1502',
  'BONDS': '1503',
  'SHARES': '1504',
  'EQUITY_INVESTMENT': '1505',
  'MUTUAL_FUNDS': '1506',
  'FIXED_INCOME_SECURITIES': '1507',
  'SUBSIDIARY_INVESTMENT': '1508',
  'ASSOCIATE_INVESTMENT': '1509',
  'JOINT_VENTURE_INVESTMENT': '1510',
  'INVESTMENT_PROPERTY': '1511',
  'LONG_TERM_INVESTMENTS': '1550',
  
  // Fixed Assets (1600-1699)
  'FIXED_ASSET': '1600',
  'LAND': '1601',
  'BUILDING': '1602',
  'LEASEHOLD_IMPROVEMENT': '1603',
  'FURNITURE_FIXTURE': '1604',
  'OFFICE_EQUIPMENT': '1605',
  'COMPUTER_EQUIPMENT': '1606',
  'SOFTWARE': '1607',
  'MOTOR_VEHICLE': '1608',
  'PLANT_MACHINERY': '1609',
  'LEASE_ASSET': '1610',
  'RIGHT_OF_USE_ASSET': '1611',
  'CONSTRUCTION_IN_PROGRESS': '1612',
  'ASSET_UNDER_CAPITAL_LEASE': '1613',
  'PROPERTY_PLANT_EQUIPMENT': '1650',
  'CAPITAL_WORK_IN_PROGRESS': '1651',
  
  // Accumulated Depreciation (1700-1799)
  'ACCUM_DEPRECIATION_BUILDING': '1700',
  'ACCUM_DEPRECIATION_FURNITURE': '1701',
  'ACCUM_DEPRECIATION_EQUIPMENT': '1702',
  'ACCUM_DEPRECIATION_VEHICLE': '1703',
  'ACCUM_DEPRECIATION_COMPUTER': '1704',
  'ACCUM_DEPRECIATION_SOFTWARE': '1705',
  'ACCUM_AMORTIZATION': '1706',
  
  // Intangible Assets (1800-1899)
  'INTANGIBLE_ASSET': '1800',
  'GOODWILL': '1801',
  'TRADEMARK': '1802',
  'PATENT': '1803',
  'COPYRIGHT': '1804',
  'LICENSE': '1805',
  'FRANCHISE': '1806',
  'CUSTOMER_RELATIONSHIP': '1807',
  'SOFTWARE_DEVELOPMENT': '1808',
  
  // Current Assets (1900-1999)
  'CURRENT_ASSET': '1900',
  'PREPAID_EXPENSE': '1901',
  'PREPAID_RENT': '1902',
  'PREPAID_INSURANCE': '1903',
  'PREPAID_TAX': '1904',
  'INVENTORY': '1905',
  'SUPPLIES': '1906',
  'WORK_IN_PROGRESS': '1907',
  'DEFERRED_TAX_ASSET': '1910',
  'OTHER_CURRENT_ASSETS': '1920',
  
  // ==================== LIABILITY ACCOUNTS (2000-2999) ====================
  
  // Deposits (2000-2099)
  'DEPOSITS_LIABILITY': '2000',
  'CUSTOMER_DEPOSITS': '2001',
  'SAVINGS_DEPOSITS': '2002',
  'CURRENT_DEPOSITS': '2003',
  'FIXED_DEPOSITS': '2004',
  'TERM_DEPOSITS': '2005',
  'RECURRING_DEPOSITS': '2006',
  'DEMAND_DEPOSITS': '2007',
  'CALL_DEPOSITS': '2008',
  'TIME_DEPOSITS': '2009',
  'MARGIN_DEPOSITS': '2010',
  'ESCROW_DEPOSITS': '2011',
  'SECURITY_DEPOSITS': '2012',
  'DORMANT_DEPOSITS': '2013',
  // THRIFT ACCOUNTS (Liability)
  'THRIFT_SAVINGS_DEPOSITS': '2014',
  'THRIFT_COLLECTION_ACCOUNT': '2015',
  'THRIFT_WITHDRAWAL_ACCOUNT': '2016',
  
  // Repayment Control (2020-2029)
  'REPAYMENT_CONTROL_BALANCES': '2020',
  'LOAN_LATE_FEE_SUSPENSE_ACCOUNT': '2021',
  
  // Loans Payable (2100-2199)
  'LOAN_LIABILITY': '2100',
  'BORROWINGS': '2101',
  'BANK_LOAN': '2102',
  'INTERBANK_BORROWING': '2103',
  'CENTRAL_BANK_BORROWING': '2104',
  'SUBORDINATED_DEBT': '2105',
  'BONDS_PAYABLE': '2106',
  'COMMERCIAL_PAPER': '2107',
  'LOAN_FROM_DIRECTORS': '2108',
  'LOAN_FROM_SHAREHOLDERS': '2109',
  
  // Interest Payable (2200-2299)
  'INTEREST_PAYABLE': '2200',
  'INTEREST_PAYABLE_ON_LOANS': '2201',
  'INTEREST_PAYABLE_ON_SAVINGS': '2202',
  'INTEREST_PAYABLE_ON_DEPOSITS': '2203',
  'INTEREST_PAYABLE_ON_BORROWINGS': '2204',
  'INTEREST_PAYABLE_ON_BONDS': '2205',
  'INTEREST_PAYABLE_ON_OVERDRAFT': '2206',
  'ACCRUED_INTEREST_PAYABLE': '2207',
  'THRIFT_INTEREST_PAYABLE': '2208',
  
  // ==================== INTEREST PAYABLE BY PRODUCT (2209-2299) ====================
  'INTEREST_PAYABLE_PERSONAL_LOAN': '2209',
  'INTEREST_PAYABLE_BUSINESS_LOAN': '2210',
  'INTEREST_PAYABLE_MORTGAGE_LOAN': '2211',
  'INTEREST_PAYABLE_AUTO_LOAN': '2212',
  'INTEREST_PAYABLE_EDUCATION_LOAN': '2213',
  'INTEREST_PAYABLE_CONSUMER_LOAN': '2214',
  'INTEREST_PAYABLE_SME_LOAN': '2215',
  'INTEREST_PAYABLE_AGRICULTURAL_LOAN': '2216',
  'INTEREST_PAYABLE_DAILY_LOAN': '2217',
  'INTEREST_PAYABLE_WEEKLY_LOAN': '2218',
  'INTEREST_PAYABLE_GROUP_LOAN': '2219',
  'INTEREST_PAYABLE_MONTHLY_LOAN': '2220',
  'INTEREST_PAYABLE_GROUP_MONTHLY_LOAN': '2221',
  'INTEREST_PAYABLE_ASSET_LOAN': '2222',
  'INTEREST_PAYABLE_SOLAR_LOAN': '2223',
  'INTEREST_PAYABLE_RAPID_CASH_LOAN': '2224',
  'INTEREST_PAYABLE_STAFF_SALARY_ADVANCE': '2225',
  'INTEREST_PAYABLE_STAFF_LOAN': '2226',
  'INTEREST_PAYABLE_INDIVIDUAL_LOAN': '2227',
  'INTEREST_PAYABLE_CORPORATE_LOAN': '2228',
  'INTEREST_PAYABLE_OVERDRAFT': '2229',
  'INTEREST_PAYABLE_HOME_IMPROVEMENT_LOAN': '2230',
  'INTEREST_PAYABLE_SCHOOL_IMPROVEMENT_LOAN': '2231',
  'INTEREST_PAYABLE_AGRICULTURE_LOAN': '2232',
  'INTEREST_PAYABLE_GENERAL_LOAN': '2233',
  'INTEREST_PAYABLE_MORTGAGE': '2234',
  'INTEREST_PAYABLE_HOME_LOAN': '2235',
  'INTEREST_PAYABLE_SAVINGS': '2236',
  'INTEREST_PAYABLE_TERM_DEPOSIT': '2237',
  'INTEREST_PAYABLE_CREDIT_CARD': '2238',
  'INTEREST_PAYABLE_LINE_OF_CREDIT': '2239',
  
  // Accounts Payable (2300-2399)
  'PAYABLE_ACCOUNT': '2300',
  'ACCOUNTS_PAYABLE': '2301',
  'TRADE_PAYABLES': '2302',
  'SUPPLIER_PAYABLES': '2303',
  'EMPLOYEE_PAYABLES': '2304',
  'SALARY_PAYABLE': '2305',
  'BONUS_PAYABLE': '2306',
  'COMMISSION_PAYABLE': '2307',
  'FEE_PAYABLE': '2308',
  'DIVIDEND_PAYABLE': '2309',
  'RENT_PAYABLE': '2310',
  'UTILITIES_PAYABLE': '2311',
  'PROFESSIONAL_FEES_PAYABLE': '2312',
  'AUDIT_FEES_PAYABLE': '2313',
  'DIRECTOR_FEES_PAYABLE': '2314',
  
  // Accrued Expenses (2400-2499)
  'ACCRUED_EXPENSES': '2400',
  'ACCRUED_SALARIES': '2401',
  'ACCRUED_VACATION': '2402',
  'ACCRUED_BONUS': '2403',
  'ACCRUED_INTEREST': '2404',
  'ACCRUED_TAXES': '2405',
  'ACCRUED_AUDIT_FEES': '2406',
  'ACCRUED_LEGAL_FEES': '2407',
  'ACCRUED_CONSULTING_FEES': '2408',
  'ACCRUED_LIABILITIES': '2450',
  
  // Current Liabilities (2500-2599)
  'CURRENT_LIABILITY': '2500',
  'CURRENT_PORTION_LONG_TERM_DEBT': '2501',
  'SHORT_TERM_BORROWINGS': '2502',
  'SHORT_TERM_LEASE_LIABILITY': '2503',
  'UNEARNED_REVENUE': '2504',
  'DEFERRED_INCOME': '2505',
  'CUSTOMER_ADVANCES': '2506',
  'DEFERRED_REVENUE': '2507',
  'OTHER_CURRENT_LIABILITIES': '2550',
  
  // Long Term Liabilities (2600-2699)
  'LONG_TERM_LIABILITY': '2600',
  'LONG_TERM_DEBT': '2601',
  'LONG_TERM_LOANS': '2602',
  'LONG_TERM_LEASE_LIABILITY': '2603',
  'DEFERRED_TAX_LIABILITY': '2604',
  'PENSION_LIABILITY': '2605',
  'POST_EMPLOYMENT_BENEFITS': '2606',
  'PROVISIONS': '2607',
  'OTHER_LONG_TERM_LIABILITIES': '2650',
  
  // Provisions (2700-2799)
  'PROVISION_FOR_LOAN_LOSSES': '2700',
  'PROVISION_FOR_DOUBTFUL_DEBTS': '2701',
  'PROVISION_FOR_CONTINGENCIES': '2702',
  'PROVISION_FOR_LEGAL': '2703',
  'PROVISION_FOR_RESTRUCTURING': '2704',
  'PROVISION_FOR_WARRANTY': '2705',
  'PROVISION_FOR_EMPLOYEE_BENEFITS': '2706',
  
  // ==================== EQUITY ACCOUNTS (3000-3999) ====================
  
  // Capital (3000-3099)
  'SHARE_CAPITAL': '3000',
  'ORDINARY_SHARE_CAPITAL': '3001',
  'PREFERENCE_SHARE_CAPITAL': '3002',
  'AUTHORIZED_SHARE_CAPITAL': '3003',
  'ISSUED_SHARE_CAPITAL': '3004',
  'PAID_UP_CAPITAL': '3005',
  'CALLED_UP_CAPITAL': '3006',
  'TREASURY_SHARES': '3007',
  'TREASURY_STOCK': '3008',
  
  // Capital Accounts (3100-3199)
  'CAPITAL_ACCOUNT': '3100',
  'ADDITIONAL_PAID_IN_CAPITAL': '3101',
  'SHARE_PREMIUM': '3102',
  'CAPITAL_CONTRIBUTIONS': '3103',
  'PARTNERS_CAPITAL': '3104',
  'MEMBER_CAPITAL': '3105',
  
  // Retained Earnings (3200-3299)
  'RETAINED_EARNINGS': '3200',
  'ACCUMULATED_PROFIT_LOSS': '3201',
  'CURRENT_YEAR_EARNINGS': '3202',
  'PRIOR_YEAR_EARNINGS': '3203',
  'UNAPPROPRIATED_PROFIT': '3204',
  'APPROPRIATED_RETAINED_EARNINGS': '3205',
  
  // Reserves (3300-3399)
  'STATUTORY_RESERVE': '3300',
  'LEGAL_RESERVE': '3301',
  'GENERAL_RESERVE': '3302',
  'CAPITAL_RESERVE': '3303',
  'REVALUATION_RESERVE': '3304',
  'FOREIGN_CURRENCY_TRANSLATION_RESERVE': '3305',
  'FAIR_VALUE_RESERVE': '3306',
  'HEDGING_RESERVE': '3307',
  'RETAINED_EARNINGS_APPROPRIATED': '3308',
  
  // Other Equity (3400-3499)
  'OTHER_COMPREHENSIVE_INCOME': '3400',
  'MINORITY_INTEREST': '3401',
  'NON_CONTROLLING_INTEREST': '3402',
  'DIVIDEND_EQUITY': '3403',
  'PROPOSED_DIVIDEND': '3404',
  'INTERIM_DIVIDEND': '3405',
  
  // ==================== REVENUE/INCOME ACCOUNTS (4000-4999) ====================
  
  // Interest Income - General (4000-4099)
  'INTEREST_INCOME': '4000',
  'INTEREST_INCOME_ON_LOANS': '4001',
  'INTEREST_INCOME_ON_MORTGAGES': '4002',
  'INTEREST_INCOME_ON_OVERDRAFT': '4003',
  'INTEREST_INCOME_ON_INVESTMENTS': '4004',
  'INTEREST_INCOME_ON_BONDS': '4005',
  'INTEREST_INCOME_ON_TREASURY_BILLS': '4006',
  'INTEREST_INCOME_ON_DEPOSITS': '4007',
  'INTEREST_INCOME_ON_INTERBANK': '4008',
  'INTEREST_INCOME_ON_CALL_MONEY': '4009',
  'INTEREST_INCOME_ACCRUED': '4010',
  'THRIFT_INTEREST_INCOME': '4011',
  'THRIFT_CYCLE_INTEREST_INCOME': '4012',
  
  // ==================== INTEREST INCOME BY PRODUCT (4013-4049) ====================
  'INTEREST_ON_PERSONAL_LOAN': '4013',
  'INTEREST_ON_BUSINESS_LOAN': '4014',
  'INTEREST_ON_MORTGAGE_LOAN': '4015',
  'INTEREST_ON_AUTO_LOAN': '4016',
  'INTEREST_ON_EDUCATION_LOAN': '4017',
  'INTEREST_ON_CONSUMER_LOAN': '4018',
  'INTEREST_ON_SME_LOAN': '4019',
  'INTEREST_ON_AGRICULTURAL_LOAN': '4020',
  'INTEREST_ON_DAILY_LOAN': '4021',
  'INTEREST_ON_WEEKLY_LOAN': '4022',
  'INTEREST_ON_GROUP_LOAN': '4023',
  'INTEREST_ON_MONTHLY_LOAN': '4024',
  'INTEREST_ON_GROUP_MONTHLY_LOAN': '4025',
  'INTEREST_ON_ASSET_LOAN': '4026',
  'INTEREST_ON_SOLAR_LOAN': '4027',
  'INTEREST_ON_RAPID_CASH_LOAN': '4028',
  'INTEREST_ON_STAFF_SALARY_ADVANCE': '4029',
  'INTEREST_ON_STAFF_LOAN': '4030',
  'INTEREST_ON_INDIVIDUAL_LOAN': '4031',
  'INTEREST_ON_CORPORATE_LOAN': '4032',
  'INTEREST_ON_OVERDRAFT': '4033',
  'INTEREST_ON_HOME_IMPROVEMENT_LOAN': '4034',
  'INTEREST_ON_SMALL_MEDIUM_ENTERPRISE_LOAN': '4035',
  'INTEREST_ON_SCHOOL_IMPROVEMENT_LOAN': '4036',
  'INTEREST_ON_AGRICULTURE_LOAN': '4037',
  'INTEREST_ON_GENERAL_LOAN': '4038',
  'INTEREST_ON_MORTGAGE': '4039',
  'INTEREST_ON_HOME_LOAN': '4040',
  'INTEREST_ON_SAVINGS': '4041',
  'INTEREST_ON_TERM_DEPOSIT': '4042',
  'INTEREST_ON_CREDIT_CARD': '4043',
  'INTEREST_ON_LINE_OF_CREDIT': '4044',
  
  // Fee Income (4100-4199)
  'FEE_INCOME': '4100',
  'LOAN_PROCESSING_FEE': '4101',
  'LOAN_DISBURSEMENT_FEE': '4102',
  'LOAN_MANAGEMENT_FEE': '4103',
  'LOAN_COMMITMENT_FEE': '4104',
  'LOAN_LATE_PAYMENT_FEE': '4105',
  'LOAN_PREPAYMENT_PENALTY': '4106',
  'ACCOUNT_OPENING_FEE': '4107',
  'ACCOUNT_MAINTENANCE_FEE': '4108',
  'ACCOUNT_CLOSURE_FEE': '4109',
  'ATM_FEE_INCOME': '4110',
  'CARD_FEE_INCOME': '4111',
  'TRANSACTION_FEE': '4112',
  'TRANSFER_FEE': '4113',
  'WITHDRAWAL_FEE': '4114',
  'DEPOSIT_FEE': '4115',
  'STATEMENT_FEE': '4116',
  'SMS_ALERT_FEE': '4117',
  'COMMISSION_INCOME': '4118',
  'BROKERAGE_INCOME': '4119',
  'GUARANTEE_FEE': '4120',
  'LOAN_INSURANCE_FEE': '4121',
  'LATE_PAYMENT_FEE_INCOME': '4122',
  'OTHER_FEE_INCOME': '4123',
  'SMS_CHARGE': '4124',
  'PROCESSING_FEE': '4125',
  'SERVICE_FEE': '4126',
  'FEE_CHARGE': '4127',
  'INTEREST_CHARGE': '4128',
  'PENALTY_CHARGE': '4129',
  'CARD_FEE': '4130',
  'LOAN_FEE': '4131',
  'INVESTMENT_FEE': '4132',
  'BANK_CHARGE': '4133',
  'CHARGE': '4134',
  'THRIFT_CYCLE_FEE': '4135',
  'THRIFT_SERVICE_FEE': '4136',
  'THRIFT_PENALTY_FEE': '4137',
  'THRIFT_WITHDRAWAL_FEE': '4138',
  
  // Service Income (4200-4299)
  'SERVICE_INCOME': '4200',
  'ADVISORY_FEE': '4201',
  'CONSULTING_FEE': '4202',
  'MANAGEMENT_FEE': '4203',
  'AGENCY_FEE': '4204',
  'TRUST_FEE': '4205',
  'CUSTODIAL_FEE': '4206',
  'SAFE_DEPOSIT_BOX_FEE': '4207',
  'WIRE_TRANSFER_FEE': '4208',
  'FOREIGN_EXCHANGE_INCOME': '4209',
  'CURRENCY_EXCHANGE_INCOME': '4210',
  'THRIFT_MANAGEMENT_FEE': '4211',
  
  // Operating Revenue (4300-4399)
  'OPERATING_REVENUE': '4300',
  'TRADING_INCOME': '4301',
  'CAPITAL_GAINS': '4302',
  'DIVIDEND_INCOME': '4303',
  'RENTAL_INCOME': '4304',
  'ROYALTY_INCOME': '4305',
  'SUNDRY_INCOME': '4306',
  'OTHER_OPERATING_INCOME': '4307',
  
  // Non-Operating Income (4400-4499)
  'NON_OPERATING_INCOME': '4400',
  'GAIN_ON_SALE_OF_ASSETS': '4401',
  'GAIN_ON_INVESTMENTS': '4402',
  'GAIN_ON_FOREIGN_EXCHANGE': '4403',
  'INSURANCE_CLAIM_INCOME': '4404',
  'LITIGATION_SETTLEMENT_INCOME': '4405',
  'EXTRAORDINARY_INCOME': '4406',
  'OTHER_NON_OPERATING_INCOME': '4407',
  
  // ==================== EXPENSE ACCOUNTS (5000-5999) ====================
  
  // Interest Expense - General (5000-5099)
  'INTEREST_EXPENSE': '5000',
  'INTEREST_EXPENSE_ON_DEPOSITS': '5001',
  'INTEREST_EXPENSE_ON_SAVINGS': '5002',
  'INTEREST_EXPENSE_ON_BORROWINGS': '5003',
  'INTEREST_EXPENSE_ON_LOANS': '5004',
  'INTEREST_EXPENSE_ON_BONDS': '5005',
  'INTEREST_EXPENSE_ON_LEASE': '5006',
  'INTEREST_EXPENSE_ON_OVERDRAFT': '5007',
  'INTEREST_EXPENSE_ACCRUED': '5008',
  'THRIFT_INTEREST_EXPENSE': '5009',
  
  // ==================== INTEREST EXPENSE BY PRODUCT (5010-5049) ====================
  'INTEREST_EXPENSE_PERSONAL_LOAN': '5010',
  'INTEREST_EXPENSE_BUSINESS_LOAN': '5011',
  'INTEREST_EXPENSE_MORTGAGE_LOAN': '5012',
  'INTEREST_EXPENSE_AUTO_LOAN': '5013',
  'INTEREST_EXPENSE_EDUCATION_LOAN': '5014',
  'INTEREST_EXPENSE_CONSUMER_LOAN': '5015',
  'INTEREST_EXPENSE_SME_LOAN': '5016',
  'INTEREST_EXPENSE_AGRICULTURAL_LOAN': '5017',
  'INTEREST_EXPENSE_DAILY_LOAN': '5018',
  'INTEREST_EXPENSE_WEEKLY_LOAN': '5019',
  'INTEREST_EXPENSE_GROUP_LOAN': '5020',
  'INTEREST_EXPENSE_MONTHLY_LOAN': '5021',
  'INTEREST_EXPENSE_GROUP_MONTHLY_LOAN': '5022',
  'INTEREST_EXPENSE_ASSET_LOAN': '5023',
  'INTEREST_EXPENSE_SOLAR_LOAN': '5024',
  'INTEREST_EXPENSE_RAPID_CASH_LOAN': '5025',
  'INTEREST_EXPENSE_STAFF_SALARY_ADVANCE': '5026',
  'INTEREST_EXPENSE_STAFF_LOAN': '5027',
  'INTEREST_EXPENSE_INDIVIDUAL_LOAN': '5028',
  'INTEREST_EXPENSE_CORPORATE_LOAN': '5029',
  'INTEREST_EXPENSE_OVERDRAFT': '5030',
  'INTEREST_EXPENSE_HOME_IMPROVEMENT_LOAN': '5031',
  'INTEREST_EXPENSE_SCHOOL_IMPROVEMENT_LOAN': '5032',
  'INTEREST_EXPENSE_AGRICULTURE_LOAN': '5033',
  'INTEREST_EXPENSE_GENERAL_LOAN': '5034',
  'INTEREST_EXPENSE_MORTGAGE': '5035',
  'INTEREST_EXPENSE_HOME_LOAN': '5036',
  'INTEREST_EXPENSE_SAVINGS': '5037',
  'INTEREST_EXPENSE_TERM_DEPOSIT': '5038',
  'INTEREST_EXPENSE_CREDIT_CARD': '5039',
  'INTEREST_EXPENSE_LINE_OF_CREDIT': '5040',
  
  // Staff Expenses (5100-5199)
  'STAFF_EXPENSE': '5100',
  'SALARIES_WAGES': '5101',
  'BONUSES': '5102',
  'COMMISSIONS': '5103',
  'ALLOWANCES': '5104',
  'OVERTIME_PAY': '5105',
  'STAFF_BENEFITS': '5106',
  'PENSION_CONTRIBUTIONS': '5107',
  'SOCIAL_SECURITY': '5108',
  'HEALTH_INSURANCE': '5109',
  'TRAINING_EXPENSE': '5110',
  'RECRUITMENT_EXPENSE': '5111',
  'STAFF_WELFARE': '5112',
  'UNIFORM_EXPENSE': '5113',
  'STAFF_TRAVEL': '5114',
  'STAFF_ACCOMMODATION': '5115',
  
  // Administrative Expenses (5200-5299)
  'ADMIN_EXPENSE': '5200',
  'OFFICE_RENT': '5201',
  'OFFICE_UTILITIES': '5202',
  'ELECTRICITY': '5203',
  'WATER': '5204',
  'INTERNET': '5205',
  'TELEPHONE': '5206',
  'POSTAGE': '5207',
  'COURIER': '5208',
  'STATIONERY': '5209',
  'OFFICE_SUPPLIES': '5210',
  'PRINTING': '5211',
  'SECURITY_SERVICES': '5212',
  'CLEANING_SERVICES': '5213',
  'INSURANCE_PREMIUM': '5214',
  'LEGAL_FEES': '5215',
  'AUDIT_FEES': '5216',
  'CONSULTING_FEES': '5217',
  'PROFESSIONAL_FEES': '5218',
  'REGULATORY_FEES': '5219',
  'LICENSE_FEES': '5220',
  'MEMBERSHIP_SUBSCRIPTION': '5221',
  'SOFTWARE_SUBSCRIPTION': '5222',
  'CLOUD_SERVICES': '5223',
  'DATA_SERVICES': '5224',
  
  // Operating Expenses (5300-5399)
  'OPERATING_EXPENSE': '5300',
  'RENT_EXPENSE': '5301',
  'MAINTENANCE_REPAIRS': '5302',
  'EQUIPMENT_MAINTENANCE': '5303',
  'VEHICLE_MAINTENANCE': '5304',
  'BUILDING_MAINTENANCE': '5305',
  'SOFTWARE_MAINTENANCE': '5306',
  'DEPRECIATION_EXPENSE': '5307',
  'AMORTIZATION_EXPENSE': '5308',
  'DEPLETION_EXPENSE': '5309',
  'LEASE_EXPENSE': '5310',
  'INSURANCE_EXPENSE': '5311',
  'PROPERTY_TAX': '5312',
  'OTHER_OPERATING_EXPENSES': '5313',
  
  // Marketing Expenses (5400-5499)
  'MARKETING_EXPENSE': '5400',
  'ADVERTISING': '5401',
  'PROMOTION': '5402',
  'PUBLIC_RELATIONS': '5403',
  'BRANDING': '5404',
  'MARKET_RESEARCH': '5405',
  'CUSTOMER_ACQUISITION': '5406',
  'LOYALTY_PROGRAMS': '5407',
  'SPONSORSHIP': '5408',
  'EVENTS': '5409',
  'DONATIONS_EXPENSE': '5410',
  
  // Technology Expenses (5500-5599)
  'TECHNOLOGY_EXPENSE': '5500',
  'IT_MAINTENANCE': '5501',
  'HARDWARE': '5502',
  'SOFTWARE_LICENSES': '5503',
  'NETWORK_COSTS': '5504',
  'CYBERSECURITY': '5505',
  'BANKING_PLATFORM': '5506',
  'CORE_BANKING_SYSTEM': '5507',
  'DIGITAL_BANKING': '5508',
  'MOBILE_BANKING': '5509',
  'INTERNET_BANKING': '5510',
  'ATM_NETWORK': '5511',
  'POS_NETWORK': '5512',
  'CARD_PROCESSING': '5513',
  
  // Provision Expenses (5600-5699)
  'PROVISION_EXPENSE': '5600',
  'LOAN_LOSS_PROVISION': '5601',
  'DOUBTFUL_DEBT_PROVISION': '5602',
  'CONTINGENCY_PROVISION': '5603',
  'IMPAIRMENT_LOSS': '5604',
  'BAD_DEBT_EXPENSE': '5605',
  
  // Non-Operating Expenses (5700-5799)
  'NON_OPERATING_EXPENSE': '5700',
  'LOSS_ON_SALE_OF_ASSETS': '5701',
  'LOSS_ON_INVESTMENTS': '5702',
  'LOSS_ON_FOREIGN_EXCHANGE': '5703',
  'LITIGATION_SETTLEMENT_EXPENSE': '5704',
  'EXTRAORDINARY_EXPENSE': '5705',
  'PENALTIES_FINES': '5706',
  
  // Financial Expenses (5800-5899)
  'FINANCIAL_EXPENSE': '5800',
  'BANK_CHARGES': '5801',
  'COMMISSION_EXPENSE': '5802',
  'BROKERAGE_EXPENSE': '5803',
  'TRANSACTION_COSTS': '5804',
  'CLEARING_EXPENSE': '5805',
  'SETTLEMENT_EXPENSE': '5806',
  'SWIFT_CHARGES': '5807',
  
  // ==================== MATURED DEPOSIT ACCOUNTS (5900-5999) ====================
  'MATURED_DEPOSIT_PERSONAL_LOAN': '5900',
  'MATURED_DEPOSIT_BUSINESS_LOAN': '5901',
  'MATURED_DEPOSIT_MORTGAGE_LOAN': '5902',
  'MATURED_DEPOSIT_AUTO_LOAN': '5903',
  'MATURED_DEPOSIT_EDUCATION_LOAN': '5904',
  'MATURED_DEPOSIT_CONSUMER_LOAN': '5905',
  'MATURED_DEPOSIT_SME_LOAN': '5906',
  'MATURED_DEPOSIT_AGRICULTURAL_LOAN': '5907',
  'MATURED_DEPOSIT_DAILY_LOAN': '5908',
  'MATURED_DEPOSIT_WEEKLY_LOAN': '5909',
  'MATURED_DEPOSIT_GROUP_LOAN': '5910',
  'MATURED_DEPOSIT_MONTHLY_LOAN': '5911',
  'MATURED_DEPOSIT_GROUP_MONTHLY_LOAN': '5912',
  'MATURED_DEPOSIT_ASSET_LOAN': '5913',
  'MATURED_DEPOSIT_SOLAR_LOAN': '5914',
  'MATURED_DEPOSIT_RAPID_CASH_LOAN': '5915',
  'MATURED_DEPOSIT_STAFF_SALARY_ADVANCE': '5916',
  'MATURED_DEPOSIT_STAFF_LOAN': '5917',
  'MATURED_DEPOSIT_INDIVIDUAL_LOAN': '5918',
  'MATURED_DEPOSIT_CORPORATE_LOAN': '5919',
  'MATURED_DEPOSIT_OVERDRAFT': '5920',
  'MATURED_DEPOSIT_HOME_IMPROVEMENT_LOAN': '5921',
  'MATURED_DEPOSIT_SCHOOL_IMPROVEMENT_LOAN': '5922',
  'MATURED_DEPOSIT_AGRICULTURE_LOAN': '5923',
  'MATURED_DEPOSIT_GENERAL_LOAN': '5924',
  'MATURED_DEPOSIT_MORTGAGE': '5925',
  'MATURED_DEPOSIT_HOME_LOAN': '5926',
  'MATURED_DEPOSIT_SAVINGS': '5927',
  'MATURED_DEPOSIT_TERM_DEPOSIT': '5928',
  'MATURED_DEPOSIT_CREDIT_CARD': '5929',
  'MATURED_DEPOSIT_LINE_OF_CREDIT': '5930',
  
  // ==================== CHARGE RECEIVABLE ACCOUNTS (5931-5960) ====================
  'CHARGE_RECEIVABLE_PERSONAL_LOAN': '5931',
  'CHARGE_RECEIVABLE_BUSINESS_LOAN': '5932',
  'CHARGE_RECEIVABLE_MORTGAGE_LOAN': '5933',
  'CHARGE_RECEIVABLE_AUTO_LOAN': '5934',
  'CHARGE_RECEIVABLE_EDUCATION_LOAN': '5935',
  'CHARGE_RECEIVABLE_CONSUMER_LOAN': '5936',
  'CHARGE_RECEIVABLE_SME_LOAN': '5937',
  'CHARGE_RECEIVABLE_AGRICULTURAL_LOAN': '5938',
  'CHARGE_RECEIVABLE_DAILY_LOAN': '5939',
  'CHARGE_RECEIVABLE_WEEKLY_LOAN': '5940',
  'CHARGE_RECEIVABLE_GROUP_LOAN': '5941',
  'CHARGE_RECEIVABLE_MONTHLY_LOAN': '5942',
  'CHARGE_RECEIVABLE_GROUP_MONTHLY_LOAN': '5943',
  'CHARGE_RECEIVABLE_ASSET_LOAN': '5944',
  'CHARGE_RECEIVABLE_SOLAR_LOAN': '5945',
  'CHARGE_RECEIVABLE_RAPID_CASH_LOAN': '5946',
  'CHARGE_RECEIVABLE_STAFF_SALARY_ADVANCE': '5947',
  'CHARGE_RECEIVABLE_STAFF_LOAN': '5948',
  'CHARGE_RECEIVABLE_INDIVIDUAL_LOAN': '5949',
  'CHARGE_RECEIVABLE_CORPORATE_LOAN': '5950',
  'CHARGE_RECEIVABLE_OVERDRAFT': '5951',
  'CHARGE_RECEIVABLE_HOME_IMPROVEMENT_LOAN': '5952',
  'CHARGE_RECEIVABLE_SCHOOL_IMPROVEMENT_LOAN': '5953',
  'CHARGE_RECEIVABLE_AGRICULTURE_LOAN': '5954',
  'CHARGE_RECEIVABLE_GENERAL_LOAN': '5955',
  'CHARGE_RECEIVABLE_MORTGAGE': '5956',
  'CHARGE_RECEIVABLE_HOME_LOAN': '5957',
  'CHARGE_RECEIVABLE_SAVINGS': '5958',
  'CHARGE_RECEIVABLE_TERM_DEPOSIT': '5959',
  'CHARGE_RECEIVABLE_CREDIT_CARD': '5960',
  'CHARGE_RECEIVABLE_LINE_OF_CREDIT': '5961',
  
  // ==================== PRINCIPAL BALANCE ACCOUNTS (5962-5999) ====================
  'PRINCIPAL_BALANCE_PERSONAL_LOAN': '5962',
  'PRINCIPAL_BALANCE_BUSINESS_LOAN': '5963',
  'PRINCIPAL_BALANCE_MORTGAGE_LOAN': '5964',
  'PRINCIPAL_BALANCE_AUTO_LOAN': '5965',
  'PRINCIPAL_BALANCE_EDUCATION_LOAN': '5966',
  'PRINCIPAL_BALANCE_CONSUMER_LOAN': '5967',
  'PRINCIPAL_BALANCE_SME_LOAN': '5968',
  'PRINCIPAL_BALANCE_AGRICULTURAL_LOAN': '5969',
  'PRINCIPAL_BALANCE_DAILY_LOAN': '5970',
  'PRINCIPAL_BALANCE_WEEKLY_LOAN': '5971',
  'PRINCIPAL_BALANCE_GROUP_LOAN': '5972',
  'PRINCIPAL_BALANCE_MONTHLY_LOAN': '5973',
  'PRINCIPAL_BALANCE_GROUP_MONTHLY_LOAN': '5974',
  'PRINCIPAL_BALANCE_ASSET_LOAN': '5975',
  'PRINCIPAL_BALANCE_SOLAR_LOAN': '5976',
  'PRINCIPAL_BALANCE_RAPID_CASH_LOAN': '5977',
  'PRINCIPAL_BALANCE_STAFF_SALARY_ADVANCE': '5978',
  'PRINCIPAL_BALANCE_STAFF_LOAN': '5979',
  'PRINCIPAL_BALANCE_INDIVIDUAL_LOAN': '5980',
  'PRINCIPAL_BALANCE_CORPORATE_LOAN': '5981',
  'PRINCIPAL_BALANCE_OVERDRAFT': '5982',
  'PRINCIPAL_BALANCE_HOME_IMPROVEMENT_LOAN': '5983',
  'PRINCIPAL_BALANCE_SCHOOL_IMPROVEMENT_LOAN': '5984',
  'PRINCIPAL_BALANCE_AGRICULTURE_LOAN': '5985',
  'PRINCIPAL_BALANCE_GENERAL_LOAN': '5986',
  'PRINCIPAL_BALANCE_MORTGAGE': '5987',
  'PRINCIPAL_BALANCE_HOME_LOAN': '5988',
  'PRINCIPAL_BALANCE_SAVINGS': '5989',
  'PRINCIPAL_BALANCE_TERM_DEPOSIT': '5990',
  'PRINCIPAL_BALANCE_CREDIT_CARD': '5991',
  'PRINCIPAL_BALANCE_LINE_OF_CREDIT': '5992',
  
  // ==================== CONTROL ACCOUNTS (6000-6999) ====================
  
  // Control Accounts (6000-6099)
  'CONTROL_ACCOUNT': '6000',
  'GENERAL_LEDGER_CONTROL': '6001',
  'HEAD_OFFICE_CONTROL': '6002',
  'BRANCH_CONTROL': '6003',
  'INTERNAL_CONTROL': '6004',
  'INTER_COMPANY_CONTROL': '6005',
  'CONTROL_SUSPENSE': '6006',
  
  // Suspense Accounts (6100-6199)
  'SUSPENSE_ACCOUNT': '6100',
  'GENERAL_SUSPENSE': '6101',
  'TRANSACTION_SUSPENSE': '6102',
  'CLEARING_SUSPENSE': '6103',
  'RECONCILIATION_SUSPENSE': '6104',
  'DIFFERENCE_SUSPENSE': '6105',
  
  // Clearing Accounts (6200-6299)
  'CLEARING_ACCOUNT': '6200',
  'CHEQUE_CLEARING': '6201',
  'TRANSFER_CLEARING': '6202',
  'ATM_CLEARING': '6203',
  'POS_CLEARING': '6204',
  'CARD_CLEARING': '6205',
  'INTERBANK_CLEARING': '6206',
  'NEFT_CLEARING': '6207',
  'RTGS_CLEARING': '6208',
  'ACH_CLEARING': '6209',
  'SWIFT_CLEARING': '6210',
  'INTERNAL_CLEARING': '6211',
  
  // Inter-Branch Accounts (6300-6399)
  'INTER_BRANCH': '6300',
  'INTER_BRANCH_TRANSFER': '6301',
  'INTER_BRANCH_RECONCILIATION': '6302',
  'BRANCH_NOSTRO': '6303',
  'BRANCH_VOSTRO': '6304',
  'HEAD_OFFICE_CURRENT': '6305',
  'BRANCH_CURRENT': '6306',
  'BRANCH_CURRENT_ACCOUNT': '6307',
  
  // ==================== TAX ACCOUNTS (7000-7999) ====================
  
  // Tax Payable (7000-7099)
  'WITHHOLDING_TAX_PAYABLE': '7000',
  'VAT_PAYABLE': '7001',
  'INCOME_TAX_PAYABLE': '7002',
  'CORPORATE_TAX_PAYABLE': '7003',
  'PAYROLL_TAX_PAYABLE': '7004',
  'PROPERTY_TAX_PAYABLE': '7005',
  'EXCISE_TAX_PAYABLE': '7006',
  'CUSTOMS_DUTY_PAYABLE': '7007',
  'STAMP_DUTY_PAYABLE': '7008',
  'CAPITAL_GAINS_TAX_PAYABLE': '7009',
  
  // ==================== WITHHOLDING TAX BY PRODUCT (7010-7040) ====================
  'WITHHOLDING_TAX_PERSONAL_LOAN': '7010',
  'WITHHOLDING_TAX_BUSINESS_LOAN': '7011',
  'WITHHOLDING_TAX_MORTGAGE_LOAN': '7012',
  'WITHHOLDING_TAX_AUTO_LOAN': '7013',
  'WITHHOLDING_TAX_EDUCATION_LOAN': '7014',
  'WITHHOLDING_TAX_CONSUMER_LOAN': '7015',
  'WITHHOLDING_TAX_SME_LOAN': '7016',
  'WITHHOLDING_TAX_AGRICULTURAL_LOAN': '7017',
  'WITHHOLDING_TAX_DAILY_LOAN': '7018',
  'WITHHOLDING_TAX_WEEKLY_LOAN': '7019',
  'WITHHOLDING_TAX_GROUP_LOAN': '7020',
  'WITHHOLDING_TAX_MONTHLY_LOAN': '7021',
  'WITHHOLDING_TAX_GROUP_MONTHLY_LOAN': '7022',
  'WITHHOLDING_TAX_ASSET_LOAN': '7023',
  'WITHHOLDING_TAX_SOLAR_LOAN': '7024',
  'WITHHOLDING_TAX_RAPID_CASH_LOAN': '7025',
  'WITHHOLDING_TAX_STAFF_SALARY_ADVANCE': '7026',
  'WITHHOLDING_TAX_STAFF_LOAN': '7027',
  'WITHHOLDING_TAX_INDIVIDUAL_LOAN': '7028',
  'WITHHOLDING_TAX_CORPORATE_LOAN': '7029',
  'WITHHOLDING_TAX_OVERDRAFT': '7030',
  'WITHHOLDING_TAX_HOME_IMPROVEMENT_LOAN': '7031',
  'WITHHOLDING_TAX_SCHOOL_IMPROVEMENT_LOAN': '7032',
  'WITHHOLDING_TAX_AGRICULTURE_LOAN': '7033',
  'WITHHOLDING_TAX_GENERAL_LOAN': '7034',
  'WITHHOLDING_TAX_MORTGAGE': '7035',
  'WITHHOLDING_TAX_HOME_LOAN': '7036',
  'WITHHOLDING_TAX_SAVINGS': '7037',
  'WITHHOLDING_TAX_TERM_DEPOSIT': '7038',
  'WITHHOLDING_TAX_CREDIT_CARD': '7039',
  'WITHHOLDING_TAX_LINE_OF_CREDIT': '7040',
  
  // Tax Receivable (7100-7199)
  'TAX_RECEIVABLE': '7100',
  'WITHHOLDING_TAX_RECOVERABLE': '7101',
  'VAT_RECOVERABLE': '7102',
  'INPUT_VAT': '7103',
  'PREPAID_TAX': '7104',
  
  // Tax Expense (7200-7299)
  'TAX_EXPENSE': '7200',
  'CURRENT_TAX_EXPENSE': '7201',
  'DEFERRED_TAX_EXPENSE': '7202',
  'WITHHOLDING_TAX_EXPENSE': '7203',
  'VAT_EXPENSE': '7204',
  
  // ==================== OFF-BALANCE SHEET (8000-8999) ====================
  
  // Contingent Liabilities (8000-8099)
  'CONTINGENT_LIABILITY': '8000',
  'GUARANTEES_ISSUED': '8001',
  'LETTERS_OF_CREDIT': '8002',
  'BANKERS_ACCEPTANCES': '8003',
  'UNDRAWN_COMMITMENTS': '8004',
  'UNDISBURSED_LOANS': '8005',
  'UNUSED_OVERDRAFTS': '8006',
  'UNUSED_CREDIT_LINES': '8007',
  'FORWARD_CONTRACTS': '8008',
  'FUTURES_CONTRACTS': '8009',
  'OPTIONS_CONTRACTS': '8010',
  'SWAP_CONTRACTS': '8011',
  'CUSTOMER_ACCEPTANCES': '8012',
  
  // Collateral (8100-8199)
  'COLLATERAL_HELD': '8100',
  'PLEDGED_ASSETS': '8101',
  'SECURITIES_HELD_AS_COLLATERAL': '8102',
  'CASH_COLLATERAL': '8103',
  'ASSETS_UNDER_LIEN': '8104',
  'DOCUMENTS_HELD_FOR_COLLECTION': '8105',
  
  // Memoranda (8200-8299)
  'MEMORANDUM_ACCOUNT': '8200',
  'STATISTICAL_ACCOUNT': '8201',
  'INFORMATION_ACCOUNT': '8202',
  'TRACKING_ACCOUNT': '8203',
  'BUDGET_ACCOUNT': '8204',
  'FORECAST_ACCOUNT': '8205'
};



// Account class to code mapping (updated with more classes)
const validClasses = [
  'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE', 
  'CONTROL', 'SUSPENSE', 'TAX', 'OFF_BALANCE_SHEET',
  'CONTROL_SUSPENSE'    // ✅ now supported
];

// Helper function to get account type description
const getAccountTypeDescription = (code) => {
  const entry = Object.entries(ACCOUNT_TYPE_CODES).find(([key, value]) => value === code);
  return entry ? entry[0].replace(/_/g, ' ').toLowerCase() : 'Unknown';
};

// Helper function to get account class by code
const getAccountClass = (code) => {
  if (!code) return null;
  const codeStr = code.toString();
  const classCode = codeStr.charAt(0);
  return Object.entries(ACCOUNT_CLASS_CODES).find(([key, value]) => value === classCode)?.[0] || 'UNKNOWN';
};

// Helper function to validate account code
const isValidAccountCode = (code) => {
  const codeStr = code.toString();
  return codeStr.length >= 4 && 
         codeStr.length <= 6 && 
         Object.values(ACCOUNT_TYPE_CODES).includes(codeStr);
};

// Helper function to generate full account number
const generateAccountNumber = (typeCode, branchCode = '000', currencyCode = 'NGN') => {
  const branch = branchCode.padStart(3, '0').slice(0, 3);
  const currency = currencyCode.slice(0, 3).toUpperCase();
  return `${typeCode}-${branch}-${currency}`;
};

// ==================== HELPER FUNCTIONS ====================
const normalizeBranchCode = (code) => String(code || '').padStart(3, '0');

const normalizeAccountType = (type) => (type || '').toUpperCase().trim();

const getAccountClassCode = (accountClass) => {
  const map = {
    'ASSET': '1',
    'LIABILITY': '2',
    'EQUITY': '3',
    'REVENUE': '4',
    'EXPENSE': '5',
    'CONTROL': '6',
    'SUSPENSE': '7',
    'TAX': '8',
    'OFF_BALANCE_SHEET': '9',
    'CONTROL_SUSPENSE': '6',   // ✅ treat as control
    'MEMORANDA': '0'
  };
  return map[accountClass] || '0';
};

const getNormalBalance = (accountClass) => {
  return ['LIABILITY', 'EQUITY', 'REVENUE'].includes(accountClass) ? 'CREDIT' : 'DEBIT';
};

const generateSubAccountCode = (accountClass, accountType, metadata) => {
  return String(Math.floor(1000 + Math.random() * 9000)).padStart(4, '0');
};

const generateCOAAccountNumber = ({
  organizationCode,
  branchCode,
  accountClass,
  accountType,
  subAccount
}) => {
  const org = String(organizationCode).padStart(2, '0');
  const br = normalizeBranchCode(branchCode);
  const cls = getAccountClassCode(accountClass);
  const typeCode = getAccountClassCode(accountClass) + '00';
  const sub = String(subAccount).padStart(4, '0');
  return `${org}${br}${cls}${typeCode}${sub}`;
};

const getFinancialStatementInfo = (accountClass, accountType) => {
  const map = {
    'ASSET': { type: 'BALANCE_SHEET', category: 'ASSETS' },
    'LIABILITY': { type: 'BALANCE_SHEET', category: 'LIABILITIES' },
    'EQUITY': { type: 'BALANCE_SHEET', category: 'EQUITY' },
    'REVENUE': { type: 'INCOME_STATEMENT', category: 'REVENUE' },
    'EXPENSE': { type: 'INCOME_STATEMENT', category: 'EXPENSES' },
    'CONTROL': { type: 'CONTROL', category: 'CONTROL_ACCOUNTS' },
    'SUSPENSE': { type: 'SUSPENSE', category: 'SUSPENSE_ACCOUNTS' },
    'TAX': { type: 'TAX', category: 'TAX_ACCOUNTS' },
    'OFF_BALANCE_SHEET': { type: 'OFF_BALANCE', category: 'OFF_BALANCE_SHEET' },
    'CONTROL_SUSPENSE': { type: 'CONTROL', category: 'CONTROL_ACCOUNTS' }   // ✅ added
  };
  return map[accountClass] || { type: 'OTHER', category: 'OTHER' };
};

const determineAccountLevel = (level, isControlAccount, parentAccountNo) => {
  if (isControlAccount) return 2;
  if (parentAccountNo) return Math.min(level || 4, 5);
  return level || 4;
};

// Get account type code
export const getAccountTypeCode = (accountTypeString) => {
  return ACCOUNT_TYPE_CODES[accountTypeString] || '999';
};

// UPDATED: Enhanced account class and type validation
export const validateAccountClassType = (accountClass, accountType) => {
  const normalizedAccountClass = accountClass.toUpperCase();
  const normalizedAccountType = accountType.toUpperCase();
  
  logger.debug('Validating account class and type:', {
    accountClass: normalizedAccountClass,
    accountType: normalizedAccountType
  });

  const validCombinations = {
    'ASSET': [ /* ... your existing asset types ... */ ],
    'LIABILITY': [ /* ... existing ... */ ],
    'EQUITY': [ /* ... existing ... */ ],
    'REVENUE': [ /* ... existing ... */ ],
    'EXPENSE': [ /* ... existing ... */ ],
    'CONTROL': [
      'CONTROL_ACCOUNT', 'GENERAL_LEDGER_CONTROL', 'HEAD_OFFICE_CONTROL', 'BRANCH_CONTROL', 
      'INTERNAL_CONTROL', 'INTER_COMPANY_CONTROL', 'INTER_BRANCH', 'INTER_BRANCH_TRANSFER',
      'INTER_BRANCH_RECONCILIATION', 'BRANCH_NOSTRO', 'BRANCH_VOSTRO', 'HEAD_OFFICE_CURRENT', 
      'BRANCH_CURRENT', 'CONTROL_SUSPENSE'   // ✅ added
    ],
    'SUSPENSE': [ /* ... existing ... */ ],
    'TAX': [ /* ... existing ... */ ],
    'OFF_BALANCE_SHEET': [ /* ... existing ... */ ]
  };

  if (!validCombinations[normalizedAccountClass]) {
    throw new Error(`Invalid account class: ${accountClass}`);
  }

  const allowedTypes = validCombinations[normalizedAccountClass];
  if (!allowedTypes.includes(normalizedAccountType)) {
    logger.warn(`Account type '${accountType}' may not be valid for account class '${accountClass}', but proceeding anyway`);
  }
  
  return accountClass;
};

// Map metadata account type to internal format
export const mapMetadataAccountTypeToAccountType = (accountType) => {
  return accountType;
};

// ==================== UPDATED getCOABalanceType (returns DEBIT/CREDIT) ====================
export const getCOABalanceType = (accountClass, accountType) => {
  const normalizedAccountClass = (accountClass || '').toUpperCase().trim();
  const normalizedAccountType = (accountType || '').trim();

  const balanceTypeMapping = {
    // ... your existing mapping ...
    'CONTROL_SUSPENSE': 'DEBIT',   // ✅ added
    // ... rest unchanged
  };

  if (normalizedAccountType && balanceTypeMapping[normalizedAccountType]) {
    return balanceTypeMapping[normalizedAccountType];
  }
  if (balanceTypeMapping[normalizedAccountClass]) {
    return balanceTypeMapping[normalizedAccountClass];
  }
  return 'DEBIT';
};

// Generate next GL account ID
export const generateNextGLAcctId = async (connection) => {
  const [result] = await connection.execute(
    'SELECT MAX(GL_ACCT_ID) as maxId FROM gl_accounts'
  );
  return (result[0]?.maxId || 0) + 1;
};

// Add audit trail
export const addAuditTrail = async (auditParams, connection) => {
  try {
    const query = `
      INSERT INTO audit_trail (
        EVENT_TYPE, USER_ID, ACTION, NEW_VALUE, OLD_VALUE, 
        IP_ADDRESS, ENTITY_ID, ENTITY_TYPE, STATUS, 
        DESCRIPTION, REFERENCE_NO, ACCOUNT_NO, ADDITIONAL_INFO,
        createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    
    const values = [
      auditParams.EVENT_TYPE,
      auditParams.USER_ID,
      auditParams.ACTION,
      JSON.stringify(auditParams.NEW_VALUE),
      JSON.stringify(auditParams.OLD_VALUE),
      auditParams.IP_ADDRESS,
      auditParams.ENTITY_ID,
      auditParams.ENTITY_TYPE,
      auditParams.STATUS,
      auditParams.DESCRIPTION,
      auditParams.REFERENCE_NO,
      auditParams.ACCOUNT_NO,
      JSON.stringify(auditParams.ADDITIONAL_INFO)
    ];
    
    await connection.execute(query, values);
    console.log('✅ Audit trail created successfully');
  } catch (error) {
    console.error('❌ Failed to create audit trail:', error.message);
  }
};

// ==================== ENHANCED: CREATE COA-ALIGNED GL ACCOUNT + LEDGER ENTRY ====================
// ==================== ENHANCED: CREATE COA-ALIGNED GL ACCOUNT + LEDGER + HIERARCHY ====================
export const createCOAAlignedGLAccount = async (req, res) => {
  let transaction;

  try {
    logger.info('Starting COA-aligned GL account creation with Ledger linkage & hierarchy');
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));

    await GLAccount.createTableIfNotExists();
    console.log('✅ GL Account table check/creation completed');

    transaction = await sequelize.transaction();

    // -------- DESTRUCTURE WITH HIERARCHY FIELDS --------
    const {
      // Existing fields
      organizationCode: rawOrgCode,
      organizationName = '',
      branchCode: rawBranchCode,
      branchName = '',
      accountClass,
      accountType,
      ACCT_DESC,
      level = 4,
      CREATED_BY = 'system',
      parentAccountNo = null,
      isControlAccount = false,
      isSuspenseAccount = false,
      openingBalance = 0,
      allowNegativeBalance = false,
      productType,
      subAccount,
      metadata = {},
      // New hierarchical fields (frontend sends these)
      parentId,
      isFolder = false,
      sortOrder = 0,
      name: providedName,       // if frontend sends 'name' instead of ACCT_DESC
    } = req.body;

    // ------------------ SAFE INPUT CONVERSION ------------------
    const safeToString = (value) => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (typeof value === 'object') try { return JSON.stringify(value); } catch { return ''; }
      return '';
    };

    const safeTrim = (value) => {
      const str = safeToString(value);
      return typeof str === 'string' ? str.trim() : '';
    };

    const organizationCode = safeTrim(rawOrgCode);
    const branchCode = safeTrim(rawBranchCode);
    const acctDesc = safeTrim(ACCT_DESC || providedName || '');
    const safeOrganizationName = safeTrim(organizationName);
    const safeBranchName = safeTrim(branchName);

    if (!organizationCode || !branchCode || !acctDesc) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid required fields: organizationCode, branchCode, ACCT_DESC (or name)'
      });
    }

    const resolvedAccountClass = accountClass || metadata.accountClass || '';
    const resolvedAccountType = accountType || metadata.accountType || '';
    
    const safeToUpper = (value) => {
      const str = safeToString(value);
      return typeof str === 'string' ? str.toUpperCase().trim() : '';
    };

    const accountClassUpper = safeToUpper(resolvedAccountClass);
    const accountTypeUpper = safeToUpper(resolvedAccountType);

    console.log('🔍 Account classification:', { accountClassUpper, accountTypeUpper });

    // Valid classes
    const validClasses = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE', 'CONTROL', 'SUSPENSE', 'TAX', 'OFF_BALANCE_SHEET', 'CONTROL_SUSPENSE'];
    if (!validClasses.includes(accountClassUpper)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Invalid accountClass. Must be one of: ${validClasses.join(', ')}`
      });
    }

    // ------------------ GL CODE GENERATION ------------------
    const normalizeBranchCodeSimple = (code) => {
      const str = safeToString(code);
      const digits = str.replace(/\D/g, '');
      return digits.padStart(3, '0').slice(0, 3);
    };

    const normalizedBranchCode = normalizeBranchCodeSimple(branchCode);
    const subAccountCode = subAccount || '0001';

    const clsMap = {
      'ASSET': '1', 'LIABILITY': '2', 'EQUITY': '3',
      'REVENUE': '4', 'EXPENSE': '5', 'CONTROL': '6',
      'SUSPENSE': '7', 'TAX': '8', 'OFF_BALANCE_SHEET': '9',
      'CONTROL_SUSPENSE': '6'
    };

    const accountTypeCategoryMap = {};
    Object.entries(ACCOUNT_TYPE_CODES).forEach(([key, value]) => {
      accountTypeCategoryMap[key] = value;
    });

    const generateUniqueGLCode = ({ orgCode, branch, accClass, accType, subAcc }) => {
      const org = safeToString(orgCode).padStart(2, '0').slice(0, 2);
      const br = safeToString(branch).padStart(3, '0').slice(0, 3);
      const cls = clsMap[accClass] || '0';
      let categoryCode = accountTypeCategoryMap[accType] || '0000';
      if (categoryCode === '0000') {
        const typeHash = Math.abs(accType.split('').reduce((acc, char) => {
          return ((acc << 5) - acc) + char.charCodeAt(0);
        }, 0)).toString().slice(-4);
        categoryCode = typeHash.padStart(4, '0');
      }
      const sub = safeToString(subAcc).padStart(4, '0').slice(0, 4);
      return `${org}${br}${cls}${categoryCode}${sub}`;
    };

    const glcode = generateUniqueGLCode({
      orgCode: organizationCode,
      branch: normalizedBranchCode,
      accClass: accountClassUpper,
      accType: accountTypeUpper,
      subAcc: subAccountCode
    });

    const glAccountId = `GL${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // ------------------ POSTING RULES ------------------
    const getSimpleNormalBalance = (accClass) => {
      return ['LIABILITY', 'EQUITY', 'REVENUE'].includes(accClass) ? 'CREDIT' : 'DEBIT';
    };

    const normalBalance = getSimpleNormalBalance(accountClassUpper);
    let accountLevel = parseInt(safeToString(level), 10) || 4;
    let accountPath = null;

    // ---------- HIERARCHY LOGIC ----------
    // Resolve parentId (could come as 'parentId' or from parentAccountNo)
    const resolvedParentId = parentId || (parentAccountNo ? parseInt(parentAccountNo, 10) : null);

    if (resolvedParentId) {
      const parent = await ChartofAccount.findOne({
        where: {
          id: resolvedParentId,
          organization_code: parseInt(organizationCode, 10),
          branch_code: normalizedBranchCode,
          is_deleted: false
        },
        transaction
      });
      if (!parent) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: `Parent account with ID ${resolvedParentId} not found in this branch`
        });
      }
      // Level = parent level + 1 (or use provided level if greater)
      const parentLevel = parent.accountLevel || 0;
      accountLevel = Math.max(accountLevel, parentLevel + 1);
      // Path = parent path + parent id
      accountPath = parent.accountPath
        ? `${parent.accountPath}/${parent.id}`
        : `${parent.id}`;
    }

    const getPostingRules = (accountClass, normalBalance, allowNegativeBalance, isControlAccount, isSuspenseAccount, metadata = {}) => {
      const baseRules = {
        allowNegative: Boolean(allowNegativeBalance),
        postAllow: true,
        controlAccount: Boolean(isControlAccount),
        suspenseAccount: Boolean(isSuspenseAccount)
      };
      if (metadata.postingRulesOverride) {
        return { ...baseRules, ...metadata.postingRulesOverride };
      }
      return { ...baseRules, crAllowed: true, drAllowed: true };
    };

    const postingRules = getPostingRules(
      accountClassUpper, normalBalance, allowNegativeBalance,
      isControlAccount, isSuspenseAccount, metadata
    );

    // ---------------- MAP TO DB-SAFE ACCOUNT CLASS ----------------
    const getDbSafeAccountClass = (accClass) => {
      const mapping = { 'CONTROL_SUSPENSE': 'CONTROL' };
      return mapping[accClass] || accClass;
    };

    const dbSafeClass = getDbSafeAccountClass(accountClassUpper);
    console.log(`🔍 DB-safe account class: ${dbSafeClass} (original: ${accountClassUpper})`);

    // ------------------ METADATA & COA STRUCTURE ------------------
    const coaMetadata = {
      accountClass: accountClassUpper,
      accountType: accountTypeUpper,
      normalBalance,
      coaCompliant: true,
      dynamicAccount: true,
      branchSpecific: true,
      productType: safeToString(productType),
      subAccountCode,
      balanceSettings: {
        allowNegative: Boolean(allowNegativeBalance),
        openingBalance: parseFloat(safeToString(openingBalance)) || 0
      },
      hierarchy: {
        level: accountLevel,
        parentId: resolvedParentId,
        isFolder: Boolean(isFolder),
        sortOrder: sortOrder || 0,
        accountPath: accountPath,
        parentAccountNo: safeToString(parentAccountNo)
      },
      postingRules,
      ...(typeof metadata === 'object' ? metadata : {})
    };

    const orgSegment = safeToString(organizationCode).padStart(2, '0').slice(0, 2);
    const branchSegment = safeToString(normalizedBranchCode).padStart(3, '0').slice(0, 3);
    const classCode = clsMap[accountClassUpper] || '0';
    const categoryCode = accountTypeCategoryMap[accountTypeUpper] || '0000';
    const subSegment = safeToString(subAccountCode).padStart(4, '0').slice(0, 4);

    const coaStructure = {
      organization: { code: organizationCode, name: safeOrganizationName || `Organization ${organizationCode}` },
      branch: { code: normalizedBranchCode, name: safeBranchName || `Branch ${branchCode}` },
      account: {
        class: accountClassUpper,
        type: accountTypeUpper,
        category: accountClassUpper,
        subCategory: accountTypeUpper,
        categoryCode,
        postingRules
      },
      segments: [
        { segment: 'ORG', value: orgSegment, description: 'Organization' },
        { segment: 'BRANCH', value: branchSegment, description: 'Branch' },
        { segment: 'CLASS', value: classCode, description: 'Account Class' },
        { segment: 'CATEGORY', value: categoryCode, description: 'Account Type Category' },
        { segment: 'SUB', value: subSegment, description: 'Sub Account' }
      ],
      generationDate: new Date().toISOString()
    };

    // ------------------ DUPLICATE CHECK ------------------
    const existingAccounts = await Promise.all([
      ChartofAccount.findOne({ where: { glcode }, transaction }),
      Ledger.findOne({ where: { GL_ACCT_NO: glcode }, transaction }),
      GLAccount.findOne({ where: { GL_ACCT_NO: glcode }, transaction })
    ]);

    if (existingAccounts.some(acc => acc)) {
      await transaction.rollback();
      return res.status(409).json({
        success: false,
        message: `GL account with code ${glcode} already exists.`,
        error: 'DUPLICATE_GL_CODE',
        generatedCode: glcode
      });
    }

    // ------------------ CREATE CHART OF ACCOUNT (with hierarchy) ------------------
    const chartAccount = await ChartofAccount.create({
      name: acctDesc,
      glcode,
      type: accountClassUpper,
      account_usage: accountTypeUpper,
      gl_group: accountClassUpper,
      balance: parseFloat(safeToString(openingBalance)) || 0,
      unreconciled_balance: parseFloat(safeToString(openingBalance)) || 0,
      manual_entries: 'NO',
      description: acctDesc,
      status: 'ACTIVE',
      organizationCode: parseInt(organizationCode, 10) || 1,
      branchCode: normalizedBranchCode,
      glAccountNo: glcode,
      mappingStatus: 'SYNCED',
      mappedAt: new Date(),
      category: accountClassUpper,
      subCategory: accountTypeUpper,
      isControlAccount: Boolean(isControlAccount),
      isSuspenseAccount: Boolean(isSuspenseAccount),
      allowNegativeBalance: Boolean(allowNegativeBalance),
      postingRules: JSON.stringify(postingRules),
      reportingCategory: accountClassUpper,
      createdBy: safeTrim(CREATED_BY),
      updatedBy: safeTrim(CREATED_BY),
      sourceSystem: 'INTERNAL_COA_ENGINE',
      // HIERARCHY FIELDS
      parentId: resolvedParentId,
      accountLevel: accountLevel,
      isFolder: Boolean(isFolder),
      sortOrder: sortOrder || 0,
      accountPath: accountPath,
      metadata: JSON.stringify(coaMetadata)
    }, { transaction });

    // ------------------ CREATE LEDGER ENTRY ------------------
    const getAccountClassCategoryCode = (accClass) => {
      const map = { 
        'ASSET': '1000', 'LIABILITY': '2000', 'EQUITY': '3000', 
        'REVENUE': '4000', 'EXPENSE': '5000',
        'CONTROL': '6000', 'SUSPENSE': '6100',
        'TAX': '7000', 'OFF_BALANCE_SHEET': '8000',
        'CONTROL_SUSPENSE': '6000'
      };
      return map[accClass] || '1000';
    };

    const ledgerData = {
      GL_ACCT_NO: glcode,
      GL_ACCT_ID: parseInt(safeToString(chartAccount.id), 10) || 0,
      CHART_OF_ACCT_ID: '10001',
      BAL_CD: getAccountClassCategoryCode(accountClassUpper),
      SUB_LEDGER_NO: subAccountCode,
      ACCT_DESC: acctDesc,
      LEDGER_NO: '001',
      BU_ID: normalizedBranchCode,
      GL_ACCT_CAT: dbSafeClass,
      CR_ALLOWED: postingRules.crAllowed,
      DR_ALLOWED: postingRules.drAllowed,
      REC_ST: 'Active',
      POST_ALLOW: postingRules.postAllow,
      POST_FG: false,
      CONTROL_ACCT_FG: Boolean(isControlAccount),
      CREATED_BY: safeTrim(CREATED_BY),
      SUSPENSE_ACCT_FG: Boolean(isSuspenseAccount),
      ALLOW_BAL_SWING_FG: Boolean(allowNegativeBalance),
      PARENT_ID: parentAccountNo ? safeToString(parentAccountNo) : null,
      SEG_VALUE: subAccountCode,
      SEG_DESC: acctDesc,
      SEG_NO: subAccountCode,
      subfolderId: `COA_${organizationCode}_${normalizedBranchCode}`,
      DELAY_GL_POSTING: false,
      ROW_TS: new Date(),
      LEDGER_BALANCE: parseFloat(safeToString(openingBalance)) || 0,
      organizationName: safeOrganizationName || `Organization ${organizationCode}`,
      branchName: safeBranchName || `Branch ${branchCode}`,
      organizationCode: parseInt(organizationCode, 10) || 1,
      branchCode: normalizedBranchCode,
      branchType: 'MAIN',
      OPENING_BALANCE: parseFloat(safeToString(openingBalance)) || 0,
      CURRENT_BALANCE: parseFloat(safeToString(openingBalance)) || 0,
      AVAILABLE_BALANCE: parseFloat(safeToString(openingBalance)) || 0,
      CURRENCY_CODE: 'NGN',
      JOURNAL_ID: `JRN-COA-${Date.now()}`,
      TRANSACTION_TYPE: `${accountClassUpper} Balance`,
      metadata: JSON.stringify(coaMetadata),
      categoryCode: getAccountClassCategoryCode(accountClassUpper),
      categoryName: `${dbSafeClass} - ${accountTypeUpper}`,
      level: accountLevel,
      childAccounts: '[]',
      accountType: accountTypeUpper
    };

    const ledgerEntry = await Ledger.create(ledgerData, { transaction });

    // ------------------ CREATE GL ACCOUNT ENTRY ------------------
    const glAccountData = {
      GL_ACCT_NO: glcode,
      GL_ACCT_ID: glAccountId,
      CREATED_BY: safeTrim(CREATED_BY),
      coaStructure,
      organizationName: safeOrganizationName || `Organization ${organizationCode}`,
      organizationCode: parseInt(organizationCode, 10) || 1,
      branchName: safeBranchName || `Branch ${branchCode}`,
      branchCode: normalizedBranchCode,
      branchType: 'MAIN',
      categoryCode: getAccountClassCategoryCode(accountClassUpper),
      categoryName: `${dbSafeClass} - ${accountTypeUpper}`,
      parentCode: parentAccountNo,
      level: accountLevel,
      LEDGER_NO: '001',
      PARENT_ID: parentAccountNo ? parseInt(parentAccountNo, 10) : null,
      subfolderId: `COA_${organizationCode}_${normalizedBranchCode}`,
      BAL_CD: getAccountClassCategoryCode(accountClassUpper),
      SUB_LEDGER_NO: subAccountCode,
      SEG_NO: 1,
      CHART_OF_ACCT_ID: '10001',
      ACCT_DESC: acctDesc,
      GL_ACCT_CAT: dbSafeClass,
      JOURNAL_ID: `JRN-COA-${Date.now()}`,
      TRANSACTION_TYPE: `${accountClassUpper} Balance`,
      CR_ALLOWED: postingRules.crAllowed,
      DR_ALLOWED: postingRules.drAllowed,
      REC_ST: 'Active',
      POST_ALLOW: postingRules.postAllow,
      POST_FG: false,
      CONTROL_ACCT_FG: Boolean(isControlAccount),
      SUSPENSE_ACCT_FG: Boolean(isSuspenseAccount),
      ALLOW_BAL_SWING_FG: Boolean(allowNegativeBalance),
      SEG_VALUE: subAccountCode,
      SEG_DESC: acctDesc,
      SEG_TY_CD: accountClassUpper,
      SEG_PLACEHLDR_ID: 'SEG001',
      DELAY_GL_POSTING: false,
      LEDGER_BALANCE: parseFloat(safeToString(openingBalance)) || 0,
      AVAILABLE_BALANCE: parseFloat(safeToString(openingBalance)) || 0,
      OPENING_BALANCE: parseFloat(safeToString(openingBalance)) || 0,
      CURRENT_BALANCE: parseFloat(safeToString(openingBalance)) || 0,
      CURRENCY_CODE: 'NGN',
      balanceHistory: [],
      transactions: [],
      SETTLEMENT_GL_ACCT_NO: null,
      INTER_BRANCH_ACCOUNT: false,
      legacyReference: {
        chartAccountId: chartAccount.id,
        ledgerId: ledgerEntry.id,
        glcode
      },
      systemSource: 'NEW_SYSTEM',
      syncStatus: {
        chartOfAccount: 'SYNCED',
        ledger: 'SYNCED',
        lastSync: new Date().toISOString()
      },
      metadata: coaMetadata,
      branchTimezone: 'Africa/Lagos',
      accountType: accountTypeUpper
    };

    const glAccountEntry = await GLAccount.create(glAccountData, { transaction });

    // Optional bidirectional links
    await chartAccount.update({ 
      glAccountId: ledgerEntry.id,
      mappedGLAccountId: glAccountEntry.id 
    }, { transaction });

    await transaction.commit();

    // ------------------ SUCCESS RESPONSE ------------------
    const responseData = {
      chartAccountId: chartAccount.id,
      ledgerId: ledgerEntry.id,
      glAccountId: glAccountEntry.id,
      glcode,
      GL_ACCT_NO: glcode,
      GL_ACCT_ID: glAccountId,
      name: chartAccount.name,
      description: chartAccount.description,
      accountClass: accountClassUpper,
      accountType: accountTypeUpper,
      normalBalance,
      postingRules,
      organizationCode: chartAccount.organizationCode,
      organizationName: safeOrganizationName || `Org ${organizationCode}`,
      branchCode: chartAccount.branchCode,
      branchName: safeBranchName || `Branch ${branchCode}`,
      balance: chartAccount.balance,
      openingBalance: parseFloat(safeToString(openingBalance)) || 0,
      status: 'ACTIVE',
      isControlAccount: Boolean(isControlAccount),
      isSuspenseAccount: Boolean(isSuspenseAccount),
      allowNegativeBalance: Boolean(allowNegativeBalance),
      createdBy: safeTrim(CREATED_BY),
      createdAt: chartAccount.createdAt,
      coaStructure,
      metadata: coaMetadata,
      categoryCode: accountTypeCategoryMap[accountTypeUpper] || '0000',
      // Hierarchy info
      hierarchy: {
        parentId: chartAccount.parentId,
        accountLevel: chartAccount.accountLevel,
        isFolder: chartAccount.isFolder,
        sortOrder: chartAccount.sortOrder,
        accountPath: chartAccount.accountPath
      }
    };

    return res.status(201).json({
      success: true,
      message: `COA-aligned ${accountTypeUpper} GL account created successfully`,
      data: responseData
    });

  } catch (error) {
    console.error('❌ Error:', error.message, error.stack);
    if (transaction) {
      try { await transaction.rollback(); } catch (e) { logger.error('Rollback failed:', e); }
    }
    logger.error('Failed to create COA-aligned GL account:', { error: error.message, body: req.body });
    return res.status(500).json({
      success: false,
      message: 'Failed to create COA-aligned GL account',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// ==================== GET COA-ALIGNED GL ACCOUNT ====================
// ==================== GET COA-ALIGNED GL ACCOUNT(S) ====================
export const getCOAAlignedAccount = async (req, res) => {
  try {
    const { glcode, accountId } = req.params;
    let glAccountNo = glcode || req.query.glcode;
    let glAccountId = accountId || req.query.accountId;

    console.log('🔍 Fetching COA-aligned account(s):', { glAccountNo, glAccountId });

    // If no identifier provided, return all COA-aligned GL accounts
    if (!glAccountNo && !glAccountId) {
      const page = parseInt(req.query.page) || 1;
      // ✅ Support 'all' parameter or use a larger default limit
      let limit;
      if (req.query.limit === 'all') {
        limit = 10000; // Large number to get all records
      } else {
        limit = parseInt(req.query.limit) || 100; // Default to 100 instead of 20
      }
      const offset = (page - 1) * limit;

      const { count, rows } = await GLAccount.findAndCountAll({
        limit,
        offset,
        order: [['GL_ACCT_NO', 'ASC']]
      });

      // Format accounts for response
      const accounts = rows.map(glAccount => ({
        glcode: glAccount.GL_ACCT_NO,
        glAccountId: glAccount.GL_ACCT_ID,
        description: glAccount.ACCT_DESC,
        accountClass: glAccount.GL_ACCT_CAT,
        accountType: glAccount.accountType,
        organizationCode: glAccount.organizationCode,
        branchCode: glAccount.branchCode,
        status: glAccount.REC_ST,
        createdAt: glAccount.createdAt
      }));

      return res.status(200).json({
        success: true,
        data: accounts,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit)
        },
        meta: {
          timestamp: new Date().toISOString()
        }
      });
    }

    // Build where clause for single account lookup
    let whereClause = {};
    if (glAccountNo) whereClause.GL_ACCT_NO = glAccountNo;
    else if (glAccountId) whereClause.GL_ACCT_ID = glAccountId;

    const glAccount = await GLAccount.findOne({ where: whereClause });
    if (!glAccount) {
      return res.status(404).json({
        success: false,
        message: `COA-aligned account not found with ${glAccountNo ? `GL_ACCT_NO = ${glAccountNo}` : `GL_ACCT_ID = ${glAccountId}`}`
      });
    }

    // Fetch additional details from ChartofAccount and Ledger (optional)
    let chartAccount = null;
    if (glAccount.GL_ACCT_NO) {
      chartAccount = await ChartofAccount.findOne({ where: { glcode: glAccount.GL_ACCT_NO } });
    }
    if (!chartAccount && glAccount.legacyReference?.chartAccountId) {
      chartAccount = await ChartofAccount.findByPk(glAccount.legacyReference.chartAccountId);
    }

    let ledgerEntry = null;
    if (glAccount.GL_ACCT_NO) {
      ledgerEntry = await Ledger.findOne({ where: { GL_ACCT_NO: glAccount.GL_ACCT_NO } });
    }
    if (!ledgerEntry && glAccount.legacyReference?.ledgerId) {
      ledgerEntry = await Ledger.findByPk(glAccount.legacyReference.ledgerId);
    }

    let metadata = glAccount.metadata;
    if (typeof metadata === 'string') {
      try { metadata = JSON.parse(metadata); } catch(e) { metadata = {}; }
    }

    const responseData = {
      glcode: glAccount.GL_ACCT_NO,
      glAccountId: glAccount.GL_ACCT_ID,
      description: glAccount.ACCT_DESC,
      accountClass: glAccount.GL_ACCT_CAT,
      accountType: glAccount.accountType || metadata?.accountType,
      normalBalance: metadata?.normalBalance || (['LIABILITY','EQUITY','REVENUE'].includes(glAccount.GL_ACCT_CAT) ? 'CREDIT' : 'DEBIT'),
      categoryCode: glAccount.categoryCode,
      categoryName: glAccount.categoryName,
      organizationCode: glAccount.organizationCode,
      organizationName: glAccount.organizationName,
      branchCode: glAccount.branchCode,
      branchName: glAccount.branchName,
      openingBalance: glAccount.OPENING_BALANCE,
      currentBalance: glAccount.CURRENT_BALANCE,
      availableBalance: glAccount.AVAILABLE_BALANCE,
      ledgerBalance: glAccount.LEDGER_BALANCE,
      postingRules: {
        crAllowed: glAccount.CR_ALLOWED,
        drAllowed: glAccount.DR_ALLOWED,
        postAllow: glAccount.POST_ALLOW,
        allowNegative: glAccount.ALLOW_BAL_SWING_FG,
        controlAccount: glAccount.CONTROL_ACCT_FG,
        suspenseAccount: glAccount.SUSPENSE_ACCT_FG
      },
      level: glAccount.level,
      parentCode: glAccount.parentCode,
      parentId: glAccount.PARENT_ID,
      status: glAccount.REC_ST,
      createdBy: glAccount.CREATED_BY,
      createdAt: glAccount.createdAt,
      updatedAt: glAccount.updatedAt,
      coaStructure: metadata?.coaStructure || glAccount.coaStructure,
      chartAccountId: chartAccount?.id,
      ledgerId: ledgerEntry?.id,
      metadata: metadata,
      segmentInfo: {
        orgSegment: glAccount.coaStructure?.segments?.find(s => s.segment === 'ORG')?.value,
        branchSegment: glAccount.coaStructure?.segments?.find(s => s.segment === 'BRANCH')?.value,
        classSegment: glAccount.coaStructure?.segments?.find(s => s.segment === 'CLASS')?.value,
        categorySegment: glAccount.coaStructure?.segments?.find(s => s.segment === 'CATEGORY')?.value,
        subSegment: glAccount.coaStructure?.segments?.find(s => s.segment === 'SUB')?.value
      }
    };

    return res.status(200).json({
      success: true,
      data: responseData,
      meta: {
        source: 'GLAccount',
        includes: {
          chartOfAccount: !!chartAccount,
          ledger: !!ledgerEntry
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error fetching COA-aligned account(s):', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch COA-aligned GL account(s)',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// ==================== FIXED HELPER FUNCTIONS ====================

// Fixed normalizeBranchCode function
const normalizeBranchCodeFixed = (code) => {
  if (code === null || code === undefined) return '000';
  
  // Convert to string first
  const strCode = String(code);
  
  // Remove any non-digit characters
  const digitsOnly = strCode.replace(/\D/g, '');
  
  // If empty after cleaning, return '000'
  if (!digitsOnly) return '000';
  
  // Pad to 3 digits
  return digitsOnly.padStart(3, '0');
};

// Updated getAccountClassCode to handle all cases
const getAccountClassCodeFixed = (accountClass) => {
  const map = {
    'ASSET': '1',
    'LIABILITY': '2', 
    'EQUITY': '3',
    'REVENUE': '4',
    'EXPENSE': '5',
    'CONTROL': '6',
    'SUSPENSE': '7',
    'TAX': '8',
    'OFF_BALANCE_SHEET': '9'
  };
  
  const upperClass = String(accountClass).toUpperCase().trim();
  return map[upperClass] || '0';
};


// Updated generateCOAAccountNumber with safer handling
const generateCOAAccountNumberFixed = ({ organizationCode, branchCode, accountClass, subAccount }) => {
  const org = String(organizationCode || '00').padStart(2, '0');
  const br = normalizeBranchCodeFixed(branchCode);
  const cls = getAccountClassCodeFixed(accountClass);
  const typeCode = getAccountClassCodeFixed(accountClass) + '00';
  const sub = String(subAccount || '0001').padStart(4, '0');
  return `${org}${br}${cls}${typeCode}${sub}`;
};

// Updated generateSubAccountCode with safer handling
const generateSubAccountCodeFixed = (accountClass, accountType, metadata) => {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return String(randomNum).padStart(4, '0');
};

// Updated getNormalBalance with safer handling
const getNormalBalanceFixed = (accountClass) => {
  const upperClass = String(accountClass).toUpperCase().trim();
  return ['LIABILITY', 'EQUITY', 'REVENUE'].includes(upperClass) ? 'CREDIT' : 'DEBIT';
};

// Updated determineAccountLevel with safer handling
const determineAccountLevelFixed = (level, isControlAccount, parentAccountNo) => {
  const numLevel = parseInt(level) || 4;
  if (isControlAccount) return 2;
  if (parentAccountNo) return Math.min(numLevel, 5);
  return numLevel;
};

// ==================== DEPRECATED: LEGACY FUNCTION (DO NOT USE FOR NEW CODE) ====================
/**
 * @deprecated Use createCOAAlignedGLAccount instead. This is kept only for legacy migrations.
 */
export const createLegacyGLAccount = async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'This endpoint is deprecated. Use /gl/create-coa-aligned instead.',
    recommended: 'POST /api/gl/create-coa-aligned'
  });
};

// Optional: Keep old name for backward compatibility (temporary)
export { createLegacyGLAccount as createGLAccount };

// ==================== CREATE LEDGER ENTRY ====================
export const createLedgerEntry = async (req, res, ledgerData = null, options = {}) => {
  let transaction;
  
  try {
    // This function can be called directly or via HTTP
    const data = ledgerData || req.body;
    const { useTransaction = true } = options;

    const requiredFields = ['GL_ACCT_NO', 'AMOUNT', 'TRANSACTION_TYPE'];
    const missingFields = requiredFields.filter(field => !data[field]);
    
    if (missingFields.length > 0) {
      const error = new Error(`Missing required fields: ${missingFields.join(', ')}`);
      if (res) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      throw error;
    }

    // Start transaction if requested
    if (useTransaction) {
      transaction = await sequelize.transaction();
    }

    // Check if account exists
    const account = await Ledger.findOne({
      where: { GL_ACCT_NO: data.GL_ACCT_NO },
      transaction
    });

    if (!account) {
      const error = new Error(`GL Account ${data.GL_ACCT_NO} not found`);
      if (res) {
        if (transaction) await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      throw error;
    }

    // Check if transaction is allowed
    const isCredit = data.TRANSACTION_TYPE.toUpperCase() === 'CR' || data.TRANSACTION_TYPE.toUpperCase() === 'CREDIT';
    const isDebit = data.TRANSACTION_TYPE.toUpperCase() === 'DR' || data.TRANSACTION_TYPE.toUpperCase() === 'DEBIT';
    
    if (isCredit && !account.CR_ALLOWED) {
      const error = new Error(`Credit transactions not allowed for account ${data.GL_ACCT_NO}`);
      if (res) {
        if (transaction) await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      throw error;
    }

    if (isDebit && !account.DR_ALLOWED) {
      const error = new Error(`Debit transactions not allowed for account ${data.GL_ACCT_NO}`);
      if (res) {
        if (transaction) await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      throw error;
    }

    if (!isCredit && !isDebit) {
      const error = new Error(`Invalid transaction type: ${data.TRANSACTION_TYPE}. Must be 'CR'/'CREDIT' or 'DR'/'DEBIT'`);
      if (res) {
        if (transaction) await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      throw error;
    }

    // Process the transaction using Ledger's built-in method
    const amount = parseFloat(data.AMOUNT);
    const transactionType = isCredit ? TRANSACTION_TYPES.CREDIT : TRANSACTION_TYPES.DEBIT;
    
    try {
      // Use the Ledger model's updateBalance method
      await account.updateBalance(amount, transactionType, { transaction });
      
      // Get updated account
      const updatedAccount = await Ledger.findOne({
        where: { GL_ACCT_NO: data.GL_ACCT_NO },
        transaction
      });

      // Create result
      const result = {
        success: true,
        transaction: {
          GL_ACCT_NO: data.GL_ACCT_NO,
          AMOUNT: amount,
          TRANSACTION_TYPE: transactionType,
          NEW_BALANCE: parseFloat(updatedAccount.LEDGER_BALANCE || 0),
          PREVIOUS_BALANCE: parseFloat(account.LEDGER_BALANCE || 0),
          CURRENT_BALANCE: parseFloat(updatedAccount.CURRENT_BALANCE || 0),
          AVAILABLE_BALANCE: parseFloat(updatedAccount.AVAILABLE_BALANCE || 0),
          JOURNAL_ID: data.JOURNAL_ID || `JRN-${Date.now()}`,
          CREATED_BY: data.CREATED_BY || 'system',
          DESCRIPTION: data.DESCRIPTION || '',
          REFERENCE_NO: data.REFERENCE_NO || '',
          TIMESTAMP: new Date()
        }
      };

      // Commit transaction if used
      if (transaction) {
        await transaction.commit();
      }

      if (res) {
        return res.status(200).json({
          success: true,
          message: 'Ledger entry created successfully',
          data: result.transaction
        });
      }

      return result;

    } catch (balanceError) {
      if (transaction) await transaction.rollback();
      throw balanceError;
    }

  } catch (error) {
    logger.error('❌ Failed to create ledger entry:', error);
    
    if (res) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create ledger entry',
        error: error.message
      });
    }
    
    throw error;
  }
};



// Helper function to create full gl_accounts table - UPDATED with proper syntax
async function createFullGLAccountsTable(connection) {
  return new Promise((resolve, reject) => {
    // First, drop table if exists to avoid conflicts
    connection.query('DROP TABLE IF EXISTS gl_accounts', (dropErr) => {
      if (dropErr) {
        console.warn('Warning dropping table:', dropErr.message);
      }
      
      // Create table with proper SQL syntax
      const createTableQuery = `
        CREATE TABLE gl_accounts (
          id INT PRIMARY KEY AUTO_INCREMENT,
          GL_ACCT_NO VARCHAR(50) UNIQUE NOT NULL,
          GL_ACCT_ID INT,
          CREATED_BY VARCHAR(100),
          organizationName VARCHAR(255),
          organizationCode VARCHAR(50),
          branchName VARCHAR(255),
          branchCode VARCHAR(50),
          branchType VARCHAR(50) DEFAULT 'MAIN',
          ACCT_DESC VARCHAR(500),
          categoryCode VARCHAR(10),
          categoryName VARCHAR(255),
          level INT DEFAULT 4,
          LEDGER_NO VARCHAR(10) DEFAULT '001',
          SUB_LEDGER_NO VARCHAR(10) DEFAULT '001',
          CHART_OF_ACCT_ID VARCHAR(10) DEFAULT '001',
          GL_ACCT_CAT VARCHAR(10),
          BAL_CD VARCHAR(10),
          subfolderId VARCHAR(100),
          JOURNAL_ID VARCHAR(100),
          TRANSACTION_TYPE VARCHAR(100),
          CR_ALLOWED BOOLEAN DEFAULT FALSE,
          DR_ALLOWED BOOLEAN DEFAULT TRUE,
          REC_ST VARCHAR(20) DEFAULT 'Active',
          POST_ALLOW BOOLEAN DEFAULT TRUE,
          CONTROL_ACCT_FG BOOLEAN DEFAULT FALSE,
          SUSPENSE_ACCT_FG BOOLEAN DEFAULT FALSE,
          ALLOW_BAL_SWING_FG BOOLEAN DEFAULT FALSE,
          LEDGER_BALANCE DECIMAL(20,2) DEFAULT 0.00,
          AVAILABLE_BALANCE DECIMAL(20,2) DEFAULT 0.00,
          OPENING_BALANCE DECIMAL(20,2) DEFAULT 0.00,
          CURRENT_BALANCE DECIMAL(20,2) DEFAULT 0.00,
          CURRENCY_CODE VARCHAR(3) DEFAULT 'NGN',
          metadata JSON,
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_gl_acct_no (GL_ACCT_NO),
          INDEX idx_organization (organizationCode, branchCode),
          INDEX idx_status (REC_ST)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `;
      
      connection.query(createTableQuery, (err, result) => {
        if (err) {
          console.error('Error creating table:', err.message);
          console.error('SQL:', createTableQuery);
          reject(err);
        } else {
          console.log('✅ Created gl_accounts table with all columns');
          resolve(result);
        }
      });
    });
  });
}




// ==================== UTILITY FUNCTIONS ====================

// Helper function to determine asset category
const getAssetCategory = (accountType) => {
  // Current assets
  if (accountType.includes('CURRENT_ASSET') || 
      accountType.includes('CASH') || 
      accountType.includes('BANK') || 
      accountType.includes('RECEIVABLE') ||
      accountType.includes('TRADING_SECURITIES') ||
      accountType.includes('DERIVATIVE_ASSETS') ||
      accountType.includes('INVENTORY') ||
      accountType.includes('PREPAID') ||
      accountType.includes('ACCUMULATED_INCOME') ||
      accountType.includes('INTEREST_RECEIVABLE') ||
      accountType.includes('FEE_RECEIVABLE')) {
    return 'CURRENT_ASSET';
  }
  
  // Non-current assets
  if (accountType.includes('NON_CURRENT_ASSET') || 
      accountType.includes('FIXED_ASSET') || 
      accountType.includes('PROPERTY') || 
      accountType.includes('INTANGIBLE') ||
      accountType.includes('GOODWILL') ||
      accountType.includes('INVESTMENT') ||
      accountType.includes('LEASE_ASSET') ||
      accountType.includes('RIGHT_OF_USE') ||
      accountType.includes('DEFERRED_TAX_ASSET')) {
    return 'NON_CURRENT_ASSET';
  }
  
  // Default to asset
  return 'ASSET';
};

// Helper function to determine liability category
const getLiabilityCategory = (accountType) => {
  // Current liabilities
  if (accountType.includes('CURRENT_LIABILITY') || 
      accountType.includes('PAYABLE') || 
      accountType.includes('DEPOSIT') || 
      accountType.includes('TAX_PAYABLE') ||
      accountType.includes('INTEREST_PAYABLE') ||
      accountType.includes('ACCRUED') ||
      accountType.includes('DIVIDEND_PAYABLE') ||
      accountType.includes('WITHHOLDING_TAX_PAYABLE') ||
      accountType.includes('UNEARNED_REVENUE') ||
      accountType.includes('CUSTOMER_DEPOSITS') ||
      accountType.includes('SAVINGS_DEPOSITS')) {
    return 'CURRENT_LIABILITY';
  }
  
  // Non-current liabilities
  if (accountType.includes('NON_CURRENT_LIABILITY') || 
      accountType.includes('LONG_TERM') || 
      accountType.includes('LOAN_LIABILITY') || 
      accountType.includes('BORROWING') ||
      accountType.includes('BONDS_PAYABLE') ||
      accountType.includes('SUBORDINATED_DEBT') ||
      accountType.includes('LEASE_LIABILITY') ||
      accountType.includes('DEFERRED_TAX_LIABILITY')) {
    return 'NON_CURRENT_LIABILITY';
  }
  
  // Default to liability
  return 'LIABILITY';
};

// Helper function to determine tax category
const getTaxCategory = (accountType) => {
  if (accountType.includes('PAYABLE')) {
    return 'CURRENT_LIABILITY';
  }
  if (accountType.includes('ASSET')) {
    return 'CURRENT_ASSET';
  }
  return 'LIABILITY';
};

// Helper function to determine control category
const getControlCategory = (accountType) => {
  if (accountType.includes('LIABILITY')) {
    return 'CURRENT_LIABILITY';
  }
  return 'ASSET';
};

// Helper function to update parent-child relationships
const updateParentChildRelationship = async (parentAccountNo, childAccountNo, connection) => {
  try {
    // First update parent's childAccounts
    const [parentRows] = await connection.execute(
      'SELECT childAccounts FROM gl_accounts WHERE GL_ACCT_NO = ?',
      [parentAccountNo]
    );
    
    let childAccounts = [];
    if (parentRows[0]?.childAccounts) {
      childAccounts = typeof parentRows[0].childAccounts === 'string' 
        ? JSON.parse(parentRows[0].childAccounts)
        : parentRows[0].childAccounts;
    }
    
    if (!childAccounts.includes(childAccountNo)) {
      childAccounts.push(childAccountNo);
      await connection.execute(
        'UPDATE gl_accounts SET childAccounts = ? WHERE GL_ACCT_NO = ?',
        [JSON.stringify(childAccounts), parentAccountNo]
      );
      console.log(`✅ Updated parent-child: ${parentAccountNo} -> ${childAccountNo}`);
    }
  } catch (error) {
    console.log('⚠️ Could not update parent-child relationship:', error.message);
  }
};

// Helper function to ensure gl_accounts table exists
async function ensureGLAccountsTable(connection) {
  try {
    // Try to describe the table first
    await connection.execute('DESCRIBE gl_accounts');
    console.log('✅ gl_accounts table exists');
    return true;
  } catch (error) {
    console.log('🔄 Creating gl_accounts table...');
    
    // Create a minimal table with only required columns
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS gl_accounts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        GL_ACCT_NO VARCHAR(50) UNIQUE NOT NULL,
        GL_ACCT_ID INT,
        CREATED_BY VARCHAR(100),
        ACCT_DESC VARCHAR(500),
        organizationName VARCHAR(255),
        organizationCode VARCHAR(50),
        branchName VARCHAR(255),
        branchCode VARCHAR(50),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Created minimal gl_accounts table');
    
    // Now add other columns if they don't exist
    const additionalColumns = [
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS branchType VARCHAR(50) DEFAULT "MAIN"',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS coaStructure JSON',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS categoryCode VARCHAR(10)',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS categoryName VARCHAR(255)',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS level INT DEFAULT 4',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS LEDGER_NO VARCHAR(10) DEFAULT "001"',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS SUB_LEDGER_NO VARCHAR(10) DEFAULT "001"',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS CHART_OF_ACCT_ID VARCHAR(10) DEFAULT "001"',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS GL_ACCT_CAT VARCHAR(10)',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS BAL_CD VARCHAR(10)',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS subfolderId VARCHAR(100)',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS JOURNAL_ID VARCHAR(100)',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS TRANSACTION_TYPE VARCHAR(100)',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS CR_ALLOWED BOOLEAN DEFAULT FALSE',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS DR_ALLOWED BOOLEAN DEFAULT TRUE',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS REC_ST VARCHAR(20) DEFAULT "Active"',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS POST_ALLOW BOOLEAN DEFAULT TRUE',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS CONTROL_ACCT_FG BOOLEAN DEFAULT FALSE',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS SUSPENSE_ACCT_FG BOOLEAN DEFAULT FALSE',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS ALLOW_BAL_SWING_FG BOOLEAN DEFAULT FALSE',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS LEDGER_BALANCE DECIMAL(20,2) DEFAULT 0.00',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS AVAILABLE_BALANCE DECIMAL(20,2) DEFAULT 0.00',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS OPENING_BALANCE DECIMAL(20,2) DEFAULT 0.00',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS CURRENT_BALANCE DECIMAL(20,2) DEFAULT 0.00',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS CURRENCY_CODE VARCHAR(3) DEFAULT "NGN"',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS metadata JSON'
    ];
    
    for (const alterQuery of additionalColumns) {
      try {
        await connection.execute(alterQuery);
      } catch (alterError) {
        console.log(`⚠️ Could not add column: ${alterError.message}`);
      }
    }
    
    console.log('✅ Added additional columns to gl_accounts table');
    return true;
  }
}

// Helper function to create gl_accounts table
async function createGLAccountsTable(connection) {
  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS gl_accounts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        GL_ACCT_NO VARCHAR(50) UNIQUE NOT NULL,
        GL_ACCT_ID INT,
        CREATED_BY VARCHAR(100),
        organizationName VARCHAR(255),
        organizationCode VARCHAR(50),
        branchName VARCHAR(255),
        branchCode VARCHAR(50),
        branchType VARCHAR(50),
        ACCT_DESC VARCHAR(500),
        coaStructure JSON,
        categoryCode VARCHAR(10),
        categoryName VARCHAR(255),
        level INT,
        LEDGER_NO VARCHAR(10),
        SUB_LEDGER_NO VARCHAR(10),
        CHART_OF_ACCT_ID VARCHAR(10),
        GL_ACCT_CAT VARCHAR(10),
        BAL_CD VARCHAR(10),
        subfolderId VARCHAR(100),
        JOURNAL_ID VARCHAR(100),
        TRANSACTION_TYPE VARCHAR(100),
        CR_ALLOWED BOOLEAN DEFAULT FALSE,
        DR_ALLOWED BOOLEAN DEFAULT FALSE,
        REC_ST VARCHAR(20) DEFAULT 'Active',
        POST_ALLOW BOOLEAN DEFAULT TRUE,
        CONTROL_ACCT_FG BOOLEAN DEFAULT FALSE,
        SUSPENSE_ACCT_FG BOOLEAN DEFAULT FALSE,
        ALLOW_BAL_SWING_FG BOOLEAN DEFAULT FALSE,
        LEDGER_BALANCE DECIMAL(20,2) DEFAULT 0.00,
        AVAILABLE_BALANCE DECIMAL(20,2) DEFAULT 0.00,
        OPENING_BALANCE DECIMAL(20,2) DEFAULT 0.00,
        CURRENT_BALANCE DECIMAL(20,2) DEFAULT 0.00,
        CURRENCY_CODE VARCHAR(3) DEFAULT 'NGN',
        metadata JSON,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    console.error('❌ Error creating gl_accounts table:', error.message);
    throw error;
  }
}

// ==================== DIAGNOSE DATABASE ====================
export const diagnoseDatabase = async (req, res) => {
  const connection = await sequelize.connectionManager.getConnection();
  
  try {
    console.log('🔍 Running database diagnosis...');
    
    // 1. Check all tables
    const [tables] = await connection.execute('SHOW TABLES');
    const tableNames = tables.map(t => Object.values(t)[0]);
    console.log('📊 Tables found:', tableNames);
    
    // 2. Check organizations table if it exists
    let orgColumns = [];
    if (tableNames.some(t => t.toLowerCase().includes('organization'))) {
      const orgTable = tableNames.find(t => t.toLowerCase().includes('organization'));
      [orgColumns] = await connection.execute(`SHOW COLUMNS FROM ${orgTable}`);
      console.log(`📊 ${orgTable} columns:`, orgColumns.map(c => ({ Field: c.Field, Type: c.Type })));
    }
    
    // 3. Check branches table if it exists
    let branchColumns = [];
    if (tableNames.some(t => t.toLowerCase().includes('branch'))) {
      const branchTable = tableNames.find(t => t.toLowerCase().includes('branch'));
      [branchColumns] = await connection.execute(`SHOW COLUMNS FROM ${branchTable}`);
      console.log(`📊 ${branchTable} columns:`, branchColumns.map(c => ({ Field: c.Field, Type: c.Type })));
    }
    
    // 4. Check gl_accounts table if it exists
    let glColumns = [];
    if (tableNames.some(t => t.toLowerCase().includes('gl_account'))) {
      const glTable = tableNames.find(t => t.toLowerCase().includes('gl_account'));
      [glColumns] = await connection.execute(`SHOW COLUMNS FROM ${glTable}`);
      console.log(`📊 ${glTable} columns:`, glColumns.map(c => ({ Field: c.Field, Type: c.Type })));
    }
    
    return res.json({
      success: true,
      diagnosis: {
        tables: tableNames,
        organizations: orgColumns.map(c => c.Field),
        branches: branchColumns.map(c => c.Field),
        gl_accounts: glColumns.map(c => c.Field)
      }
    });
    
  } catch (error) {
    console.error('❌ Diagnosis error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    if (connection) sequelize.connectionManager.releaseConnection(connection);
  }
};

// ==================== EXPORT DEFAULT ====================
const GLAccountController = {
  createCOAAlignedGLAccount,
  createLedgerEntry,
  diagnoseDatabase,
  validateAccountClassType,
  mapMetadataAccountTypeToAccountType,
  getCOABalanceType,
  generateNextGLAcctId,
  getAccountTypeCode,
  addAuditTrail,
  getCOAAlignedAccount
};

export default GLAccountController;