import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { Extrato } from "@/lib/extrato/parser";
import { fmt, fmtData } from "@/lib/extrato/store";
import { chaveLanc, mesmaConta, type Realizado } from "@/lib/realizado";

export function PendenciasRealizado({ pendentes, lista, aoVincular }: { pendentes: Realizado[]; lista: Extrato[]; aoVincular: () => void }) {
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  async function vincular(r: Realizado) {
    const v = escolha[r.id];
    if (!v) return;
    const { error } = await supabase.from("realizados").update({ vinculo: v }).eq("id", r.id).select("id").single();
    if (error) { toast.error("Só quem importou o realizado pode associá-lo."); return; }
    toast.success("Associação salva.");
    aoVincular();
  }
  const candidatos = (r: Realizado) => lista.filter((e) => mesmaConta(r.conta, e)).flatMap((e) =>
    e.transacoes.filter((t) => t.tipo === (r.tipo === "pagar" ? "D" : "C")).map((t) => ({ k: chaveLanc(e.id, t), t, e })))
    .sort((a, b) => Math.abs(a.t.valor - r.valor) - Math.abs(b.t.valor - r.valor)).slice(0, 30);
  return <div>
    <h3 className="mb-1 font-semibold">Pendências de associação ({pendentes.length})</h3>
    <p className="mb-3 text-sm text-muted-foreground">Realizados da planilha sem lançamento do extrato com a mesma conta, data e valor. Escolha o lançamento para associar manualmente.</p>
    {pendentes.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma pendência.</p> : <div className="max-h-[32rem] overflow-auto"><Table>
      <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Conta</TableHead><TableHead>Operação</TableHead><TableHead>Cliente/Fornecedor</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Lançamento do extrato</TableHead></TableRow></TableHeader>
      <TableBody>{pendentes.map((r) => { const c = candidatos(r); return <TableRow key={r.id}>
        <TableCell className="num">{fmtData(r.data)}</TableCell>
        <TableCell className="text-xs">{r.conta}</TableCell>
        <TableCell>{r.tipo === "pagar" ? "Despesa" : "Receita"}</TableCell>
        <TableCell className="max-w-56 whitespace-normal text-sm">{r.contraparte}<div className="text-xs text-muted-foreground">{r.documento}</div></TableCell>
        <TableCell className={`num text-right ${r.tipo === "pagar" ? "text-debit" : "text-credit"}`}>{fmt(r.valor)}</TableCell>
        <TableCell><div className="flex gap-2">
          {c.length ? <Select value={escolha[r.id] ?? ""} onValueChange={(v) => setEscolha((s) => ({ ...s, [r.id]: v }))}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Escolher lançamento" /></SelectTrigger>
            <SelectContent>{c.map(({ k, t }) => <SelectItem key={k} value={k}>{fmtData(t.data)} · {fmt(t.valor)} · {t.descricao.slice(0, 30)}</SelectItem>)}</SelectContent>
          </Select> : <span className="text-xs text-muted-foreground">Sem extrato desta conta</span>}
          <Button size="sm" onClick={() => vincular(r)} disabled={!escolha[r.id]}>Associar</Button>
        </div></TableCell>
      </TableRow>; })}</TableBody>
    </Table></div>}
  </div>;
}
