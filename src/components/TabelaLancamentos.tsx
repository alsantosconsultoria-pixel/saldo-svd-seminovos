import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Transacao } from "@/lib/extrato/parser";
import { fmt, fmtData } from "@/lib/extrato/store";

export type LancamentoExibido = Transacao & { banco: string; conta: string };

export function TabelaLancamentos({ itens }: { itens: LancamentoExibido[] }) {
  const entradas = itens.filter((t) => t.tipo === "C").reduce((a, t) => a + t.valor, 0);
  const saidas = itens.filter((t) => t.tipo === "D").reduce((a, t) => a + t.valor, 0);
  return <Table>
    <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Banco / Conta</TableHead><TableHead>Descrição</TableHead><TableHead>Contraparte</TableHead><TableHead>CNPJ/CPF</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
    <TableBody>
      {itens.length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">Nenhum lançamento no período.</TableCell></TableRow>}
      {itens.map((t) => <TableRow key={`${t.banco}-${t.conta}-${t.id}`}>
        <TableCell className="num">{fmtData(t.data)}</TableCell>
        <TableCell>{t.banco}<div className="text-xs text-muted-foreground">CC {t.conta}</div></TableCell>
        <TableCell className="max-w-80 whitespace-normal break-words">{t.descricao}</TableCell>
        <TableCell className="max-w-64 whitespace-normal break-words text-muted-foreground">{t.contraparte}</TableCell>
        <TableCell className="num text-xs">{t.documento}</TableCell>
        <TableCell className={`num text-right ${t.tipo === "C" ? "text-credit" : "text-debit"}`}>{t.tipo === "D" ? "-" : ""}{fmt(t.valor)}</TableCell>
      </TableRow>)}
    </TableBody>
    <TableFooter>
      <TableRow><TableCell colSpan={5} className="text-right">Total de entradas</TableCell><TableCell className="num text-right text-credit">{fmt(entradas)}</TableCell></TableRow>
      <TableRow><TableCell colSpan={5} className="text-right">Total de saídas</TableCell><TableCell className="num text-right text-debit">-{fmt(saidas)}</TableCell></TableRow>
      <TableRow><TableCell colSpan={5} className="text-right">Resultado do período</TableCell><TableCell className={`num text-right ${entradas - saidas >= 0 ? "text-credit" : "text-debit"}`}>{fmt(entradas - saidas)}</TableCell></TableRow>
    </TableFooter>
  </Table>;
}