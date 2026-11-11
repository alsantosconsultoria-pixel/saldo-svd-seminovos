import { Fragment, useRef } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmt, fmtData } from "@/lib/extrato/store";
import type { DiaFluxo } from "@/lib/fluxo";
import type { LinhaPlano } from "@/lib/plano";

const n = (v: number) => (v ? fmt(v).replace("R$", "").trim() : "—");

export function FluxoPlano({ linhas, periodo, abertos, setAbertos, semSaldo = false, marcados, onComposicao }: { linhas: LinhaPlano[]; periodo: DiaFluxo[]; semSaldo?: boolean; abertos: Set<string>; setAbertos: (s: Set<string>) => void; marcados?: Map<string, number> | undefined; onComposicao?: ((id: string, rotulo: string) => void) | undefined }) {
  const rolo = useRef<HTMLDivElement>(null);
  const rolar = (d: number) => rolo.current?.scrollBy({ left: d * Math.max(240, (rolo.current.clientWidth || 600) * 0.7), behavior: "smooth" });
  const alternar = (id: string) => { const s = new Set(abertos); if (s.has(id)) s.delete(id); else s.add(id); setAbertos(s); };
  const todos = linhas.flatMap((g) => [g.id, ...g.filhos.map((f) => f.id)]);
  const cel = "num whitespace-nowrap border-l px-3 py-1.5 text-right";
  const rot = "sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-1.5 text-left";
  const Linha = ({ l, nivel }: { l: LinhaPlano; nivel: number }) => {
    const pode = l.filhos.length > 0, aberto = abertos.has(l.id);
    const cor = l.id.startsWith("credito") ? "text-credit" : "text-debit";
    return <>
      <tr className={`border-b ${nivel === 0 ? "bg-muted/40 font-semibold" : nivel === 2 ? "text-muted-foreground" : ""}`}>
        <td className={rot + (nivel === 0 ? " bg-muted" : "")} style={{ paddingLeft: 12 + nivel * 18 }}>
          {pode ? <button type="button" className="inline-flex items-center gap-1 hover:opacity-70" onClick={() => alternar(l.id)}>{aberto ? <ChevronDown className="size-3.5 print:hidden" /> : <ChevronRight className="size-3.5 print:hidden" />}{l.rotulo}</button> : l.rotulo}
        </td>
        {l.valores.map((v, i) => <td key={i} className={`${cel} ${v ? cor : ""}`}>{n(v)}</td>)}
        <td className={`${cel} font-semibold ${cor}`}>{marcados && nivel === 2 && marcados.get(l.id) ? <button type="button" title="Ver composição com marcador" className="inline-flex items-center gap-1.5 underline decoration-dotted underline-offset-4 hover:opacity-70" onClick={() => onComposicao?.(l.id, l.rotulo)}><span className="inline-flex items-center gap-0.5 rounded-full bg-accent/40 px-1.5 py-0.5 font-sans text-[10px] font-medium text-accent-foreground no-underline"><Tag className="size-2.5" />{marcados.get(l.id)}</span>{n(l.total)}</button> : n(l.total)}</td>
      </tr>
      {pode && aberto && l.filhos.map((f) => <Linha key={f.id} l={f} nivel={nivel + 1} />)}
    </>;
  };
  const [rec, pag] = linhas;
  return <div className="space-y-2">
    <div className="flex justify-end gap-2 print:hidden">
      <Button size="sm" variant="ghost" onClick={() => setAbertos(new Set(todos))}>Abrir todas as linhas</Button>
      <Button size="sm" variant="ghost" onClick={() => setAbertos(new Set())}>Fechar todas</Button>
    </div>
    <div className="relative"><button type="button" aria-label="Recuar" onClick={() => rolar(-1)} className="absolute inset-y-0 left-0 z-20 flex w-7 items-center justify-center border-r bg-card/90 text-muted-foreground hover:bg-muted hover:text-foreground print:hidden"><ChevronLeft className="size-4" /></button><button type="button" aria-label="Avançar" onClick={() => rolar(1)} className="absolute inset-y-0 right-0 z-20 flex w-7 items-center justify-center border-l bg-card/90 text-muted-foreground hover:bg-muted hover:text-foreground print:hidden"><ChevronRight className="size-4" /></button><div ref={rolo} className="overflow-x-auto px-7 print:px-0"><table className="w-full border-collapse text-sm">
      <thead><tr className="border-b-2 border-primary"><th className={rot + " bg-card font-semibold"}>Plano financeiro</th>{periodo.map((d) => <th key={d.data} className={cel + " font-semibold"}>{fmtData(d.data).slice(0, 5)}</th>)}<th className={cel + " font-semibold"}>Total</th></tr></thead>
      <tbody>
        {!semSaldo && <tr className="border-b"><td className={rot + " font-medium"}>Saldo inicial</td>{periodo.map((d) => <td key={d.data} className={`${cel} ${d.inicial < 0 ? "text-debit" : ""}`}>{n(d.inicial)}</td>)}<td className={cel} /></tr>}
        {linhas.map((l) => <Fragment key={l.id}><Linha l={l} nivel={0} /></Fragment>)}
        <tr className="border-b"><td className={rot + " font-medium"}>Resultado do dia</td>{periodo.map((d, i) => { const v = (rec?.valores[i] ?? 0) - (pag?.valores[i] ?? 0); return <td key={d.data} className={`${cel} ${v < 0 ? "text-debit" : ""}`}>{n(v)}</td>; })}<td className={cel}>{n((rec?.total ?? 0) - (pag?.total ?? 0))}</td></tr>
        {!semSaldo && <tr className="border-t-2 border-foreground/30 bg-muted/30 font-semibold"><td className={rot + " bg-muted"}>Saldo previsto</td>{periodo.map((d) => <td key={d.data} className={`${cel} ${d.final < 0 ? "bg-destructive/10 text-debit" : ""}`}>{n(d.final)}</td>)}<td className={cel} /></tr>}
      </tbody>
    </table></div></div>
  </div>;
}

