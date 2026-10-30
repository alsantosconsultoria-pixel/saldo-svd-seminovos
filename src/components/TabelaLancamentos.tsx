import { Fragment } from "react";
import type { Realizado } from "@/lib/realizado";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Transacao } from "@/lib/extrato/parser";
import { fmt, fmtData } from "@/lib/extrato/store";

export type LancamentoExibido = Transacao & { banco: string; conta: string; extratoId?: string };

export function TabelaLancamentos({ itens, vinculos }: { itens: LancamentoExibido[]; vinculos?: Map<string, Realizado[]> }) {
  const entradas = itens.filter((t) => t.tipo === "C").reduce((a, t) => a + t.valor, 0);
  const saidas = itens.filter((t) => t.tipo === "D").reduce((a, t) => a + t.valor, 0);
  return <Table>
    <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Banco / Conta</TableHead><TableHead>Descrição</TableHead><TableHead>Contraparte</TableHead><TableHead>CNPJ/CPF</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
    <TableBody>
      {itens.length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">Nenhum lançamento no período.</TableCell></TableRow>}
      {itens.map((t) => <Fragment key={`${t.banco}-${t.conta}-${t.id}`}><TableRow>
        <TableCell className="num">{fmtData(t.data)}</TableCell>
        <TableCell>{t.banco}<div className="text-xs text-muted-foreground">CC {t.conta}</div></TableCell>
        <TableCell className="max-w-80 whitespace-normal break-words">{t.descricao}</TableCell>
        <TableCell className="max-w-64 whitespace-normal break-words text-muted-foreground">{t.contraparte}</TableCell>
        <TableCell className="num text-xs">{t.documento}</TableCell>
        <TableCell className={`num text-right ${t.tipo === "C" ? "text-credit" : "text-debit"}`}>{t.tipo === "D" ? "-" : ""}{fmt(t.valor)}</TableCell>
      </TableRow>
      {(vinculos?.get(`${t.extratoId}|${t.id}`) ?? []).map((r) => <TableRow key={r.id} className="bg-muted/40 text-xs">
        <TableCell /><TableCell className="text-muted-foreground">↳ {r.tipo === "pagar" ? "Despesa paga" : "Receita recebida"}</TableCell>
        <TableCell className="max-w-80 whitespace-normal break-words">{r.categoria}{r.descricao && <div className="text-muted-foreground">{r.descricao.slice(0, 140)}</div>}</TableCell>
        <TableCell className="whitespace-normal">{r.contraparte}</TableCell><TableCell className="num">{r.documento}</TableCell>
        <TableCell className="num text-right">{fmt(r.valor)}</TableCell>
      </TableRow>)}</Fragment>)}
    </TableBody>
    <TableFooter>
      <TableRow><TableCell colSpan={5} className="text-right">Total de entradas</TableCell><TableCell className="num text-right text-credit">{fmt(entradas)}</TableCell></TableRow>
      <TableRow><TableCell colSpan={5} className="text-right">Total de saídas</TableCell><TableCell className="num text-right text-debit">-{fmt(saidas)}</TableCell></TableRow>
      <TableRow><TableCell colSpan={5} className="text-right">Resultado do período</TableCell><TableCell className={`num text-right ${entradas - saidas >= 0 ? "text-credit" : "text-debit"}`}>{fmt(entradas - saidas)}</TableCell></TableRow>
    </TableFooter>
  </Table>;
}