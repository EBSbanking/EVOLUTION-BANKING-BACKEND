// services/customerBatchService.js - UPDATED VERSION WITH AUTO-COLUMN ADDITION
import xlsx from 'xlsx';
import Customer from '../models/Customer.js';
// FIX: Changed from named import { generateCustomerNumber } to default import
import generateCustomerNumber from '../utils/generateCustomerNumber.js';

class CustomerBatchService {
  async processExcelBatch(fileBuffer, transaction) {
    // Check if buffer is valid
    if (!fileBuffer || fileBuffer.length === 0) {
      return {
        success: false,
        message: 'Invalid file buffer',
        total: 0,
        created: 0,
        errors: ['File buffer is empty or invalid']
      };
    }

    try {
      // 🔥 Ensure customer table has all required columns BEFORE processing
      await this.ensureCustomerTableColumns(transaction);

      // Read Excel file
      const workbook = xlsx.read(fileBuffer, { 
        type: 'buffer',
        cellDates: true,
        cellText: false
      });
      
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON
      const jsonData = xlsx.utils.sheet_to_json(worksheet);
      
      console.log('Excel data parsed:', jsonData);

      if (!jsonData.length) {
        return {
          success: false,
          message: 'Excel file is empty or has no data rows',
          total: 0,
          created: 0,
          errors: []
        };
      }

      console.log(`Processing ${jsonData.length} rows...`);

      // Validate and transform data
      const { validCustomers, errors } = await this.validateAndTransformData(jsonData);
      
      console.log(`Validation complete: ${validCustomers.length} valid, ${errors.length} errors`);

      if (validCustomers.length === 0) {
        return {
          success: false,
          message: 'No valid customers found in the file',
          total: jsonData.length,
          created: 0,
          errors: errors
        };
      }

      // Create customers in batch
      const result = await this.createCustomersBatch(validCustomers, transaction);
      
      return {
        success: true,
        message: `Batch processing completed: ${result.createdCount} created, ${result.duplicateCount} duplicates, ${result.failedCount} failed`,
        total: jsonData.length,
        created: result.createdCount,
        duplicates: result.duplicateCount,
        failed: result.failedCount,
        errors: errors.concat(result.errors || [])
      };

    } catch (error) {
      console.error('Batch processing error:', error);
      return {
        success: false,
        message: `Processing failed: ${error.message}`,
        total: 0,
        created: 0,
        errors: [error.message]
      };
    }
  }

  // 🔥 NEW FUNCTION: Ensure all required columns exist in customers table
  async ensureCustomerTableColumns(transaction) {
    try {
      console.log('🔍 Checking customers table structure before batch upload...');
      
      if (!Customer.sequelize) {
        console.error('❌ Sequelize instance not available');
        return false;
      }
      
      const sequelize = Customer.sequelize;
      
      // List of columns that should exist based on your model
      const columnsToCheck = [
        { name: 'EVENT_ID', type: 'VARCHAR(50)', nullable: true },
        { name: 'APPROVED_BY', type: 'VARCHAR(100)', nullable: true },
        { name: 'APPROVED_DT', type: 'DATETIME', nullable: true },
        { name: 'SUSPENDED_BY', type: 'VARCHAR(100)', nullable: true },
        { name: 'SUSPENDED_DT', type: 'DATETIME', nullable: true },
        { name: 'SUSPENSION_REASON', type: 'TEXT', nullable: true },
        { name: 'CLOSED_BY', type: 'VARCHAR(100)', nullable: true },
        { name: 'CLOSED_DT', type: 'DATETIME', nullable: true },
        { name: 'CLOSURE_REASON', type: 'TEXT', nullable: true },
        { name: 'REJECTED_BY', type: 'VARCHAR(100)', nullable: true },
        { name: 'REJECTED_DT', type: 'DATETIME', nullable: true },
        { name: 'REJECTION_REASON', type: 'TEXT', nullable: true },
        { name: 'customer_type_id', type: 'INTEGER', nullable: true },
        { name: 'relationship_officer_id', type: 'INTEGER', nullable: true },
        { name: 'createdAt', type: 'DATETIME', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'updatedAt', type: 'DATETIME', nullable: false, defaultValue: 'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' }
      ];
      
      for (const column of columnsToCheck) {
        try {
          const [check] = await sequelize.query(
            `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() 
             AND TABLE_NAME = 'customers' 
             AND COLUMN_NAME = ?`,
            { 
              replacements: [column.name],
              transaction 
            }
          );
          
          if (check[0].count === 0) {
            console.log(`➕ Adding ${column.name} column to customers table...`);
            
            let alterQuery = `ALTER TABLE customers ADD COLUMN ${column.name} ${column.type}`;
            
            if (column.nullable === false) {
              alterQuery += ' NOT NULL';
            } else {
              alterQuery += ' NULL';
            }
            
            if (column.defaultValue) {
              alterQuery += ` DEFAULT ${column.defaultValue}`;
            }
            
            await sequelize.query(alterQuery, { transaction });
            console.log(`✅ ${column.name} column added successfully`);
          }
        } catch (error) {
          console.warn(`⚠️ Error checking/adding ${column.name} column:`, error.message);
          // Continue with other columns
        }
      }
      
      console.log('✅ Customers table structure verified for batch upload');
      return true;
    } catch (error) {
      console.error('❌ Error ensuring customer table columns:', error.message);
      return false;
    }
  }

