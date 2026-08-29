import jsPDF from "jspdf";

type Lang = "fr" | "en";

const money = (v: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(Number(v) || 0);
const num = (v: number) => new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(Number(v) || 0);
const pct = (v: number | string) => (typeof v === "number" ? `${(v * 100).toFixed(1)} %` : String(v ?? "—"));
const bps = (v: number) => `${(Number(v) || 0).toFixed(1)}`;

const MARGIN = 36;

export function buildCommissionsPdf(opts: {
  lang: Lang;
  data: any;
  agent: string;
  aiSummary?: string;
}): jsPDF {
  const { lang, data, agent, aiSummary } = opts;
  const isFr = lang === "fr";
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = MARGIN;

  const ensure = (needed: number) => {
    if (y + needed > pageH - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const title = (t: string) => {
    ensure(28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20, 30, 50);
    doc.text(t, MARGIN, y);
    y += 14;
    doc.setDrawColor(210, 216, 226);
    doc.line(MARGIN, y, pageW - MARGIN, y);
    y += 10;
  };

  const paragraph = (t: string, size = 9) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(60, 68, 82);
    const lines = doc.splitTextToSize(t, pageW - MARGIN * 2);
    for (const line of lines) {
      ensure(size + 3);
      doc.text(line, MARGIN, y);
      y += size + 3;
    }
    y += 4;
  };

  const table = (head: string[], rows: (string | number)[][], widths?: number[]) => {
    const avail = pageW - MARGIN * 2;
    const w = widths ?? head.map(() => avail / head.length);
    const scale = avail / w.reduce((s, x) => s + x, 0);
    const cols = w.map((x) => x * scale);

    const drawHead = () => {
      ensure(22);
      doc.setFillColor(238, 242, 248);
      doc.rect(MARGIN, y - 10, avail, 16, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(70, 80, 96);
      let x = MARGIN + 4;
      head.forEach((h, i) => {
        const align = i === 0 ? "left" : "right";
        doc.text(String(h), align === "left" ? x : x + cols[i] - 8, y, { align: align as any });
        x += cols[i];
      });
      y += 12;
    };

    drawHead();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    rows.forEach((r, ri) => {
      if (y + 12 > pageH - MARGIN) {
        doc.addPage();
        y = MARGIN;
        drawHead();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
      }
      if (ri % 2) {
        doc.setFillColor(249, 250, 252);
        doc.rect(MARGIN, y - 8, avail, 12, "F");
      }
      doc.setTextColor(35, 42, 56);
      let x = MARGIN + 4;
      r.forEach((c, i) => {
        const align = i === 0 ? "left" : "right";
        const txt = String(c ?? "");
        const clipped = doc.splitTextToSize(txt, cols[i] - 8)[0] ?? "";
        doc.text(clipped, align === "left" ? x : x + cols[i] - 8, y, { align: align as any });
        x += cols[i];
      });
      y += 12;
    });
    y += 10;
  };

  // ---- Header ----
  doc.setFillColor(6, 13, 26);
  doc.rect(0, 0, pageW, 64, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(isFr ? "Rapport commissions — Planiprêt" : "Commissions report — Planiprêt", MARGIN, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(190, 205, 230);
  const sub = [
    `${isFr ? "Période" : "Period"} : ${data?.periodLabel ?? "—"}`,
    `${data?.window?.start ?? "?"} → ${data?.window?.end ?? "?"}`,
    agent ? `${isFr ? "Courtier" : "Broker"} : ${agent}` : isFr ? "Tous les courtiers" : "All brokers",
    `${isFr ? "Généré le" : "Generated" } ${new Date().toLocaleString(isFr ? "fr-CA" : "en-CA")}`,
  ].join("   ·   ");
  doc.text(sub, MARGIN, 48);
  y = 88;

  // ---- KPI ----
  const k = data?.kpi?.ytd ?? {};
  const kp = data?.kpi?.ytdPy ?? {};
  const delta = (a: number, b: number) => (b ? `${(((a - b) / b) * 100).toFixed(1)} %` : "—");
  title(isFr ? "Indicateurs clés" : "Key indicators");
  table(
    [isFr ? "Indicateur" : "Indicator", isFr ? "Période" : "Period", "N-1", isFr ? "Variation" : "Change"],
    [
      [isFr ? "Volume" : "Volume", money(k.volume), money(kp.volume), delta(k.volume, kp.volume)],
      [isFr ? "Dossiers" : "Deals", num(k.deals), num(kp.deals), delta(k.deals, kp.deals)],
      ["Commissions", money(k.commission), money(kp.commission), delta(k.commission, kp.commission)],
      [isFr ? "Dossier moyen" : "Avg deal", money(k.avgDeal), money(kp.avgDeal), delta(k.avgDeal, kp.avgDeal)],
      ["BPS", bps(k.bps), bps(kp.bps), delta(k.bps, kp.bps)],
      [isFr ? "Commission / dossier" : "Commission / deal", money(k.commissionPerDeal), money(kp.commissionPerDeal), delta(k.commissionPerDeal, kp.commissionPerDeal)],
      [isFr ? "Prêteurs actifs" : "Active lenders", num(data?.kpi?.activeLenders ?? 0), "—", "—"],
      [isFr ? "Courtiers actifs" : "Active brokers", num(data?.kpi?.activeBrokers ?? 0), "—", "—"],
    ],
    [200, 110, 110, 90],
  );

  // ---- Brokers ----
  const brokers: any[] = data?.brokers ?? [];
  if (brokers.length) {
    title(isFr ? "Classement des courtiers" : "Broker ranking");
    table(
      ["#", isFr ? "Courtier" : "Broker", "Maestro ID", "Volume", isFr ? "Doss." : "Deals", "Commission", "BPS", "YoY vol."],
      brokers.slice(0, 60).map((b) => [
        b.rank,
        [b.firstName, b.lastName].filter(Boolean).join(" ") || b.broker,
        b.maestroBrokerId ?? "—",
        money(b.volume),
        num(b.deals),
        money(b.commission),
        bps(b.bps),
        pct(b.volumeYoy),
      ]),
      [26, 150, 80, 90, 46, 90, 44, 60],
    );
  }

  // ---- Lenders ----
  const lenders: any[] = data?.lenders ?? [];
  if (lenders.length) {
    title(isFr ? "Prêteurs" : "Lenders");
    table(
      ["#", isFr ? "Prêteur" : "Lender", "Volume", isFr ? "Doss." : "Deals", "Commission", "BPS", "% vol.", "YoY vol."],
      lenders.slice(0, 40).map((l) => [
        l.rank, l.key, money(l.cyVolume), num(l.cyDeals), money(l.cyCommission), bps(l.cyBps), pct(l.sharePct), pct(l.volumeYoy),
      ]),
      [26, 150, 90, 46, 90, 44, 55, 60],
    );
  }

  // ---- Product & term mix ----
  const products: any[] = data?.products ?? [];
  const terms: any[] = data?.terms ?? [];
  if (products.length || terms.length) {
    title(isFr ? "Mix produits et termes" : "Product & term mix");
    if (products.length) {
      table(
        [isFr ? "Type de prêt" : "Mortgage type", "Volume", isFr ? "Doss." : "Deals", "Commission", "% vol."],
        products.slice(0, 25).map((p) => [p.key, money(p.cyVolume), num(p.cyDeals), money(p.cyCommission), pct(p.sharePct)]),
        [200, 110, 60, 110, 60],
      );
    }
    if (terms.length) {
      table(
        [isFr ? "Terme" : "Term", "Volume", isFr ? "Doss." : "Deals", "Commission", "% vol."],
        terms.slice(0, 25).map((t) => [t.key, money(t.cyVolume), num(t.cyDeals), money(t.cyCommission), pct(t.sharePct)]),
        [200, 110, 60, 110, 60],
      );
    }
  }

  // ---- Reconciliation ----
  const checks: any[] = data?.reconciliation?.checks ?? [];
  if (checks.length) {
    title(isFr ? "Contrôles de réconciliation" : "Reconciliation checks");
    table(
      [isFr ? "Contrôle" : "Check", isFr ? "Attendu" : "Expected", isFr ? "Obtenu" : "Actual", isFr ? "Écart" : "Delta", isFr ? "Statut" : "Status"],
      checks.map((c) => {
        const isDeals = String(c.key).toLowerCase().includes("deals");
        const f = isDeals ? num : money;
        return [c.label, f(c.expected), f(c.actual), f(c.delta), c.status];
      }),
      [230, 90, 90, 80, 60],
    );
  }

  // ---- Discrepancies summary ----
  const disc = data?.discrepancies;
  if (disc?.total) {
    title(isFr ? "Écarts source vs affiché" : "Source vs displayed gaps");
    table(
      [isFr ? "Type d'écart" : "Gap type", isFr ? "Lignes" : "Rows"],
      Object.entries(disc.counts ?? {}).map(([k2, v]) => [String(k2).replace(/_/g, " "), num(Number(v))]),
      [320, 100],
    );
  }

  // ---- Calculation notes ----
  const notes: string[] = data?.calcNotes ?? [];
  if (notes.length) {
    title(isFr ? "Notes de calcul" : "Calculation notes");
    notes.forEach((n2) => paragraph(`• ${n2}`, 8));
  }

  // ---- AI summary ----
  if (aiSummary) {
    title(isFr ? "Synthèse IA" : "AI summary");
    paragraph(aiSummary, 9);
  }

  // ---- Footer page numbers ----
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(140, 148, 162);
    doc.text(`${p} / ${pages}`, pageW - MARGIN, pageH - 18, { align: "right" });
    doc.text(isFr ? "Planiprêt — rapport interne confidentiel" : "Planiprêt — confidential internal report", MARGIN, pageH - 18);
  }

  return doc;
}

export function downloadCommissionsPdf(opts: {
  lang: Lang;
  data: any;
  agent: string;
  aiSummary?: string;
  year: number;
}) {
  const doc = buildCommissionsPdf(opts);
  const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  const parts = ["commissions", String(opts.year), slug(opts.data?.periodLabel ?? ""), opts.agent ? slug(opts.agent) : ""].filter(Boolean);
  doc.save(`${parts.join("-")}.pdf`);
}
