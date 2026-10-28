import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText, Printer, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { fmt, fmtData, hoje } from "@/lib/extrato/store";
import type { Extrato } from "@/lib/extrato/parser";
import { saldoExtrato } from "@/components/Tratativas";
import { fluxoCaixa, fluxoPeriodo, type DiaFluxo } from "@/lib/fluxo";
import { Input } from "@/components/ui/input";
import { ultimoSaldoExtrato } from "@/lib/tratativas";
import { analisarFluxo } from "@/lib/fluxo-ia.functions";

interface Prev { id: string; tipo: string; vencimento: string; descricao: string; contraparte: string; documento: string; banco: string; categoria: string; valor: number }

export function Previsoes({ lista, atualizacao = 0 }: { lista: Extrato[]; atualizacao?: number }) {
  const [itens, setItens] = useState<Prev[]>([]);
  const [ia, setIa] = useState("");
  const [pensando, setPensando] = useState(false);
  const dia = hoje();
  const mais = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const [de, setDe] = useState(dia);
  const [ate, setAte] = useState(() => mais(dia, 14));
  const [relatorio, setRelatorio] = useState(false);

  async function carregar() {
    const { data } = await supabase.from("previsoes").select("*").order("vencimento");
    setItens((data ?? []).map((r) => ({ ...r, valor: Number(r.valor) })));
  }
  useEffect(() => {
    carregar();
    const ch = supabase.channel("prev").on("postgres_changes", { event: "*", schema: "public", table: "previsoes" }, carregar).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [atualizacao]);

  async function limpar() {
    if (!confirm("Apagar todas as previsões que você importou?")) return;
    await supabase.from("previsoes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    carregar();
  }

  const saldoBancos = lista.reduce((a, e) => a + saldoExtrato(e), 0);
  const fluxo = useMemo(() => fluxoCaixa(saldoBancos, itens, dia), [saldoBancos, itens, dia]);
  const ini = de < dia ? dia : de;
  const periodo = useMemo(() => (ate >= ini ? fluxoPeriodo(fluxo, saldoBancos, ini, ate) : []), [fluxo, saldoBancos, ini, ate]);
  const criticos = periodo.filter((d) => d.faltante > 0);
  const noPeriodo = (i: Prev) => { const v = i.vencimento < dia ? dia : i.vencimento; return v >= ini && v <= ate; };
  const rec = itens.filter((i) => i.tipo === "receber" && noPeriodo(i));
  const pag = itens.filter((i) => i.tipo === "pagar" && noPeriodo(i));
  const baseExtratos = lista.map((e) => ultimoSaldoExtrato(e).data).filter(Boolean).sort().at(-1) ?? "";
  const soma = (l: Prev[]) => l.reduce((a, b) => a + b.valor, 0);

  async function analisar() {
    setPensando(true); setIa("");
    const maiores = [...pag].sort((a, b) => b.valor - a.valor).slice(0, 40)
      .map((p) => `${fmtData(p.vencimento)} | ${p.contraparte} | ${p.categoria} | doc ${p.documento} | ${fmt(p.valor)}`).join("\n");
    const resumo = `Hoje: ${fmtData(dia)}\nSaldos atuais por banco:\n${lista.map((e) => `${e.banco} ${e.conta}: ${fmt(saldoExtrato(e))}`).join("\n")}\nTotal: ${fmt(saldoBancos)}\n\nFluxo diário (data | inicial | receber | pagar | final | faltante):\n${fluxo.map((d) => `${fmtData(d.data)} | ${fmt(d.inicial)} | ${fmt(d.receber)} | ${fmt(d.pagar)} | ${fmt(d.final)} | ${fmt(d.faltante)}`).join("\n")}\n\nMaiores pagamentos previstos:\n${maiores}`;
    try {
      const r = await analisarFluxo({ data: { resumo } });
      if (r.erro) toast.error(r.erro); else setIa(r.texto);
    } catch { toast.error("Não foi possível falar com a IA."); }
    setPensando(false);
  }

  return (
    <div className="space-y-4">
      {itens.length > 0 && <div className="flex justify-end print:hidden"><Button variant="outline" onClick={limpar}><Trash2 /> Limpar previsões</Button></div>}

      <Card className="flex flex-wrap items-end justify-between gap-3 p-5 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <div><label htmlFor="prev-de" className="text-xs text-muted-foreground">De</label><Input id="prev-de" type="date" className="w-40" value={de} onChange={(e) => e.target.value && setDe(e.target.value)} /></div>
          <div><label htmlFor="prev-ate" className="text-xs text-muted-foreground">Até</label><Input id="prev-ate" type="date" className="w-40" value={ate} onChange={(e) => e.target.value && setAte(e.target.value)} /></div>
          {[7, 15, 30].map((n) => <Button key={n} size="sm" variant="ghost" onClick={() => { setDe(dia); setAte(mais(dia, n - 1)); }}>{n} dias</Button>)}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setRelatorio((r) => !r)} disabled={!periodo.length}><FileText /> {relatorio ? "Voltar às previsões" : "Relatório de fluxo"}</Button>
          {relatorio && <Button onClick={() => window.print()}><Printer /> Imprimir / PDF</Button>}
        </div>
      </Card>

      {relatorio ? <RelatorioFluxo periodo={periodo} saldoBancos={saldoBancos} base={baseExtratos} receber={soma(rec)} pagar={soma(pag)} maiores={[...pag].sort((a, b) => b.valor - a.valor).slice(0, 8)} /> : <>
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Saldo dos bancos {baseExtratos && `(extratos até ${fmtData(baseExtratos)})`}</div><div className="num text-lg font-semibold">{fmt(saldoBancos)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">A receber no período</div><div className="num text-lg font-semibold text-credit">{fmt(soma(rec))}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">A pagar no período</div><div className="num text-lg font-semibold text-debit">{fmt(soma(pag))}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Saldo previsto em {fmtData(ate)}</div><div className={`num text-lg font-semibold ${(periodo.at(-1)?.final ?? 0) < 0 ? "text-debit" : ""}`}>{fmt(periodo.at(-1)?.final ?? saldoBancos)}</div></Card>
      </div>

      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Fluxo de caixa previsto</h3>
        {periodo.length === 0 ? <p className="text-sm text-muted-foreground">Escolha um período a partir de hoje.</p> : <FluxoLinha periodo={periodo} />}
      </Card>

      {criticos.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5 p-5">
          <div className="mb-2 flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="size-4" /> Dias sem saldo suficiente</div>
          <ul className="space-y-1 text-sm">
            {criticos.map((d) => <li key={d.data}><b>{fmtData(d.data)}</b>: faltam <span className="num font-semibold text-destructive">{fmt(d.faltante)}</span> para pagar {fmt(d.pagar)} em compromissos</li>)}
          </ul>
        </Card>
      )}

      {periodo.length > 0 && <Card className="p-5"><h3 className="mb-3 font-semibold">Curva dos saldos</h3><Curva periodo={periodo} /></Card>}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Análise da IA para os próximos dias</h3>
          <Button onClick={analisar} disabled={pensando || fluxo.length === 0}><Sparkles /> {pensando ? "Analisando..." : "Analisar fluxo"}</Button>
        </div>
        {ia ? <div className="whitespace-pre-wrap text-sm leading-relaxed">{ia}</div> : <p className="text-sm text-muted-foreground">Clique em "Analisar fluxo" para receber sugestões sobre os dias críticos.</p>}
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Títulos previstos</h3>
        {itens.length === 0 ? <p className="text-sm text-muted-foreground">Nada importado ainda.</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Vencimento</TableHead><TableHead>Operação</TableHead><TableHead>Cliente/Fornecedor</TableHead><TableHead>Nº documento</TableHead><TableHead className="text-right">Valor título</TableHead></TableRow></TableHeader>
            <TableBody>{itens.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="num">{fmtData(i.vencimento)}</TableCell>
                <TableCell>{i.tipo === "receber" ? "Receber" : "Pagar"}</TableCell>
                <TableCell><div className="text-sm">{i.contraparte || "—"}</div><div className="text-xs text-muted-foreground">{i.categoria}</div></TableCell>
                <TableCell className="text-sm">{i.documento || "—"}</TableCell>
                <TableCell className={`num text-right ${i.tipo === "receber" ? "text-credit" : "text-debit"}`}>{fmt(i.valor)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </Card>
      </>}
    </div>
  );
}

function Curva({ periodo }: { periodo: DiaFluxo[] }) {
  return <div className="h-64"><ResponsiveContainer>
    <AreaChart data={periodo.map((d) => ({ ...d, dia: fmtData(d.data).slice(0, 5) }))}>
      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
      <XAxis dataKey="dia" fontSize={12} />
      <YAxis fontSize={12} width={90} tickFormatter={(v) => fmt(v).replace(",00", "")} />
      <Tooltip formatter={(v: number) => fmt(v)} />
      <ReferenceLine y={0} stroke="var(--destructive)" />
      <Area type="monotone" dataKey="final" name="Saldo previsto" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} isAnimationActive={false} />
    </AreaChart>
  </ResponsiveContainer></div>;
}

function FluxoLinha({ periodo }: { periodo: DiaFluxo[] }) {
  const n = (v: number) => fmt(v).replace("R$", "").trim();
  const cel = "num whitespace-nowrap border-l px-3 py-2 text-right";
  const rot = "sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-2 text-left font-medium";
  return <div className="overflow-x-auto">
    <table className="w-full border-collapse text-sm">
      <thead><tr className="border-b bg-muted/40"><th className={rot + " bg-muted"}>Data</th>{periodo.map((d) => <th key={d.data} className={cel + " font-semibold"}>{fmtData(d.data).slice(0, 5)}</th>)}</tr></thead>
      <tbody>
        <tr className="border-b"><td className={rot}>Saldo inicial</td>{periodo.map((d) => <td key={d.data} className={`${cel} ${d.inicial < 0 ? "text-debit" : ""}`}>{n(d.inicial)}</td>)}</tr>
        <tr className="border-b"><td className={rot}>A receber</td>{periodo.map((d) => <td key={d.data} className={`${cel} text-credit`}>{d.receber ? n(d.receber) : "—"}</td>)}</tr>
        <tr className="border-b"><td className={rot}>A pagar</td>{periodo.map((d) => <td key={d.data} className={`${cel} text-debit`}>{d.pagar ? n(d.pagar) : "—"}</td>)}</tr>
        <tr className="border-b"><td className={rot}>Total do dia</td>{periodo.map((d) => <td key={d.data} className={`${cel} ${d.receber - d.pagar < 0 ? "text-debit" : ""}`}>{n(d.receber - d.pagar)}</td>)}</tr>
        <tr className="border-b-2 border-foreground/30 bg-muted/30 font-semibold"><td className={rot + " bg-muted"}>Previsão de saldo</td>{periodo.map((d) => <td key={d.data} className={`${cel} ${d.final < 0 ? "bg-destructive/10 text-debit" : ""}`}>{n(d.final)}</td>)}</tr>
        <tr><td className={rot}>Falta para pagar</td>{periodo.map((d) => <td key={d.data} className={`${cel} ${d.faltante ? "font-semibold text-debit" : "text-muted-foreground"}`}>{d.faltante ? n(d.faltante) : "—"}</td>)}</tr>
      </tbody>
    </table>
  </div>;
}

function RelatorioFluxo({ periodo, saldoBancos, base, receber, pagar, maiores }: { periodo: DiaFluxo[]; saldoBancos: number; base: string; receber: number; pagar: number; maiores: Prev[] }) {
  const final = periodo.at(-1)?.final ?? saldoBancos;
  const menor = periodo.reduce((m, d) => (d.final < m.final ? d : m), periodo[0]!);
  const criticos = periodo.filter((d) => d.faltante > 0);
  const primeiroCritico = criticos[0];
  const falta = criticos.reduce((m, d) => Math.max(m, d.faltante), 0);
  const recs: string[] = [];
  if (primeiroCritico) {
    recs.push(`Garantir ${fmt(-menor.final)} até ${fmtData(primeiroCritico.data)} (antecipação de recebíveis, captação ou aporte) para cobrir o pior momento do período.`);
    recs.push("Priorizar impostos e folha; renegociar ou reprogramar os maiores pagamentos abaixo para depois do dia crítico.");
  } else {
    recs.push(`O caixa cobre todos os compromissos do período; o menor saldo previsto é ${fmt(menor.final)} em ${fmtData(menor.data)}.`);
    if (final > saldoBancos) recs.push("Avaliar aplicação do excedente de curto prazo sem comprometer a liquidez dos próximos dias.");
  }
  if (pagar > receber) recs.push(`As saídas superam as entradas em ${fmt(pagar - receber)} no período; acompanhar a cobrança dos recebíveis previstos.`);
  const Kpi = ({ t, v, d }: { t: string; v: number; d?: string }) => <div className="border-l-2 border-primary pl-3"><p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t}</p><p className={`num text-xl font-semibold ${v < 0 ? "text-debit" : ""}`}>{fmt(v)}</p>{d && <p className="text-xs text-muted-foreground">{d}</p>}</div>;
  return <article className="space-y-8 bg-card p-8 text-card-foreground shadow-sm print:shadow-none">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-primary pb-4">
      <div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Financeiro SVD SEMINOVOS · Grupo SVD</p><h1 className="text-2xl font-semibold">Relatório de fluxo de caixa previsto</h1><p className="text-sm text-muted-foreground">Período {fmtData(periodo[0]!.data)} a {fmtData(periodo.at(-1)!.data)}{base && ` · saldos pelo último extrato (${fmtData(base)})`}</p></div>
      <div className={`px-4 py-2 text-sm font-semibold ${primeiroCritico ? "bg-destructive/10 text-debit" : "bg-primary/10 text-primary"}`}>{primeiroCritico ? `Atenção: ${criticos.length} dia(s) sem cobertura` : "Caixa coberto no período"}</div>
    </header>
    <section className="grid gap-5 sm:grid-cols-5">
      <Kpi t="Saldo atual" v={saldoBancos} /><Kpi t="A receber" v={receber} /><Kpi t="A pagar" v={-pagar} /><Kpi t="Menor saldo" v={menor.final} d={fmtData(menor.data)} /><Kpi t="Saldo final" v={final} d={fmtData(periodo.at(-1)!.data)} />
    </section>
    <section><h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">01 · Orientação para decisão</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm">{recs.map((r) => <li key={r}>{r}</li>)}</ul>
      {falta > 0 && <p className="mt-2 text-sm font-semibold text-debit">Maior falta diária para pagamentos: {fmt(falta)}.</p>}
    </section>
    <section><h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">02 · Fluxo diário</h2><FluxoLinha periodo={periodo} /></section>
    <section className="break-inside-avoid"><h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">03 · Curva do saldo</h2><Curva periodo={periodo} /></section>
    {maiores.length > 0 && <section className="break-inside-avoid"><h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">04 · Maiores pagamentos do período</h2>
      <table className="w-full text-sm"><tbody>{maiores.map((m) => <tr key={m.id} className="border-b"><td className="num py-1.5">{fmtData(m.vencimento)}</td><td>{m.contraparte || "—"}</td><td className="text-muted-foreground">{m.categoria}</td><td className="num text-right">{fmt(m.valor)}</td></tr>)}</tbody></table>
    </section>}
    <footer className="border-t pt-3 text-xs text-muted-foreground">Projeção baseada nas previsões importadas; sem baixa nos saldos bancários. Gerado em {new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.</footer>
  </article>;
}
