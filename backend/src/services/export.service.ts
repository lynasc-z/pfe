import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import type { Readable } from 'stream';

// ─── CSV Helpers ──────────────────────────────────────────────────────────────

function escapeCsv(value: unknown): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(rows: unknown[][], headers: string[]): string {
  const lines: string[] = [headers.map(escapeCsv).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsv).join(','));
  }
  return lines.join('\r\n');
}

export function sendCsv(res: Response, filename: string, headers: string[], rows: unknown[][]): void {
  const csv = buildCsv(rows, headers);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

// ─── PDF Stats Report ─────────────────────────────────────────────────────────

export interface PDFStatsData {
  from?: string;
  to?: string;
  totalEmployees: number;
  totalRequests: number;
  statusCounts: Record<string, number>;
  departmentStats: Record<string, number>;
  typeStats: Record<string, number>;
  hrAgentStats: { fullName: string; totalReserved: number; inProgress: number; treated: number }[];
}

export function sendStatsPDF(res: Response, data: PDFStatsData): void {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="admin-stats-report.pdf"`);
  (doc as unknown as Readable).pipe(res);

  // Header bar
  doc.rect(0, 0, doc.page.width, 70).fill('#FF6B00');
  doc.fillColor('white').fontSize(20).font('Helvetica-Bold')
    .text('Sonatrach — Leave Management Report', 50, 22);
  doc.fontSize(10).font('Helvetica')
    .text(`Generated: ${new Date().toLocaleDateString()}`, 50, 48);

  doc.fillColor('#0A0A0A');

  // Date range
  let y = 90;
  if (data.from || data.to) {
    doc.fontSize(11).font('Helvetica')
      .text(`Period: ${data.from ?? '—'} to ${data.to ?? '—'}`, 50, y);
    y += 20;
  }

  // KPI row
  y += 10;
  doc.fontSize(13).font('Helvetica-Bold').text('Key Metrics', 50, y); y += 20;
  const kpis = [
    ['Total Employees', data.totalEmployees],
    ['Total Requests', data.totalRequests],
    ['Treated', data.statusCounts['treated'] ?? 0],
    ['Pending HR', data.statusCounts['pending_hr'] ?? 0],
    ['Rejected', data.statusCounts['rejected'] ?? 0],
  ];
  for (const [label, value] of kpis) {
    doc.fontSize(11).font('Helvetica-Bold').text(`${label}: `, 50, y, { continued: true });
    doc.font('Helvetica').text(String(value));
    y += 18;
  }

  // Department breakdown
  y += 12;
  doc.fontSize(13).font('Helvetica-Bold').text('Requests by Department', 50, y); y += 20;
  for (const [dept, count] of Object.entries(data.departmentStats)) {
    doc.fontSize(10).font('Helvetica').text(`  ${dept}: ${count}`, 50, y); y += 16;
    if (y > doc.page.height - 80) { doc.addPage(); y = 50; }
  }

  // Leave type breakdown
  y += 12;
  doc.fontSize(13).font('Helvetica-Bold').text('Requests by Leave Type', 50, y); y += 20;
  for (const [type, count] of Object.entries(data.typeStats)) {
    doc.fontSize(10).font('Helvetica').text(`  ${type}: ${count}`, 50, y); y += 16;
    if (y > doc.page.height - 80) { doc.addPage(); y = 50; }
  }

  // HR agent workload table
  if (data.hrAgentStats.length > 0) {
    if (y > doc.page.height - 120) { doc.addPage(); y = 50; }
    y += 12;
    doc.fontSize(13).font('Helvetica-Bold').text('HR Agent Workload', 50, y); y += 20;

    // Table header
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Name', 50, y);
    doc.text('Total', 270, y);
    doc.text('In Progress', 330, y);
    doc.text('Treated', 430, y);
    y += 14;
    doc.moveTo(50, y).lineTo(530, y).strokeColor('#DDDDDD').stroke(); y += 8;

    doc.font('Helvetica').fontSize(10);
    for (const agent of data.hrAgentStats) {
      doc.text(agent.fullName, 50, y, { width: 210 });
      doc.text(String(agent.totalReserved), 270, y);
      doc.text(String(agent.inProgress), 330, y);
      doc.text(String(agent.treated), 430, y);
      y += 16;
      if (y > doc.page.height - 60) { doc.addPage(); y = 50; }
    }
  }

  // Footer
  doc.fontSize(8).fillColor('#888888')
    .text('LeaveRec — Sonatrach HR System', 50, doc.page.height - 40, { align: 'center' });

  doc.end();
}
