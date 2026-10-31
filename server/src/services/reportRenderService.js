/**
 * reportRenderService.js — PDF, Excel, and CSV renderers.
 *
 * Each renderer accepts a { title, columns, rows, metadata } descriptor
 * and writes to a writable stream or returns a Buffer.
 *
 * Dependencies (already in package.json):
 *   pdfkit   ^0.20.2
 *   exceljs  ^4.4.0
 */

import fs            from 'fs';
import path          from 'path';
import { fileURLToPath } from 'url';
import PDFDocument   from 'pdfkit';
import ExcelJS       from 'exceljs';
import { logger }    from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Format a value for display: round numbers, format dates, handle null. */
const fmt = (v) => {
  if (v == null)          return '';
  if (v instanceof Date)  return v.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  const s = String(v);
  // Detect ISO date strings from PostgreSQL
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) {
    return s.slice(0, 19).replace('T', ' ');
  }
  return s;
};

/** Truncate a string for PDF cells. */
const trunc = (s, max = 28) => {
  const str = fmt(s);
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
};

// ─────────────────────────────────────────────────────────────────────────────
// PDF RENDERER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render a report as PDF and save to filePath.
 *
 * @param {object} opts
 * @param {string}   opts.title        Report title
 * @param {string}   opts.subtitle     Optional subtitle (date range etc.)
 * @param {object[]} opts.columns      [{ header, key, width? }]
 * @param {object[]} opts.rows         Data rows
 * @param {string}   opts.filePath     Absolute output path
 * @param {object}   [opts.summary]    Optional { key: value } summary table at top
 * @returns {Promise<number>}          File size in bytes
 */
export const renderPDF = async ({ title, subtitle = '', columns, rows, filePath, summary = null }) => {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // ── Cover / header ────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 70).fill('#1d4ed8');
    doc.fillColor('#fff').fontSize(18).font('Helvetica-Bold')
       .text('🏦 BankShield', 40, 18, { lineBreak: false });
    doc.fontSize(13).font('Helvetica')
       .text(title, 180, 22, { lineBreak: false });
    doc.fontSize(9).fillColor('#bfdbfe')
       .text(`Generated: ${new Date().toISOString().slice(0,19).replace('T',' ')} UTC`, 40, 52);
    if (subtitle) {
      doc.text(subtitle, 40, 62, { lineBreak: false });
    }
    doc.fillColor('#000');
    doc.y = 88;

    // ── Summary box (optional) ─────────────────────────────────────────────
    if (summary && Object.keys(summary).length) {
      doc.fontSize(10).font('Helvetica-Bold').text('Summary', { underline: true });
      doc.moveDown(0.3);
      const entries = Object.entries(summary);
      const colW    = (doc.page.width - 80) / Math.min(entries.length, 4);
      entries.forEach(([k, v], i) => {
        const x = 40 + (i % 4) * colW;
        const y = doc.y + Math.floor(i / 4) * 36;
        doc.rect(x, y, colW - 4, 32).stroke('#e5e7eb');
        doc.font('Helvetica').fontSize(8).fillColor('#6b7280')
           .text(k, x + 4, y + 4, { width: colW - 8 });
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827')
           .text(String(v), x + 4, y + 14, { width: colW - 8 });
      });
      doc.y += Math.ceil(entries.length / 4) * 36 + 10;
    }

    // ── Table ─────────────────────────────────────────────────────────────────
    const usableW  = doc.page.width - 80;
    const totalUnits = columns.reduce((s, c) => s + (c.width ?? 1), 0);
    const colWidths  = columns.map(c => (c.width ?? 1) / totalUnits * usableW);
    const rowH       = 16;
    const headerH    = 20;

    const drawHeader = (y) => {
      doc.rect(40, y, usableW, headerH).fill('#1e40af');
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8);
      columns.forEach((col, i) => {
        const x = 40 + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.text(col.header, x + 2, y + 5, { width: colWidths[i] - 4, lineBreak: false });
      });
      doc.fillColor('#000');
      return y + headerH;
    };

    let y = drawHeader(doc.y);

    rows.forEach((row, ri) => {
      // New page check
      if (y + rowH > doc.page.height - 50) {
        doc.addPage();
        y = drawHeader(50);
      }

      const bg = ri % 2 === 0 ? '#f8fafc' : '#ffffff';
      doc.rect(40, y, usableW, rowH).fill(bg).stroke('#e5e7eb');
      doc.fillColor('#111827').font('Helvetica').fontSize(7.5);

      columns.forEach((col, i) => {
        const x = 40 + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.text(trunc(row[col.key], Math.floor(colWidths[i] / 5.5)),
                 x + 2, y + 4, { width: colWidths[i] - 4, lineBreak: false });
      });
      y += rowH;
    });

    // Row count footer
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(8).fillColor('#6b7280')
       .text(`Total rows: ${rows.length}`, 40);

    doc.end();
    stream.on('finish', () => {
      const size = fs.statSync(filePath).size;
      logger.debug(`[report] PDF saved: ${filePath} (${size} bytes)`);
      resolve(size);
    });
    stream.on('error', reject);
    doc.on('error', reject);
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// EXCEL RENDERER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render a report as .xlsx and save to filePath.
 * @returns {Promise<number>} File size in bytes
 */
