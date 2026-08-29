/**
 * Planiprêt — export of commission visuals (PNG per chart, PDF recap).
 * html2canvas + jsPDF are loaded lazily so they never weigh on first paint.
 */

function slug(s: string) {
  return (s || "export")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "export";
}

function bgColor(node: HTMLElement): string {
  const scope = node.closest<HTMLElement>(".planipret-admin-scope, .planipret-scope") ?? document.body;
  const v = getComputedStyle(scope).getPropertyValue("--pp-bg-base").trim();
  return v || "#ffffff";
}

async function capture(node: HTMLElement, scale = 2): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import("html2canvas");
  return html2canvas(node, {
    backgroundColor: bgColor(node),
    scale: Math.min(scale, window.devicePixelRatio > 1 ? 2 : 1.6),
    useCORS: true,
    logging: false,
    ignoreElements: (el: Element) => (el as HTMLElement).classList?.contains("pp-hide-export"),
    windowWidth: node.scrollWidth,
  });
}

/** Export a single DOM node (chart card, KPI row…) as a PNG download. */
export async function exportNodePng(node: HTMLElement | null, filename: string) {
  if (!node) return;
  const canvas = await capture(node);
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(filename)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export type PdfMeta = {
  title: string;
  subtitle?: string;
  periodLabel?: string;
  lang?: "fr" | "en";
};

/**
 * Build a visual PDF recap: every `[data-pp-export-block]` inside `root`
 * (KPI hero, charts, tables) is rasterised and laid out over A4 landscape pages.
 */
export async function exportDashboardPdf(root: HTMLElement | null, meta: PdfMeta) {
  if (!root) return;
  const { default: jsPDF } = await import("jspdf");
  const isFr = (meta.lang ?? "fr") === "fr";

  const blocks = Array.from(root.querySelectorAll<HTMLElement>("[data-pp-export-block]"))
    .filter((el) => el.offsetParent !== null && el.clientHeight > 40);

  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const M = 32;

  // Cover header
  pdf.setFillColor(15, 27, 61);
  pdf.rect(0, 0, pw, 92, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text(meta.title, M, 44);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  if (meta.subtitle) pdf.text(meta.subtitle, M, 64);
  if (meta.periodLabel) pdf.text(meta.periodLabel, M, 80);
  pdf.setFontSize(9);
  pdf.text(
    `${isFr ? "Généré le" : "Generated"} ${new Date().toLocaleString(isFr ? "fr-CA" : "en-CA", { timeZone: "America/Toronto" })}`,
    pw - M, 80, { align: "right" },
  );

  let y = 92 + 20;

  for (const block of blocks) {
    const canvas = await capture(block, 1.6);
    const maxW = pw - M * 2;
    const imgW = maxW;
    const imgH = (canvas.height / canvas.width) * imgW;

    if (y + imgH > ph - M) {
      pdf.addPage();
      y = M;
    }
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", M, y, imgW, Math.min(imgH, ph - M - y));
    y += Math.min(imgH, ph - M - y) + 16;
  }

  // Footer page numbers
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(120, 132, 150);
    pdf.text(`${meta.title} — ${i}/${total}`, pw / 2, ph - 14, { align: "center" });
  }

  pdf.save(`${slug(meta.title)}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
