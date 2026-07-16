import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface PDFExportOptions {
  title?: string;
  filename?: string;
  orientation?: 'portrait' | 'landscape';
  margin?: number;
}

export const exportToPDF = async (
  elementId: string,
  options: PDFExportOptions = {}
): Promise<void> => {
  const {
    title = 'Export',
    filename = 'export.pdf',
    orientation = 'portrait',
    margin = 10,
  } = options;

  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`);
  }

  // Create canvas from element
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth - (margin * 2);
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  // Add title
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text(title, margin, margin + 5);

  // Add date
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, margin, margin + 12);

  // Add image
  let yPosition = margin + 20;
  let remainingHeight = imgHeight;

  // First page
  const firstPageImgHeight = Math.min(remainingHeight, pageHeight - yPosition - margin);
  pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);

  // Additional pages if needed
  if (imgHeight > pageHeight - yPosition - margin) {
    let currentY = pageHeight - yPosition - margin;
    while (currentY < imgHeight) {
      pdf.addPage();
      pdf.addImage(
        imgData,
        'PNG',
        margin,
        margin - currentY,
        imgWidth,
        imgHeight
      );
      currentY += pageHeight - (margin * 2);
    }
  }

  pdf.save(filename);
};

export const exportTableToPDF = async (
  data: Record<string, any>[],
  columns: { key: string; label: string }[],
  options: PDFExportOptions = {}
): Promise<void> => {
  const {
    title = 'Export',
    filename = 'export.pdf',
    orientation = 'landscape',
    margin = 10,
  } = options;

  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const colWidth = (pageWidth - (margin * 2)) / columns.length;

  // Add title
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text(title, margin, margin + 5);

  // Add date
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, margin, margin + 12);

  // Add table headers
  let yPosition = margin + 25;
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setFillColor(240, 240, 240);
  pdf.rect(margin, yPosition - 4, pageWidth - (margin * 2), 8, 'F');
  
  columns.forEach((col, index) => {
    pdf.text(col.label, margin + (index * colWidth) + 2, yPosition);
  });

  // Add table rows
  yPosition += 10;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);

  data.forEach((row, rowIndex) => {
    if (yPosition > pageHeight - margin) {
      pdf.addPage();
      yPosition = margin + 10;
    }

    // Alternate row background
    if (rowIndex % 2 === 0) {
      pdf.setFillColor(250, 250, 250);
      pdf.rect(margin, yPosition - 4, pageWidth - (margin * 2), 7, 'F');
    }

    columns.forEach((col, colIndex) => {
      const value = String(row[col.key] || '');
      const truncated = value.length > 30 ? value.substring(0, 27) + '...' : value;
      pdf.text(truncated, margin + (colIndex * colWidth) + 2, yPosition);
    });

    yPosition += 7;
  });

  pdf.save(filename);
};

export const exportMetricsToPDF = async (
  metrics: Record<string, string | number>,
  options: PDFExportOptions = {}
): Promise<void> => {
  const {
    title = 'Rapport Analytics',
    filename = 'analytics-report.pdf',
    margin = 15,
  } = options;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();

  // Add title
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.text(title, margin, margin + 10);

  // Add date
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 100, 100);
  pdf.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, margin, margin + 18);

  // Add metrics
  let yPosition = margin + 35;
  pdf.setTextColor(0, 0, 0);

  Object.entries(metrics).forEach(([key, value]) => {
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text(key, margin, yPosition);
    
    pdf.setFont('helvetica', 'normal');
    pdf.text(String(value), pageWidth - margin - 30, yPosition);
    
    yPosition += 12;
  });

  pdf.save(filename);
};
