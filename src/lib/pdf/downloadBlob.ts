/**
 * Force a real file download (no browser print dialog) by using a Blob URL
 * and a synthetic <a download> click. Works reliably across Chrome & Safari
 * (including iOS Safari) where `jsPDF#save()` can otherwise fall back to
 * opening the PDF in a viewer / print preview.
 */
export function downloadPdfBlob(blob: Blob, filename: string): void {
  if (!(blob instanceof Blob)) {
    throw new Error("downloadPdfBlob: expected a Blob");
  }
  if (!filename || typeof filename !== "string") {
    throw new Error("downloadPdfBlob: filename required");
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  // Hide from layout in case it lingers
  a.style.position = "fixed";
  a.style.left = "-9999px";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
