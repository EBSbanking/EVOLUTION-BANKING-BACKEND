import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import XLSX from 'xlsx';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate a Term Deposit Contract Letter (PDFKit streaming)
 * @param {Object} termDeposit - Term deposit data object
 * @param {Stream} writeStream - Writable stream for PDF output
 * @returns {Promise<void>} Resolves when PDF is generated, rejects on error
 */
export function generateTermDepositContractLetter(termDeposit, writeStream) {
  return new Promise((resolve, reject) => {
    try {
      if (!termDeposit) {
        throw new Error('termDeposit object is null or undefined');
      }

      const doc = new PDFDocument({ margin: 50 });
      doc.pipe(writeStream);

      // Paths to bank logo and signature images
      const logoPath = path.join(__dirname, '../image for test/logo.PNG');
      const signaturePath = path.join(__dirname, '../image for test/Screenshot 2025-09-05 092128.png');

      // Validate image files
      if (!fs.existsSync(logoPath)) {
        throw new Error(`Bank logo image not found at: ${logoPath}`);
      }
      if (!fs.existsSync(signaturePath)) {
        throw new Error(`Bank signature image not found at: ${signaturePath}`);
      }

      // Add bank logo at top-left
      doc.image(logoPath, 50, 30, { width: 100 });
      doc.moveDown(4);

      // Header
      doc.fontSize(16).text('Term Deposit Contract Letter', {
        align: 'center',
        underline: true,
      });
      doc.moveDown(1.5);

      // Contract Details
      doc.fontSize(12);
      doc.text(`Account Number: ${termDeposit.ACCT_NO ?? 'N/A'}`);
      doc.text(`Account Name: ${termDeposit.ACCT_NM ?? 'N/A'}`);
      doc.text(`Customer Name: ${termDeposit.CUST_NM ?? 'N/A'}`);
      doc.text(`Term: ${termDeposit.TERM ? `${termDeposit.TERM} months` : 'N/A'}`);
      doc.text(
        `Start Date: ${
          termDeposit.START_DT
            ? new Date(termDeposit.START_DT).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })
            : 'N/A'
        }`
      );
      doc.text(
        `Maturity Date: ${
          termDeposit.MATURITY_DT
            ? new Date(termDeposit.MATURITY_DT).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })
            : 'N/A'
        }`
      );
      doc.text(`Principal Amount: ${termDeposit.NOTICE_AMOUNT ?? '0'}`);
      doc.text(
        `Interest Rate: ${
          termDeposit.EFFECTIVE_RATE ? `${termDeposit.EFFECTIVE_RATE}%` : 'N/A'
        }`
      );
      doc.text(
        `Interest Payment Status: ${termDeposit.INTEREST_PAYMENT_STATUS ?? 'N/A'}`
      );
      doc.text(
        `Upfront Interest Amount: ${
          termDeposit.UPFRONT_INTEREST_AMOUNT != null
            ? termDeposit.UPFRONT_INTEREST_AMOUNT.toFixed(2)
            : '0.00'
        }`
      );

      // Signatures section
      doc.moveDown(2);
      doc.fontSize(12).text('Signatures:', { underline: true });
      doc.moveDown(0.5);

      // Customer signature with name
      doc.text(`Customer Name: ${termDeposit.CUST_NM ?? 'N/A'}`, 50, doc.y);
      doc.moveDown(0.5);
      doc.text('Customer Signature: _______________________________', 50, doc.y);
      doc.moveDown(1.5);

      // Bank signature
      doc.text('Authorized Bank Representative:', 50, doc.y);
      doc.image(signaturePath, 50, doc.y, { width: 150 });
      doc.moveDown(4);

      // Footer
      doc.fontSize(10).text('Please keep this letter as your official contract document.', {
        italics: true,
      });
      doc.moveDown();
      doc.text('Thank you for banking with us.', { align: 'right' });

      doc.end();
      resolve();
    } catch (error) {
      logger.error('Error in generateTermDepositContractLetter', { error: error.message, stack: error.stack });
      reject(new Error(`Failed to generate term deposit contract letter: ${error.message}`));
    }
  });
}

/**
 * Generate a Customer Account Statement with detailed transaction history
 * @param {Object} customerAccount - Customer account data object
 * @param {Array<Object>} transactions - Array of transaction objects
 * @param {Object} period - Period object with startDate, endDate, openingBalance, closingBalance
 * @param {Stream} writeStream - Writable stream for PDF output (Express response object)
 * @returns {Promise<void>} Resolves when PDF is generated, rejects on error
 */
