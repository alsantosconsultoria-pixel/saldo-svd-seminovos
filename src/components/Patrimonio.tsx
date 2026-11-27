import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Info, Landmark, RotateCcw, Scale, SlidersHorizontal, TrendingDown, TrendingUp } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { Extrato } from "@/lib/extrato/parser";
import { fmt, fmtData } from "@/lib/extrato/store";
import type { Realizado } from "@/lib/realizado";
import {
  CENARIOS,
  COMPLEMENTOS_INICIAIS,
  PREMISSAS_INICIAIS,
  compararPatrimonio,
  datasDiarias,
  datasMensais,
  indicadoresPatrimonio,
  montarSeriePatrimonio,
  oscilacaoRelevante,
  type CenarioPatrimonio,
  type ComplementosPatrimonio,
  type GranularidadePatrimonio,
  type PremissasPatrimonio,
  type SnapshotPatrimonio,
  type TituloPatrimonio,
} from "@/lib/patrimonio";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const CONFIG_ID = "geral";

function somarDias(data: string, dias: number) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function numero(valor: unknown, original = 0) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : original;
}

function ConfigNumero({ id, rotulo, valor, aoMudar, sufixo = "%", max = 100, passo = 0.5 }: { id: string; rotulo: string; valor: number; aoMudar: (v: number) => void; sufixo?: string; max?: number; passo?: number }) {
  return <label htmlFor={id} className="space-y-1.5 text-xs font-medium text-muted-foreground">
    <span>{rotulo}</span>
    <div className="relative"><Input id={id} type="number" min={0} max={max} step={passo} className="bg-card pr-10 text-right" value={valor} onChange={(e) => aoMudar(Math.min(max, Math.max(0, numero(e.target.value))))} /><span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{sufixo}</span></div>
  </label>;
}

function pct(valor: number | null, casas = 1) {
  return valor === null ? "n/d" : `${valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

function razao(valor: number | null) {
  return valor === null ? "n/d" : `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
}

function nomeCenario(id: CenarioPatrimonio) {
  return CENARIOS.find((c) => c.id === id)?.nome ?? id;
}

