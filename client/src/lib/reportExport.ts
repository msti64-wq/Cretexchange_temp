import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { apiRequest } from "@/lib/queryClient";
import type { ReportColumn } from "@shared/reportColumns";
import type { ReportResponse } from "@shared/reportTypes";

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export async function downloadReportCsv(url: string, filename: string): Promise<void> {
  const response = await apiRequest(url, { method: "GET" });
  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(blobUrl);
}

export function downloadReportPdf(
  report: ReportResponse & { columns: ReportColumn[] },
  filename: string,
): void {
  const orientation = report.columns.length > 9 ? "landscape" : "portrait";
  const doc = new jsPDF({ orientation });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.text(`${report.reportType === "owner" ? "Owner" : "Driver"} Report`, 14, 16);

  doc.setFontSize(10);
  doc.text(`Generated: ${new Date(report.generatedAt).toLocaleString()}`, 14, 24);
  doc.text(`Date range: ${report.dateRange.label}`, 14, 30);

  const summaryLines = [
    `Washouts: ${report.summary.totalWashouts}`,
    `Charged: $${report.summary.totalAmountCharged}`,
    `Paid: $${report.summary.totalPaid}`,
    `Unpaid/Pending: $${report.summary.totalUnpaidPending}`,
  ];

  if (report.reportType === "driver") {
    summaryLines.push(`Tips: $${report.summary.totalTips}`);
    summaryLines.push(`Driver Payments: $${report.summary.totalDriverPayments}`);
  }

  summaryLines.forEach((line, index) => {
    doc.text(line, 14, 38 + index * 6);
  });

  autoTable(doc, {
    startY: 38 + summaryLines.length * 6 + 6,
    head: [report.columns.map((column) => column.label)],
    body: report.rows.map((row) => report.columns.map((column) => formatValue((row as any)[column.key]))),
    styles: {
      fontSize: 7,
      cellPadding: 2,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: 255,
    },
    margin: { left: 14, right: 14 },
  });

  doc.save(filename);
}
