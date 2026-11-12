import { useState } from "react";
import { FileSpreadsheet, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { baixarExcelForecast } from "@/lib/excel-forecast";
import { Area, ComposedChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type Extrato } from "@/lib/extrato/parser";
import { saldoNaData, ultimoSaldoExtrato } from "@/lib/tratativas";
import { fmt, fmtData } from "@/lib/extrato/store";
import type { DiaFluxo } from "@/lib/fluxo";
import type { LinhaPlano } from "@/lib/plano";
import { FluxoPlano } from "@/components/FluxoPlano";
import { ResumoPlano } from "@/components/ResumoPlano";

interface Props {
  contas: Extrato[]; periodo: DiaFluxo[]; corte: string; linhas: LinhaPlano[];
  saldoIni: number; realE: number; realS: number; projE: number; projS: number;
  maiores: LinhaPlano[]; onCategoria: (id: string, rotulo: string) => void;
}

// Relatório gerencial em formato de forecast: realizado até o corte e projeção depois, por conta financeira.
export function RelatorioPainel({ contas, periodo, corte, linhas, saldoIni, realE, realS, projE, projS, maiores, onCategoria }: Props) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const inicio = periodo[0]?.data, fim = periodo.at(-1)?.data;
  const final = periodo.at(-1)?.final ?? saldoIni;
  const menor = periodo.reduce<DiaFluxo | undefined>((m, d) => (!m || d.final < m.final ? d : m), undefined);
  const dados = periodo.map((d) => ({ dia: fmtData(d.data).slice(0, 5), real: d.data <= corte ? d.final : null, proj: d.data >= corte || !periodo.some((x) => x.data <= corte) ? d.final : null }));
  const temProj = periodo.some((d) => d.data > corte);
  const kpis = [
    { t: "Saldo inicial", v: saldoIni, d: inicio && fmtData(inicio) },
    { t: "Entradas realizadas", v: realE, c: "text-credit" },
    { t: "Saídas realizadas", v: -realS, c: "text-debit" },
    { t: "Entradas projetadas", v: projE, c: "text-credit" },
    { t: "Saídas projetadas", v: -projS, c: "text-debit" },
    { t: temProj ? "Saldo projetado" : "Saldo final", v: final, d: fim && fmtData(fim), destaque: true },
  ];
  return <article className="treasury-report bg-card text-card-foreground">
    <div className="mb-4 flex justify-end print:hidden"><Button variant="outline" size="sm" disabled={!periodo.length} onClick={() => void baixarExcelForecast(linhas, periodo, abertos, { titulo: "Demonstrativo gerencial · Forecast", subtitulo: `Período ${inicio ? fmtData(inicio) : ""} a ${fim ? fmtData(fim) : ""} · realizado até ${fmtData(corte)} · ${contas.length} contas bancárias`, corte, kpis: kpis.map((k) => ({ t: k.t, v: k.v })), arquivo: `relatorio-gerencial-${inicio ?? ""}-a-${fim ?? ""}.xlsx` })}><FileSpreadsheet /> Baixar Excel</Button></div>
    <header className="flex flex-wrap items-start justify-between gap-5 border-b-2 border-primary pb-7">
      <div><div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary"><Landmark className="size-4" /> Financeiro SVD SEMINOVOS · Grupo SVD</div><h2 className="text-3xl font-semibold leading-tight">Demonstrativo gerencial · Forecast</h2><p className="mt-2 text-sm text-muted-foreground">Realizado e projeção por plano financeiro</p></div>
      <div className="sm:text-right"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Período</p><p className="num mt-1 text-lg font-semibold">{inicio && fim ? `${fmtData(inicio)} a ${fmtData(fim)}` : "—"}</p><p className="mt-2 text-xs text-muted-foreground">Realizado até {fmtData(corte)} · {contas.length} contas bancárias</p></div>
    </header>
    <section className="grid grid-cols-2 gap-px overflow-hidden border-b bg-border sm:grid-cols-3">
      {kpis.map((k) => <div key={k.t} className={`p-4 ${k.destaque ? "bg-primary text-primary-foreground" : "bg-card"}`}><p className={`text-[10px] font-medium uppercase tracking-wider ${k.destaque ? "opacity-80" : "text-muted-foreground"}`}>{k.t}</p><p className={`num mt-1.5 whitespace-nowrap text-xl font-semibold ${k.destaque ? "" : k.c ?? (k.v < 0 ? "text-debit" : "")}`}>{fmt(k.v)}</p>{k.d && <p className={`text-[11px] ${k.destaque ? "opacity-80" : "text-muted-foreground"}`}>{k.d}</p>}</div>)}
    </section>
    {menor && menor.final < 0 && <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-debit">Atenção: menor saldo do período {fmt(menor.final)} em {fmtData(menor.data)}.</p>}
    <section className="report-section mt-7"><Titulo numero="01" titulo="Curva do saldo · realizado e projetado" />
      {dados.length ? <ResponsiveContainer width="100%" height={260}><ComposedChart data={dados}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="dia" fontSize={11} /><YAxis fontSize={11} width={60} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} /><Tooltip formatter={(v: number) => fmt(v)} /><ReferenceLine y={0} stroke="var(--destructive)" strokeDasharray="4 4" /><Area dataKey="real" name="Realizado" stroke="var(--chart-3)" fill="var(--chart-1)" fillOpacity={0.25} strokeWidth={2} isAnimationActive={false} connectNulls={false} /><Line dataKey="proj" name="Projetado" stroke="var(--primary)" strokeDasharray="6 4" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} /></ComposedChart></ResponsiveContainer> : <p className="py-4 text-sm text-muted-foreground">Sem dias no período.</p>}
      <p className="mt-1 text-xs text-muted-foreground">Linha cheia: saldo realizado pelos extratos · tracejada: projeção pelas previsões.</p>
    </section>
    <section className="report-section mt-7"><Titulo numero="02" titulo="Forecast por plano financeiro" />
      {periodo.length ? <FluxoPlano linhas={linhas} periodo={periodo} abertos={abertos} setAbertos={setAbertos} corte={corte} /> : null}
      <p className="mt-2 text-xs text-muted-foreground">Clique nas linhas para abrir as contas financeiras e as categorias. Colunas destacadas são projeção.</p>
    </section>
    <section className="report-section mt-7"><Titulo numero="03" titulo="Maiores saídas realizadas por conta financeira" />
      <ResumoPlano linhas={maiores} onCategoria={onCategoria} />
    </section>
    <section className="report-section mt-7"><Titulo numero="04" titulo="Posição por banco e conta" />
      <Table><TableHeader><TableRow><TableHead>Banco / conta</TableHead><TableHead className="text-right">Saldo em {inicio ? fmtData(inicio) : "—"}</TableHead><TableHead className="text-right">Saldo em {fim ? fmtData(fim > corte ? corte : fim) : "—"}</TableHead><TableHead>Base</TableHead></TableRow></TableHeader><TableBody>{contas.map((e) => {
        const u = ultimoSaldoExtrato(e);
        const a = inicio ? saldoNaData(e, inicio)?.saldo ?? e.saldoInicial : e.saldoInicial;
        const b = fim ? saldoNaData(e, fim > corte ? corte : fim)?.saldo ?? u.saldo : u.saldo;
        return <TableRow key={e.id}><TableCell><p className="font-semibold">{e.banco}</p><p className="text-xs text-muted-foreground">Ag {e.agencia || "—"} · CC {e.conta || "—"}</p></TableCell><TableCell className="num text-right">{fmt(a)}</TableCell><TableCell className={`num text-right font-semibold ${b < 0 ? "text-debit" : ""}`}>{fmt(b)}</TableCell><TableCell className="text-xs text-muted-foreground">Extrato até {u.data ? fmtData(u.data) : "—"}{u.parcial ? " · parcial" : ""}</TableCell></TableRow>;
      })}</TableBody></Table>
    </section>
    <footer className="mt-10 flex flex-wrap justify-between gap-2 border-t pt-4 text-xs text-muted-foreground"><span>Financeiro SVD SEMINOVOS · Grupo SVD · Para apreciação da diretoria</span><span>Emitido em {new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · horário de Brasília</span></footer>
  </article>;
}
function Titulo({ numero, titulo }: { numero: string; titulo: string }) { return <div className="mb-4 flex items-baseline gap-3 border-b pb-2"><span className="num text-sm font-semibold text-primary">{numero}</span><h3 className="text-sm font-semibold uppercase tracking-wider">{titulo}</h3></div>; }
