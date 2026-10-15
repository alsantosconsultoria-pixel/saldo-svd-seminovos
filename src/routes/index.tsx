import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Upload, Download, Trash2, CheckCircle2, AlertTriangle, RotateCcw, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { categoria, parseLinhas, saldoDiario, type Extrato } from "@/lib/extrato/parser";
import { deJSON, exportar, fmt, fmtData, useExtratos } from "@/lib/extrato/store";

export const Route = createFileRoute("/")({
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

function Index() {
  const { lista, add, remove, reset } = useExtratos();
  const [filtro, setFiltro] = useState("todos");
  const [carregando, setCarregando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const inputJSON = useRef<HTMLInputElement>(null);

  const ativos = filtro === "todos" ? lista : lista.filter((e) => e.id === filtro);

  const consolidado = useMemo(() => {
    const porConta = ativos.map((e) => ({ e, dias: saldoDiario(e) }));
    const datas = [...new Set(porConta.flatMap((p) => p.dias.map((d) => d.data)))].sort();
    return datas.map((data) => {
      let saldo = 0, entradas = 0, saidas = 0;
      porConta.forEach(({ e, dias }) => {
        const hoje = dias.find((d) => d.data === data);
        const ult = [...dias].reverse().find((d) => d.data <= data);
        saldo += ult ? ult.fechamento : e.saldoInicial;
        entradas += hoje?.entradas ?? 0;
        saidas += hoje?.saidas ?? 0;
      });
      return { data, label: fmtData(data).slice(0, 5), saldo, entradas, saidas };
    });
  }, [ativos]);

  const transacoes = ativos.flatMap((e) => e.transacoes.map((t) => ({ ...t, banco: e.banco, conta: e.conta })));
  const totE = transacoes.filter((t) => t.tipo === "C").reduce((a, b) => a + b.valor, 0);
  const totS = transacoes.filter((t) => t.tipo === "D").reduce((a, b) => a + b.valor, 0);
  const saldoIni = ativos.reduce((a, e) => a + e.saldoInicial, 0);
  const saldoFim = consolidado.at(-1)?.saldo ?? saldoIni;

  const cats = useMemo(() => {
    const m = new Map<string, { cat: string; entradas: number; saidas: number }>();
    transacoes.forEach((t) => {
      const c = categoria(t.descricao);
      const r = m.get(c) ?? { cat: c, entradas: 0, saidas: 0 };
      if (t.tipo === "C") r.entradas += t.valor; else r.saidas += t.valor;
      m.set(c, r);
    });
    return [...m.values()].sort((a, b) => b.saidas + b.entradas - (a.saidas + a.entradas));
  }, [transacoes]);

  const hojeIso = new Date().toISOString().slice(0, 10);
  // futuros só aparecem enquanto a data prevista ainda não chegou; débitos só contam quando saem no extrato
  const futuros = ativos.flatMap((e) => (e.futuros ?? []).filter((t) => t.data > hojeIso).map((t) => ({ ...t, banco: e.banco })));
  const topSaidas = [...transacoes].filter((t) => t.tipo === "D").sort((a, b) => b.valor - a.valor).slice(0, 8);

  async function importar(files: FileList | null) {
    if (!files?.length) return;
    setCarregando(true);
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
        toast.success(`${e.banco}: ${e.transacoes.length} lançamentos${e.saldoFinalInformado !== null ? `, saldo ${fmt(e.saldoFinalInformado)}` : ""}${ocr ? " (lido por OCR — confira)" : ""}`);
      } catch (err) {
        toast.dismiss(id);
        toast.error(`${f.name}: não foi possível ler o PDF`);
        console.error(err);
      }
    }
    setCarregando(false);
    if (input.current) input.current.value = "";
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
    <div className="min-h-screen">
      <Toaster />
      <header className="border-b bg-primary text-primary-foreground print:bg-transparent print:text-foreground">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] opacity-70">Relatório gerencial</p>
            <h1 className="text-2xl font-semibold">Saldo Diário · Multi-bancos</h1>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <input ref={input} type="file" accept="application/pdf" multiple hidden onChange={(e) => importar(e.target.files)} />
            <Button variant="secondary" onClick={() => input.current?.click()} disabled={carregando}>
              <Upload /> {carregando ? "Lendo PDF..." : "Importar extrato PDF"}
            </Button>
            <Button variant="secondary" onClick={() => window.print()}><Printer /> Imprimir</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Select value={filtro} onValueChange={setFiltro}>
            <SelectTrigger className="w-80 bg-card"><SelectValue /></SelectTrigger>
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi titulo="Saldo inicial" valor={saldoIni} />
          <Kpi titulo="Entradas" valor={totE} cor="text-credit" />
          <Kpi titulo="Saídas" valor={-totS} cor="text-debit" />
          <Kpi titulo="Saldo final" valor={saldoFim} destaque />
        </div>

        <Tabs defaultValue="painel">
          <TabsList className="print:hidden">
            <TabsTrigger value="painel">Painel</TabsTrigger>
            <TabsTrigger value="diario">Saldo diário</TabsTrigger>
            <TabsTrigger value="lanc">Lançamentos</TabsTrigger>
            <TabsTrigger value="contas">Contas</TabsTrigger>
          </TabsList>

          <TabsContent value="painel" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h3 className="mb-3 font-semibold">Evolução do saldo consolidado</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={consolidado}>
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
                  <BarChart data={consolidado}>
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
                <h3 className="mb-3 font-semibold">Por categoria</h3>
                <Table>
                  <TableHeader><TableRow><TableHead>Categoria</TableHead><TableHead className="text-right">Entradas</TableHead><TableHead className="text-right">Saídas</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {cats.map((c) => (
                      <TableRow key={c.cat}>
                        <TableCell>{c.cat}</TableCell>
                        <TableCell className="num text-right text-credit">{c.entradas ? fmt(c.entradas) : "—"}</TableCell>
                        <TableCell className="num text-right text-debit">{c.saidas ? fmt(c.saidas) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
              <Card className="p-5">
                <h3 className="mb-3 font-semibold">Maiores saídas</h3>
                <Table>
                  <TableBody>
                    {topSaidas.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="num text-xs text-muted-foreground">{fmtData(t.data)}</TableCell>
                        <TableCell><div className="text-sm">{t.descricao}</div><div className="text-xs text-muted-foreground">{t.contraparte}</div></TableCell>
                        <TableCell className="num text-right text-debit">{fmt(t.valor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
            {futuros.length > 0 && (
              <Card className="p-5">
                <h3 className="mb-3 font-semibold">Lançamentos futuros</h3>
                <Table>
                  <TableBody>
                    {futuros.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="num text-xs text-muted-foreground">{fmtData(t.data)}</TableCell>
                        <TableCell>{t.banco}</TableCell>
                        <TableCell>{t.descricao}</TableCell>
                        <TableCell className={`num text-right ${t.tipo === "C" ? "text-credit" : "text-debit"}`}>{t.tipo === "D" ? "-" : ""}{fmt(t.valor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="diario" className="space-y-4">
            {ativos.map((e) => (
              <Card key={e.id} className="p-5">
                <h3 className="mb-3 font-semibold">{contaLabel(e)}</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead><TableHead className="text-right">Abertura</TableHead><TableHead className="text-right">Entradas</TableHead>
                      <TableHead className="text-right">Saídas</TableHead><TableHead className="text-right">Fechamento calculado</TableHead>
                      <TableHead className="text-right">Saldo do banco</TableHead><TableHead>Conferência</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {saldoDiario(e).length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-muted-foreground">Sem lançamentos nem saldo no período.</TableCell></TableRow>
                    )}
                    {saldoDiario(e).map((d) => (
                      <TableRow key={d.data}>
                        <TableCell className="num">{fmtData(d.data)}</TableCell>
                        <TableCell className="num text-right">{fmt(d.abertura)}</TableCell>
                        <TableCell className="num text-right text-credit">{fmt(d.entradas)}</TableCell>
                        <TableCell className="num text-right text-debit">{fmt(d.saidas)}</TableCell>
                        <TableCell className="num text-right font-semibold">{fmt(d.fechamento)}</TableCell>
                        <TableCell className="num text-right">{d.informado === null ? "—" : fmt(d.informado)}</TableCell>
                        <TableCell>
                          {d.ok === null ? <span className="text-xs text-muted-foreground">sem saldo no PDF</span>
                            : d.ok ? <span className="inline-flex items-center gap-1 text-sm text-credit"><CheckCircle2 className="size-4" /> OK</span>
                            : <span className="inline-flex items-center gap-1 text-sm text-debit"><AlertTriangle className="size-4" /> Dif. {fmt((d.informado ?? 0) - d.fechamento)}</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="lanc">
            <Card className="p-5">
              <Table>
                <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Banco</TableHead><TableHead>Descrição</TableHead><TableHead>Contraparte</TableHead><TableHead>CNPJ/CPF</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
                <TableBody>
                  {transacoes.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="num">{fmtData(t.data)}</TableCell>
                      <TableCell>{t.banco}</TableCell>
                      <TableCell>{t.descricao}</TableCell>
                      <TableCell className="text-muted-foreground">{t.contraparte}</TableCell>
                      <TableCell className="num text-xs">{t.documento}</TableCell>
                      <TableCell className={`num text-right ${t.tipo === "C" ? "text-credit" : "text-debit"}`}>{t.tipo === "D" ? "-" : ""}{fmt(t.valor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="contas" className="space-y-3">
            {lista.map((e) => (
              <Card key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <div className="font-semibold">{contaLabel(e)}</div>
                  <div className="text-sm text-muted-foreground">{e.titular} · {e.arquivo} · {e.transacoes.length} lançamentos</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="num font-semibold">{e.saldoFinalInformado === null ? "sem saldo no extrato" : fmt(e.saldoFinalInformado)}</span>
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