export function generateCustomerAccountStatement(customerAccount, transactions, period, writeStream) {
  return new Promise((resolve, reject) => {
    try {
      if (writeStream.headersSent) {
        logger.warn('Headers already sent for account statement');
        return reject(new Error('Response already sent'));
      }

      if (!customerAccount) {
        throw new Error('customerAccount object is null or undefined');
      }
      if (!period || !period.startDate || !period.endDate) {
        throw new Error('Period object is invalid or missing startDate/endDate');
      }
      if (!Array.isArray(transactions)) {
        throw new Error('transactions must be an array');
      }

      const doc = new PDFDocument({ margin: 50 });
      doc.pipe(writeStream);

      writeStream.setHeader('Content-Type', 'application/pdf');
      writeStream.setHeader(
        'Content-Disposition',
        `attachment; filename=Account_Statement_${customerAccount.ACCT_NO || 'unknown'}.pdf`
      );

      // Path to bank logo
      const logoPath = path.join(__dirname, '../image for test/logo.PNG');

      // Validate image file
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 30, { width: 100 });
        doc.moveDown(4);
      } else {
        logger.warn(`Bank logo image not found at: ${logoPath}`);
        doc.moveDown(2);
      }

      // Header
      doc.fontSize(16).text('ACCOUNT STATEMENT', {
        align: 'center',
        underline: true,
      });
      doc.moveDown(1);

      // Statement Period
      doc.fontSize(12);
      const startDate = new Date(period.startDate);
      const endDate = new Date(period.endDate);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Invalid period.startDate or period.endDate');
      }
      doc.text(`Statement Period: ${startDate.toLocaleDateString('en-NG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })} to ${endDate.toLocaleDateString('en-NG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}`);
      doc.text(`Statement Date: ${new Date().toLocaleDateString('en-NG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}`);
      doc.moveDown(1);

      // Account Information
      doc.fontSize(14).text('ACCOUNT INFORMATION', { underline: true });
      doc.fontSize(12);
      doc.text(`Account Number: ${customerAccount.ACCT_NO ?? 'N/A'}`);
      doc.text(`Account Name: ${customerAccount.ACCT_NM ?? 'N/A'}`);
      doc.text(`Account Type: ${customerAccount.ACCOUNT_TYPE ?? 'N/A'}`);
      doc.text(`Customer ID: ${customerAccount.CUST_ID ?? 'N/A'}`);
      doc.text(`Business Unit: ${customerAccount.BU_ID ?? 'N/A'}`);
      doc.text(`Account Status: ${customerAccount.REC_ST ?? 'N/A'}`);
      doc.moveDown(1);

      // Balance Information
      doc.fontSize(14).text('BALANCE SUMMARY', { underline: true });
      doc.fontSize(12);
      const openingBalance = typeof period.openingBalance === 'number' && !isNaN(period.openingBalance)
        ? period.openingBalance
        : 0;
      const closingBalance = typeof period.closingBalance === 'number' && !isNaN(period.closingBalance)
        ? period.closingBalance
        : 0;
      const ledgerBalance = typeof customerAccount.LEDGER_BAL === 'number' && !isNaN(customerAccount.LEDGER_BAL)
        ? customerAccount.LEDGER_BAL
        : 0;
      const availableBalance = typeof customerAccount.AVAILABLE_BALANCE === 'number' && !isNaN(customerAccount.AVAILABLE_BALANCE)
        ? customerAccount.AVAILABLE_BALANCE
        : 0;
      const accruedInterest = typeof customerAccount.ACCRUED_INTEREST === 'number' && !isNaN(customerAccount.ACCRUED_INTEREST)
        ? customerAccount.ACCRUED_INTEREST
        : 0;

      doc.text(`Opening Balance: ₦${openingBalance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      doc.text(`Closing Balance: ₦${closingBalance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      doc.text(`Ledger Balance: ₦${ledgerBalance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      doc.text(`Available Balance: ₦${availableBalance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      
      if (accruedInterest > 0) {
        doc.text(`Accrued Interest: ₦${accruedInterest.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      }
      
      if (typeof customerAccount.INTEREST_RATE === 'number' && !isNaN(customerAccount.INTEREST_RATE)) {
        doc.text(`Interest Rate: ${customerAccount.INTEREST_RATE}%`);
      }
      doc.moveDown(1);

      // Transaction Summary
      if (transactions.length > 0) {
        const totalDebits = transactions.reduce((sum, t) => sum + (t.IS_DEBIT ? t.DISPLAY_AMOUNT || 0 : 0), 0);
        const totalCredits = transactions.reduce((sum, t) => sum + (!t.IS_DEBIT ? t.DISPLAY_AMOUNT || 0 : 0), 0);
        const netChange = totalCredits - totalDebits;
        
        doc.fontSize(14).text('TRANSACTION SUMMARY', { underline: true });
        doc.fontSize(12);
        doc.text(`Period: ${startDate.toLocaleDateString('en-NG', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })} - ${endDate.toLocaleDateString('en-NG', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}`);
        doc.text(`Total Debits: ₦${totalDebits.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        doc.text(`Total Credits: ₦${totalCredits.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        doc.text(`Net Change: ₦${netChange.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        doc.text(`Number of Transactions: ${transactions.length}`);
        doc.moveDown(1);
      }

      // Transaction History
      if (transactions.length > 0) {
        doc.addPage();
        doc.fontSize(16).text('TRANSACTION HISTORY', { align: 'center', underline: true });
        doc.moveDown(0.5);

        // Table headers
        const tableTop = doc.y;
        const dateX = 40;
        const typeX = 90;
        const descriptionX = 120;
        const referenceX = 220;
        const amountX = 300;
        const balanceX = 380;
        const statusX = 460;
        const detailsX = 520;

        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('Date', dateX, tableTop, { width: 45 });
        doc.text('Type', typeX, tableTop, { width: 25 });
        doc.text('Description', descriptionX, tableTop, { width: 95 });
        doc.text('Reference', referenceX, tableTop, { width: 75 });
        doc.text('Amount (₦)', amountX, tableTop, { width: 75, align: 'right' });
        doc.text('Balance (₦)', balanceX, tableTop, { width: 75, align: 'right' });
        doc.text('Status', statusX, tableTop, { width: 55, align: 'center' });
        doc.text('Details', detailsX, tableTop, { width: 60, align: 'center' });

        // Draw line under headers
        doc.moveTo(40, tableTop + 15).lineTo(580, tableTop + 15).stroke();
        doc.moveDown(0.5);

        // Transaction rows
        let currentY = tableTop + 25;
        doc.font('Helvetica').fontSize(8);

        // Sort transactions by date (newest first)
        const sortedTransactions = [...transactions].sort((a, b) => 
          new Date(b.TRANS_DT || b.timestamp || b.createdAt || 0) - new Date(a.TRANS_DT || a.timestamp || a.createdAt || 0)
        );

        sortedTransactions.forEach((transaction, index) => {
          if (currentY > 700) {
            doc.addPage();
            currentY = 50;
            // Redraw headers on new page
            doc.fontSize(9).font('Helvetica-Bold');
            doc.text('Date', dateX, currentY, { width: 45 });
            doc.text('Type', typeX, currentY, { width: 25 });
            doc.text('Description', descriptionX, currentY, { width: 95 });
            doc.text('Reference', referenceX, currentY, { width: 75 });
            doc.text('Amount (₦)', amountX, currentY, { width: 75, align: 'right' });
            doc.text('Balance (₦)', balanceX, currentY, { width: 75, align: 'right' });
            doc.text('Status', statusX, currentY, { width: 55, align: 'center' });
            doc.text('Details', detailsX, currentY, { width: 60, align: 'center' });
            doc.moveTo(40, currentY + 15).lineTo(580, currentY + 15).stroke();
            currentY += 25;
            doc.font('Helvetica').fontSize(8);
          }

          const transDate = transaction.TRANS_DT || transaction.timestamp || transaction.createdAt
            ? new Date(transaction.TRANS_DT || transaction.timestamp || transaction.createdAt).toLocaleDateString('en-NG', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })
            : 'N/A';
          
          const transType = transaction.TRANS_TYPE || 
                           (transaction.IS_DEBIT ? 'DR' : 'CR') || 
                           (transaction.DR_AMOUNT > 0 ? 'DR' : 'CR') || 'N/A';
          
          const description = transaction.DESCRIPTION || transaction.NARRATION || 
                             transaction.description || 'Transaction';
          
          const reference = transaction.REFERENCE_NO || transaction.TRANS_REF || 
                           transaction.reference_no || 'N/A';
          
          const amount = typeof transaction.DISPLAY_AMOUNT === 'number' && !isNaN(transaction.DISPLAY_AMOUNT)
            ? transaction.DISPLAY_AMOUNT
            : 0;
          const balance = typeof transaction.BALANCE_AFTER === 'number' && !isNaN(transaction.BALANCE_AFTER)
            ? transaction.BALANCE_AFTER
            : 0;
          
          const status = transaction.STATUS || transaction.status || 'Completed';

          // Get additional details
          const additionalInfo = transaction.additional_info || {};
          const depositor = additionalInfo.depositor_name || additionalInfo.account_name || 'N/A';
          const businessUnit = additionalInfo.business_unit || 'N/A';
          const currencyCount = additionalInfo.currency_count ? `Notes: ${additionalInfo.currency_count.TOTAL_CURRENCY_COUNT || 0}` : '';

          // Alternate row background
          if (index % 2 === 0) {
            doc.rect(40, currentY - 5, 540, 25).fillAndStroke('#f5f5f5', '#e0e0e0');
          }

          doc.fillColor('#000000');
          
          // Date
          doc.text(transDate, dateX, currentY, { width: 45 });
          
          // Type with color coding
          if (transType === 'DR' || transType === 'DEBIT') {
            doc.fillColor('#ff0000');
            doc.text(transType, typeX, currentY, { width: 25 });
          } else {
            doc.fillColor('#008000');
            doc.text(transType, typeX, currentY, { width: 25 });
          }
          
          doc.fillColor('#000000');
          
          // Description
          doc.text(description.substring(0, 20), descriptionX, currentY, { width: 95, ellipsis: true });
          
          // Reference
          doc.text(reference.substring(0, 12), referenceX, currentY, { width: 75, ellipsis: true });
          
          // Amount with color coding
          if (transType === 'DR' || transType === 'DEBIT') {
            doc.fillColor('#ff0000');
          } else {
            doc.fillColor('#008000');
          }
          doc.text(amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), amountX, currentY, { width: 75, align: 'right' });
          
          // Balance
          doc.fillColor('#000000');
          doc.text(balance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), balanceX, currentY, { width: 75, align: 'right' });
          
          // Status with color coding
          if (status.toLowerCase() === 'completed' || status.toLowerCase() === 'success' || status.toLowerCase() === 'approved') {
            doc.fillColor('#008000');
          } else if (status.toLowerCase() === 'pending') {
            doc.fillColor('#ffa500');
          } else if (status.toLowerCase() === 'failed' || status.toLowerCase() === 'rejected') {
            doc.fillColor('#ff0000');
          } else {
            doc.fillColor('#000000');
          }
          doc.text(status, statusX, currentY, { width: 55, align: 'center' });
          
          // Details button
          doc.fillColor('#0000ff');
          doc.text('View', detailsX, currentY, { width: 60, align: 'center' });
          
          doc.fillColor('#000000');
          
          // Additional details
          currentY += 12;
          doc.fontSize(7);
          doc.text(`By: ${depositor.substring(0, 15)} | BU: ${businessUnit} ${currencyCount ? '| ' + currencyCount : ''}`, dateX, currentY, { width: 400, ellipsis: true });
          
          currentY += 15;
          doc.fontSize(8);
        });
      } else {
        doc.moveDown(1);
        doc.fontSize(12).text('No transactions during this period.', { align: 'center' });
      }

      // Footer on each page
      try {
        const pageRange = doc.bufferedPageRange();
        if (pageRange && pageRange.count > 0) {
          for (let i = 0; i < pageRange.count; i++) {
            doc.switchToPage(i);
            doc.fontSize(8).text(
              `Page ${i + 1} of ${pageRange.count}`,
              50,
              doc.page.height - 30,
              { align: 'center' }
            );
            doc.text(
              'Confidential: For account holder only',
              50,
              doc.page.height - 20,
              { align: 'center' }
            );
            doc.text(
              'Contact: customer.service@bank.com | Phone: +234-XXX-XXXX-XXXX',
              50,
              doc.page.height - 10,
              { align: 'center', fontSize: 7 }
            );
          }
        }
      } catch (error) {
        logger.warn('Error adding footer to pages', { error: error.message, stack: error.stack });
      }

      doc.on('end', () => resolve());
      doc.on('error', (err) => {
        logger.error('Error generating account statement PDF', { error: err.message, stack: err.stack });
        if (!writeStream.headersSent) {
          writeStream.status(500).json({ success: false, message: 'Error generating account statement PDF' });
        }
        reject(err);
      });

      doc.end();
    } catch (error) {
      logger.error('Error in generateCustomerAccountStatement', { error: error.message, stack: error.stack });
      if (!writeStream.headersSent) {
        writeStream.status(500).json({ success: false, message: `Failed to generate account statement: ${error.message}` });
      }
      reject(error);
    }
  });
}

/**
 * Generate a tabular PDF Report (e.g., Trial Balance)
 * @param {string} reportType - Type of report (used in filename)
 * @param {Array<Object>} data - Array of data objects to display
 * @param {Array<Object>} fields - Array of field definitions with key, displayName, and type
 * @param {string} title - Report title
 * @param {Response} res - Express response object
 * @returns {Promise<void>} Resolves when PDF is generated, rejects on error
 */
export function generateReport(reportType, data, fields, title, res) {
  return new Promise((resolve, reject) => {
    try {
      if (res.headersSent) {
        logger.warn(`Headers already sent for ${reportType} report`);
        return reject(new Error('Response already sent'));
      }

      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${reportType}_report.pdf`);

      doc.pipe(res);

      // Path to bank logo
      const logoPath = path.join(__dirname, '../image for test/logo.PNG');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 30, 20, { width: 80 });
        doc.moveDown(3);
      } else {
        logger.warn(`Bank logo image not found at: ${logoPath}`);
        doc.moveDown(1.5);
      }

      // Header
      doc.fontSize(14).font('Helvetica-Bold').text(title, { align: 'center', underline: true });
      doc.moveDown(0.5);

      // Optimized column widths for A4
      const columnWidths = {
        GL_ACCT_NO: 90,
        ACCT_DESC: 120,
        GL_ACCT_CAT: 70,
        DEBIT: 70,
        CREDIT: 70,
        NET_BALANCE: 70,
      };

      // Calculate total table width
      const totalTableWidth = Object.values(columnWidths).reduce((sum, width) => sum + width, 0);
      const startX = 30;

      // Table headers
      let xPos = startX;
      doc.fontSize(9).font('Helvetica-Bold');
      fields.forEach((field) => {
        doc.text(field.displayName, xPos, doc.y, { 
          width: columnWidths[field.key] || 70, 
          align: field.type === 'number' ? 'right' : 'left',
          ellipsis: true
        });
        xPos += columnWidths[field.key] || 70;
      });
      
      // Draw line under headers
      doc.moveTo(startX, doc.y + 12).lineTo(startX + totalTableWidth, doc.y + 12).stroke();
      doc.moveDown(0.3);

      // Table rows
      doc.font('Helvetica').fontSize(8);
      let currentY = doc.y;
      data.forEach((item, index) => {
        if (currentY > 720) {
          doc.addPage();
          currentY = 30;
          
          // Redraw headers on new page
          xPos = startX;
          doc.fontSize(9).font('Helvetica-Bold');
          fields.forEach((field) => {
            doc.text(field.displayName, xPos, currentY, { 
              width: columnWidths[field.key] || 70, 
              align: field.type === 'number' ? 'right' : 'left',
              ellipsis: true
            });
            xPos += columnWidths[field.key] || 70;
          });
          doc.moveTo(startX, currentY + 12).lineTo(startX + totalTableWidth, currentY + 12).stroke();
          currentY += 20;
          doc.font('Helvetica').fontSize(8);
        }

        const isTotalRow = item.GL_ACCT_NO === 'TOTALS';
        if (isTotalRow) {
          doc.font('Helvetica-Bold');
          doc.rect(startX, currentY - 3, totalTableWidth, 16).fillAndStroke('#f0f0f0', '#d0d0d0');
        } else if (index % 2 === 0) {
          doc.rect(startX, currentY - 3, totalTableWidth, 16).fillAndStroke('#f5f5f5', '#e0e0e0');
        }

        doc.fillColor('#000000');

        xPos = startX;
        fields.forEach((field) => {
          let value = item[field.key];
          if (field.type === 'number' && value != null) {
            value = value.toLocaleString('en-NG', { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            });
          } else if (field.type === 'date' && value) {
            value = new Date(value).toLocaleDateString('en-NG', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });
          } else if (field.type === 'string') {
            value = value != null ? value.toString() : 'N/A';
            if (value.length > 20) {
              value = value.substring(0, 17) + '...';
            }
          }
          doc.text(value, xPos, currentY, { 
            width: columnWidths[field.key] || 70, 
            align: field.type === 'number' ? 'right' : 'left',
            ellipsis: true
          });
          xPos += columnWidths[field.key] || 70;
        });
        currentY += 16;
        if (isTotalRow) {
          doc.font('Helvetica');
        }
      });

      // Footer on each page
      try {
        const pageRange = doc.bufferedPageRange();
        if (pageRange && pageRange.count > 0) {
          for (let i = 0; i < pageRange.count; i++) {
            doc.switchToPage(i);
            doc.fontSize(7).text(
              `Page ${i + 1} of ${pageRange.count}`,
              startX,
              doc.page.height - 20,
              { align: 'center', width: totalTableWidth }
            );
            doc.text(
              'Confidential: For internal use only',
              startX,
              doc.page.height - 15,
              { align: 'center', width: totalTableWidth }
            );
            doc.text(
              `Generated: ${new Date().toLocaleDateString('en-NG', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })}`,
              startX,
              doc.page.height - 10,
              { align: 'center', width: totalTableWidth }
            );
          }
        }
      } catch (error) {
        logger.warn('Error adding footer to pages', { error: error.message, stack: error.stack });
      }

      doc.on('end', () => resolve());
      doc.on('error', (err) => {
        logger.error(`Error generating PDF for ${reportType}`, { error: err.message, stack: err.stack });
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            message: `Error generating ${reportType} PDF`, 
            timestamp: new Date().toISOString() 
          });
        }
        reject(err);
      });

      doc.end();
    } catch (err) {
      logger.error(`Error in generateReport for ${reportType}`, { error: err.message, stack: err.stack });
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          message: `Error generating ${reportType} PDF`, 
          timestamp: new Date().toISOString() 
        });
      }
      reject(err);
    }
  });
}

/**
 * Generate Trial Balance PDF
 * @param {Array<Object>} data - Trial balance rows
 * @param {string} period - e.g. "1 August 2025 - 31 August 2025"
 * @param {Response} res - Express response object
 * @returns {Promise<void>} Resolves when PDF is generated, rejects on error
 */
export function generateTrialBalanceReport(data, period, res) {
  return new Promise((resolve, reject) => {
    try {
      if (res.headersSent) {
        logger.warn('Headers already sent for trial-balance report');
        return reject(new Error('Response already sent'));
      }

      if (!Array.isArray(data)) {
        throw new Error('Data must be an array');
      }

      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=trial_balance_report.pdf');

      doc.pipe(res);

      // Path to bank logo
      const logoPath = path.join(__dirname, '../image for test/logo.PNG');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 30, { width: 100 });
        doc.moveDown(4);
      } else {
        logger.warn(`Bank logo image not found at: ${logoPath}`);
        doc.moveDown(2);
      }

      // Header
      doc.fontSize(16).font('Helvetica-Bold').text(`Trial Balance Report (${period})`, { align: 'center', underline: true });
      doc.moveDown(1);

      // Define columns
      const columns = [
        { key: 'GL_ACCT_NO', label: 'GL Account Number', width: 100, type: 'string' },
        { key: 'Description', label: 'Account Description', width: 150, type: 'string' },
        { key: 'Category', label: 'Category', width: 80, type: 'string' },
        { key: 'Debit', label: 'Debit (NGN)', width: 80, type: 'number' },
        { key: 'Credit', label: 'Credit (NGN)', width: 80, type: 'number' },
        { key: 'Net', label: 'Net Balance (NGN)', width: 80, type: 'number' },
      ];

      // Consolidate data by GL_ACCT_NO and group by Category
      const groupedData = data.reduce((acc, item) => {
        if (item.GL_ACCT_NO === 'TOTALS') return acc; // Skip TOTALS row
        const key = `${item.Category}_${item.GL_ACCT_NO}`;
        if (!acc[key]) {
          acc[key] = {
            GL_ACCT_NO: item.GL_ACCT_NO,
            Description: item.Description || 'Unknown Account', // Default to 'Unknown Account' if no description
            Category: item.Category || 'UNKNOWN',
            Debit: 0,
            Credit: 0,
            Net: 0,
          };
        } else {
          // Update Description: prefer longer, non-empty description or most recent
          if (item.Description && item.Description.length > (acc[key].Description?.length || 0)) {
            acc[key].Description = item.Description;
          }
        }
        acc[key].Debit += Number(item.Debit) || 0;
        acc[key].Credit += Number(item.Credit) || 0;
        acc[key].Net += Number(item.Net) || 0;
        return acc;
      }, {});

      // Convert grouped data to array and sort by Category (LIABILITY first, then ASSET, then others)
      const consolidatedData = Object.values(groupedData).sort((a, b) => {
        const categoryOrder = { 'LIABILITY': 1, 'ASSET': 2, 'UNKNOWN': 3 };
        const orderA = categoryOrder[a.Category] || 4;
        const orderB = categoryOrder[b.Category] || 4;
        if (orderA !== orderB) return orderA - orderB;
        return a.GL_ACCT_NO.localeCompare(b.GL_ACCT_NO);
      });

      // Calculate subtotals by Category
      const subtotals = consolidatedData.reduce((acc, item) => {
        if (!acc[item.Category]) {
          acc[item.Category] = { Debit: 0, Credit: 0, Net: 0 };
        }
        acc[item.Category].Debit += Number(item.Debit) || 0;
        acc[item.Category].Credit += Number(item.Credit) || 0;
        acc[item.Category].Net += Number(item.Net) || 0;
        return acc;
      }, {});

      // Calculate grand total
      const grandTotal = {
        GL_ACCT_NO: 'TOTALS',
        Description: '',
        Category: '',
        Debit: Object.values(subtotals).reduce((sum, sub) => sum + Number(sub.Debit), 0),
        Credit: Object.values(subtotals).reduce((sum, sub) => sum + Number(sub.Credit), 0),
        Net: Object.values(subtotals).reduce((sum, sub) => sum + Number(sub.Net), 0),
      };

      // Table headers
      let xPos = 50;
      doc.fontSize(10).font('Helvetica-Bold');
      columns.forEach((col) => {
        doc.text(col.label, xPos, doc.y, { 
          width: col.width, 
          align: col.type === 'number' ? 'right' : 'left' 
        });
        xPos += col.width;
      });
      doc.moveTo(50, doc.y + 15).lineTo(550, doc.y + 15).stroke();
      doc.moveDown(0.5);

      // Table rows
      doc.font('Helvetica').fontSize(9);
      let currentY = doc.y;

      // Render sections for each Category
      const categories = [...new Set(consolidatedData.map(item => item.Category))].sort((a, b) => {
        const categoryOrder = { 'LIABILITY': 1, 'ASSET': 2, 'UNKNOWN': 3 };
        return (categoryOrder[a] || 4) - (categoryOrder[b] || 4);
      });

      categories.forEach(category => {
        if (consolidatedData.some(item => item.Category === category)) {
          if (currentY > 700) {
            doc.addPage();
            currentY = 50;
            // Redraw headers
            xPos = 50;
            doc.fontSize(10).font('Helvetica-Bold');
            columns.forEach((col) => {
              doc.text(col.label, xPos, currentY, { 
                width: col.width, 
                align: col.type === 'number' ? 'right' : 'left' 
              });
              xPos += col.width;
            });
            doc.moveTo(50, currentY + 15).lineTo(550, currentY + 15).stroke();
            currentY += 25;
            doc.font('Helvetica').fontSize(9);
          }

          doc.fontSize(10).font('Helvetica-Bold').text(category, 50, currentY, { underline: true });
          currentY += 15;

          consolidatedData
            .filter(item => item.Category === category)
            .forEach((item, index) => {
              if (currentY > 700) {
                doc.addPage();
                currentY = 50;
                // Redraw headers
                xPos = 50;
                doc.fontSize(10).font('Helvetica-Bold');
                columns.forEach((col) => {
                  doc.text(col.label, xPos, currentY, { 
                    width: col.width, 
                    align: col.type === 'number' ? 'right' : 'left' 
                  });
                  xPos += col.width;
                });
                doc.moveTo(50, currentY + 15).lineTo(550, currentY + 15).stroke();
                currentY += 25;
                doc.font('Helvetica').fontSize(9);
              }

              if (index % 2 === 0) {
                doc.rect(50, currentY - 5, 500, 20).fillAndStroke('#f5f5f5', '#e0e0e0');
              }

              xPos = 50;
              columns.forEach((col) => {
                let value = item[col.key];
                if (col.type === 'number' && value != null) {
                  value = Number(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                } else if (col.type === 'string') {
                  value = value != null ? value.toString() : 'N/A';
                  if (col.key === 'Description' && value.length > 20) {
                    value = value.substring(0, 17) + '...';
                  }
                }
                doc.text(value, xPos, currentY, { 
                  width: col.width, 
                  align: col.type === 'number' ? 'right' : 'left' 
                });
                xPos += col.width;
              });
              currentY += 20;
            });

          // Render Subtotal for this category
          if (subtotals[category] && (subtotals[category].Debit > 0 || subtotals[category].Credit > 0 || subtotals[category].Net !== 0)) {
            if (currentY > 700) {
              doc.addPage();
              currentY = 50;
              // Redraw headers
              xPos = 50;
              doc.fontSize(10).font('Helvetica-Bold');
              columns.forEach((col) => {
                doc.text(col.label, xPos, currentY, { 
                  width: col.width, 
                  align: col.type === 'number' ? 'right' : 'left' 
                });
                xPos += col.width;
              });
              doc.moveTo(50, currentY + 15).lineTo(550, currentY + 15).stroke();
              currentY += 25;
              doc.font('Helvetica').fontSize(9);
            }

            doc.font('Helvetica-Bold');
            doc.rect(50, currentY - 5, 500, 20).fillAndStroke('#f0f0f0', '#d0d0d0');
            xPos = 50;
            doc.text(`${category} SUBTOTAL`, xPos, currentY, { width: columns[0].width + columns[1].width });
            xPos += columns[0].width + columns[1].width + columns[2].width;
            doc.text(
              Number(subtotals[category].Debit).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
              xPos,
              currentY,
              { width: columns[3].width, align: 'right' }
            );
            xPos += columns[3].width;
            doc.text(
              Number(subtotals[category].Credit).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
              xPos,
              currentY,
              { width: columns[4].width, align: 'right' }
            );
            xPos += columns[4].width;
            doc.text(
              Number(subtotals[category].Net).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
              xPos,
              currentY,
              { width: columns[5].width, align: 'right' }
            );
            currentY += 20;
            doc.font('Helvetica');
          }
        }
      });

      // Grand Total
      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
        // Redraw headers
        xPos = 50;
        doc.fontSize(10).font('Helvetica-Bold');
        columns.forEach((col) => {
          doc.text(col.label, xPos, currentY, { 
            width: col.width, 
            align: col.type === 'number' ? 'right' : 'left' 
          });
          xPos += col.width;
        });
        doc.moveTo(50, currentY + 15).lineTo(550, currentY + 15).stroke();
        currentY += 25;
        doc.font('Helvetica').fontSize(9);
      }

      doc.font('Helvetica-Bold');
      doc.rect(50, currentY - 5, 500, 20).fillAndStroke('#f0f0f0', '#d0d0d0');
      xPos = 50;
      doc.text('TOTALS', xPos, currentY, { width: columns[0].width });
      xPos += columns[0].width + columns[1].width + columns[2].width;
      doc.text(
        Number(grandTotal.Debit).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        xPos,
        currentY,
        { width: columns[3].width, align: 'right' }
      );
      xPos += columns[3].width;
      doc.text(
        Number(grandTotal.Credit).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        xPos,
        currentY,
        { width: columns[4].width, align: 'right' }
      );
      xPos += columns[4].width;
      doc.text(
        Number(grandTotal.Net).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        xPos,
        currentY,
        { width: columns[5].width, align: 'right' }
      );
      currentY += 20;
      doc.font('Helvetica');

      // Footer on each page
      try {
        const pageRange = doc.bufferedPageRange();
        if (pageRange && pageRange.count > 0) {
          for (let i = 0; i < pageRange.count; i++) {
            doc.switchToPage(i);
            doc.fontSize(8).text(
              `Page ${i + 1} of ${pageRange.count}`,
              50,
              doc.page.height - 30,
              { align: 'center' }
            );
            doc.text(
              'Confidential: For internal use only',
              50,
              doc.page.height - 20,
              { align: 'center' }
            );
            doc.text(
              `Generated on: ${new Date().toLocaleDateString('en-NG', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })}`,
              50,
              doc.page.height - 10,
              { align: 'center' }
            );
          }
        }
      } catch (error) {
        logger.warn('Error adding footer to pages', { error: error.message, stack: error.stack });
      }

      doc.on('end', () => resolve());
      doc.on('error', (err) => {
        logger.error('Error generating trial-balance PDF', { error: err.message, stack: err.stack });
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            message: 'Error generating trial-balance PDF', 
            timestamp: new Date().toISOString() 
          });
        }
        reject(err);
      });

      doc.end();
    } catch (err) {
      logger.error('Error in generateTrialBalanceReport', { error: err.message, stack: err.stack });
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          message: 'Error generating trial-balance PDF', 
          timestamp: new Date().toISOString() 
        });
      }
      reject(err);
    }
  });
}


/**
 * Generate an Excel report
 * @param {Array<Object>} data - Array of data objects to include
 * @param {string} reportType - Type of report (used in filename)
 * @param {Array<Object>} fields - Array of field definitions with key, displayName, and type
 * @param {string} title - Worksheet title
 * @returns {string} Path to generated Excel file
 */
export function generateExcelReport(data, reportType, fields, title) {
  const reportsDir = path.join(__dirname, '../reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const uniqueId = uuidv4();
  const excelPath = path.join(reportsDir, `${reportType}_${uniqueId}.xlsx`);

  const headers = fields.map((f) => f.displayName);
  const dataRows = data.map((item) =>
    fields.map((field) => {
      let value = item[field.key];
      if (field.type === 'date' && value) {
        return new Date(value).toLocaleDateString('en-NG', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      } else if (field.type === 'boolean') {
        return value ? 'Yes' : 'No';
      } else if (field.type === 'number') {
        return value != null ? value : '';
      }
      return value ?? '';
    })
  );

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
  XLSX.writeFile(wb, excelPath);

  return excelPath;
}

/**
 * Cleanup report files
 * @param {string} filePath - Path to the file to delete
 */
export function cleanupReportFiles(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`Successfully deleted file: ${filePath}`);
    }
  } catch (err) {
    logger.error(`Cleanup error for ${filePath}`, { error: err.message, stack: err.stack });
  }
}

/**
 * Generate Thrift Accounts Report (PDF)
 * @param {Array<Object>} thriftAccounts - Array of thrift account objects
 * @param {Object} filters - Filter criteria used for the report
 * @param {Response} res - Express response object
 * @returns {Promise<void>} Resolves when PDF is generated, rejects on error
 */

export function generateThriftAccountsReport(thriftAccounts, filters, res) {
  return new Promise((resolve, reject) => {
    try {
      if (res.headersSent) {
        logger.warn('Headers already sent for thrift-accounts report');
        return reject(new Error('Response already sent'));
      }

      if (!Array.isArray(thriftAccounts)) {
        throw new Error('thriftAccounts must be an array');
      }

      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=thrift_accounts_report.pdf');

      doc.pipe(res);

      // Path to bank logo
      const logoPath = path.join(__dirname, '../image for test/logo.PNG');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 40, 20, { width: 80 });
      } else {
        logger.warn(`Bank logo image not found at: ${logoPath}`);
      }

      // Header
      doc.fontSize(16).font('Helvetica-Bold')
         .text('THRIFT ACCOUNTS REPORT', 130, 30, { align: 'center', underline: true });
      
      // Report date and filters
      doc.fontSize(10).font('Helvetica')
         .text(`Generated on: ${new Date().toLocaleDateString('en-NG', {
           year: 'numeric',
           month: 'long',
           day: 'numeric',
           hour: '2-digit',
           minute: '2-digit'
         })}`, 40, 60);
      
      // Filters information
      let filterInfo = 'All Accounts';
      if (filters) {
        const filterParts = [];
        if (filters.COLLECTION_TYPE) filterParts.push(`Type: ${filters.COLLECTION_TYPE}`);
        if (filters.status) filterParts.push(`Status: ${filters.status}`);
        if (filters.RELATIONSHIP_MANAGER) filterParts.push(`Manager: ${filters.RELATIONSHIP_MANAGER}`);
        if (filters.startDate && filters.endDate) {
          filterParts.push(`Period: ${new Date(filters.startDate).toLocaleDateString()} - ${new Date(filters.endDate).toLocaleDateString()}`);
        }
        if (filterParts.length > 0) {
          filterInfo = filterParts.join(' | ');
        }
      }
      
      doc.text(`Filters: ${filterInfo}`, 40, 75);
      doc.text(`Total Accounts: ${thriftAccounts.length}`, 40, 90);

      // Summary Statistics
      const totalAmount = thriftAccounts.reduce((sum, account) => sum + (account.AMOUNT || 0), 0);
      const activeAccounts = thriftAccounts.filter(acc => acc.status === 'active').length;
      const collectionTypeCounts = thriftAccounts.reduce((acc, account) => {
        const type = account.COLLECTION_TYPE || 'UNKNOWN';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});

      doc.text(`Total Balance: ₦${totalAmount.toLocaleString('en-NG')}`, 400, 60);
      doc.text(`Active Accounts: ${activeAccounts}`, 400, 75);
      doc.text(`Inactive Accounts: ${thriftAccounts.length - activeAccounts}`, 400, 90);

      // Table headers
      const headers = [
        { label: 'Cust ID', x: 40, width: 60 },
        { label: 'Account No', x: 100, width: 70 },
        { label: 'Full Name', x: 170, width: 90 },
        { label: 'Collection Type', x: 260, width: 60 },
        { label: 'Balance (₦)', x: 320, width: 70 },
        { label: 'Opened Date', x: 390, width: 70 },
        { label: 'Relationship Manager', x: 460, width: 90 },
        { label: 'Status', x: 550, width: 50 },
        { label: 'Created Date', x: 600, width: 70 }
      ];

      let currentY = 120;

      // Draw table headers
      doc.fontSize(9).font('Helvetica-Bold');
      headers.forEach(header => {
        doc.text(header.label, header.x, currentY, { width: header.width });
      });

      // Draw line under headers
      doc.moveTo(40, currentY + 15).lineTo(670, currentY + 15).stroke();
      currentY += 25;

      // Table rows
      doc.fontSize(8).font('Helvetica');
      
      thriftAccounts.forEach((account, index) => {
        // Check if we need a new page
        if (currentY > 500) {
          doc.addPage();
          currentY = 40;
          
          // Redraw headers on new page
          doc.fontSize(9).font('Helvetica-Bold');
          headers.forEach(header => {
            doc.text(header.label, header.x, currentY, { width: header.width });
          });
          doc.moveTo(40, currentY + 15).lineTo(670, currentY + 15).stroke();
          currentY += 25;
          doc.fontSize(8).font('Helvetica');
        }

        // Alternate row background
        if (index % 2 === 0) {
          doc.rect(40, currentY - 5, 630, 20).fillAndStroke('#f8f9fa', '#e9ecef');
        }

        // Customer ID
        doc.text(account.CUST_ID || 'N/A', headers[0].x, currentY, { 
          width: headers[0].width 
        });

        // Account Number
        doc.text(account.ACCT_NO || 'N/A', headers[1].x, currentY, { 
          width: headers[1].width 
        });

        // Full Name
        const fullName = account.FULL_NAME || `${account.FIRST_NAME || ''} ${account.LASTNAME || ''}`.trim() || 'N/A';
        doc.text(fullName, headers[2].x, currentY, { 
          width: headers[2].width,
          ellipsis: true
        });

        // Collection Type with color coding
        const collectionType = account.COLLECTION_TYPE || 'N/A';
        if (collectionType === 'DAILY') {
          doc.fillColor('#1890ff');
        } else if (collectionType === 'WEEKLY') {
          doc.fillColor('#52c41a');
        } else if (collectionType === 'MONTHLY') {
          doc.fillColor('#fa8c16');
        } else {
          doc.fillColor('#722ed1');
        }
        doc.text(collectionType, headers[3].x, currentY, { 
          width: headers[3].width 
        });
        doc.fillColor('#000000');

        // Balance
        const balance = account.AMOUNT || 0;
        doc.text(balance.toLocaleString('en-NG', { 
          minimumFractionDigits: 2, 
          maximumFractionDigits: 2 
        }), headers[4].x, currentY, { 
          width: headers[4].width,
          align: 'right'
        });

        // Opened Date
        const openedDate = account.OPENED_DT ? 
          new Date(account.OPENED_DT).toLocaleDateString('en-NG', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          }) : 'N/A';
        doc.text(openedDate, headers[5].x, currentY, { 
          width: headers[5].width 
        });

        // Relationship Manager
        const manager = account.RELATIONSHIP_MANAGER || 'N/A';
        doc.text(manager, headers[6].x, currentY, { 
          width: headers[6].width,
          ellipsis: true
        });

        // Status with color coding
        const status = account.status || 'active';
        if (status === 'active') {
          doc.fillColor('#52c41a');
        } else if (status === 'inactive') {
          doc.fillColor('#faad14');
        } else if (status === 'suspended') {
          doc.fillColor('#f5222d');
        } else {
          doc.fillColor('#666666');
        }
        doc.text(status.toUpperCase(), headers[7].x, currentY, { 
          width: headers[7].width,
          align: 'center'
        });
        doc.fillColor('#000000');

        // Created Date
        const createdDate = account.createdAt ? 
          new Date(account.createdAt).toLocaleDateString('en-NG', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          }) : 'N/A';
        doc.text(createdDate, headers[8].x, currentY, { 
          width: headers[8].width 
        });

        currentY += 20;
      });

      // Summary section on last page
      if (currentY > 400) {
        doc.addPage();
        currentY = 40;
      }

      doc.fontSize(12).font('Helvetica-Bold')
         .text('SUMMARY STATISTICS', 40, currentY, { underline: true });
      currentY += 25;

      doc.fontSize(10).font('Helvetica');
      
      // Collection Type Breakdown
      doc.text('Collection Type Breakdown:', 40, currentY);
      currentY += 15;
      
      Object.entries(collectionTypeCounts).forEach(([type, count]) => {
        const percentage = ((count / thriftAccounts.length) * 100).toFixed(1);
        doc.text(`• ${type}: ${count} accounts (${percentage}%)`, 60, currentY);
        currentY += 12;
      });

      currentY += 10;

      // Balance Summary
      const avgBalance = totalAmount / thriftAccounts.length;
      const maxBalance = Math.max(...thriftAccounts.map(acc => acc.AMOUNT || 0));
      const minBalance = Math.min(...thriftAccounts.map(acc => acc.AMOUNT || 0));

      doc.text('Balance Summary:', 40, currentY);
      currentY += 15;
      doc.text(`• Total Balance: ₦${totalAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 60, currentY);
      currentY += 12;
      doc.text(`• Average Balance: ₦${avgBalance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 60, currentY);
      currentY += 12;
      doc.text(`• Highest Balance: ₦${maxBalance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 60, currentY);
      currentY += 12;
      doc.text(`• Lowest Balance: ₦${minBalance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 60, currentY);

      // Footer on each page
      try {
        const pageRange = doc.bufferedPageRange();
        if (pageRange && pageRange.count > 0) {
          for (let i = 0; i < pageRange.count; i++) {
            doc.switchToPage(i);
            doc.fontSize(8)
               .text(`Page ${i + 1} of ${pageRange.count}`, 40, doc.page.height - 20, { align: 'center' })
               .text('Confidential: For internal use only', 40, doc.page.height - 10, { align: 'center' });
          }
        }
      } catch (error) {
        logger.warn('Error adding footer to pages', { error: error.message });
      }

      doc.on('end', () => resolve());
      doc.on('error', (err) => {
        logger.error('Error generating thrift accounts PDF', { error: err.message });
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            message: 'Error generating thrift accounts report PDF' 
          });
        }
        reject(err);
      });

      doc.end();
    } catch (err) {
      logger.error('Error in generateThriftAccountsReport', { error: err.message });
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          message: 'Error generating thrift accounts report PDF' 
        });
      }
      reject(err);
    }
  });
}

/**
 * Generate Thrift Accounts Excel Report
 * @param {Array<Object>} thriftAccounts - Array of thrift account objects
 * @param {Object} filters - Filter criteria used for the report
 * @returns {string} Path to generated Excel file
 */
export function generateThriftAccountsExcelReport(thriftAccounts, filters) {
  const reportsDir = path.join(__dirname, '../reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const uniqueId = uuidv4();
  const excelPath = path.join(reportsDir, `thrift_accounts_report_${uniqueId}.xlsx`);

  // Prepare data for Excel
  const excelData = thriftAccounts.map(account => ({
    'Customer ID': account.CUST_ID || 'N/A',
    'Account Number': account.ACCT_NO || 'N/A',
    'Full Name': account.FULL_NAME || `${account.FIRST_NAME || ''} ${account.LASTNAME || ''}`.trim() || 'N/A',
    'Collection Type': account.COLLECTION_TYPE || 'N/A',
    'Balance (₦)': account.AMOUNT || 0,
    'Opened Date': account.OPENED_DT ? new Date(account.OPENED_DT).toLocaleDateString() : 'N/A',
    'Relationship Manager': account.RELATIONSHIP_MANAGER || 'N/A',
    'Status': account.status || 'active',
    'Created Date': account.createdAt ? new Date(account.createdAt).toLocaleDateString() : 'N/A',
    'Last Collection Date': account.lastCollectionDate ? new Date(account.lastCollectionDate).toLocaleDateString() : 'N/A',
    'Account Type': account.accountType || 'N/A',
    'Total Contributions': account.totalContributions || 0,
    'Total Withdrawals': account.totalWithdrawals || 0
  }));

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(excelData);

  // Add summary sheet
  const summaryData = [
    ['THRIFT ACCOUNTS REPORT SUMMARY'],
    [''],
    ['Generated on:', new Date().toLocaleDateString()],
    ['Total Accounts:', thriftAccounts.length],
    ['Total Balance:', thriftAccounts.reduce((sum, acc) => sum + (acc.AMOUNT || 0), 0)],
    ['Active Accounts:', thriftAccounts.filter(acc => acc.status === 'active').length],
    [''],
    ['Collection Type Breakdown:']
  ];

  // Add collection type breakdown
  const typeCounts = thriftAccounts.reduce((acc, account) => {
    const type = account.COLLECTION_TYPE || 'UNKNOWN';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  Object.entries(typeCounts).forEach(([type, count]) => {
    summaryData.push([`${type}:`, count]);
  });

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
  
  // Add worksheets to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Thrift Accounts');
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  // Write file
  XLSX.writeFile(wb, excelPath);

  return excelPath;
}

export default {
  generateTermDepositContractLetter,
  generateCustomerAccountStatement,
  generateReport,
  generateTrialBalanceReport,
  generateExcelReport,
  cleanupReportFiles,
   generateThriftAccountsReport,
  generateThriftAccountsExcelReport
};