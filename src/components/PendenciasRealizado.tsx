import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Extrato } from "@/lib/extrato/parser";
import { fmt, fmtData } from "@/lib/extrato/store";
import { chaveLanc, mesmaConta, pendenciasPorDia, type Realizado } from "@/lib/realizado";
import type { LancamentoExibido } from "@/components/TabelaLancamentos";

const sinal = (n: number) => <span className={n >= 0 ? "text-credit" : "text-debit"}>{fmt(n)}</span>;

export function PendenciasRealizado({ pendentes, extrato, lista, aoVincular }: { pendentes: Realizado[]; extrato: LancamentoExibido[]; lista: Extrato[]; aoVincular: () => void }) {
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  async function vincular(r: Realizado) {
    const v = escolha[r.id];
    if (!v) return;
    const { error } = await supabase.from("realizados").update({ vinculo: v }).eq("id", r.id).select("id").single();
    if (error) { toast.error("Só quem importou o realizado pode associá-lo."); return; }
    toast.success("Associação salva.");
    aoVincular();
  }
  const livres = new Set(extrato.map((t) => `${t.extratoId}|${t.id}`));
  const candidatos = (r: Realizado) => lista.filter((e) => mesmaConta(r.conta, e)).flatMap((e) =>
    e.transacoes.filter((t) => t.tipo === (r.tipo === "pagar" ? "D" : "C") && livres.has(chaveLanc(e.id, t))).map((t) => ({ k: chaveLanc(e.id, t), t })))
    .sort((a, b) => Math.abs(a.t.valor - r.valor) - Math.abs(b.t.valor - r.valor)).slice(0, 30);
  const dias = pendenciasPorDia(pendentes, extrato);
  return <div>
    <h3 className="mb-1 font-semibold">Pendências de associação</h3>
    <p className="mb-3 text-sm text-muted-foreground">À esquerda, realizados da planilha sem lançamento no extrato; à direita, lançamentos do extrato sem realizado. Separados por data — o saldo do dia deve bater dos dois lados.</p>
    {dias.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma pendência.</p> : <div className="max-h-[40rem] space-y-4 overflow-auto">
      {dias.map((d) => <div key={d.data} className="rounded-md border">
        <div className="flex flex-wrap items-center gap-4 border-b bg-muted/40 px-3 py-2 text-sm">
          <strong className="num">{fmtData(d.data)}</strong>
          <span>Realizado: {sinal(d.saldoReal)}</span>
          <span>Extrato: {sinal(d.saldoExt)}</span>
          <span className="ml-auto">{d.diferenca === 0 ? <span className="text-credit">Saldo do dia bate</span> : <>Diferença: {sinal(d.diferenca)}</>}</span>
        </div>
        <div className="grid gap-0 md:grid-cols-2 md:divide-x">
          <div className="p-3">
            <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Relatório realizado ({d.real.length})</div>
            {d.real.length === 0 && <p className="text-xs text-muted-foreground">Sem pendências.</p>}
            {d.real.map((r) => { const c = candidatos(r); return <div key={r.id} className="mb-3 border-b pb-2 last:border-0">
              <div className="flex justify-between gap-2 text-sm">
                <span>{r.contraparte}<div className="text-xs text-muted-foreground">{r.tipo === "pagar" ? "Despesa" : "Receita"} · {r.conta} {r.documento && `· ${r.documento}`}</div></span>
                <span className={`num ${r.tipo === "pagar" ? "text-debit" : "text-credit"}`}>{r.tipo === "pagar" ? "-" : ""}{fmt(r.valor)}</span>
              </div>
              <div className="mt-1 flex gap-2">
                {c.length ? <Select value={escolha[r.id] ?? ""} onValueChange={(v) => setEscolha((s) => ({ ...s, [r.id]: v }))}>
                  <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Associar ao lançamento do extrato" /></SelectTrigger>
                  <SelectContent>{c.map(({ k, t }) => <SelectItem key={k} value={k}>{fmtData(t.data)} · {fmt(t.valor)} · {t.descricao.slice(0, 30)}</SelectItem>)}</SelectContent>
                </Select> : <span className="flex-1 text-xs text-muted-foreground">Sem lançamento livre desta conta</span>}
                <Button size="sm" onClick={() => vincular(r)} disabled={!escolha[r.id]}>Associar</Button>
              </div>
            </div>; })}
          </div>
          <div className="p-3">
            <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Extrato ({d.ext.length})</div>
            {d.ext.length === 0 && <p className="text-xs text-muted-foreground">Sem pendências.</p>}
            {d.ext.map((t) => <div key={`${t.extratoId}|${t.id}`} className="mb-2 flex justify-between gap-2 border-b pb-2 text-sm last:border-0">
              <span>{t.descricao}<div className="text-xs text-muted-foreground">{t.banco} · CC {t.conta}{t.contraparte && ` · ${t.contraparte}`}</div></span>
              <span className={`num ${t.tipo === "C" ? "text-credit" : "text-debit"}`}>{t.tipo === "D" ? "-" : ""}{fmt(t.valor)}</span>
            </div>)}
          </div>
        </div>
      </div>)}
    </div>}
  </div>;
}
