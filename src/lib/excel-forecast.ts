import type { DiaFluxo } from "@/lib/fluxo";
import type { LinhaPlano } from "@/lib/plano";

const br = (d: string) => d.split("-").reverse().join("/");

// Desenha a curva do saldo (realizado cheio, projetado tracejado) num PNG para embutir no Excel.
function curvaPng(periodo: DiaFluxo[], corte?: string): string {
  const W = 1100, H = 380, m = { l: 80, r: 20, t: 30, b: 50 };
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H);
  const vals = periodo.map((d) => d.final);
  let min = Math.min(0, ...vals), max = Math.max(0, ...vals); if (max === min) max = min + 1;
  const x = (i: number) => m.l + (periodo.length < 2 ? 0 : (i * (W - m.l - m.r)) / (periodo.length - 1));
  const y = (v: number) => m.t + ((max - v) * (H - m.t - m.b)) / (max - min);
  g.font = "12px Arial"; g.fillStyle = "#64748b"; g.strokeStyle = "#e2e8f0";
  for (let k = 0; k <= 5; k++) { const v = min + ((max - min) * k) / 5; g.beginPath(); g.moveTo(m.l, y(v)); g.lineTo(W - m.r, y(v)); g.stroke(); g.textAlign = "right"; g.fillText(`${(v / 1000).toFixed(0)}k`, m.l - 8, y(v) + 4); }
  const passo = Math.max(1, Math.ceil(periodo.length / 15)); g.textAlign = "center";
  periodo.forEach((d, i) => { if (i % passo === 0) g.fillText(br(d.data).slice(0, 5), x(i), H - m.b + 18); });
  g.strokeStyle = "#dc2626"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(m.l, y(0)); g.lineTo(W - m.r, y(0)); g.stroke();
  const tracar = (de: number, ate: number, cor: string, tracejado: boolean) => {
    if (ate < de) return; g.strokeStyle = cor; g.lineWidth = 2.5; g.setLineDash(tracejado ? [8, 5] : []); g.beginPath();
    for (let i = de; i <= ate; i++) { const p = periodo[i]!; if (i === de) g.moveTo(x(i), y(p.final)); else g.lineTo(x(i), y(p.final)); }
    g.stroke(); g.lineWidth = 1;
  };
  const ultReal = corte ? periodo.reduce((a, d, i) => (d.data <= corte ? i : a), -1) : -1;
  if (corte) { tracar(0, ultReal, "#0f766e", false); tracar(Math.max(0, ultReal), periodo.length - 1, "#1e3a5f", true); }
  else tracar(0, periodo.length - 1, "#1e3a5f", false);
  g.setLineDash([]); g.textAlign = "left"; g.font = "bold 14px Arial"; g.fillStyle = "#0f172a";
  g.fillText("Curva do saldo" + (corte ? "  —  realizado (linha cheia) · projetado (tracejada)" : ""), m.l, 18);
  return c.toDataURL("image/png").split(",")[1]!;
}

export interface OpcoesExcel { titulo: string; subtitulo?: string; corte?: string; kpis?: { t: string; v: number }[]; semSaldo?: boolean; arquivo: string }

