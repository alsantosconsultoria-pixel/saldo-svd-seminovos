import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Upload, Download, Trash2, RotateCcw, Printer, LogOut, FileText, FileSpreadsheet, ChevronRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { categoria, parseLinhas, saldoDiario, type Extrato } from "@/lib/extrato/parser";
import { deJSON, exportar, fmt, fmtData, useExtratos } from "@/lib/extrato/store";
import { importarPrevisoes } from "@/lib/importar-previsoes";
import { associar, extratoSemVinculo, mesmaConta, carregarRealizados, importarRealizado, type Realizado } from "@/lib/realizado";
import { PendenciasRealizado } from "@/components/PendenciasRealizado";
import { SaldoDiario } from "@/components/SaldoDiario";
import { TabelaLancamentos } from "@/components/TabelaLancamentos";
import { Tratativas } from "@/components/Tratativas";
import { Previsoes } from "@/components/Previsoes";
import { RelatorioPainel } from "@/components/RelatorioPainel";
import { ResumoPlano } from "@/components/ResumoPlano";
import { fluxoPorPlano, idLinhaPlano, itensForecast, totaisPorPlano, type ContaPlano } from "@/lib/plano";
import type { DiaFluxo } from "@/lib/fluxo";
import { CompartilharRelatorio } from "@/components/CompartilharRelatorio";
import { saldoNaData, ultimoSaldoExtrato } from "@/lib/tratativas";
import { souAdmin } from "@/lib/admin.functions";
import { AdminUsuarios } from "@/components/AdminUsuarios";
import { AdminPlano } from "@/components/AdminPlano";
import { MinhaSenha } from "@/components/MinhaSenha";
import { AdminDados } from "@/components/AdminDados";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Saldo Diário — Controle multi-bancos por extrato PDF" },
      { name: "description", content: "Importe extratos PDF, valide saldos e acompanhe o saldo diário consolidado de todos os bancos." },
      { property: "og:title", content: "Saldo Diário — Controle multi-bancos" },
      { property: "og:description", content: "Leitor de extratos PDF com relatório gerencial de saldo diário." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const contaLabel = (e: Extrato) => `${e.banco} · Ag ${e.agencia} · CC ${e.conta}`;

// Painel: primeiro os saldos; o clique abre o detalhe (categorias, maiores saídas ou um lançamento).
type VistaPainel = { tipo: "composicao"; titulo: string; itens: Realizado[] };

function Index() {
  const { lista, add, remove, reset } = useExtratos();
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState("todos");
  const [carregando, setCarregando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const inputJSON = useRef<HTMLInputElement>(null);
  const inputPlanilha = useRef<HTMLInputElement>(null);
  const importando = useRef(false);
  const [arrastando, setArrastando] = useState(false);
  const [atualizacaoPrevisoes, setAtualizacaoPrevisoes] = useState(0);
  const [realizados, setRealizados] = useState<Realizado[]>([]);
  const inputRealizado = useRef<HTMLInputElement>(null);
  const recarregarRealizados = () => carregarRealizados().then(setRealizados).catch(() => {});
  useEffect(() => {
    recarregarRealizados();
    const ch = supabase.channel("realizados").on("postgres_changes", { event: "*", schema: "public", table: "realizados" }, recarregarRealizados).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
  const associacao = useMemo(() => associar(realizados, lista), [realizados, lista]);
  async function importarRealizadoArquivo(files: FileList | null) {
    const f = files?.[0];
    if (inputRealizado.current) inputRealizado.current.value = "";
    if (!f) return;
    const aviso = toast.loading(`Lendo realizado de ${f.name}...`);
    try {
      const r = await importarRealizado(f);
      toast.success(`${r.lidos} lançamentos realizados lidos, ${r.novos} novos (repetidos ignorados).`, { id: aviso });
      recarregarRealizados();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível ler a planilha.", { id: aviso }); }
  }
  const [relatorioPainel, setRelatorioPainel] = useState(false);
  const [aba, setAba] = useState("painel");
  const [lancDe, setLancDe] = useState("");
  const [lancConta, setLancConta] = useState("todas");
  const [lancAte, setLancAte] = useState("");
  const relatorioRef = useRef<HTMLDivElement>(null);
  const [painelDe, setPainelDe] = useState("");
  const [painelAte, setPainelAte] = useState("");
  const [vista, setVista] = useState<VistaPainel | null>(null);
  const [admin, setAdmin] = useState(false);
  useEffect(() => { souAdmin().then((r) => setAdmin(r.admin)).catch(() => setAdmin(false)); }, []);
  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const ativos = filtro === "todos" ? lista : lista.filter((e) => e.id === filtro);

  const consolidado = useMemo(() => {
    const porConta = ativos.map((e) => ({ e, dias: saldoDiario(e) }));
    const datas = [...new Set(porConta.flatMap((p) => p.dias.map((d) => d.data)))].sort();
    return datas.map((data) => {
      let saldo = 0, entradas = 0, saidas = 0;
      porConta.forEach(({ e, dias }) => {
        const hoje = dias.find((d) => d.data === data);
        const ult = [...dias].reverse().find((d) => d.data <= data);
        saldo += saldoNaData(e, data)?.saldo ?? (ult ? ult.fechamento : e.saldoInicial);
        entradas += hoje?.entradas ?? 0;
        saidas += hoje?.saidas ?? 0;
      });
      return { data, label: fmtData(data).slice(0, 5), saldo, entradas, saidas };
    });
  }, [ativos]);

  const transacoes = ativos.flatMap((e) => e.transacoes.map((t) => ({ ...t, banco: e.banco, conta: e.conta, extratoId: e.id })));
  // painel: saldo do último dia de cada extrato — nunca acumulado/somado entre dias
  const diaAntes = (d: string) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
  const saldoIni = ativos.reduce((a, e) => a + (painelDe ? saldoNaData(e, diaAntes(painelDe))?.saldo ?? e.saldoInicial : e.saldoInicial), 0);
  const saldosAtuais = ativos.map(ultimoSaldoExtrato);
  const saldoFim = painelAte ? ativos.reduce((a, e) => a + (saldoNaData(e, painelAte)?.saldo ?? 0), 0) : saldosAtuais.reduce((a, s) => a + s.saldo, 0);
  const saldoParcial = saldosAtuais.some((s) => s.parcial);
  const totE = transacoes.filter((t) => t.tipo === "C").reduce((a, b) => a + b.valor, 0);
  const totS = transacoes.filter((t) => t.tipo === "D").reduce((a, b) => a + b.valor, 0);

  // lançamentos: filtro por período + totais do período filtrado
  const noPeriodo = (d: string) => (!lancDe || d >= lancDe) && (!lancAte || d <= lancAte);
  const lancFiltrados = useMemo(
    () => transacoes.filter((t) => noPeriodo(t.data) && (lancConta === "todas" || t.extratoId === lancConta)).sort((a, b) => a.data.localeCompare(b.data)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transacoes, lancDe, lancAte, lancConta],
  );
  const contaSel = lista.find((e) => e.id === lancConta);
  const pendReal = associacao.pendentes.filter((r) => noPeriodo(r.data) && (!contaSel || mesmaConta(r.conta, contaSel)));
  const pendExt = extratoSemVinculo(lista, associacao.porLanc, realizados)
    .filter((t) => noPeriodo(t.data) && (!contaSel || t.extratoId === contaSel.id));
  // painel: categorias e maiores lançamentos vêm da base do realizado, no período do filtro
  const realPainel = useMemo(() => realizados.filter((r) => (!painelDe || r.data >= painelDe) && (!painelAte || r.data <= painelAte)), [realizados, painelDe, painelAte]);
  const ultimoRealizado = realizados.reduce((m, r) => (r.data > m ? r.data : m), "");
  const cats = useMemo(() => {
    const m = new Map<string, { cat: string; entradas: number; saidas: number }>();
    realPainel.forEach((r) => {
      const c = r.categoria || "Sem categoria";
      const x = m.get(c) ?? { cat: c, entradas: 0, saidas: 0 };
      if (r.tipo === "receber") x.entradas += r.valor; else x.saidas += r.valor;
      m.set(c, x);
    });
    return [...m.values()].sort((a, b) => b.saidas + b.entradas - (a.saidas + a.entradas));
  }, [realPainel]);

  const hojeIso = new Date().toISOString().slice(0, 10);
  // futuros só aparecem enquanto a data prevista ainda não chegou; débitos só contam quando saem no extrato
  const futuros = ativos.flatMap((e) => (e.futuros ?? []).filter((t) => t.data > hojeIso).map((t) => ({ ...t, banco: e.banco })));
  const futReceber = futuros.filter((t) => t.tipo === "C").reduce((a, b) => a + b.valor, 0);
  const futPagar = futuros.filter((t) => t.tipo === "D").reduce((a, b) => a + b.valor, 0);
  const topReal = [...realPainel].filter((r) => r.tipo === "pagar").sort((a, b) => b.valor - a.valor).slice(0, 8);
  const topSaidas = topReal.map((r) => ({ id: r.id, data: r.data, descricao: r.descricao, contraparte: r.contraparte, valor: r.valor, tipo: "D", banco: r.conta, conta: r.conta })) as unknown as Parameters<typeof RelatorioPainel>[0]["maioresSaidas"];
  const catEntradas = cats.reduce((a, c) => a + c.entradas, 0);
  const catSaidas = cats.reduce((a, c) => a + c.saidas, 0);
  const topTotal = topReal.reduce((a, r) => a + r.valor, 0);

  // plano financeiro + previsões para o painel e o forecast
  const [planoContas, setPlanoContas] = useState<ContaPlano[]>([]);
  const [planoMapa, setPlanoMapa] = useState<Record<string, string>>({});
  const [prevs, setPrevs] = useState<{ tipo: string; vencimento: string; categoria: string; valor: number }[]>([]);
  useEffect(() => {
    const ler = async () => {
      const [c, m, p] = await Promise.all([supabase.from("plano_contas").select("*"), supabase.from("plano_categorias").select("*"), supabase.from("previsoes").select("tipo,vencimento,categoria,valor")]);
      setPlanoContas((c.data ?? []) as ContaPlano[]);
      setPlanoMapa(Object.fromEntries((m.data ?? []).map((x) => [x.categoria, x.conta_id])));
      setPrevs((p.data ?? []).map((x) => ({ ...x, valor: Number(x.valor) })));
    };
    ler();
    const ch = supabase.channel("painel-plano").on("postgres_changes", { event: "*", schema: "public", table: "previsoes" }, ler).on("postgres_changes", { event: "*", schema: "public", table: "plano_categorias" }, ler).on("postgres_changes", { event: "*", schema: "public", table: "plano_contas" }, ler).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [atualizacaoPrevisoes]);
  const itensReal = realPainel.map((r) => ({ tipo: r.tipo, vencimento: r.data, categoria: r.categoria, valor: r.valor }));
  const resumoPlano = useMemo(() => totaisPorPlano(itensReal, planoContas, planoMapa), [realPainel, planoContas, planoMapa]); // eslint-disable-line react-hooks/exhaustive-deps
  const maioresPlano = useMemo(() => [...(resumoPlano[1]?.filhos ?? [])].filter((f) => f.total).sort((a, b) => b.total - a.total).slice(0, 8), [resumoPlano]);
  const maioresTotal = maioresPlano.reduce((a, f) => a + f.total, 0);
  const abrirCategoria = (id: string, rotulo: string) => setVista({ tipo: "composicao", titulo: rotulo, itens: realPainel.filter((r) => idLinhaPlano(r.tipo, r.categoria, planoContas, planoMapa) === id).sort((a, b) => b.valor - a.valor) });
  // consolidado (gráficos) respeita o filtro de datas
  const consolidadoPainel = useMemo(() => consolidado.filter((d) => (!painelDe || d.data >= painelDe) && (!painelAte || d.data <= painelAte)), [consolidado, painelDe, painelAte]);
  // forecast do relatório: realizado até hoje, previsões depois; período = filtro (ou 14 dias para trás/frente)
  const somaDias = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const fcDe = painelDe || somaDias(hojeIso, -14);
  const fcAte = painelAte && painelAte >= fcDe ? painelAte : somaDias(fcDe > hojeIso ? fcDe : hojeIso, 14);
  const forecast = useMemo(() => {
    const dias: string[] = [];
    for (let d = fcDe, i = 0; d <= fcAte && i < 370; d = somaDias(d, 1), i++) dias.push(d);
    const itens = itensForecast(realizados.filter((r) => r.data >= fcDe && r.data <= fcAte), prevs.filter((p) => p.vencimento >= fcDe && p.vencimento <= fcAte), hojeIso);
    const linhas = fluxoPorPlano(itens, dias, planoContas, planoMapa, fcDe);
    const ultExt = ativos.map((e) => ultimoSaldoExtrato(e).data).filter(Boolean).sort().at(-1) ?? "";
    const saldoBanco = (d: string) => ativos.reduce((a, e) => a + (saldoNaData(e, d)?.saldo ?? e.saldoInicial), 0);
    let saldo = saldoBanco(diaAntes(fcDe));
    const ini0 = saldo;
    const periodo: DiaFluxo[] = dias.map((data, i) => {
      const r = linhas[0]?.valores[i] ?? 0, p = linhas[1]?.valores[i] ?? 0;
      const inicial = saldo;
      saldo = data <= ultExt && data <= hojeIso ? saldoBanco(data) : Math.round((inicial + r - p) * 100) / 100;
      return { data, inicial, receber: r, pagar: p, final: saldo, faltante: saldo < 0 ? Math.min(-saldo, p) : 0 };
    });
    const soma = (t: string, proj: boolean) => itens.filter((x) => x.tipo === t && (x.vencimento > hojeIso) === proj).reduce((a, x) => a + x.valor, 0);
    return { linhas, periodo, saldoIni: ini0, realE: soma("receber", false), realS: soma("pagar", false), projE: soma("receber", true), projS: soma("pagar", true) };
  }, [fcDe, fcAte, realizados, prevs, planoContas, planoMapa, ativos, hojeIso]); // eslint-disable-line react-hooks/exhaustive-deps

  async function importar(files: File[]) {
    if (!files?.length) return;
    const { pdfParaLinhas } = await import("@/lib/extrato/pdf");
    for (const f of Array.from(files)) {
      const id = toast.loading(`Lendo ${f.name}...`);
      try {
        const { linhas, ocr } = await pdfParaLinhas(
          await f.arrayBuffer(),
          async (erro) => {
            toast.dismiss(id);
            return window.prompt(`${erro ? "Senha incorreta. " : ""}O arquivo ${f.name} tem senha. Digite a senha do PDF:`);
          },
          (msg) => toast.loading(msg, { id }),
        );
        const e = parseLinhas(linhas, f.name, ocr);
        toast.dismiss(id);
        if (!e.transacoes.length && !e.saldosInformados.length && !e.futuros?.length && !/lan[çc]amentos/i.test(linhas.flat().map((x) => x.text).join(" "))) {
          toast.error(`${f.name}: nenhum lançamento ou saldo encontrado.`);
          continue;
        }
        add(e);
        const ultimoSaldo = ultimoSaldoExtrato(e);
        toast.success(`${e.banco}: ${e.transacoes.length} lançamentos, saldo ${ultimoSaldo.parcial ? "parcial calculado" : "informado"} ${fmt(ultimoSaldo.saldo)}${ocr ? " (lido por OCR — confira)" : ""}`);
      } catch (err) {
        toast.dismiss(id);
        toast.error(`${f.name}: não foi possível ler o PDF`);
        console.error(err);
      }
    }
    if (input.current) input.current.value = "";
  }

  async function importarArquivos(files: FileList | File[] | null) {
    if (!files?.length || importando.current) return;
    importando.current = true;
    setCarregando(true);
    setArrastando(false);
    try {
      const arquivos = Array.from(files);
      const pdfs = arquivos.filter((f) => /\.pdf$/i.test(f.name));
      const planilhas = arquivos.filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
      if (pdfs.length + planilhas.length !== arquivos.length) toast.error("Use extratos PDF ou planilhas Excel/CSV.");
      if (pdfs.length) await importar(pdfs);
      for (const arquivo of planilhas) {
        const aviso = toast.loading(`Lendo ${arquivo.name}...`);
        try {
          const total = await importarPrevisoes(arquivo);
          toast.success(`${total} previsões importadas.`, { id: aviso });
          setAtualizacaoPrevisoes((v) => v + 1);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Não foi possível ler a planilha.", { id: aviso });
        }
      }
    } catch {
      toast.error("Não foi possível importar os arquivos. Tente novamente.");
    } finally {
      importando.current = false;
      setCarregando(false);
      if (input.current) input.current.value = "";
      if (inputPlanilha.current) inputPlanilha.current.value = "";
    }
  }

  function restaurarJSON(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    f.text().then((txt) => {
      try {
        const contas = deJSON(txt);
        if (!contas.length) { toast.error("O arquivo não tem contas."); return; }
        contas.forEach(add);
        toast.success(`${contas.length} ${contas.length === 1 ? "conta restaurada" : "contas restauradas"} do JSON. Já existentes não foram duplicadas.`);
      } catch {
        toast.error("JSON inválido — use o arquivo exportado pelo próprio app.");
      }
    });
    if (inputJSON.current) inputJSON.current.value = "";
  }

  function baixarCSV() {
    const h = "banco;conta;data;descricao;contraparte;documento;tipo;valor\n";
    const rows = transacoes.map((t) => [t.banco, t.conta, t.data, t.descricao, t.contraparte, t.documento, t.tipo, t.valor.toFixed(2).replace(".", ",")].join(";"));
    exportar("lancamentos.csv", "\uFEFF" + h + rows.join("\n"), "text/csv");
  }
  function baixarJSON() {
    const out = ativos.map((e) => ({
      banco: e.banco, agencia: e.agencia, conta: e.conta, titular: e.titular,
      saldo_inicial: e.saldoInicial, saldo_final_informado: e.saldoFinalInformado,
      saldo_diario: saldoDiario(e),
      transacoes: e.transacoes.map(({ id: _id, ...t }) => t),
    }));
    exportar("extratos.json", JSON.stringify(out, null, 2), "application/json");
  }

  return (
    <div className="min-h-screen" onDragOver={(e) => {
      if (!Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = carregando ? "none" : "copy";
      if (!carregando) setArrastando(true);
    }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false); }} onDrop={(e) => {
      e.preventDefault();
      setArrastando(false);
      void importarArquivos(e.dataTransfer.files);
    }}>
      {arrastando && <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-4 border-dashed border-accent bg-background/95">
        <div className="flex flex-col items-center gap-3 text-primary"><Upload className="size-12" /><p className="text-xl font-semibold">Importar arquivos</p><p className="text-sm text-muted-foreground">Extratos PDF · Planilhas Excel / CSV</p></div>
      </div>}
      <header className="border-b bg-primary text-primary-foreground print:bg-transparent print:text-foreground">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] opacity-70">Relatório gerencial</p>
            <h1 className="text-2xl font-semibold">Saldo Diário · Multi-bancos</h1>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 print:hidden sm:flex sm:w-auto sm:flex-wrap">
             <input ref={input} type="file" accept="application/pdf" multiple hidden onChange={(e) => importarArquivos(e.target.files)} />
            <Button variant="secondary" onClick={() => input.current?.click()} disabled={carregando}>
              <Upload /> {carregando ? "Importando..." : "Importar extrato PDF"}
            </Button>
            <input ref={inputPlanilha} type="file" accept=".xlsx,.xls,.csv" multiple hidden onChange={(e) => importarArquivos(e.target.files)} />
            <Button variant="secondary" onClick={() => inputPlanilha.current?.click()} disabled={carregando}><FileSpreadsheet /> Importar previsões</Button>
            <input ref={inputRealizado} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => importarRealizadoArquivo(e.target.files)} />
            <Button variant="secondary" onClick={() => inputRealizado.current?.click()} disabled={carregando}><FileSpreadsheet /> Importar realizado</Button>
            <Button variant="secondary" onClick={() => window.print()}><Printer /> Imprimir</Button>
            <MinhaSenha />
            <Button variant="secondary" onClick={sair}><LogOut /> Sair</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-4 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Select value={filtro} onValueChange={setFiltro}>
            <SelectTrigger className="w-full bg-card sm:w-80"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as contas ({lista.length})</SelectItem>
              {lista.map((e) => <SelectItem key={e.id} value={e.id}>{contaLabel(e)}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2 print:hidden">
            <input ref={inputJSON} type="file" accept=".json,application/json" hidden onChange={(e) => restaurarJSON(e.target.files)} />
            <Button variant="outline" size="sm" onClick={() => inputJSON.current?.click()}><Upload /> Restaurar JSON</Button>
            <Button variant="outline" size="sm" onClick={baixarCSV}><Download /> CSV</Button>
            <Button variant="outline" size="sm" onClick={baixarJSON}><Download /> JSON</Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 print:hidden">
          <label className="text-xs text-muted-foreground">Data inicial<Input type="date" className="w-40 bg-card" value={painelDe} onChange={(e) => setPainelDe(e.target.value)} /></label>
          <label className="text-xs text-muted-foreground">Data final<Input type="date" className="w-40 bg-card" value={painelAte} onChange={(e) => setPainelAte(e.target.value)} /></label>
          {(painelDe || painelAte) && <Button variant="ghost" size="sm" onClick={() => { setPainelDe(""); setPainelAte(""); }}>Limpar período</Button>}
          <Button variant="ghost" size="sm" onClick={() => { setPainelDe(hojeIso); setPainelAte(hojeIso); }}>Hoje</Button>
          <p className="ml-auto text-sm">Último dia do realizado: <span className="num font-semibold">{ultimoRealizado ? fmtData(ultimoRealizado) : "sem planilha importada"}</span></p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Kpi titulo={painelDe ? `Saldo inicial em ${fmtData(painelDe)}` : "Saldo inicial"} valor={saldoIni} />
          <Kpi titulo={painelAte ? `Saldo final em ${fmtData(painelAte)}` : saldoParcial ? "Saldo do último dia (inclui saldo parcial calculado)" : "Saldo final (último dia do extrato)"} valor={saldoFim} destaque />
        </div>

        <Tabs value={aba} onValueChange={(valor) => { setAba(valor); setRelatorioPainel(false); }}>
          <div className="-mx-4 overflow-x-auto px-4 pb-1 print:hidden sm:mx-0 sm:px-0">
            <TabsList className="w-max">
              <TabsTrigger value="painel">Painel</TabsTrigger>
              <TabsTrigger value="diario">Saldo diário</TabsTrigger>
              <TabsTrigger value="lanc">Lançamentos</TabsTrigger>
              <TabsTrigger value="contas">Contas</TabsTrigger>
              <TabsTrigger value="tratativas">Tratativas do dia</TabsTrigger>
              <TabsTrigger value="previsoes">Fluxo</TabsTrigger>
              {admin && <TabsTrigger value="admin">Administração</TabsTrigger>}
            </TabsList>
          </div>

          <TabsContent value="tratativas"><Tratativas lista={lista} /></TabsContent>
          {admin && <TabsContent value="admin" className="space-y-4"><AdminUsuarios /><AdminPlano /><AdminDados /></TabsContent>}
          <TabsContent value="previsoes"><Previsoes lista={lista} atualizacao={atualizacaoPrevisoes} realizados={realizados} /></TabsContent>

          <TabsContent value="painel" className={`space-y-4 ${relatorioPainel ? "dashboard-presentation" : ""}`}>
            <div className="dashboard-controls flex flex-wrap items-center justify-between gap-3 border-b pb-4 print:hidden">
              <h2 className="text-xl font-semibold">Demonstração gerencial</h2>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setRelatorioPainel((v) => !v)}><FileText />{relatorioPainel ? "Voltar ao Painel" : "Relatório do Painel"}</Button>
                {relatorioPainel && <><Button onClick={() => window.print()}><Printer /> Imprimir / PDF</Button><CompartilharRelatorio titulo="Demonstrativo gerencial de saldos · Grupo SVD" resumo={`Contas selecionadas: ${ativos.length}. Saldo inicial: ${fmt(saldoIni)}. Saldo final (último dia do extrato): ${fmt(saldoFim)}.`} arquivo={`painel-${hojeIso}`} obterRelatorio={() => relatorioRef.current?.querySelector("article") ?? null} /></>}
              </div>
            </div>
            {relatorioPainel && <div ref={relatorioRef} className="treasury-report-container"><RelatorioPainel contas={ativos} periodo={forecast.periodo} corte={hojeIso} linhas={forecast.linhas} saldoIni={forecast.saldoIni} realE={forecast.realE} realS={forecast.realS} projE={forecast.projE} projS={forecast.projS} maiores={maioresPlano} onCategoria={abrirCategoria} /></div>}
            <div className={`dashboard-editor space-y-4 ${relatorioPainel ? "hidden" : ""}`}>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h3 className="mb-3 font-semibold">Evolução do saldo consolidado</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={consolidadoPainel}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" fontSize={12} />
                    <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Area dataKey="saldo" stroke="var(--chart-3)" fill="var(--chart-1)" fillOpacity={0.25} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
              <Card className="p-5">
                <h3 className="mb-3 font-semibold">Entradas × saídas por dia</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={consolidadoPainel}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" fontSize={12} />
                    <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="entradas" fill="var(--credit)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="saidas" fill="var(--debit)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h3 className="mb-1 font-semibold">Por conta financeira <span className="text-xs font-normal text-muted-foreground">(realizado)</span></h3>
                <p className="mb-3 text-xs text-muted-foreground">Clique no saldo para abrir as contas e as categorias.</p>
                {realPainel.length === 0 ? <p className="text-sm text-muted-foreground">Sem realizado no período. Importe a planilha ou ajuste as datas.</p> : <ResumoPlano linhas={resumoPlano} onCategoria={abrirCategoria} />}
              </Card>
              <Card className="p-5">
                <div className="mb-1 flex items-baseline justify-between gap-2"><h3 className="font-semibold">Maiores saídas <span className="text-xs font-normal text-muted-foreground">(por conta financeira)</span></h3>{maioresPlano.length > 0 && <span className="num text-sm font-semibold text-debit">{fmt(maioresTotal)}</span>}</div>
                <p className="mb-3 text-xs text-muted-foreground">As {maioresPlano.length || ""} contas com maior saída no período; clique para abrir as categorias.</p>
                {maioresPlano.length === 0 ? <p className="text-sm text-muted-foreground">Sem saídas realizadas no período.</p> : <ResumoPlano linhas={maioresPlano} onCategoria={abrirCategoria} />}
              </Card>
            </div>
            <Dialog open={!!vista} onOpenChange={(o) => !o && setVista(null)}>
              <DialogContent className="max-w-4xl">
                <DialogHeader>
                  <DialogTitle>{vista?.titulo} · <span className="num">{fmt((vista?.itens ?? []).reduce((a, r) => a + r.valor, 0))}</span></DialogTitle>
                </DialogHeader>
                {vista && vista.tipo === "composicao" && (
                  <>
                    <div className="max-h-[65vh] overflow-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead>Data baixa</TableHead><TableHead>Cliente/Fornecedor</TableHead><TableHead>Descrição</TableHead><TableHead>Documento</TableHead><TableHead>Conta</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
                        <TableBody>{vista.itens.map((r) => <TableRow key={r.id}>
                          <TableCell className="num">{fmtData(r.data)}</TableCell><TableCell>{r.contraparte}</TableCell><TableCell className="text-sm">{r.descricao}<div className="text-xs text-muted-foreground">{r.categoria}</div></TableCell><TableCell>{r.documento}</TableCell><TableCell className="text-xs">{r.conta}</TableCell>
                          <TableCell className={`num text-right ${r.tipo === "pagar" ? "text-debit" : "text-credit"}`}>{fmt(r.valor)}</TableCell>
                        </TableRow>)}</TableBody>
                      </Table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Button variant="ghost" size="sm" onClick={() => setVista(null)}><ArrowLeft /> Fechar</Button>
                      <p className="text-sm font-semibold">Total: <span className="num">{fmt(vista.itens.reduce((a, r) => a + r.valor, 0))}</span></p>
                    </div>
                  </>
                )}
              </DialogContent>
            </Dialog>
            {futuros.length > 0 && (
              <Card className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                <h3 className="font-semibold">Previsões futuras dos extratos</h3>
                <div className="flex flex-wrap items-center gap-6">
                  <p className="text-sm">A receber: <span className="num font-semibold text-credit">{fmt(futReceber)}</span></p>
                  <p className="text-sm">A pagar: <span className="num font-semibold text-debit">-{fmt(futPagar)}</span></p>
                  <p className="text-sm">Saldo previsto: <span className={`num font-semibold ${futReceber - futPagar >= 0 ? "text-credit" : "text-debit"}`}>{fmt(futReceber - futPagar)}</span></p>
                </div>
              </Card>
            )}
            </div>
          </TabsContent>

          <TabsContent value="diario"><SaldoDiario contas={ativos} /></TabsContent>

          <TabsContent value="lanc">
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground" htmlFor="lanc-de">De</label>
                  <Input id="lanc-de" type="date" value={lancDe} onChange={(e) => setLancDe(e.target.value)} className="w-40" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground" htmlFor="lanc-ate">Até</label>
                  <Input id="lanc-ate" type="date" value={lancAte} onChange={(e) => setLancAte(e.target.value)} className="w-40" />
                </div>
                <Button variant="ghost" size="sm" className="h-9" onClick={() => { setLancDe(hojeIso); setLancAte(hojeIso); }}>Hoje</Button>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground" htmlFor="lanc-conta">Conta bancária</label>
                  <select id="lanc-conta" value={lancConta} onChange={(e) => setLancConta(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="todas">Todas as contas</option>
                    {lista.map((e) => <option key={e.id} value={e.id}>{e.banco} · CC {e.conta}</option>)}
                  </select>
                </div>
                {(lancDe || lancAte || lancConta !== "todas") && (
                  <Button variant="ghost" size="sm" onClick={() => { setLancDe(""); setLancAte(""); setLancConta("todas"); }}>Limpar filtro</Button>
                )}
                <span className="ml-auto text-sm text-muted-foreground">{lancFiltrados.length} lançamentos</span>
              </div>
              <TabelaLancamentos itens={lancFiltrados} vinculos={associacao.porLanc} />
            </Card>
            <Card className="mt-4 p-5">
              <PendenciasRealizado pendentes={pendReal} extrato={pendExt} lista={lista} aoVincular={recarregarRealizados} />
            </Card>
          </TabsContent>

          <TabsContent value="contas" className="space-y-3">
            {lista.map((e) => (
              <Card key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
                <div className="min-w-0">
                  <div className="font-semibold">{contaLabel(e)}</div>
                  <div className="text-sm text-muted-foreground">{e.titular} · {e.arquivo} · {e.transacoes.length} lançamentos</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right"><span className="num font-semibold">{fmt(ultimoSaldoExtrato(e).saldo)}</span><p className="text-xs text-muted-foreground">{ultimoSaldoExtrato(e).data && fmtData(ultimoSaldoExtrato(e).data)} · {ultimoSaldoExtrato(e).parcial ? "Saldo parcial calculado" : "Saldo informado"}</p></div>
                  <Button variant="ghost" size="icon" onClick={() => remove(e.id)} aria-label="Remover"><Trash2 /></Button>
                </div>
              </Card>
            ))}
            <Button variant="outline" onClick={reset}><RotateCcw /> Restaurar demonstração</Button>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function Kpi({ titulo, valor, cor = "", destaque = false }: { titulo: string; valor: number; cor?: string; destaque?: boolean }) {
  return (
    <Card className={`p-5 ${destaque ? "border-accent bg-accent/30" : ""}`}>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{titulo}</p>
      <p className={`num mt-1 text-2xl font-semibold ${cor}`}>{fmt(valor)}</p>
    </Card>
  );
}
