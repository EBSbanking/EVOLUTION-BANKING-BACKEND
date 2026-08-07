// services/EMTLReceiptService.js
import moment from 'moment';

class EMTLReceiptService {
  /**
   * Generate receipt for a transaction with EMTL
   */
  static generateReceipt(transactionData) {
    const {
      transactionId,
      referenceNo,
      customerId,
      customerName,
      accountNo,
      amount,
      emtlAmount,
      totalDebit,
      emtlApplicable,
      emtlReason,
      transactionType,
      transactionDate,
      description,
      beneficiaryName,
      beneficiaryAccount
    } = transactionData;

    const receipt = {
      receiptNo: `RCPT-${Date.now()}`,
      transactionId: transactionId || referenceNo,
      transactionReference: referenceNo,
      date: moment(transactionDate).format('DD/MM/YYYY HH:mm:ss'),
      timestamp: new Date().toISOString(),
      
      customerInfo: {
        customerId: customerId,
        name: customerName || 'N/A',
        accountNo: accountNo,
        bank: 'Evolution Banking Solution'
      },
      
      transactionDetails: {
        type: transactionType || 'TRANSFER',
        amount: parseFloat(amount).toFixed(2),
        amountFormatted: new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency: 'NGN'
        }).format(amount),
        description: description || 'Transaction',
        status: 'COMPLETED'
      },

      charges: {
        emtl: {
          applicable: emtlApplicable,
          amount: parseFloat(emtlAmount || 0).toFixed(2),
          amountFormatted: new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN'
          }).format(emtlAmount || 0),
          reason: emtlReason || 'N/A',
          policy: 'CBN/FIRS EMTL Directive'
        }
      },

      totals: {
        principal: parseFloat(amount).toFixed(2),
        principalFormatted: new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency: 'NGN'
        }).format(amount),
        charges: parseFloat(emtlAmount || 0).toFixed(2),
        chargesFormatted: new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency: 'NGN'
        }).format(emtlAmount || 0),
        totalDebit: parseFloat(totalDebit || amount).toFixed(2),
        totalDebitFormatted: new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency: 'NGN'
        }).format(totalDebit || amount)
      },

      beneficiaryInfo: {
        name: beneficiaryName || 'N/A',
        accountNo: beneficiaryAccount || 'N/A',
        bank: 'Evolution Banking Solution'
      }
    };

    return receipt;
  }

  /**
   * Generate detailed receipt (HTML format)
   */
  static generateHTMLReceipt(transactionData) {
    const receipt = this.generateReceipt(transactionData);
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .receipt { max-width: 600px; margin: 0 auto; border: 1px solid #ddd; padding: 20px; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; }
          .title { font-size: 24px; font-weight: bold; color: #2c3e50; }
          .subtitle { color: #7f8c8d; }
          .section { margin: 20px 0; }
          .section-title { font-weight: bold; color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 10px; }
          .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f5f5f5; }
          .label { color: #7f8c8d; }
          .value { font-weight: bold; }
          .total { font-size: 18px; border-top: 2px solid #333; padding-top: 10px; margin-top: 10px; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #7f8c8d; font-size: 12px; }
          .emtl { background: #f8f9fa; padding: 10px; border-radius: 5px; margin: 10px 0; }
          .status { color: #27ae60; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <div class="title">EVOLUTION BANKING</div>
            <div class="subtitle">Transaction Receipt</div>
            <div>Ref: ${receipt.transactionReference}</div>
            <div>Date: ${receipt.date}</div>
          </div>

          <div class="section">
            <div class="section-title">Customer Details</div>
            <div class="row">
              <span class="label">Name</span>
              <span class="value">${receipt.customerInfo.name}</span>
            </div>
            <div class="row">
              <span class="label">Account Number</span>
              <span class="value">${receipt.customerInfo.accountNo}</span>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Transaction Details</div>
            <div class="row">
              <span class="label">Type</span>
              <span class="value">${receipt.transactionDetails.type}</span>
            </div>
            <div class="row">
              <span class="label">Amount</span>
              <span class="value">${receipt.transactionDetails.amountFormatted}</span>
            </div>
            <div class="row">
              <span class="label">Description</span>
              <span class="value">${receipt.transactionDetails.description}</span>
            </div>
            <div class="row">
              <span class="label">Status</span>
              <span class="value status">${receipt.transactionDetails.status}</span>
            </div>
          </div>

          ${receipt.charges.emtl.applicable ? `
          <div class="section emtl">
            <div class="section-title">EMTL Charges</div>
            <div class="row">
              <span class="label">EMTL Amount</span>
              <span class="value">${receipt.charges.emtl.amountFormatted}</span>
            </div>
            <div class="row">
              <span class="label">Policy</span>
              <span class="value">${receipt.charges.emtl.policy}</span>
            </div>
            <div class="row">
              <span class="label">Reason</span>
              <span class="value">${receipt.charges.emtl.reason}</span>
            </div>
          </div>
          ` : ''}

          <div class="section">
            <div class="section-title">Totals</div>
            <div class="row">
              <span class="label">Principal Amount</span>
              <span class="value">${receipt.totals.principalFormatted}</span>
            </div>
            ${receipt.charges.emtl.applicable ? `
            <div class="row">
              <span class="label">EMTL Charges</span>
              <span class="value">${receipt.totals.chargesFormatted}</span>
            </div>
            ` : ''}
            <div class="row total">
              <span class="label">Total Debit</span>
              <span class="value">${receipt.totals.totalDebitFormatted}</span>
            </div>
          </div>

          ${receipt.beneficiaryInfo.name !== 'N/A' ? `
          <div class="section">
            <div class="section-title">Beneficiary</div>
            <div class="row">
              <span class="label">Name</span>
              <span class="value">${receipt.beneficiaryInfo.name}</span>
            </div>
            <div class="row">
              <span class="label">Account Number</span>
              <span class="value">${receipt.beneficiaryInfo.accountNo}</span>
            </div>
          </div>
          ` : ''}

          <div class="footer">
            <div>This is a computer-generated receipt. No signature required.</div>
            <div>Thank you for banking with Evolution Banking Solution</div>
          </div>
        </div>
      </body>
      </html>
    `;

    return html;
  }

  /**
   * Generate SMS receipt
   */
  static generateSMSReceipt(transactionData) {
    const {
      customerName,
      accountNo,
      amount,
      emtlAmount,
      totalDebit,
      referenceNo
    } = transactionData;

    const formattedAmount = new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN'
    }).format(amount);

    const emtlText = emtlAmount > 0 
      ? ` (EMTL: ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(emtlAmount)})`
      : '';

    return `${customerName || 'Dear customer'}, ${formattedAmount} debited from ${accountNo}${emtlText}. Total debit: ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(totalDebit)}. Ref: ${referenceNo}. Thank you for banking with us.`;
  }

  /**
   * Generate JSON receipt (API response)
   */
  static generateJSONReceipt(transactionData) {
    return this.generateReceipt(transactionData);
  }
}

export default EMTLReceiptService;