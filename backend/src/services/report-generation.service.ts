import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export const generateExcelReport = async (data: any[], _options: any = {}): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report');

  // Add headers
  if (data.length > 0) {
    const headers = Object.keys(data[0]);
    worksheet.addRow(headers);
    data.forEach(row => {
      worksheet.addRow(Object.values(row));
    });
  }

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

export const generatePdfReport = async (data: any[], _options: any = {}): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Report', { align: 'center' });
    doc.moveDown();

    data.forEach((row, idx) => {
      doc.fontSize(10).text(`${idx + 1}. ${JSON.stringify(row)}`);
    });

    doc.end();
  });
};

// Utility to save report file
export const saveReportFile = async (filename: string, content: Buffer): Promise<string> => {
  const fs = await import('fs/promises');
  const path = await import('path');
  
  const reportsDir = path.join(__dirname, '../../reports');
  await fs.mkdir(reportsDir, { recursive: true });
  
  const filePath = path.join(reportsDir, filename);
  await fs.writeFile(filePath, content);
  
  return filePath;
};