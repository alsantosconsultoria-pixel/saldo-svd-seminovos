import { AlertTriangle, CheckCircle2, Landmark } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmt, fmtData } from "@/lib/extrato/store";
import type { balancoNaData } from "@/lib/tratativas";

export interface DespesaRelatorio {
  id: string; tipo: string; vencimento: string; valor: number; contraparte: string;
  documento: string; descricao: string; categoria: string; banco: string;
}
export interface TransferenciaRelatorio { id: string; origem: string; destino: string; valor: number }
interface Props {
  dia: string; linhas: ReturnType<typeof balancoNaData>; despesas: DespesaRelatorio[];
  transferencias: TransferenciaRelatorio[]; total: number; pagamentos: number;
}

export function RelatorioTratativas({ dia, linhas, despesas, transferencias, total, pagamentos }: Props) {
  const incompleto = linhas.some((l) => l.base === null);
  const faltante = Math.max(0, pagamentos - total);
  const negativos = linhas.filter((l) => l.final !== null && l.final < 0).length;
  const nome = (id: string) => {
    const conta = linhas.find((l) => l.e.id === id)?.e;
    return conta ? `${conta.banco} · Ag ${conta.agencia || "—"} · CC ${conta.conta || "—"}` : "Conta não disponível";
  };
  const emitido = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  return (
    <article className="treasury-report bg-card text-card-foreground">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b-2 border-primary pb-7">
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><Landmark className="size-5" /> Financeiro SVD SEMINOVOS</div>
          <h2 className="text-3xl font-semibold leading-tight">Demonstrativo de tesouraria</h2>
          <p className="mt-2 text-sm text-muted-foreground">Grupo SVD · Proposta de pagamentos e composição dos saldos</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs font-medium text-muted-foreground">DATA DE REFERÊNCIA</p>
          <p className="num mt-1 text-xl font-semibold">{fmtData(dia)}</p>
          <p className="mt-2 inline-flex items-center gap-1.5 border border-border px-3 py-1 text-xs font-medium">Para apreciação da diretoria</p>
        </div>
      </header>

      <section className="grid gap-5 border-b py-7 sm:grid-cols-3">
        <div><p className="text-xs font-medium text-muted-foreground">SALDO CONSOLIDADO APÓS AJUSTES</p><p className={`num mt-2 text-2xl font-semibold ${total < 0 ? "text-debit" : ""}`}>{fmt(total)}</p><p className="mt-1 text-xs text-muted-foreground">{linhas.length} contas · {incompleto ? "base parcial" : "base dos extratos"}</p></div>
        <div><p className="text-xs font-medium text-muted-foreground">PAGAMENTOS PROPOSTOS</p><p className="num mt-2 text-2xl font-semibold">{fmt(pagamentos)}</p><p className="mt-1 text-xs text-muted-foreground">{despesas.length} títulos com vencimento na data</p></div>
        <div><p className="text-xs font-medium text-muted-foreground">SALDO PROJETADO APÓS PAGAMENTOS</p><p className={`num mt-2 text-2xl font-semibold ${total - pagamentos < 0 ? "text-debit" : "text-credit"}`}>{fmt(total - pagamentos)}</p><p className="mt-1 text-xs text-muted-foreground">Projeção · sem baixa no saldo bancário</p></div>
      </section>

      <div className={`my-6 flex items-start gap-3 border-l-4 px-4 py-3 text-sm ${incompleto || faltante > 0 ? "border-destructive bg-destructive/5" : "border-credit bg-credit/5"}`}>
        {incompleto || faltante > 0 ? <AlertTriangle className="mt-0.5 size-5 shrink-0 text-debit" /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-credit" />}
        <div><p className="font-semibold">{incompleto ? "Conferência pendente: há contas sem saldo para a data." : faltante > 0 ? `Necessidade de recursos: ${fmt(faltante)}.` : "Saldo consolidado suficiente para os títulos apresentados."}</p>
          <p className="mt-1 text-muted-foreground">{negativos > 0 ? `${negativos} conta(s) permanecem negativas após os ajustes. ` : ""}A disponibilidade de cada conta e a efetivação dos créditos devem ser conferidas antes da liberação.</p>
        </div>
      </div>

      <section className="report-section">
        <SectionTitle numero="01" titulo="Posição bancária e composição dos saldos" detalhe="Saldo conhecido até a data de referência" />
        <Table>
          <TableHeader><TableRow><TableHead>Banco / conta</TableHead><TableHead>Base em</TableHead><TableHead className="text-right">Saldo do extrato</TableHead><TableHead className="text-right">Recebido</TableHead><TableHead className="text-right">Enviado</TableHead><TableHead className="text-right">Após ajustes</TableHead></TableRow></TableHeader>
          <TableBody>{linhas.map((l) => <TableRow key={l.e.id}>
            <TableCell><p className="font-semibold">{l.e.banco}</p><p className="text-xs text-muted-foreground">Ag {l.e.agencia || "—"} · CC {l.e.conta || "—"}</p></TableCell>
            <TableCell className="text-xs">{l.referencia ? fmtData(l.referencia) : "Sem base"}</TableCell>
            <TableCell className="num text-right">{l.base === null ? "Indisponível" : fmt(l.base)}</TableCell>
            <TableCell className="num text-right text-credit">{l.ent ? fmt(l.ent) : "—"}</TableCell><TableCell className="num text-right text-debit">{l.sai ? fmt(l.sai) : "—"}</TableCell>
            <TableCell className={`num text-right font-semibold ${l.final !== null && l.final < 0 ? "text-debit" : ""}`}>{l.final === null ? "Indisponível" : fmt(l.final)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
        <div className="mt-2 flex justify-between border-t bg-muted/40 px-3 py-3 text-sm font-semibold"><span>Total consolidado{incompleto ? " (parcial)" : ""}</span><span className="num">{fmt(total)}</span></div>
        <p className="mt-2 text-xs text-muted-foreground">Bases anteriores são mantidas até o último lançamento conhecido. Ajustes são internos e não alteram o total consolidado.</p>
      </section>

      <section className="report-section mt-8">
        <SectionTitle numero="02" titulo="Ajustes de tesouraria" detalhe={`${transferencias.length} transferências registradas na data`} />
        {transferencias.length ? <Table><TableHeader><TableRow><TableHead>Conta de origem</TableHead><TableHead>Conta de destino</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader><TableBody>{transferencias.map((t) => <TableRow key={t.id}><TableCell>{nome(t.origem)}</TableCell><TableCell>{nome(t.destino)}</TableCell><TableCell className="num text-right font-semibold">{fmt(t.valor)}</TableCell></TableRow>)}</TableBody></Table> : <p className="border-y py-4 text-sm text-muted-foreground">Nenhum ajuste registrado na data.</p>}
      </section>

      <section className="report-section mt-8">
        <SectionTitle numero="03" titulo="Despesas propostas para pagamento" detalhe={`Vencimento em ${fmtData(dia)} · previsões importadas`} />
        {despesas.length ? <Table><TableHeader><TableRow><TableHead>Fornecedor / despesa</TableHead><TableHead>Nº documento</TableHead><TableHead>Banco indicado</TableHead><TableHead className="text-right">Valor do título</TableHead></TableRow></TableHeader><TableBody>{despesas.map((d) => <TableRow key={d.id}><TableCell><p className="font-medium">{d.contraparte || "Não informado"}</p><p className="text-xs text-muted-foreground">{d.descricao || d.categoria || "—"}</p></TableCell><TableCell>{d.documento || "—"}</TableCell><TableCell>{d.banco || "Não definido"}</TableCell><TableCell className="num text-right">{fmt(d.valor)}</TableCell></TableRow>)}</TableBody></Table> : <p className="border-y py-4 text-sm text-muted-foreground">Nenhuma despesa com vencimento nesta data.</p>}
        <div className="mt-2 flex justify-between border-t bg-muted/40 px-3 py-3 text-sm font-semibold"><span>Total para apreciação</span><span className="num">{fmt(pagamentos)}</span></div>
        <p className="mt-2 text-xs text-muted-foreground">Títulos são previsões, não comprovantes de pagamento. Vencimentos anteriores e receitas previstas não integram esta proposta.</p>
      </section>

      <section className="report-approval mt-10 border-t-2 border-primary pt-5">
        <SectionTitle numero="04" titulo="Deliberação da diretoria" detalhe="Preenchimento e assinatura no documento" />
        <div className="mt-5 flex flex-wrap gap-6 text-sm"><span>□ Aprovado</span><span>□ Aprovado com ressalvas</span><span>□ Não aprovado</span></div>
        <div className="mt-6 border-b pb-8 text-sm text-muted-foreground">Observações / ressalvas:</div>
        <div className="mt-12 grid gap-8 sm:grid-cols-3"><div className="border-t pt-2 text-xs">Responsável pela tesouraria</div><div className="border-t pt-2 text-xs">Diretoria · nome e assinatura</div><div className="border-t pt-2 text-xs">Data da aprovação</div></div>
      </section>
      <footer className="mt-10 flex flex-wrap justify-between gap-2 border-t pt-4 text-xs text-muted-foreground"><span>Financeiro SVD SEMINOVOS · Grupo SVD</span><span>Emitido em {emitido} · horário de Brasília</span></footer>
    </article>
  );
}

function SectionTitle({ numero, titulo, detalhe }: { numero: string; titulo: string; detalhe: string }) {
  return <div className="mb-4 flex items-start gap-3"><span className="num pt-0.5 text-sm font-semibold text-credit">{numero}</span><div><h3 className="text-base font-semibold">{titulo}</h3><p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p></div></div>;
}