export function PatrimonioDetalhado({ lista, realizados, previsoes, versao = 0 }: { lista: Extrato[]; realizados: Realizado[]; previsoes: TituloPatrimonio[]; versao?: number }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [granularidade, setGranularidade] = useState<GranularidadePatrimonio>("diaria");
  const [de, setDe] = useState(() => somarDias(hoje, -30));
  const [ate, setAte] = useState(() => somarDias(hoje, 30));
  const [ano, setAno] = useState(() => Number(hoje.slice(0, 4)));
  const [mesInicial, setMesInicial] = useState(1);
  const [mesFinal, setMesFinal] = useState(12);
  const [cenarioA, setCenarioA] = useState<CenarioPatrimonio>("base");
  const [cenarioB, setCenarioB] = useState<CenarioPatrimonio>("simulado");
  const [modoLimite, setModoLimite] = useState<"percentual" | "valor">("percentual");
  const [limite, setLimite] = useState(5);
  const [somenteRelevantes, setSomenteRelevantes] = useState(false);
  const [premissas, setPremissas] = useState<PremissasPatrimonio>(PREMISSAS_INICIAIS);
  const [complementos, setComplementos] = useState<ComplementosPatrimonio>(COMPLEMENTOS_INICIAIS);
  const [carregado, setCarregado] = useState(false);
  const [statusGravacao, setStatusGravacao] = useState<"salvo" | "salvando" | "erro">("salvo");
  const aplicandoRemoto = useRef(false);

  useEffect(() => {
    let ativo = true;
    const aplicar = (dados: unknown) => {
      const d = (dados ?? {}) as { premissas?: Partial<PremissasPatrimonio>; complementos?: Partial<ComplementosPatrimonio> };
      aplicandoRemoto.current = true;
      setPremissas({
        depreciacaoAnual: numero(d.premissas?.depreciacaoAnual, PREMISSAS_INICIAIS.depreciacaoAnual),
        pdd: numero(d.premissas?.pdd, PREMISSAS_INICIAIS.pdd),
        impostos: numero(d.premissas?.impostos, PREMISSAS_INICIAIS.impostos),
        reservaLegal: d.premissas?.reservaLegal ?? PREMISSAS_INICIAIS.reservaLegal,
        regime: d.premissas?.regime === "caixa" ? "caixa" : "competencia",
      });
      setComplementos({
        estoques: numero(d.complementos?.estoques), imobilizado: numero(d.complementos?.imobilizado),
        outrosAtivos: numero(d.complementos?.outrosAtivos), passivoLongoPrazo: numero(d.complementos?.passivoLongoPrazo),
        capitalSocial: numero(d.complementos?.capitalSocial), reservaLegalAcumulada: numero(d.complementos?.reservaLegalAcumulada),
      });
      setTimeout(() => { aplicandoRemoto.current = false; }, 0);
    };
    const ler = async () => {
      const { data, error } = await supabase.from("patrimonio_config").select("dados").eq("id", CONFIG_ID).maybeSingle();
      if (!ativo) return;
      if (error) toast.error("Não foi possível carregar as premissas patrimoniais.");
      if (data) aplicar(data.dados);
      setCarregado(true);
    };
    void ler();
    const canal = supabase.channel(`patrimonio-config-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "patrimonio_config", filter: `id=eq.${CONFIG_ID}` }, (payload) => aplicar((payload.new as { dados: unknown }).dados))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "patrimonio_config", filter: `id=eq.${CONFIG_ID}` }, (payload) => aplicar((payload.new as { dados: unknown }).dados))
      .subscribe();
    return () => { ativo = false; void supabase.removeChannel(canal); };
  }, [versao]);

  useEffect(() => {
    if (!carregado || aplicandoRemoto.current) return;
    setStatusGravacao("salvando");
    const timer = window.setTimeout(async () => {
      const { data: usuario } = await supabase.auth.getUser();
      if (!usuario.user) return;
      const { error } = await supabase.from("patrimonio_config").upsert({
        id: CONFIG_ID,
        user_id: usuario.user.id,
        dados: JSON.parse(JSON.stringify({ premissas, complementos })),
        atualizado_em: new Date().toISOString(),
      });
      setStatusGravacao(error ? "erro" : "salvo");
      if (error) toast.error("Não foi possível salvar as premissas. Tente novamente.");
    }, 700);
    return () => window.clearTimeout(timer);
  }, [premissas, complementos, carregado]);

  const datas = useMemo(() => granularidade === "diaria" ? datasDiarias(de, ate) : datasMensais(ano, mesInicial, mesFinal), [granularidade, de, ate, ano, mesInicial, mesFinal]);
  const dataInicial = granularidade === "diaria" ? de : `${ano}-${String(mesInicial).padStart(2, "0")}-01`;
  const serie = useMemo(() => montarSeriePatrimonio({ extratos: lista, realizados, previsoes, datas, de: dataInicial, cenarios: [cenarioA, cenarioB], premissas, complementos }), [lista, realizados, previsoes, datas, dataInicial, cenarioA, cenarioB, premissas, complementos]);
  const snapA = serie.at(-1)?.[cenarioA];
  const snapB = serie.at(-1)?.[cenarioB];
  const grafico = useMemo(() => serie.map((dia) => ({
    data: dia[cenarioA]?.data ?? "",
    competencia: granularidade === "mensal" ? MESES[Number((dia[cenarioA]?.data ?? hoje).slice(5, 7)) - 1]?.slice(0, 3) : fmtData(dia[cenarioA]?.data ?? hoje).slice(0, 5),
    a: dia[cenarioA]?.patrimonioLiquido ?? 0,
    b: dia[cenarioB]?.patrimonioLiquido ?? 0,
  })), [serie, cenarioA, cenarioB, granularidade, hoje]);

  const atualizarPremissa = <K extends keyof PremissasPatrimonio>(chave: K, valor: PremissasPatrimonio[K]) => setPremissas((p) => ({ ...p, [chave]: valor }));
  const atualizarComplemento = (chave: keyof ComplementosPatrimonio, valor: number) => setComplementos((c) => ({ ...c, [chave]: valor }));
  const semDados = lista.length === 0 && realizados.length === 0 && previsoes.length === 0 && Object.values(complementos).every((v) => v === 0);

  if (!snapA || !snapB) {
    return <Card className="p-8 text-center"><Landmark className="mx-auto mb-3 size-8 text-muted-foreground" /><h2 className="text-lg font-semibold">Selecione um período válido</h2><p className="mt-1 text-sm text-muted-foreground">A data final precisa ser igual ou posterior à data inicial.</p></Card>;
  }

  const linhas = compararPatrimonio(snapA, snapB);
  const linhasVisiveis = linhas.filter((l) => !somenteRelevantes || l.tipo === "grupo" || oscilacaoRelevante(l, limite, modoLimite));
  const contas = linhas.filter((l) => l.tipo === "conta");
  const relevantes = contas.filter((l) => oscilacaoRelevante(l, limite, modoLimite));
  const positivas = [...contas].filter((l) => l.variacao > 0).sort((a, b) => b.variacao - a.variacao).slice(0, 3);
  const negativas = [...contas].filter((l) => l.variacao < 0).sort((a, b) => a.variacao - b.variacao).slice(0, 3);
  const indA = indicadoresPatrimonio(snapA);
  const indB = indicadoresPatrimonio(snapB);
  const principal = [...relevantes].sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao))[0];
  const parecer: string[] = [];
  parecer.push(indB.capitalCirculante >= 0
    ? `O capital circulante líquido é positivo em ${fmt(indB.capitalCirculante)}, indicando folga de curto prazo na posição simulada.`
    : `O capital circulante líquido é negativo em ${fmt(Math.abs(indB.capitalCirculante))}, sinalizando pressão de liquidez de curto prazo.`);
  if (indB.endividamento !== null) parecer.push(`O endividamento representa ${pct(indB.endividamento * 100)} do ativo total; a liquidez corrente está em ${razao(indB.liquidezCorrente)}.`);
  else parecer.push("Não há passivo informado suficiente para calcular os indicadores de liquidez e endividamento.");
  if (principal) parecer.push(`A maior oscilação relevante está em ${principal.rotulo}: ${fmt(principal.variacao)} (${pct(principal.percentual)}) na comparação ${nomeCenario(cenarioB)} versus ${nomeCenario(cenarioA)}.`);
  else parecer.push("Nenhuma conta superou o limiar de oscilação configurado para esta comparação.");
  if (snapB.reservaLegal > 0) parecer.push(`A destinação estimada para reserva legal é ${fmt(snapB.reservaLegal)}, respeitando 5% do lucro e o limite de 20% do capital social informado.`);

  const cards = [
    { id: "lc", titulo: "Liquidez corrente", a: indA.liquidezCorrente, b: indB.liquidezCorrente, tipo: "razao" },
    { id: "ls", titulo: "Liquidez seca", a: indA.liquidezSeca, b: indB.liquidezSeca, tipo: "razao" },
    { id: "lg", titulo: "Liquidez geral", a: indA.liquidezGeral, b: indB.liquidezGeral, tipo: "razao" },
    { id: "end", titulo: "Endividamento", a: indA.endividamento === null ? null : indA.endividamento * 100, b: indB.endividamento === null ? null : indB.endividamento * 100, tipo: "percentual" },
    { id: "ccl", titulo: "Capital circulante líquido", a: indA.capitalCirculante, b: indB.capitalCirculante, tipo: "moeda" },
    { id: "roe", titulo: "ROE do período", a: indA.roe === null ? null : indA.roe * 100, b: indB.roe === null ? null : indB.roe * 100, tipo: "percentual" },
    { id: "roa", titulo: "ROA do período", a: indA.roa === null ? null : indA.roa * 100, b: indB.roa === null ? null : indB.roa * 100, tipo: "percentual" },
  ] as const;

  const formatarCard = (v: number | null, tipo: "razao" | "percentual" | "moeda") => tipo === "razao" ? razao(v) : tipo === "percentual" ? pct(v) : v === null ? "n/d" : fmt(v);
  const descricaoA = CENARIOS.find((c) => c.id === cenarioA)?.descricao;
  const descricaoB = CENARIOS.find((c) => c.id === cenarioB)?.descricao;

  return <div className="min-w-0 max-w-full space-y-5 overflow-x-hidden">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"><Landmark className="size-4" /> Financeiro SVD SEMINOVOS</div><h2 className="text-2xl font-semibold">Análise de Patrimônio</h2><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Leitura executiva da posição gerencial, construída com extratos, realizado e previsões. Saldos contábeis não disponíveis permanecem identificados, sem estimativas automáticas.</p></div>
      <Badge variant={Math.abs(snapB.diferenca) < 0.01 ? "outline" : "destructive"} className="gap-1.5 px-3 py-1.5"><Scale className="size-3.5" />{Math.abs(snapB.diferenca) < 0.01 ? "Partida dobrada validada" : `Diferença de ${fmt(snapB.diferenca)}`}</Badge>
    </div>

    {semDados && <Card className="flex gap-3 border-accent bg-accent/20 p-4 text-sm"><Info className="mt-0.5 size-4 shrink-0" /><p>Não há dados patrimoniais na base. Importe extratos e planilhas ou informe os saldos complementares abaixo; nenhum valor demonstrativo fixo será utilizado.</p></Card>}

    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex rounded-md border bg-muted p-1"><Button size="sm" variant={granularidade === "diaria" ? "default" : "ghost"} onClick={() => setGranularidade("diaria")}>Visão diária</Button><Button size="sm" variant={granularidade === "mensal" ? "default" : "ghost"} onClick={() => setGranularidade("mensal")}>Visão mensal</Button></div>
        {granularidade === "diaria" ? <>
          <label className="text-xs text-muted-foreground">De<Input type="date" className="mt-1 w-40 bg-card" value={de} onChange={(e) => e.target.value && setDe(e.target.value)} /></label>
          <label className="text-xs text-muted-foreground">Até<Input type="date" className="mt-1 w-40 bg-card" value={ate} onChange={(e) => e.target.value && setAte(e.target.value)} /></label>
          <Button variant="ghost" size="sm" onClick={() => { setDe(hoje); setAte(hoje); }}>Hoje</Button>
        </> : <>
          <label className="text-xs text-muted-foreground">Ano<Input type="number" min={2000} max={2100} className="mt-1 w-28 bg-card" value={ano} onChange={(e) => setAno(Math.max(2000, Math.min(2100, numero(e.target.value, Number(hoje.slice(0, 4))))))} /></label>
          <label className="text-xs text-muted-foreground">Mês inicial<Select value={String(mesInicial)} onValueChange={(v) => setMesInicial(Number(v))}><SelectTrigger className="mt-1 w-36 bg-card"><SelectValue /></SelectTrigger><SelectContent>{MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent></Select></label>
          <label className="text-xs text-muted-foreground">Mês final<Select value={String(mesFinal)} onValueChange={(v) => setMesFinal(Number(v))}><SelectTrigger className="mt-1 w-36 bg-card"><SelectValue /></SelectTrigger><SelectContent>{MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent></Select></label>
        </>}
      </div>
      <div className="grid gap-3 border-t pt-4 md:grid-cols-2">
        <SeletorCenario id="cenario-a" rotulo="Cenário A" valor={cenarioA} aoMudar={setCenarioA} descricao={descricaoA} />
        <SeletorCenario id="cenario-b" rotulo="Cenário B (comparado)" valor={cenarioB} aoMudar={setCenarioB} descricao={descricaoB} />
      </div>
    </Card>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <ResumoValor titulo="Ativo total" valor={snapB.ativoTotal} variacao={snapB.ativoTotal - snapA.ativoTotal} />
      <ResumoValor titulo="Passivo total" valor={snapB.passivoTotal} variacao={snapB.passivoTotal - snapA.passivoTotal} />
      <ResumoValor titulo="Patrimônio líquido" valor={snapB.patrimonioLiquido} variacao={snapB.patrimonioLiquido - snapA.patrimonioLiquido} destaque />
      <ResumoValor titulo="Resultado estimado" valor={snapB.resultado} variacao={snapB.resultado - snapA.resultado} />
    </div>

    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Indicadores patrimoniais</h3><p className="text-xs text-muted-foreground">{nomeCenario(cenarioB)} · variação em relação a {nomeCenario(cenarioA)}</p></div><span className="text-xs text-muted-foreground">ROE e ROA usam os saldos finais do período</span></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map((c) => {
        const delta = c.a === null || c.b === null ? null : c.b - c.a;
        return <div key={c.id} className="min-w-0 rounded-md border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">{c.titulo}</p><p className={`num mt-1 truncate text-base font-semibold ${(c.b ?? 0) < 0 ? "text-debit" : ""}`} title={formatarCard(c.b, c.tipo)}>{formatarCard(c.b, c.tipo)}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{delta === null ? "Sem base de comparação" : `${delta >= 0 ? "+" : ""}${formatarCard(delta, c.tipo)} vs. A`}</p></div>;
      })}</div>
    </Card>

    <Card className="p-4 sm:p-5">
      <div className="mb-3"><h3 className="font-semibold">Evolução do patrimônio líquido</h3><p className="text-xs text-muted-foreground">Comparação entre cenários na granularidade selecionada</p></div>
      <div className="h-72 w-full"><ResponsiveContainer><LineChart data={grafico} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="competencia" fontSize={11} /><YAxis fontSize={11} width={82} tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`} /><Tooltip formatter={(v: number) => fmt(v)} labelFormatter={(_l, payload) => payload[0]?.payload.data ? fmtData(payload[0].payload.data) : ""} /><Legend /><ReferenceLine y={0} stroke="var(--debit)" /><Line type="monotone" dataKey="a" name={nomeCenario(cenarioA)} stroke="var(--chart-3)" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="b" name={nomeCenario(cenarioB)} stroke="var(--chart-1)" strokeWidth={2.5} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
    </Card>

    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4 sm:p-5">
        <div><h3 className="font-semibold">Comparação horizontal e variação</h3><p className="text-xs text-muted-foreground">Posição em {fmtData(snapB.data)} · Variação = {nomeCenario(cenarioB)} − {nomeCenario(cenarioA)}</p></div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">Sensibilidade<Select value={modoLimite} onValueChange={(v) => setModoLimite(v === "valor" ? "valor" : "percentual")}><SelectTrigger className="mt-1 w-28 bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percentual">%</SelectItem><SelectItem value="valor">R$</SelectItem></SelectContent></Select></label>
          <label className="text-xs text-muted-foreground">Limiar<Input type="number" min={0} step={modoLimite === "valor" ? 100 : 1} className="mt-1 w-28 bg-card" value={limite} onChange={(e) => setLimite(Math.max(0, numero(e.target.value)))} /></label>
          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-xs"><Checkbox checked={somenteRelevantes} onCheckedChange={(v) => setSomenteRelevantes(v === true)} />Somente relevantes</label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4 text-xs text-muted-foreground sm:px-5"><Badge variant={relevantes.length ? "destructive" : "secondary"}>{relevantes.length} oscilação(ões) relevante(s)</Badge><span>Limiar: {modoLimite === "percentual" ? pct(limite, 0) : fmt(limite)}</span><span>·</span><span>Ativo = Passivo + PL: <strong className="text-credit">{fmt(snapB.diferenca)}</strong></span></div>
      <div className="p-4 pt-3 sm:p-5 sm:pt-3"><div className="overflow-x-auto"><Table>
        <TableHeader><TableRow className="bg-muted/40"><TableHead className="min-w-64">Conta / grupo patrimonial</TableHead><TableHead className="text-right">{nomeCenario(cenarioA)}</TableHead><TableHead className="text-right">{nomeCenario(cenarioB)}</TableHead><TableHead className="text-right">Variação R$</TableHead><TableHead className="text-right">Variação %</TableHead><TableHead className="text-center">Sinal</TableHead></TableRow></TableHeader>
        <TableBody>{linhasVisiveis.map((l) => {
          const alerta = l.tipo === "conta" && oscilacaoRelevante(l, limite, modoLimite);
          if (l.tipo === "grupo") return <TableRow key={l.id} className="bg-primary/5"><TableCell colSpan={6} className="py-2 text-xs font-bold tracking-wider text-primary">{l.rotulo}</TableCell></TableRow>;
          return <TableRow key={l.id} className={alerta ? "bg-destructive/5" : l.tipo === "total" ? "bg-muted/30 font-semibold" : ""}>
            <TableCell className={l.tipo === "conta" ? "pl-6" : ""}><span className={l.tipo === "memo" ? "text-xs font-normal text-muted-foreground" : ""}>{l.rotulo}</span></TableCell>
            <TableCell className="num text-right">{fmt(l.a)}</TableCell><TableCell className="num text-right">{fmt(l.b)}</TableCell>
            <TableCell className={`num text-right ${l.variacao > 0 ? "text-credit" : l.variacao < 0 ? "text-debit" : ""}`}>{l.variacao > 0 ? "+" : ""}{fmt(l.variacao)}</TableCell>
            <TableCell className="num text-right">{l.percentual === null ? "—" : `${l.percentual > 0 ? "+" : ""}${pct(l.percentual)}`}</TableCell>
            <TableCell className="text-center">{alerta ? <Badge variant="destructive" className="gap-1 whitespace-nowrap">{l.variacao >= 0 ? <ArrowUpRight /> : <ArrowDownRight />}Alta oscilação</Badge> : l.tipo === "total" ? <CheckCircle2 className="mx-auto size-4 text-muted-foreground" /> : "—"}</TableCell>
          </TableRow>;
        })}</TableBody>
      </Table></div>{linhasVisiveis.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma variação atingiu o limiar configurado.</p>}</div>
    </Card>

    <div className="grid gap-4 lg:grid-cols-2">
      <Oscilacoes titulo="Maiores variações positivas" linhas={positivas} positivo />
      <Oscilacoes titulo="Maiores variações negativas" linhas={negativas} />
    </div>

    <Card className="border-primary/20 p-5">
      <div className="mb-3 flex items-center gap-2"><Scale className="size-5 text-primary" /><div><h3 className="font-semibold">Parecer técnico automático</h3><p className="text-xs text-muted-foreground">Leitura gerencial baseada nos dados e premissas apresentados</p></div></div>
      <ul className="space-y-2 text-sm leading-relaxed">{parecer.map((p) => <li key={p} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />{p}</li>)}</ul>
      <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">A igualdade contábil é mantida pela linha “Ajustes e saldos contábeis não disponíveis”. Esta análise não substitui o balanço patrimonial escriturado nem a validação do responsável contábil.</p>
    </Card>

    <div className="grid items-start gap-4 xl:grid-cols-2">
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><SlidersHorizontal className="size-5 text-primary" /><div><h3 className="font-semibold">Premissas contábeis interativas</h3><p className="text-xs text-muted-foreground">Aplicadas ao cenário Simulado e aos cenários de sensibilidade</p></div></div><Button variant="outline" size="sm" onClick={() => setPremissas(PREMISSAS_INICIAIS)}><RotateCcw /> Restaurar originais</Button></div>
        <div className="grid gap-4 sm:grid-cols-3"><ConfigNumero id="prem-dep" rotulo="Depreciação anual · CPC 27" valor={premissas.depreciacaoAnual} aoMudar={(v) => atualizarPremissa("depreciacaoAnual", v)} /><ConfigNumero id="prem-pdd" rotulo="PDD / PCLD · CPC 48" valor={premissas.pdd} aoMudar={(v) => atualizarPremissa("pdd", v)} /><ConfigNumero id="prem-ir" rotulo="IRPJ / CSLL efetivo" valor={premissas.impostos} aoMudar={(v) => atualizarPremissa("impostos", v)} /></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-muted-foreground">Regime de apuração<Select value={premissas.regime} onValueChange={(v) => atualizarPremissa("regime", v === "caixa" ? "caixa" : "competencia")}><SelectTrigger className="mt-1 bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="competencia">Regime de competência</SelectItem><SelectItem value="caixa">Regime de caixa</SelectItem></SelectContent></Select></label><label className="flex h-9 cursor-pointer items-center gap-2 self-end rounded-md border bg-card px-3 text-sm"><Checkbox checked={premissas.reservaLegal} onCheckedChange={(v) => atualizarPremissa("reservaLegal", v === true)} />Aplicar reserva legal de 5%</label></div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">No regime de caixa, depreciação e PDD não afetam o resultado. A reserva legal considera 5% do lucro líquido positivo, limitada a 20% do capital social, descontando a reserva já constituída.</p>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Saldos complementares</h3><p className="text-xs text-muted-foreground">Preencha somente valores confirmados; a base atual não os contém</p></div><Button variant="ghost" size="sm" onClick={() => setComplementos(COMPLEMENTOS_INICIAIS)}>Zerar complementos</Button></div>
        <div className="grid gap-4 sm:grid-cols-2"><ConfigNumero id="comp-est" rotulo="Estoques" sufixo="R$" max={999999999999} passo={0.01} valor={complementos.estoques} aoMudar={(v) => atualizarComplemento("estoques", v)} /><ConfigNumero id="comp-imo" rotulo="Imobilizado" sufixo="R$" max={999999999999} passo={0.01} valor={complementos.imobilizado} aoMudar={(v) => atualizarComplemento("imobilizado", v)} /><ConfigNumero id="comp-out" rotulo="Outros ativos circulantes" sufixo="R$" max={999999999999} passo={0.01} valor={complementos.outrosAtivos} aoMudar={(v) => atualizarComplemento("outrosAtivos", v)} /><ConfigNumero id="comp-pnc" rotulo="Passivo de longo prazo" sufixo="R$" max={999999999999} passo={0.01} valor={complementos.passivoLongoPrazo} aoMudar={(v) => atualizarComplemento("passivoLongoPrazo", v)} /><ConfigNumero id="cap-social" rotulo="Capital social" sufixo="R$" max={999999999999} passo={0.01} valor={complementos.capitalSocial} aoMudar={(v) => atualizarComplemento("capitalSocial", v)} /><ConfigNumero id="res-acum" rotulo="Reserva legal já constituída" sufixo="R$" max={999999999999} passo={0.01} valor={complementos.reservaLegalAcumulada} aoMudar={(v) => atualizarComplemento("reservaLegalAcumulada", v)} /></div>
      </Card>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><p>Base / Realizado não adiciona PDD, depreciação ou tributos estimados. Os cenários alteram apenas projeções e premissas, sem modificar os dados importados.</p><p className={statusGravacao === "erro" ? "text-debit" : ""}>{statusGravacao === "salvando" ? "Salvando premissas…" : statusGravacao === "erro" ? "Falha ao salvar premissas" : "Premissas salvas e compartilhadas com a equipe"}</p></div>
  </div>;
}

function SeletorCenario({ id, rotulo, valor, aoMudar, descricao }: { id: string; rotulo: string; valor: CenarioPatrimonio; aoMudar: (v: CenarioPatrimonio) => void; descricao?: string | undefined }) {
  return <div><label htmlFor={id} className="text-xs font-medium text-muted-foreground">{rotulo}</label><Select value={valor} onValueChange={(v) => aoMudar(v as CenarioPatrimonio)}><SelectTrigger id={id} className="mt-1 bg-card"><SelectValue /></SelectTrigger><SelectContent>{CENARIOS.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select><p className="mt-1 text-[11px] text-muted-foreground">{descricao}</p></div>;
}

function ResumoValor({ titulo, valor, variacao, destaque = false }: { titulo: string; valor: number; variacao: number; destaque?: boolean }) {
  return <Card className={`p-4 ${destaque ? "border-accent bg-accent/20" : ""}`}><p className="text-xs uppercase tracking-wider text-muted-foreground">{titulo}</p><p className={`num mt-1 text-xl font-semibold ${valor < 0 ? "text-debit" : ""}`}>{fmt(valor)}</p><p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">{variacao >= 0 ? <TrendingUp className="size-3 text-credit" /> : <TrendingDown className="size-3 text-debit" />}{variacao >= 0 ? "+" : ""}{fmt(variacao)} vs. cenário A</p></Card>;
}

function Oscilacoes({ titulo, linhas, positivo = false }: { titulo: string; linhas: { id: string; rotulo: string; variacao: number; percentual: number | null }[]; positivo?: boolean }) {
  return <Card className="p-5"><div className="mb-3 flex items-center gap-2">{positivo ? <TrendingUp className="size-5 text-credit" /> : <TrendingDown className="size-5 text-debit" />}<h3 className="font-semibold">{titulo}</h3></div>{linhas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma variação neste sentido.</p> : <div className="space-y-3">{linhas.map((l) => <div key={l.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-medium">{l.rotulo}</p><p className="text-xs text-muted-foreground">{pct(l.percentual)}</p></div><span className={`num whitespace-nowrap text-sm font-semibold ${positivo ? "text-credit" : "text-debit"}`}>{l.variacao > 0 ? "+" : ""}{fmt(l.variacao)}</span></div>)}</div>}</Card>;
}
