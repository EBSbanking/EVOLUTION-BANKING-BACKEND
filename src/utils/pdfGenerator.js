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
            Description: item.Description || 'Unknown Account',
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
      
      // Convert grouped data to array and sort by Category
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
 * Generate an Excel report - UNIFIED VERSION
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
      } else if (field.type === 'number' && value != null) {
        return Number(value).toLocaleString('en-NG', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      } else if (field.type === 'string') {
        return value != null ? value.toString() : 'N/A';
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
      
      // Path to bank logo - Using black and white
      const logoPath = path.join(__dirname, '../image for test/logo.PNG');
      if (fs.existsSync(logoPath)) {
        // Convert logo to grayscale for black and white report
        doc.image(logoPath, 40, 20, { width: 80 });
      } else {
        logger.warn(`Bank logo image not found at: ${logoPath}`);
      }
      
      // Header - Black and white styling
      doc.fontSize(16).font('Helvetica-Bold')
         .fillColor('#000000') // Black
         .text('THRIFT ACCOUNTS REPORT', 130, 30, { align: 'center', underline: true });
    
      // Report date and filters
      doc.fontSize(10).font('Helvetica')
         .fillColor('#000000')
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
      const totalContributions = thriftAccounts.reduce((sum, account) => sum + (account.total_contributions || 0), 0);
      const totalWithdrawals = thriftAccounts.reduce((sum, account) => sum + (account.total_withdrawals || 0), 0);
      const activeAccounts = thriftAccounts.filter(acc => acc.status === 'active').length;
      const collectionTypeCounts = thriftAccounts.reduce((acc, account) => {
        const type = account.COLLECTION_TYPE || 'UNKNOWN';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});
      
      // Financial summary on the right side
      doc.text(`Current Balance: ₦${totalAmount.toLocaleString('en-NG')}`, 400, 60);
      doc.text(`Total Contributions: ₦${totalContributions.toLocaleString('en-NG')}`, 400, 75);
      doc.text(`Total Withdrawals: ₦${totalWithdrawals.toLocaleString('en-NG')}`, 400, 90);
      doc.text(`Active Accounts: ${activeAccounts}`, 500, 60);
      doc.text(`Inactive Accounts: ${thriftAccounts.length - activeAccounts}`, 500, 75);
      
      // Table headers - Black and white with proper formatting
      const headers = [
        { label: 'Cust ID', x: 40, width: 60 },
        { label: 'Account No', x: 100, width: 70 },
        { label: 'Full Name', x: 170, width: 90 },
        { label: 'Collection Type', x: 260, width: 60 },
        { label: 'Current Balance (₦)', x: 320, width: 80 },
        { label: 'Total Contributions (₦)', x: 400, width: 85 },
        { label: 'Total Withdrawals (₦)', x: 485, width: 80 },
        { label: 'Opened Date', x: 565, width: 70 },
        { label: 'Status', x: 635, width: 50 }
      ];
      
      let currentY = 120;
      
      // Draw table headers with black background and white text
      doc.fontSize(9).font('Helvetica-Bold');
      doc.rect(40, currentY, 630, 20).fill('#000000'); // Black header background
      
      headers.forEach(header => {
        doc.fillColor('#ffffff') // White text
           .text(header.label, header.x, currentY + 5, { 
             width: header.width,
             ellipsis: true 
           });
      });
      
      currentY += 25;
      
      // Table rows - Black and white alternating
      doc.fontSize(8).font('Helvetica');
    
      thriftAccounts.forEach((account, index) => {
        // Check if we need a new page
        if (currentY > 500) {
          doc.addPage();
          currentY = 40;
        
          // Redraw headers on new page
          doc.fontSize(9).font('Helvetica-Bold');
          doc.rect(40, currentY, 630, 20).fill('#000000');
          
          headers.forEach(header => {
            doc.fillColor('#ffffff')
               .text(header.label, header.x, currentY + 5, { 
                 width: header.width,
                 ellipsis: true 
               });
          });
          currentY += 25;
          doc.fontSize(8).font('Helvetica');
        }
        
        // Alternate row background - Light gray for even rows
        if (index % 2 === 0) {
          doc.rect(40, currentY - 5, 630, 20).fill('#f5f5f5'); // Very light gray
        }
        
        // Reset to black text
        doc.fillColor('#000000');
        
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
        
        // Collection Type - Simple text in black and white
        const collectionType = account.COLLECTION_TYPE || 'N/A';
        doc.text(collectionType, headers[3].x, currentY, {
          width: headers[3].width
        });
        
        // Current Balance (AMOUNT)
        const balance = account.AMOUNT || 0;
        doc.text(balance.toLocaleString('en-NG', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }), headers[4].x, currentY, {
          width: headers[4].width,
          align: 'right'
        });
        
        // Total Contributions
        const contributions = account.total_contributions || 0;
        doc.text(contributions.toLocaleString('en-NG', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }), headers[5].x, currentY, {
          width: headers[5].width,
          align: 'right'
        });
        
        // Total Withdrawals
        const withdrawals = account.total_withdrawals || 0;
        doc.text(withdrawals.toLocaleString('en-NG', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }), headers[6].x, currentY, {
          width: headers[6].width,
          align: 'right'
        });
        
        // Opened Date
        const openedDate = account.OPENED_DT ?
          new Date(account.OPENED_DT).toLocaleDateString('en-NG', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          }) : 'N/A';
        doc.text(openedDate, headers[7].x, currentY, {
          width: headers[7].width
        });
        
        // Status - Simple text formatting
        const status = account.status || 'active';
        doc.text(status.toUpperCase(), headers[8].x, currentY, {
          width: headers[8].width,
          align: 'center'
        });
        
        currentY += 20;
      });
      
      // Draw horizontal lines between rows (optional, for better readability)
      doc.strokeColor('#000000').lineWidth(0.5);
      for (let i = 0; i <= thriftAccounts.length; i++) {
        if (i % 10 === 0 && i > 0) {
          const lineY = 120 + 25 + (i * 20);
          if (lineY < currentY) {
            doc.moveTo(40, lineY).lineTo(670, lineY).stroke();
          }
        }
      }
      
      // Summary section on last page - Black and white styling
      if (currentY > 400) {
        doc.addPage();
        currentY = 40;
      }
      
      doc.fontSize(12).font('Helvetica-Bold')
         .fillColor('#000000')
         .text('SUMMARY STATISTICS', 40, currentY, { underline: true });
      currentY += 25;
      
      doc.fontSize(10).font('Helvetica');
    
      // Financial Summary Box
      doc.rect(40, currentY, 300, 100).stroke('#000000');
      doc.fontSize(11).font('Helvetica-Bold')
         .text('FINANCIAL SUMMARY', 50, currentY + 10);
      
      doc.fontSize(9).font('Helvetica');
      doc.text(`Total Current Balance: ₦${totalAmount.toLocaleString('en-NG', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}`, 50, currentY + 30);
      
      doc.text(`Total Contributions: ₦${totalContributions.toLocaleString('en-NG', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}`, 50, currentY + 45);
      
      doc.text(`Total Withdrawals: ₦${totalWithdrawals.toLocaleString('en-NG', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}`, 50, currentY + 60);
      
      // Calculate net contributions (contributions - withdrawals)
      const netContributions = totalContributions - totalWithdrawals;
      doc.text(`Net Contributions: ₦${netContributions.toLocaleString('en-NG', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}`, 50, currentY + 75);
      
      // Collection Type Breakdown Box
      doc.rect(350, currentY, 320, 100).stroke('#000000');
      doc.fontSize(11).font('Helvetica-Bold')
         .text('COLLECTION TYPE BREAKDOWN', 360, currentY + 10);
      
      currentY += 110;
      
      // Account Statistics Box
      doc.rect(40, currentY, 300, 80).stroke('#000000');
      doc.fontSize(11).font('Helvetica-Bold')
         .text('ACCOUNT STATISTICS', 50, currentY + 10);
      
      doc.fontSize(9).font('Helvetica');
      doc.text(`Total Accounts: ${thriftAccounts.length}`, 50, currentY + 30);
      doc.text(`Active Accounts: ${activeAccounts}`, 50, currentY + 45);
      doc.text(`Inactive Accounts: ${thriftAccounts.length - activeAccounts}`, 50, currentY + 60);
      
      // Balance Analysis Box
      doc.rect(350, currentY, 320, 80).stroke('#000000');
      doc.fontSize(11).font('Helvetica-Bold')
         .text('BALANCE ANALYSIS', 360, currentY + 10);
      
      const avgBalance = thriftAccounts.length > 0 ? totalAmount / thriftAccounts.length : 0;
      const maxBalance = thriftAccounts.length > 0 ? Math.max(...thriftAccounts.map(acc => acc.AMOUNT || 0)) : 0;
      const minBalance = thriftAccounts.length > 0 ? Math.min(...thriftAccounts.map(acc => acc.AMOUNT || 0)) : 0;
      
      doc.fontSize(9).font('Helvetica');
      doc.text(`Average Balance: ₦${avgBalance.toLocaleString('en-NG', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}`, 360, currentY + 30);
      doc.text(`Highest Balance: ₦${maxBalance.toLocaleString('en-NG', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}`, 360, currentY + 45);
      doc.text(`Lowest Balance: ₦${minBalance.toLocaleString('en-NG', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}`, 360, currentY + 60);
      
      // Footer on each page
      try {
        const pageRange = doc.bufferedPageRange();
        if (pageRange && pageRange.count > 0) {
          for (let i = 0; i < pageRange.count; i++) {
            doc.switchToPage(i);
            doc.fontSize(8).fillColor('#000000')
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
 * Generate a tabular PDF Report (e.g., Trial Balance or Loan Portfolio) - UNIFIED VERSION
 * @param {string} reportType - Type of report (used in filename)
 * @param {Array<Object>} data - Array of data objects to display
 * @param {Array<Object>} fields - Array of field definitions with key, displayName, and type
 * @param {string} title - Report title
 * @param {Response} res - Express response object
 * @returns {Promise<void>} Resolves when PDF is generated, rejects on error
 */
export function generateReport(reportType, data, fields, title, res, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      if (res.headersSent) {
        logger.warn(`Headers already sent for ${reportType} report`);
        return reject(new Error('Response already sent'));
      }
      
      // Determine orientation: default to 'landscape' for wide reports like loan_portfolio
      const isWideReport = reportType === 'loan_portfolio';
      const layout = options.layout || (isWideReport ? 'landscape' : 'portrait');
      
      const doc = new PDFDocument({ 
        margin: 30, 
        size: 'A4',
        layout  // Key addition: ensures landscape for wide tables
      });
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
      
      // Dynamic column widths based on fields
      const columnWidths = {};
      fields.forEach(field => {
        switch (field.key) {
          // Loan-specific widths (optimized for landscape)
          case 'ACCT_NM':
          case 'REPAYMENT_SOURCE_ACCOUNT':
            columnWidths[field.key] = 95;
            break;
          case 'ACTUAL_DISBURSEMENT':
          case 'TOTAL_INTEREST':
          case 'TOTAL_REPAYMENT':
            columnWidths[field.key] = 85;
            break;
          case 'START_DT':
          case 'MATURITY_DT':
            columnWidths[field.key] = 75;
            break;
          case 'INTEREST_RATE':
            columnWidths[field.key] = 65;
            break;
          // Trial Balance widths (unchanged)
          case 'GL_ACCT_NO':
            columnWidths[field.key] = 90;
            break;
          case 'ACCT_DESC':
            columnWidths[field.key] = 120;
            break;
          case 'GL_ACCT_CAT':
            columnWidths[field.key] = 70;
            break;
          case 'DEBIT':
          case 'CREDIT':
          case 'NET_BALANCE':
            columnWidths[field.key] = 70;
            break;
          // Default
          default:
            columnWidths[field.key] = isWideReport ? 55 : 70;
        }
      });
      
      // Calculate total table width and scale if needed
      let totalTableWidth = Object.values(columnWidths).reduce((sum, width) => sum + width, 0);
      const pageUsableWidth = layout === 'landscape' ? 782 : 535;
      if (totalTableWidth > pageUsableWidth) {
        const scaleFactor = pageUsableWidth / totalTableWidth;
        Object.keys(columnWidths).forEach(key => {
          columnWidths[key] *= scaleFactor;
        });
        totalTableWidth = pageUsableWidth;
      }
      
      const startX = 30;
      
      // Table headers
      let xPos = startX;
      doc.fontSize(9).font('Helvetica-Bold');
      fields.forEach((field) => {
        doc.text(field.displayName, xPos, doc.y, {
          width: columnWidths[field.key],
          align: field.type === 'number' ? 'right' : 'left',
          ellipsis: true
        });
        xPos += columnWidths[field.key];
      });
    
      // Draw line under headers
      doc.moveTo(startX, doc.y + 12).lineTo(startX + totalTableWidth, doc.y + 12).stroke();
      doc.moveDown(0.3);
      
      // Table rows (main data only; no totals inline)
      doc.font('Helvetica').fontSize(8);
      let currentY = doc.y;
      let finalTableY = currentY; // Track the final Y after all data
      
      data.forEach((item, index) => {
        // Page break logic
        const maxY = layout === 'landscape' ? 555 : 720;
        if (currentY > maxY) {
          doc.addPage();
          currentY = 30;
          // Redraw headers
          xPos = startX;
          doc.fontSize(9).font('Helvetica-Bold');
          fields.forEach((field) => {
            doc.text(field.displayName, xPos, currentY, {
              width: columnWidths[field.key],
              align: field.type === 'number' ? 'right' : 'left',
              ellipsis: true
            });
            xPos += columnWidths[field.key];
          });
          doc.moveTo(startX, currentY + 12).lineTo(startX + totalTableWidth, currentY + 12).stroke();
          currentY += 20;
          doc.font('Helvetica').fontSize(8);
        }
        
        // Alternating colors
        const rowHeight = 16;
        if (index % 2 === 0) {
          doc.rect(startX, currentY - 3, totalTableWidth, rowHeight).fillAndStroke('#f5f5f5', '#e0e0e0');
        }
        
        doc.fillColor('#000000');
        xPos = startX;
        fields.forEach((field) => {
          let value = item[field.key];
          if (field.type === 'number' && value != null && !isNaN(value)) {  // NaN safety
            value = Number(value).toLocaleString('en-NG', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            });
          } else if (field.type === 'number') {
            value = '0.00';  // Fallback for NaN
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
            width: columnWidths[field.key],
            align: field.type === 'number' ? 'right' : 'left',
            ellipsis: true
          });
          xPos += columnWidths[field.key];
        });
        currentY += rowHeight;
        finalTableY = currentY; // Update final Y
      });
      
      // Add space after table (decongestion)
      doc.moveDown(1); // Equivalent to ~14pt space
      
      // Add totals summary below the table (on the last page, vertically under, with more space)
      if (options.totals && reportType === 'loan_portfolio') {
        // Switch to last page
        const pageRange = doc.bufferedPageRange();
        if (pageRange && pageRange.count > 0) {
          const lastPageNum = pageRange.count - 1;
          doc.switchToPage(lastPageNum);
          
          // Dynamic Y positioning: Use finalTableY from last page + buffer (decongestion)
          let totalsY = Math.max(520, finalTableY + 40); // Increased base from 450 to 520, +40pt buffer
          const maxY = layout === 'landscape' ? 555 : 720;
          if (totalsY > maxY - 100) {  // Increased buffer to 100pt for footer
            doc.addPage();
            totalsY = 120; // More space on new page
          }
          
          // Totals section: Bold header, then 3-line summary (label + value, right-aligned)
          doc.fontSize(10).font('Helvetica-Bold').text('Summary Totals:', 30, totalsY, { underline: true });
          totalsY += 25; // Increased line spacing
          
          const formatNumber = (num) => {
            if (isNaN(num) || num === null || num === undefined) return '0.00';
            return Number(num).toLocaleString('en-NG', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            });
          };
          
          // Disbursement
          doc.fontSize(9).font('Helvetica-Bold').text('Total Disbursement:', 30, totalsY);
          doc.text(formatNumber(options.totals.disbursement), 500, totalsY, { align: 'right', width: 300 });
          totalsY += 20; // Increased spacing
          
          // Interest
          doc.fontSize(9).font('Helvetica-Bold').text('Total Interest:', 30, totalsY);
          doc.text(formatNumber(options.totals.interest), 500, totalsY, { align: 'right', width: 300 });
          totalsY += 20;
          
          // Repayment
          doc.fontSize(9).font('Helvetica-Bold').text('Total Repayment:', 30, totalsY);
          doc.text(formatNumber(options.totals.repayment), 500, totalsY, { align: 'right', width: 300 });
          totalsY += 20;
          
          // Box around totals with more padding
          doc.rect(30, totalsY - 65, 770, 70).stroke('#d0d0d0'); // Larger box
        }
      }
      
      // Footer on each page
      try {
        const pageRange = doc.bufferedPageRange();
        if (pageRange && pageRange.count > 0) {
          for (let i = 0; i < pageRange.count; i++) {
            doc.switchToPage(i);
            const pageWidth = doc.page.width;
            doc.fontSize(7).text(
              `Page ${i + 1} of ${pageRange.count}`,
              0,
              doc.page.height - 20,
              { align: 'center', width: pageWidth }
            );
            doc.text(
              'Confidential: For internal use only',
              0,
              doc.page.height - 15,
              { align: 'center', width: pageWidth }
            );
            doc.text(
              `Generated: ${new Date().toLocaleDateString('en-NG', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })}`,
              0,
              doc.page.height - 10,
              { align: 'center', width: pageWidth }
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