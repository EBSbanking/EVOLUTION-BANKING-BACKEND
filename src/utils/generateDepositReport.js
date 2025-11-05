// utils/generateDepositReport.js
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function generateDepositReport(data) {
  const filename = `deposit_${Date.now()}.pdf`;
  const reportsDir = path.join(__dirname, '../reports');

  // Ensure the reports directory exists
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const filePath = path.join(reportsDir, filename);

  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(filePath));

  doc.fontSize(20).text('Deposit Report', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Report Generated: ${new Date().toLocaleString()}`);
  doc.moveDown();

  data.forEach((deposit, idx) => {
    doc.text(
      `${idx + 1}. Account: ${deposit.accountNo} | Amount: ${deposit.amount} | Date: ${deposit.date}`
    );
  });

  doc.end();

  return filePath;
}