// Planilha Excel no mesmo layout (linhas abertas/fechadas como na tela).
export function baixarExcelPlano(linhas: LinhaPlano[], periodo: DiaFluxo[], abertos: Set<string>, titulo: string) {
  const v = (x: number) => (x ? x.toFixed(2).replace(".", ",") : "");
  const td = (x: string | number, st = "") => `<td style="border:1px solid #d6d9de;padding:4px 8px;${typeof x === "number" ? "mso-number-format:'#,##0.00';text-align:right;" : ""}${st}">${typeof x === "number" ? v(x) : x}</td>`;
  const rows: string[] = [];
  const linha = (l: LinhaPlano, nivel: number) => {
    const cor = l.id.startsWith("credito") ? "#15803d" : "#b91c1c";
    const fundo = nivel === 0 ? "background:#eef1f5;font-weight:bold;" : "";
    rows.push(`<tr>${td("&nbsp;".repeat(nivel * 4) + l.rotulo, fundo)}${l.valores.map((x) => td(x, fundo + `color:${cor};`)).join("")}${td(l.total, fundo + `color:${cor};font-weight:bold;`)}</tr>`);
    if (abertos.has(l.id)) l.filhos.forEach((f) => linha(f, nivel + 1));
  };
  rows.push(`<tr>${td("Saldo inicial", "font-weight:bold;")}${periodo.map((d) => td(d.inicial)).join("")}${td("")}</tr>`);
  linhas.forEach((l) => linha(l, 0));
  const [r, p] = linhas;
  rows.push(`<tr>${td("Resultado do dia", "font-weight:bold;")}${periodo.map((_, i) => td((r?.valores[i] ?? 0) - (p?.valores[i] ?? 0))).join("")}${td((r?.total ?? 0) - (p?.total ?? 0))}</tr>`);
  rows.push(`<tr>${td("Saldo previsto", "font-weight:bold;background:#e2e8f0;")}${periodo.map((d) => td(d.final, `font-weight:bold;background:#e2e8f0;${d.final < 0 ? "color:#b91c1c;" : ""}`)).join("")}${td("", "background:#e2e8f0;")}</tr>`);
  const head = `<tr>${td("Plano financeiro", "background:#1e3a5f;color:#fff;font-weight:bold;")}${periodo.map((d) => td(fmtData(d.data), "background:#1e3a5f;color:#fff;font-weight:bold;text-align:right;")).join("")}${td("Total", "background:#1e3a5f;color:#fff;font-weight:bold;text-align:right;")}</tr>`;
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body style="font-family:Calibri,Arial"><table><tr><td colspan="${periodo.length + 2}" style="font-size:11px;color:#64748b;letter-spacing:2px">FINANCEIRO SVD SEMINOVOS · GRUPO SVD</td></tr><tr><td colspan="${periodo.length + 2}" style="font-size:18px;font-weight:bold">${titulo}</td></tr><tr></tr>${head}${rows.join("")}<tr></tr><tr><td colspan="${periodo.length + 2}" style="font-size:10px;color:#64748b">Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td></tr></table></body></html>`;
  const blob = new Blob(["\ufeff" + html], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `fluxo-${periodo[0]?.data ?? ""}-a-${periodo.at(-1)?.data ?? ""}.xls`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
