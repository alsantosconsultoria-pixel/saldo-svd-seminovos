import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText, Printer, Sparkles, Tag, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
import { realizadoPorDia, type Realizado } from "@/lib/realizado";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FluxoPlano, baixarExcelPlano } from "@/components/FluxoPlano";
import { fluxoPorPlano, type ContaPlano, type LinhaPlano } from "@/lib/plano";

interface Prev { id: string; tipo: string; vencimento: string; descricao: string; contraparte: string; documento: string; banco: string; categoria: string; valor: number; marcador?: string }

export function Previsoes({ lista, atualizacao = 0, realizados = [] }: { lista: Extrato[]; atualizacao?: number; realizados?: Realizado[] }) {
  const [itens, setItens] = useState<Prev[]>([]);
  const [ia, setIa] = useState("");
  const [pensando, setPensando] = useState(false);
  const dia = hoje();
  const mais = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const [de, setDe] = useState(dia);
  const [ate, setAte] = useState(() => mais(dia, 14));
  const [relatorio, setRelatorio] = useState(false);
  const [comMarcador, setComMarcador] = useState(false);
  const [comp, setComp] = useState<{ id: string; rotulo: string } | null>(null);

  const [contas, setContas] = useState<ContaPlano[]>([]);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  async function carregar() {
    const [{ data }, c, m] = await Promise.all([
      supabase.from("previsoes").select("*").order("vencimento"),
      supabase.from("plano_contas").select("*"),
      supabase.from("plano_categorias").select("*"),
    ]);
    setItens((data ?? []).map((r) => ({ ...r, valor: Number(r.valor) })));
    setContas((c.data ?? []) as ContaPlano[]);
    setMapa(Object.fromEntries((m.data ?? []).map((x) => [x.categoria, x.conta_id])));
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
  const plano = useMemo(() => fluxoPorPlano(itens, periodo.map((d) => d.data), contas, mapa, dia), [itens, periodo, contas, mapa, dia]);
  const [abertosReal, setAbertosReal] = useState<Set<string>>(new Set());
  const diasReal = useMemo(() => realizadoPorDia(realizados, de, ate).map((d) => ({ data: d.data, inicial: 0, receber: 0, pagar: 0, final: 0, faltante: 0 })), [realizados, de, ate]);
  const planoReal = useMemo(() => fluxoPorPlano(realizados.map((r) => ({ tipo: r.tipo, vencimento: r.data, categoria: r.categoria, valor: r.valor })), diasReal.map((d) => d.data), contas, mapa, ""), [realizados, diasReal, contas, mapa]);
  const tituloRel = periodo.length ? `Fluxo de caixa previsto · ${fmtData(periodo[0]!.data)} a ${fmtData(periodo.at(-1)!.data)}` : "";
  const noPeriodo = (i: Prev) => { const v = i.vencimento < dia ? dia : i.vencimento; return v >= ini && v <= ate; };
  const rec = itens.filter((i) => i.tipo === "receber" && noPeriodo(i));
  const pag = itens.filter((i) => i.tipo === "pagar" && noPeriodo(i));
  const linhaDe = (i: Prev) => { const cat = i.categoria || "Sem categoria"; const c = contas.find((x) => x.id === mapa[cat]); return `${i.tipo === "receber" ? "credito" : "debito"}|${c ? c.nome.trim() : "_sem"}|${cat}`; };
  const marcados = useMemo(() => { if (!comMarcador) return undefined; const m = new Map<string, number>(); for (const i of itens) if (i.marcador && noPeriodo(i)) m.set(linhaDe(i), (m.get(linhaDe(i)) ?? 0) + 1); return m; }, [comMarcador, itens, contas, mapa, ini, ate]); // eslint-disable-line react-hooks/exhaustive-deps
  const itensComp = comp ? itens.filter((i) => noPeriodo(i) && linhaDe(i) === comp.id).sort((a, b) => a.vencimento.localeCompare(b.vencimento)) : [];
  const onComp = (id: string, rotulo: string) => setComp({ id, rotulo });
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
          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm"><Checkbox checked={comMarcador} onCheckedChange={(v) => setComMarcador(v === true)} /><Tag className="size-3.5 text-muted-foreground" /> Marcador</label>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setRelatorio((r) => !r)} disabled={!periodo.length}><FileText /> {relatorio ? "Voltar às previsões" : "Relatório de fluxo"}</Button>
          {relatorio && <Button variant="outline" onClick={() => baixarExcelPlano(plano, periodo, abertos, tituloRel)}><FileText /> Baixar Excel</Button>}
          {relatorio && <Button onClick={() => window.print()}><Printer /> Baixar PDF</Button>}
        </div>
      </Card>

      {relatorio && periodo.length > 0 ? <RelatorioFluxo periodo={periodo} saldoBancos={saldoBancos} base={baseExtratos} receber={soma(rec)} pagar={soma(pag)} maiores={[...pag].sort((a, b) => b.valor - a.valor).slice(0, 8)} plano={plano} abertos={abertos} setAbertos={setAbertos} marcados={marcados} onComposicao={onComp} /> : <>
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Saldo dos bancos {baseExtratos && `(extratos até ${fmtData(baseExtratos)})`}</div><div className="num text-lg font-semibold">{fmt(saldoBancos)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">A receber no período</div><div className="num text-lg font-semibold text-credit">{fmt(soma(rec))}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">A pagar no período</div><div className="num text-lg font-semibold text-debit">{fmt(soma(pag))}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Saldo previsto em {fmtData(ate)}</div><div className={`num text-lg font-semibold ${(periodo.at(-1)?.final ?? 0) < 0 ? "text-debit" : ""}`}>{fmt(periodo.at(-1)?.final ?? saldoBancos)}</div></Card>
      </div>

      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Fluxo de caixa previsto</h3>
        {periodo.length === 0 ? <p className="text-sm text-muted-foreground">Escolha um período a partir de hoje.</p> : <FluxoPlano linhas={plano} periodo={periodo} abertos={abertos} setAbertos={setAbertos} marcados={marcados} onComposicao={onComp} />}
        {periodo.length > 0 && contas.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Cadastre o plano financeiro em Administração para abrir as contas e categorias.</p>}
      </Card>

      {criticos.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5 p-5">
          <div className="mb-2 flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="size-4" /> Dias sem saldo suficiente</div>
          <ul className="space-y-1 text-sm">
            {criticos.map((d) => <li key={d.data}><b>{fmtData(d.data)}</b>: faltam <span className="num font-semibold text-destructive">{fmt(d.faltante)}</span> para pagar {fmt(d.pagar)} em compromissos</li>)}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Realizado por data</h3>
          {diasReal.length > 0 && <Button variant="outline" size="sm" onClick={() => baixarExcelPlano(planoReal, diasReal, abertosReal, `Fluxo de caixa realizado · ${fmtData(diasReal[0]!.data)} a ${fmtData(diasReal.at(-1)!.data)}`, true)}><FileText /> Baixar Excel</Button>}
        </div>
        {diasReal.length > 0 && <div className="mb-4"><FluxoPlano linhas={planoReal} periodo={diasReal} abertos={abertosReal} setAbertos={setAbertosReal} semSaldo /></div>}
        <h4 className="mb-2 text-sm font-medium text-muted-foreground">Composição por dia (clique no valor)</h4>
        <RealizadoLinha realizados={realizados} de={de} ate={ate} />
      </Card>

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
      <Dialog open={!!comp} onOpenChange={(o) => !o && setComp(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>{comp?.rotulo} · {fmt(soma(itensComp))}</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-auto"><Table>
            <TableHeader><TableRow><TableHead>Vencimento</TableHead><TableHead>Cliente/Fornecedor</TableHead><TableHead>Nº documento</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
            <TableBody>{itensComp.map((i) => <TableRow key={i.id}><TableCell className="num">{fmtData(i.vencimento)}</TableCell><TableCell className="whitespace-normal"><div>{i.contraparte || "—"}</div>{i.marcador && <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Tag className="size-3" />{i.marcador}</span>}</TableCell><TableCell className="text-xs">{i.documento || "—"}</TableCell><TableCell className="num text-right">{fmt(i.valor)}</TableCell></TableRow>)}</TableBody>
          </Table></div>
        </DialogContent>
      </Dialog>
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


function RelatorioFluxo({ periodo, saldoBancos, base, receber, pagar, maiores, plano, abertos, setAbertos, marcados, onComposicao }: { periodo: DiaFluxo[]; saldoBancos: number; base: string; receber: number; pagar: number; maiores: Prev[]; plano: LinhaPlano[]; abertos: Set<string>; setAbertos: (s: Set<string>) => void; marcados?: Map<string, number> | undefined; onComposicao?: ((id: string, rotulo: string) => void) | undefined }) {
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
    <section><h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">02 · Fluxo por plano financeiro</h2><FluxoPlano linhas={plano} periodo={periodo} abertos={abertos} setAbertos={setAbertos} marcados={marcados} onComposicao={onComposicao} /></section>
    <section className="break-inside-avoid"><h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">03 · Curva do saldo</h2><Curva periodo={periodo} /></section>
    {maiores.length > 0 && <section className="break-inside-avoid"><h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">04 · Maiores pagamentos do período</h2>
      <table className="w-full text-sm"><thead><tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th className="py-1.5 font-medium">Vencimento</th><th className="font-medium">Fornecedor</th><th className="font-medium">Categoria</th><th className="font-medium">Marcador</th><th className="text-right font-medium">Valor</th></tr></thead><tbody>{maiores.map((m) => <tr key={m.id} className="border-b"><td className="num py-1.5">{fmtData(m.vencimento)}</td><td>{m.contraparte || "—"}</td><td className="text-muted-foreground">{m.categoria}</td><td className="text-xs text-muted-foreground">{m.marcador ? <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"><Tag className="size-3" />{m.marcador}</span> : "—"}</td><td className="num text-right">{fmt(m.valor)}</td></tr>)}</tbody></table>
    </section>}
    <footer className="border-t pt-3 text-xs text-muted-foreground">Projeção baseada nas previsões importadas; sem baixa nos saldos bancários. Gerado em {new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.</footer>
  </article>;
}

function RealizadoLinha({ realizados, de, ate }: { realizados: Realizado[]; de: string; ate: string }) {
  const [aberto, setAberto] = useState<{ data: string; tipo: "pagar" | "receber" } | null>(null);
  const dias = realizadoPorDia(realizados, de, ate);
  if (!dias.length) return <p className="text-sm text-muted-foreground">Nenhum realizado no período. Use "Importar realizado" e escolha um período que inclua dias passados.</p>;
  const n = (v: number) => fmt(v).replace("R$", "").trim();
  const cel = "num whitespace-nowrap border-l px-3 py-2 text-right";
  const rot = "sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-2 text-left font-medium";
  const link = (d: string, tipo: "pagar" | "receber", v: number, cor: string) => v ? <button type="button" className={`${cor} underline decoration-dotted underline-offset-4 hover:opacity-70`} onClick={() => setAberto({ data: d, tipo })}>{n(v)}</button> : "—";
  const comp = aberto ? realizados.filter((r) => r.data === aberto.data && r.tipo === aberto.tipo) : [];
  return <>
    <div className="overflow-x-auto"><table className="w-full border-collapse text-sm">
      <thead><tr className="border-b bg-muted/40"><th className={rot + " bg-muted"}>Data</th>{dias.map((d) => <th key={d.data} className={cel + " font-semibold"}>{fmtData(d.data).slice(0, 5)}</th>)}</tr></thead>
      <tbody>
        <tr className="border-b"><td className={rot}>Despesa</td>{dias.map((d) => <td key={d.data} className={cel}>{link(d.data, "pagar", d.pago, "text-debit")}</td>)}</tr>
        <tr className="border-b"><td className={rot}>Receita</td>{dias.map((d) => <td key={d.data} className={cel}>{link(d.data, "receber", d.recebido, "text-credit")}</td>)}</tr>
        <tr className="bg-muted/30 font-semibold"><td className={rot + " bg-muted"}>Total do dia</td>{dias.map((d) => <td key={d.data} className={`${cel} ${d.recebido - d.pago < 0 ? "text-debit" : ""}`}>{n(d.recebido - d.pago)}</td>)}</tr>
      </tbody>
    </table></div>
    <Dialog open={!!aberto} onOpenChange={(o) => !o && setAberto(null)}>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>{aberto?.tipo === "pagar" ? "Despesas pagas" : "Receitas recebidas"} em {aberto && fmtData(aberto.data)} · {fmt(comp.reduce((a, r) => a + r.valor, 0))}</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] overflow-auto"><Table>
          <TableHeader><TableRow><TableHead>Cliente/Fornecedor</TableHead><TableHead>Categoria</TableHead><TableHead>Nº documento</TableHead><TableHead>Conta</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
          <TableBody>{comp.map((r) => <TableRow key={r.id}><TableCell className="whitespace-normal"><div>{r.contraparte || "—"}</div>{r.marcador && <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Tag className="size-3" />{r.marcador}</span>}</TableCell><TableCell className="text-xs">{r.categoria}</TableCell><TableCell className="text-xs">{r.documento}</TableCell><TableCell className="text-xs">{r.conta}</TableCell><TableCell className="num text-right">{fmt(r.valor)}</TableCell></TableRow>)}</TableBody>
        </Table></div>
      </DialogContent>
    </Dialog>
  </>;
}
