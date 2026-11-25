import { conciliarMovimentacoes, type MovimentacaoFluxo } from "@/lib/plano";
import { fmt, fmtData } from "@/lib/extrato/store";

export function MovimentacoesRelatorio({ movimentacoes }: { movimentacoes: MovimentacaoFluxo[] }) {
  const { saldo, divergentes } = conciliarMovimentacoes(movimentacoes);
  const valorAssinado = (m: MovimentacaoFluxo) => (m.tipo === "saida" ? -m.valor : m.valor);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Transferências financeiras entre contas. Já refletidas nos saldos — não compõem entradas nem saídas do fluxo.</p>
      {saldo !== 0 ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-semibold text-debit">Atenção: saldo das movimentações diferente de zero ({fmt(saldo)}). Valores sem correspondência para ajuste ou correção:</p>
          <div className="mt-2 overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th className="py-1 font-medium">Data</th><th className="font-medium">Conta</th><th className="font-medium">Tipo</th><th className="font-medium">Contraparte</th><th className="text-right font-medium">Valor</th></tr></thead>
            <tbody>{divergentes.map((m) => (
              <tr key={m.id} className="border-b border-destructive/20 last:border-0">
                <td className="num py-1">{fmtData(m.data)}</td>
                <td className="font-medium">{m.conta}</td>
                <td className="text-xs text-muted-foreground">{m.tipo === "entrada" ? "Entrada" : "Saída"}</td>
                <td className="text-xs text-muted-foreground">{m.contraparte || "—"}</td>
                <td className={`num text-right font-medium ${m.tipo === "entrada" ? "text-credit" : "text-debit"}`}>{fmt(valorAssinado(m))}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      ) : (
        <p className="text-xs font-medium text-credit">Saldo zerado — transferências compensadas entre contas.</p>
      )}
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th className="py-1.5 font-medium">Data</th><th className="font-medium">Conta</th><th className="font-medium">Tipo</th><th className="font-medium">Contraparte</th><th className="text-right font-medium">Valor</th></tr></thead>
        <tbody>{movimentacoes.map((m) => (
          <tr key={m.id} className="border-b">
            <td className="num py-1.5">{fmtData(m.data)}</td>
            <td className="font-medium">{m.conta}</td>
            <td className="text-xs text-muted-foreground">{m.tipo === "entrada" ? "Entrada" : "Saída"}</td>
            <td className="text-xs text-muted-foreground">{m.contraparte || "—"}</td>
            <td className={`num text-right ${m.tipo === "entrada" ? "text-credit" : "text-debit"}`}>{fmt(valorAssinado(m))}</td>
          </tr>
        ))}</tbody>
        <tfoot><tr className="border-t-2 font-semibold">
          <td colSpan={4} className="py-1.5">Saldo das movimentações</td>
          <td className={`num text-right ${saldo !== 0 ? "text-debit" : ""}`}>{fmt(saldo)}</td>
        </tr></tfoot>
      </table></div>
    </div>
  );
}