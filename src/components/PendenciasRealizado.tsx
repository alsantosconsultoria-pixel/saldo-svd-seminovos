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
  const [feitos, setFeitos] = useState<Record<string, string>>({});
  const [bancoSel, setBancoSel] = useState("");
  const usados = new Set(Object.values(feitos));
  pendentes = pendentes.filter((r) => !feitos[r.id]);
  extrato = extrato.filter((t) => !usados.has(`${t.extratoId}|${t.id}`));
  const contas = lista.map((e) => ({ k: `${e.banco}|${e.conta}`, nome: `${e.banco} · CC ${e.conta}`, e }));
  const bancoDe = (r: Realizado) => contas.find((c) => mesmaConta(r.conta, c.e))?.k ?? `?|${r.conta}`;
  const bancos = [...new Set([...pendentes.map(bancoDe), ...extrato.map((t) => `${t.banco}|${t.conta}`)])].map((k) => {
    const real = pendentes.filter((r) => bancoDe(r) === k), ext = extrato.filter((t) => `${t.banco}|${t.conta}` === k);
    const sr = real.reduce((a, i) => a + (i.tipo === "receber" ? i.valor : -i.valor), 0);
    const se = ext.reduce((a, i) => a + (i.tipo === "C" ? i.valor : -i.valor), 0);
    return { k, nome: contas.find((c) => c.k === k)?.nome ?? k.split("|")[1]!, real, ext, n: real.length + ext.length, dif: Math.round((sr - se) * 100) / 100 };
  }).sort((a, b) => a.nome.localeCompare(b.nome));
  const atual = bancos.find((b) => b.k === bancoSel);
  const [escExt, setEscExt] = useState<Record<string, string>>({});
  const doRelatorio = (t: LancamentoExibido) => pendentes.filter((r) => (r.tipo === "pagar" ? "D" : "C") === t.tipo)
    .sort((a, b) => (a.data === t.data ? 0 : 1) - (b.data === t.data ? 0 : 1) || Math.abs(a.valor - t.valor) - Math.abs(b.valor - t.valor)).slice(0, 40);
  async function vincularExt(t: LancamentoExibido) {
    const k = `${t.extratoId}|${t.id}`, r = pendentes.find((x) => x.id === escExt[k]);
    if (r) await vincular(r, k);
  }
  async function vincular(r: Realizado, forcado?: string) {
    const v = forcado ?? escolha[r.id];
    if (!v) return;
    const { error } = await supabase.from("realizados").update({ vinculo: v }).eq("id", r.id).select("id").single();
    if (error) { toast.error("Só quem importou o realizado pode associá-lo."); return; }
    setFeitos((f) => ({ ...f, [r.id]: v }));
    toast.success("Associação salva.");
    aoVincular();
  }
  const livres = new Set(extrato.map((t) => `${t.extratoId}|${t.id}`));
  const candidatos = (r: Realizado) => lista.filter((e) => mesmaConta(r.conta, e)).flatMap((e) =>
    e.transacoes.filter((t) => t.tipo === (r.tipo === "pagar" ? "D" : "C") && livres.has(chaveLanc(e.id, t))).map((t) => ({ k: chaveLanc(e.id, t), t })))
    .sort((a, b) => Math.abs(a.t.valor - r.valor) - Math.abs(b.t.valor - r.valor)).slice(0, 30);
  const dias = atual ? pendenciasPorDia(atual.real, atual.ext) : [];
  return <div>
    <h3 className="mb-1 font-semibold">Pendências de associação</h3>
    <p className="mb-3 text-sm text-muted-foreground">Saldo a associar por banco. Clique em um banco para trabalhar nas associações.</p>
    {bancos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma pendência.</p> : <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {bancos.map((b) => <button key={b.k} onClick={() => setBancoSel(bancoSel === b.k ? "" : b.k)} className={`rounded-md border p-3 text-left text-sm hover:bg-muted/50 ${bancoSel === b.k ? "border-primary bg-muted/50" : ""}`}>
        <div className="font-medium">{b.nome}</div>
        <div className="text-xs text-muted-foreground">{b.n} pendência(s)</div>
        <div className="mt-1">Saldo a associar: {sinal(b.dif)}</div>
      </button>)}
    </div>}
    {atual && <div className="max-h-[40rem] space-y-4 overflow-auto">
      {dias.map((d) => <div key={d.data} className="rounded-md border">
        <div className="flex flex-wrap items-center gap-4 border-b bg-muted/40 px-3 py-2 text-sm">
          <strong className="num">{fmtData(d.data)}</strong>
          <span>Realizado: {sinal(d.saldoReal)}</span>
          <span>Extrato: {sinal(d.saldoExt)}</span>
          <span className="ml-auto">{d.diferenca === 0 ? <span className="text-credit">Saldo do dia bate</span> : <>Saldo a regularizar: {sinal(d.diferenca)}</>}</span>
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
            {d.ext.map((t) => { const k = `${t.extratoId}|${t.id}`, op = doRelatorio(t); return <div key={k} className="mb-3 border-b pb-2 text-sm last:border-0">
              <div className="flex justify-between gap-2">
                <span>{t.descricao}<div className="text-xs text-muted-foreground">{t.banco} · CC {t.conta}{t.contraparte && ` · ${t.contraparte}`}</div></span>
                <span className={`num ${t.tipo === "C" ? "text-credit" : "text-debit"}`}>{t.tipo === "D" ? "-" : ""}{fmt(t.valor)}</span>
              </div>
              <div className="mt-1 flex gap-2">
                {op.length ? <Select value={escExt[k] ?? ""} onValueChange={(v) => setEscExt((s) => ({ ...s, [k]: v }))}>
                  <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Associar à pendência do relatório" /></SelectTrigger>
                  <SelectContent>{op.map((r) => <SelectItem key={r.id} value={r.id}>{fmtData(r.data)} · {fmt(r.valor)} · {r.contraparte.slice(0, 30)}</SelectItem>)}</SelectContent>
                </Select> : <span className="flex-1 text-xs text-muted-foreground">Sem pendência do relatório</span>}
                <Button size="sm" onClick={() => vincularExt(t)} disabled={!escExt[k]}>Associar</Button>
              </div>
            </div>; })}
          </div>
        </div>
      </div>)}
    </div>}
  </div>;
}
