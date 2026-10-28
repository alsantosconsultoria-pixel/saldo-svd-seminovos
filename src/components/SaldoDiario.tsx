import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saldoDiario, type Extrato, type LinhaDiaria } from "@/lib/extrato/parser";
import { lancamentosDoDia, type EscopoDiario } from "@/lib/extrato/composicao";
import { fmt, fmtData } from "@/lib/extrato/store";
import { TabelaLancamentos } from "@/components/TabelaLancamentos";

const contaLabel = (e: Extrato) => `${e.banco} · Ag ${e.agencia} · CC ${e.conta}`;

export function SaldoDiario({ contas }: { contas: Extrato[] }) {
  const [composicao, setComposicao] = useState<{ contaId: string; data: string; escopo: EscopoDiario; titulo: string } | null>(null);
  const conta = contas.find((e) => e.id === composicao?.contaId);
  const dia = conta ? saldoDiario(conta).find((d) => d.data === composicao?.data) : undefined;
  const itens = conta && composicao ? lancamentosDoDia(conta, composicao.data, composicao.escopo).map((t) => ({ ...t, banco: conta.banco, conta: conta.conta })) : [];
  const valor = (e: Extrato, d: LinhaDiaria, v: number, titulo: string, escopo: EscopoDiario = "todos", cor = "") => (
    <Button variant="ghost" className={`num h-auto max-w-full justify-end whitespace-nowrap px-1 py-1 font-inherit underline decoration-border underline-offset-4 ${cor}`} aria-label={`${titulo} de ${fmtData(d.data)} · ${contaLabel(e)}`} onClick={() => setComposicao({ contaId: e.id, data: d.data, escopo, titulo })}>{fmt(v)}</Button>
  );
  return <div className="space-y-4">
    {contas.map((e) => <Card key={e.id} className="p-5">
      <h3 className="mb-3 font-semibold">{contaLabel(e)}</h3>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Data</TableHead><TableHead className="text-right">Abertura</TableHead><TableHead className="text-right">Entradas</TableHead><TableHead className="text-right">Saídas</TableHead><TableHead className="text-right">Total do dia</TableHead><TableHead className="text-right">Fechamento calculado</TableHead><TableHead className="text-right">Saldo do banco</TableHead><TableHead>Conferência</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {saldoDiario(e).length === 0 && <TableRow><TableCell colSpan={8} className="text-muted-foreground">Sem lançamentos nem saldo no período.</TableCell></TableRow>}
          {saldoDiario(e).map((d) => <TableRow key={d.data}>
            <TableCell className="num">{fmtData(d.data)}</TableCell>
            <TableCell className="text-right">{valor(e, d, d.abertura, "Saldo de abertura")}</TableCell>
            <TableCell className="text-right">{valor(e, d, d.entradas, "Receitas", "entradas", "text-credit")}</TableCell>
            <TableCell className="text-right">{valor(e, d, d.saidas, "Despesas", "saidas", "text-debit")}</TableCell>
            <TableCell className="text-right font-semibold">{valor(e, d, d.entradas - d.saidas, "Total do dia", "todos", d.entradas - d.saidas < 0 ? "text-debit" : "text-credit")}</TableCell>
            <TableCell className="text-right font-semibold">{valor(e, d, d.fechamento, "Fechamento calculado")}</TableCell>
            <TableCell className="text-right">{d.informado === null ? "—" : valor(e, d, d.informado, "Saldo do banco")}</TableCell>
            <TableCell>{d.ok === null ? <span className="text-xs text-muted-foreground">Saldo parcial calculado</span> : d.ok ? <span className="inline-flex items-center gap-1 text-sm text-credit"><CheckCircle2 className="size-4" /> OK</span> : <span className="inline-flex items-center gap-1 text-sm text-debit"><AlertTriangle className="size-4" /> Dif. {fmt((d.informado ?? 0) - d.fechamento)}</span>}</TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
    </Card>)}
    <Dialog open={Boolean(composicao && conta)} onOpenChange={(open) => { if (!open) setComposicao(null); }}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-6xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{composicao?.titulo} · {composicao && fmtData(composicao.data)}</DialogTitle>
          <DialogDescription>{conta && contaLabel(conta)} · {itens.length} lançamentos realizados</DialogDescription>
        </DialogHeader>
        {dia && <div className="grid grid-cols-2 gap-3 border-y py-3 sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Saldo de abertura</p><p className="num text-sm font-semibold">{fmt(dia.abertura)}</p></div>
          <div><p className="text-xs text-muted-foreground">Total do dia</p><p className="num text-sm font-semibold">{fmt(dia.entradas - dia.saidas)}</p></div>
          <div><p className="text-xs text-muted-foreground">Fechamento calculado</p><p className="num text-sm font-semibold">{fmt(dia.fechamento)}</p></div>
          <div><p className="text-xs text-muted-foreground">Saldo do banco</p><p className="num text-sm font-semibold">{dia.informado === null ? "Não informado" : fmt(dia.informado)}</p></div>
        </div>}
        <div className="min-h-0 overflow-auto"><TabelaLancamentos itens={itens} /></div>
      </DialogContent>
    </Dialog>
  </div>;
}