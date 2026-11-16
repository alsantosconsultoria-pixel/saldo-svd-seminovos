import { AlertTriangle, BadgeCheck, PenLine } from "lucide-react";
import type { Extrato } from "@/lib/extrato/parser";
import { fmtData } from "@/lib/extrato/store";
import { diaUtilAnterior as statusRef, statusExtrato, type StatusExtrato as S } from "@/lib/tratativas";

const estilo: Record<S, { cls: string; rotulo: string }> = {
  ok: { cls: "border-credit/40 bg-credit/10 text-credit", rotulo: "Extrato OK" },
  desatualizado: { cls: "border-chart-4/50 bg-chart-4/15 text-foreground", rotulo: "Desatualizado" },
  manual: { cls: "border-border bg-muted text-muted-foreground", rotulo: "Manual · sem extrato" },
};

export function SeloExtrato({ e, referencia }: { e: Extrato; referencia: string }) {
  const { status, ultima } = statusExtrato(e, referencia);
  const Icone = status === "ok" ? BadgeCheck : status === "manual" ? PenLine : AlertTriangle;
  const { cls, rotulo } = estilo[status];
  return <span title={ultima ? `Último extrato: ${fmtData(ultima)}` : "Nenhum extrato importado"} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}><Icone className="size-3.5" />{rotulo}{ultima && status !== "ok" ? ` · ${fmtData(ultima)}` : ""}</span>;
}

export function SinaleiroSaldos({ lista, referencia }: { lista: Extrato[]; referencia: string }) {
  const st = lista.map((e) => statusExtrato(e, referencia).status);
  const n = (s: S) => st.filter((x) => x === s).length;
  const tudoOk = lista.length > 0 && n("ok") === lista.length;
  const luz = (ativa: boolean, cor: string) => <span className={`size-3 rounded-full ${ativa ? cor : "bg-muted-foreground/20"}`} />;
  return <div role="status" className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
    <div className="flex gap-1.5 rounded-full bg-muted px-2 py-1.5">{luz(n("desatualizado") > 0, "bg-debit")}{luz(!tudoOk && n("desatualizado") === 0, "bg-chart-4")}{luz(tudoOk, "bg-credit")}</div>
    <div className="min-w-0 flex-1"><p className="font-semibold">{tudoOk ? "Saldos OK · todos os extratos atualizados" : n("desatualizado") ? "Há extratos desatualizados" : "Há contas sem extrato (saldo manual)"}</p><p className="text-xs text-muted-foreground">Atualizado = extrato lido até {fmtData(statusRef(referencia))} ou depois</p></div>
    <div className="flex gap-3 text-xs"><span className="text-credit">{n("ok")} OK</span><span>{n("desatualizado")} desatualizado(s)</span><span className="text-muted-foreground">{n("manual")} manual</span></div>
  </div>;
}

