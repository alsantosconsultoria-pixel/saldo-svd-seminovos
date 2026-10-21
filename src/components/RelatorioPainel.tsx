import { Landmark } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saldoDiario, type Extrato, type Transacao } from "@/lib/extrato/parser";
import { fmt, fmtData } from "@/lib/extrato/store";

interface Props {
  contas: Extrato[]; consolidado: { data: string; label: string; saldo: number; entradas: number; saidas: number }[];
  saldoIni: number; saldoFim: number; entradas: number; saidas: number;
  categorias: { cat: string; entradas: number; saidas: number }[];
  maioresSaidas: (Transacao & { banco: string; conta: string })[];
}
export function RelatorioPainel({ contas, consolidado, saldoIni, saldoFim, entradas, saidas, categorias, maioresSaidas }: Props) {
  const inicio = consolidado[0]?.data;
  const fim = consolidado.at(-1)?.data;
  return <article className="treasury-report bg-card text-card-foreground">
    <header className="flex flex-wrap items-start justify-between gap-5 border-b-2 border-primary pb-7">
      <div><div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><Landmark className="size-5" /> Santos Finance Consultoria</div><h2 className="text-3xl font-semibold leading-tight">Demonstrativo gerencial de saldos</h2><p className="mt-2 text-sm text-muted-foreground">Grupo SVD · Posição bancária e movimentações realizadas</p></div>
      <div className="sm:text-right"><p className="text-xs font-medium text-muted-foreground">PERÍODO DOS EXTRATOS</p><p className="num mt-1 text-lg font-semibold">{inicio && fim ? `${fmtData(inicio)} a ${fmtData(fim)}` : "Sem movimentações"}</p><p className="mt-2 text-xs text-muted-foreground">{contas.length} contas · Para apreciação da diretoria</p></div>
    </header>
    <section className="grid gap-5 border-b py-7 sm:grid-cols-2 lg:grid-cols-4">
      {[{ titulo: "SALDO INICIAL", valor: saldoIni }, { titulo: "ENTRADAS REALIZADAS", valor: entradas }, { titulo: "SAÍDAS REALIZADAS", valor: -saidas }, { titulo: "SALDO FINAL", valor: saldoFim }].map((i) => <div key={i.titulo}><p className="text-xs font-medium text-muted-foreground">{i.titulo}</p><p className={`num mt-2 break-words text-2xl font-semibold ${i.valor < 0 ? "text-debit" : ""}`}>{fmt(i.valor)}</p></div>)}
    </section>
    <section className="report-section mt-7"><Titulo numero="01" titulo="Evolução do saldo consolidado" />
      {consolidado.length ? <ResponsiveContainer width="100%" height={250}><AreaChart data={consolidado}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="label" fontSize={12} /><YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} /><Tooltip formatter={(v: number) => fmt(v)} /><Area dataKey="saldo" stroke="var(--chart-3)" fill="var(--chart-1)" fillOpacity={0.2} strokeWidth={2} isAnimationActive={false} /></AreaChart></ResponsiveContainer> : <p className="py-4 text-sm text-muted-foreground">Nenhum saldo diário disponível.</p>}
    </section>
    <section className="report-section mt-7"><Titulo numero="02" titulo="Posição por banco e conta" />
      <Table><TableHeader><TableRow><TableHead>Banco / conta</TableHead><TableHead>Última data</TableHead><TableHead className="text-right">Saldo inicial</TableHead><TableHead className="text-right">Entradas</TableHead><TableHead className="text-right">Saídas</TableHead><TableHead className="text-right">Fechamento calculado</TableHead></TableRow></TableHeader><TableBody>{contas.map((e) => {
        const dias = saldoDiario(e); const ultimo = dias.at(-1);
        const receber = e.transacoes.filter((t) => t.tipo === "C").reduce((a, t) => a + t.valor, 0);
        const pagar = e.transacoes.filter((t) => t.tipo === "D").reduce((a, t) => a + t.valor, 0);
        return <TableRow key={e.id}><TableCell><p className="font-semibold">{e.banco}</p><p className="text-xs text-muted-foreground">Ag {e.agencia || "—"} · CC {e.conta || "—"}</p></TableCell><TableCell>{ultimo ? fmtData(ultimo.data) : "Sem base diária"}</TableCell><TableCell className="num text-right">{fmt(e.saldoInicial)}</TableCell><TableCell className="num text-right text-credit">{fmt(receber)}</TableCell><TableCell className="num text-right text-debit">{fmt(pagar)}</TableCell><TableCell className="num text-right font-semibold">{ultimo ? fmt(ultimo.fechamento) : "Indisponível"}</TableCell></TableRow>;
      })}</TableBody></Table>
      <p className="mt-3 text-xs text-muted-foreground">Mesmos indicadores e contas selecionadas no Painel. As bases podem ter datas diferentes; previsões e ajustes de tesouraria não integram as movimentações realizadas.</p>
    </section>
    <section className="report-section mt-7"><Titulo numero="03" titulo="Composição por categoria" /><Table><TableHeader><TableRow><TableHead>Categoria</TableHead><TableHead className="text-right">Entradas</TableHead><TableHead className="text-right">Saídas</TableHead></TableRow></TableHeader><TableBody>{categorias.map((c) => <TableRow key={c.cat}><TableCell>{c.cat}</TableCell><TableCell className="num text-right">{fmt(c.entradas)}</TableCell><TableCell className="num text-right">{fmt(c.saidas)}</TableCell></TableRow>)}</TableBody></Table></section>
    <section className="report-section mt-7"><Titulo numero="04" titulo="Maiores saídas do período" /><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Banco</TableHead><TableHead>Descrição / contraparte</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader><TableBody>{maioresSaidas.map((t, i) => <TableRow key={`${t.id}-${i}`}><TableCell>{fmtData(t.data)}</TableCell><TableCell>{t.banco}</TableCell><TableCell>{t.descricao}<p className="text-xs text-muted-foreground">{t.contraparte}</p></TableCell><TableCell className="num text-right text-debit">{fmt(t.valor)}</TableCell></TableRow>)}</TableBody></Table></section>
    <section className="report-section mt-7"><Titulo numero="05" titulo="Movimentação diária consolidada" /><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead className="text-right">Entradas</TableHead><TableHead className="text-right">Saídas</TableHead><TableHead className="text-right">Saldo consolidado</TableHead></TableRow></TableHeader><TableBody>{consolidado.map((d) => <TableRow key={d.data}><TableCell>{fmtData(d.data)}</TableCell><TableCell className="num text-right">{fmt(d.entradas)}</TableCell><TableCell className="num text-right">{fmt(d.saidas)}</TableCell><TableCell className={`num text-right font-semibold ${d.saldo < 0 ? "text-debit" : ""}`}>{fmt(d.saldo)}</TableCell></TableRow>)}</TableBody></Table></section>
    <footer className="mt-10 flex flex-wrap justify-between gap-2 border-t pt-4 text-xs text-muted-foreground"><span>Santos Finance Consultoria · Grupo SVD</span><span>Emitido em {new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · horário de Brasília</span></footer>
  </article>;
}
function Titulo({ numero, titulo }: { numero: string; titulo: string }) { return <div className="mb-4 flex gap-3"><span className="num text-sm font-semibold text-credit">{numero}</span><h3 className="text-base font-semibold">{titulo}</h3></div>; }