export const renderExcel = async ({ title, subtitle = '', columns, rows, filePath, summary = null }) => {
  const wb   = new ExcelJS.Workbook();
  wb.creator = 'BankShield';
  wb.created = new Date();

  const ws = wb.addWorksheet(title.slice(0, 31), {
    pageSetup: { fitToPage: true, orientation: 'landscape' },
  });

  // ── Title rows ────────────────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, columns.length);
  const titleCell = ws.getCell('A1');
  titleCell.value = `BankShield — ${title}`;
  titleCell.font  = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
  titleCell.alignment = { horizontal: 'center' };

  ws.mergeCells(2, 1, 2, columns.length);
  const subCell = ws.getCell('A2');
  subCell.value = subtitle || `Generated: ${new Date().toISOString().slice(0,19).replace('T',' ')} UTC`;
  subCell.font  = { italic: true, size: 9, color: { argb: 'FF6B7280' } };

  // ── Summary sheet ─────────────────────────────────────────────────────────
  if (summary && Object.keys(summary).length) {
    const sw = wb.addWorksheet('Summary');
    sw.columns = [{ header: 'Metric', key: 'k', width: 35 }, { header: 'Value', key: 'v', width: 25 }];
    sw.getRow(1).font = { bold: true };
    Object.entries(summary).forEach(([k, v]) => sw.addRow({ k, v: fmt(v) }));
  }

  // ── Column headers ────────────────────────────────────────────────────────
  const headerRow = ws.getRow(3);
  columns.forEach((col, i) => {
    const cell    = headerRow.getCell(i + 1);
    cell.value    = col.header;
    cell.font     = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    cell.alignment = { horizontal: 'center', wrapText: true };
    cell.border   = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
    ws.getColumn(i + 1).width = col.excelWidth ?? col.width * 8 ?? 15;
  });
  ws.getRow(3).height = 20;

  // ── Data rows ─────────────────────────────────────────────────────────────
  rows.forEach((row, ri) => {
    const wsRow = ws.addRow(columns.map(c => {
      const v = row[c.key];
      if (v == null) return '';
      if (typeof v === 'number') return v;
      if (v instanceof Date) return v;
      const s = String(v);
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) return new Date(s);
      const n = Number(v);
      return isNaN(n) ? s : n;
    }));
    if (ri % 2 === 0) {
      wsRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      });
    }
    wsRow.eachCell(cell => {
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
      cell.font   = { size: 9 };
    });
  });

  // Auto-filter on header row
  ws.autoFilter = {
    from: { row: 3, column: 1 },
    to  : { row: 3, column: columns.length },
  };

  await wb.xlsx.writeFile(filePath);
  const size = fs.statSync(filePath).size;
  logger.debug(`[report] Excel saved: ${filePath} (${size} bytes)`);
  return size;
};

// ─────────────────────────────────────────────────────────────────────────────
// CSV RENDERER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render a report as CSV and save to filePath.
 * @returns {Promise<number>} File size in bytes
 */
export const renderCSV = async ({ columns, rows, filePath }) => {
  const escape = (v) => {
    const s = fmt(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = columns.map(c => escape(c.header)).join(',');
  const lines  = rows.map(row =>
    columns.map(c => escape(row[c.key])).join(',')
  );

  // Prepend UTF-8 BOM (\uFEFF) so Excel and Windows Notepad correctly identify UTF-8 encoding
  const content = '\uFEFF' + [header, ...lines].join('\r\n');
  await fs.promises.writeFile(filePath, content, 'utf8');
  const size = fs.statSync(filePath).size;
  logger.debug(`[report] CSV saved: ${filePath} (${size} bytes)`);
  return size;
};