  async validateAndTransformData(jsonData) {
    const validCustomers = [];
    const errors = [];

    for (let i = 0; i < jsonData.length; i++) {
      try {
        const row = jsonData[i];
        const rowNumber = i + 2;

        console.log(`Processing row ${rowNumber}:`, row);

        // Use provided IDs or generate them properly
        let custId, custNo;
        
        if (row.CUST_ID && row.CUST_NO) {
          // Use provided IDs
          custId = row.CUST_ID.toString();
          custNo = row.CUST_NO.toString();
        } else {
          // Generate new IDs
          const generated = await generateCustomerNumber();
          custId = generated.CUST_ID;
          custNo = generated.CUST_NO;
        }

        // Check for duplicates in database
        const existingCustomer = await Customer.findOne({
          where: {
            $or: [
              { CUST_ID: custId },
              { CUST_NO: custNo }
            ]
          },
          attributes: ['CUST_ID', 'CUST_NO']
        });

        if (existingCustomer) {
          errors.push(`Row ${rowNumber}: Customer with ID ${custId} or Number ${custNo} already exists`);
          continue;
        }

        // Validate required fields - match your customer schema
        const missingFields = [];
        if (!row.FIRST_NAME) missingFields.push('FIRST_NAME');
        if (!row.LAST_NAME) missingFields.push('LAST_NAME');
        if (!row.HOME_ADDRESS) missingFields.push('HOME_ADDRESS');
        if (!row.BU_ID) missingFields.push('BU_ID');

        if (missingFields.length > 0) {
          errors.push(`Row ${rowNumber}: Missing required fields: ${missingFields.join(', ')}`);
          continue;
        }

        // Transform data to match your customer schema EXACTLY
        const now = new Date();
        const customerData = {
          // Required unique fields
          CUST_ID: custId,
          CUST_NO: custNo,
          
          // Personal information
          TITLE_ID: row.TITLE_ID || 'MR',
          FIRST_NAME: this.sanitizeString(row.FIRST_NAME),
          MIDDLE_NAME: this.sanitizeString(row.MIDDLE_NAME || ''),
          LAST_NAME: this.sanitizeString(row.LAST_NAME),
          CUST_NM: row.CUST_NM || `${row.FIRST_NAME} ${row.LAST_NAME}`.trim(),
          
          // Contact information
          HOME_ADDRESS: this.sanitizeString(row.HOME_ADDRESS),
          EMAIL_ADDRESS: (row.EMAIL_ADDRESS || '').toLowerCase().trim(),
          PHONE_NO: row.PHONE_NO ? String(row.PHONE_NO).trim() : '',
          
          // Business information
          BU_ID: row.BU_ID,
          
          // Personal details
          MAIDEN_NM: this.sanitizeString(row.MAIDEN_NM || ''),
          BIRTH_DT: this.parseDate(row.BIRTH_DT),
          GENDER_TY: row.GENDER_TY || '',
          MARITAL_ST: row.MARITAL_ST || 'Single',
          
          // Identification
          NIN: row.NIN ? String(row.NIN).trim() : '',
          BVN: row.BVN ? String(row.BVN).trim() : '',
          
          // Location information
          CNTRY_OF_BIRTH_ID: row.CNTRY_OF_BIRTH_ID || 'NGA',
          COUNTRY_NM: row.COUNTRY_NM || 'Nigeria',
          STATE: row.STATE || '',
          LOCAL_GOV: row.LOCAL_GOV || '',
          RESIDENT_CNTRY_ID: row.RESIDENT_CNTRY_ID || 'NGA',
          
          // Account information
          OPENING_RSN_ID: row.OPENING_RSN_ID || '',
          OPENED_DT: this.parseDate(row.OPENED_DT) || now,
          CUST_CAT: row.CUST_CAT || 'Individual',
          RISK_CLASS: row.RISK_CLASS || 'Low',
          
          // Additional fields with defaults
          CAMPAIGN_ID: row.CAMPAIGN_ID || '',
          STMNT_FREQ_CD: row.STMNT_FREQ_CD || 'Monthly',
          STMNT_FREQ_VALUE: Number(row.STMNT_FREQ_VALUE) || 1,
          CREATED_BY: row.CREATED_BY || 'System',
          USER_ID: row.USER_ID || '',
          CREATE_DT: now,
          INDUSTRY_ID: row.INDUSTRY_ID || '',
          INDUSTRY_CD: row.INDUSTRY_CD || '',
          TAX_STATUS: row.TAX_STATUS || 'Active',
          TAX_GRP_ID: row.TAX_GRP_ID || '',
          OPERATIONS_CRNCY_ID: row.OPERATIONS_CRNCY_ID || 'NGN',
          EMP_ST: row.EMP_ST || '',
          ORGANISATION_NM: this.sanitizeString(row.ORGANISATION_NM || ''),
          REGISTRATION_ADDRESS: this.sanitizeString(row.REGISTRATION_ADDRESS || ''),
          REGISTRATION_DT: this.parseDate(row.REGISTRATION_DT),
          ALERT_DELIVERY_METHOD: row.ALERT_DELIVERY_METHOD || 'Email',
          KYC_LEVEL: row.KYC_LEVEL || 'Level1',
          SMS: row.SMS || '',
          REC_ST: this.validateRecStatus(row.REC_ST) || 'Pending',
          status: this.validateRecStatus(row.REC_ST) || 'Pending',
          EVENT_ID: row.EVENT_ID || null,
          IS_PEP: this.parseBoolean(row.IS_PEP) || false,
          SANCTION_SCORE: Number(row.SANCTION_SCORE) || 0,
          DOCUMENT_VERIFICATION_STATUS: row.DOCUMENT_VERIFICATION_STATUS || 'Pending',
          
          // Timestamps
          createdAt: now,
          updatedAt: now
        };

        // Validate NIN and BVN format if provided
        if (customerData.NIN && !/^\d{11}$/.test(customerData.NIN)) {
          errors.push(`Row ${rowNumber}: Invalid NIN format - must be 11 digits, got ${customerData.NIN}`);
          continue;
        }

        if (customerData.BVN && !/^\d{11}$/.test(customerData.BVN)) {
          errors.push(`Row ${rowNumber}: Invalid BVN format - must be 11 digits, got ${customerData.BVN}`);
          continue;
        }

        validCustomers.push(customerData);
        console.log(`✅ Row ${rowNumber}: Valid customer data prepared - ${customerData.FIRST_NAME} ${customerData.LAST_NAME}`);

      } catch (error) {
        errors.push(`Row ${i + 2}: ${error.message}`);
        console.error(`❌ Error in row ${i + 2}:`, error);
      }
    }

    return { validCustomers, errors };
  }

  sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.trim().replace(/\s+/g, ' ');
  }

  parseDate(dateValue) {
    if (!dateValue) return null;
    if (dateValue instanceof Date) return dateValue;
    
    // Handle various date formats
    const date = new Date(dateValue);
    return isNaN(date.getTime()) ? null : date;
  }

  parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
    }
    if (typeof value === 'number') {
      return value === 1;
    }
    return Boolean(value);
  }

  validateRecStatus(status) {
    const validStatuses = [
      'Pending', 'Active', 'Approved', 'Inactive', 
      'Closed', 'Suspended', 'Cancelled', 'Rejected'
    ];
    return validStatuses.includes(status) ? status : 'Pending';
  }

  async createCustomersBatch(customers, transaction) {
    let createdCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;
    const errors = [];

    console.log(`🔄 Starting to create ${customers.length} customers...`);

    const batchSize = 10;
    
    for (let i = 0; i < customers.length; i += batchSize) {
      const batch = customers.slice(i, i + batchSize);
      console.log(`📦 Processing batch ${Math.floor(i/batchSize) + 1} with ${batch.length} customers`);
      
      try {
        // Use Sequelize bulkCreate with transaction
        const results = await Customer.bulkCreate(batch, {
          transaction,
          validate: true,
          individualHooks: false
        });
        
        createdCount += results.length;
        console.log(`✅ Batch ${Math.floor(i/batchSize) + 1}: ${results.length} customers created successfully`);
        
        // Log created customers
        results.forEach(customer => {
          console.log(`   👤 Created: ${customer.CUST_ID} - ${customer.FIRST_NAME} ${customer.LAST_NAME}`);
        });
        
      } catch (error) {
        console.error(`❌ Batch ${Math.floor(i/batchSize) + 1} failed:`, error.message);
        
        // Handle Sequelize errors
        if (error.name === 'SequelizeUniqueConstraintError') {
          const duplicates = Array.isArray(error.errors) ? error.errors.length : 1;
          duplicateCount += duplicates;
          failedCount += (batch.length - duplicates);
          
          console.log(`   📊 Batch ${Math.floor(i/batchSize) + 1}: ${duplicates} duplicates`);
        } else if (error.name === 'SequelizeValidationError') {
          failedCount += batch.length;
          const errorMsg = `Batch ${Math.floor(i/batchSize) + 1}: Validation error - ${error.message}`;
          errors.push(errorMsg);
          console.log(`   ❌ ${errorMsg}`);
        } else {
          failedCount += batch.length;
          const errorMsg = `Batch ${Math.floor(i/batchSize) + 1}: ${error.message}`;
          errors.push(errorMsg);
          console.log(`   ❌ ${errorMsg}`);
        }
      }
    }

    console.log(`🎉 Completed: ${createdCount} created, ${duplicateCount} duplicates, ${failedCount} failed`);
    return { createdCount, duplicateCount, failedCount, errors };
  }
}

export default new CustomerBatchService();