export async function baixarExcelForecast(linhas: LinhaPlano[], periodo: DiaFluxo[], abertos: Set<string>, o: OpcoesExcel) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Forecast", { views: [{ state: "frozen", xSplit: 1, showGridLines: false }] });
  const nc = periodo.length + 2, moeda = '#,##0.00;[Red]-#,##0.00;"—"';
  const fonte = { name: "Arial", size: 10 };
  ws.getColumn(1).width = 38; for (let i = 2; i <= nc; i++) ws.getColumn(i).width = 14;
  const add = (vals: (string | number | null)[]) => ws.addRow(vals);
  let r = add(["FINANCEIRO SVD SEMINOVOS · GRUPO SVD"]); r.font = { ...fonte, size: 9, color: { argb: "FF64748B" } };
  r = add([o.titulo]); r.font = { ...fonte, size: 16, bold: true };
  if (o.subtitulo) { r = add([o.subtitulo]); r.font = { ...fonte, color: { argb: "FF64748B" } }; }
  add([]);
  if (o.kpis?.length) {
    r = add(o.kpis.map((k) => k.t)); r.font = { ...fonte, size: 9, bold: true, color: { argb: "FF64748B" } };
    r = add(o.kpis.map((k) => k.v)); r.font = { ...fonte, size: 12, bold: true }; r.numFmt = moeda;
    r.eachCell((c, i) => { if (i === o.kpis!.length) { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } }; c.font = { ...fonte, size: 12, bold: true, color: { argb: "FFFFFFFF" } }; } });
    add([]);
  }
  const topo = ws.rowCount + 1;
  for (let i = 0; i < 20; i++) add([]);
  ws.addImage(wb.addImage({ base64: curvaPng(periodo, o.corte), extension: "png" }), { tl: { col: 0, row: topo - 1 }, ext: { width: 1100, height: 380 } });
  const azul = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF1E3A5F" } };
  r = add(["Plano financeiro", ...periodo.map((d) => br(d.data)), "Total"]);
  r.eachCell((c) => { c.fill = azul; c.font = { ...fonte, bold: true, color: { argb: "FFFFFFFF" } }; c.alignment = { horizontal: "center" }; });
  if (o.corte) { r = add(["", ...periodo.map((d) => (d.data > o.corte! ? "Projetado" : "Realizado")), ""]); r.font = { ...fonte, size: 8, italic: true, color: { argb: "FF64748B" } }; r.alignment = { horizontal: "center" }; }
  const borda = { style: "thin" as const, color: { argb: "FFD6D9DE" } };
  const estilo = (row: ReturnType<typeof add>, extra: (c: any, i: number) => void = () => {}) => row.eachCell({ includeEmpty: true }, (c, i) => { c.border = { top: borda, bottom: borda, left: borda, right: borda }; if (i > 1) c.numFmt = moeda; c.font = { ...fonte, ...(c.font ?? {}) }; extra(c, i); });
  const proj = (i: number) => !!o.corte && (periodo[i - 2]?.data ?? "") > o.corte;
  const fundoProj = (c: any, i: number) => { if (proj(i) && !c.fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }; };
  if (!o.semSaldo) estilo(r = add(["Saldo inicial", ...periodo.map((d) => d.inicial), null]), (c, i) => { if (i === 1) c.font = { ...fonte, bold: true }; fundoProj(c, i); });
  const linha = (l: LinhaPlano, nivel: number) => {
    const cor = l.id.startsWith("credito") ? "FF15803D" : "FFB91C1C";
    const row = add([" ".repeat(nivel * 4) + l.rotulo, ...l.valores, l.total]);
    if (l.filhos.length && !abertos.has(l.id)) { /* fechada */ }
    estilo(row, (c, i) => {
      c.font = { ...fonte, bold: nivel === 0 || i === nc, color: { argb: i === 1 ? (nivel === 2 ? "FF64748B" : "FF0F172A") : cor } };
      if (nivel === 0) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF1F5" } }; else fundoProj(c, i);
    });
    if (abertos.has(l.id)) l.filhos.forEach((f) => linha(f, nivel + 1));
  };
  linhas.forEach((l) => linha(l, 0));
  const [rc, pg] = linhas;
  estilo(add(["Resultado do dia", ...periodo.map((_, i) => (rc?.valores[i] ?? 0) - (pg?.valores[i] ?? 0)), (rc?.total ?? 0) - (pg?.total ?? 0)]), (c, i) => { if (i === 1) c.font = { ...fonte, bold: true }; fundoProj(c, i); });
  if (!o.semSaldo) estilo(add([o.corte ? "Saldo (realizado / projetado)" : "Saldo previsto", ...periodo.map((d) => d.final), null]), (c) => { c.font = { ...fonte, bold: true, color: { argb: typeof c.value === "number" && c.value < 0 ? "FFB91C1C" : "FF0F172A" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } }; });
  add([]);
  r = add([`Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`]); r.font = { ...fonte, size: 9, color: { argb: "FF64748B" } };
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a"); a.href = url; a.download = o.arquivo; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
