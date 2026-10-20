import type { Extrato } from "@/lib/extrato/parser";

export interface AjusteDia { origem: string; destino: string; valor: number }
export interface DespesaPrevista { tipo: string; vencimento: string; valor: number }

// A referência é sempre um saldo conhecido até a data, nunca um saldo futuro.
export function saldoNaData(e: Extrato, data: string): { saldo: number; referencia: string } | null {
  const informado = [...e.saldosInformados].filter((s) => s.data <= data).sort((a, b) => a.data.localeCompare(b.data)).at(-1);
  const inicial = e.dataSaldoInicial || [...e.transacoes].sort((a, b) => a.data.localeCompare(b.data))[0]?.data;
  if (!informado && (!inicial || inicial > data)) return null;
  const referencia = informado?.data ?? inicial ?? "";
  let centavos = Math.round((informado?.saldo ?? e.saldoInicial) * 100);
  for (const t of e.transacoes) {
    if (t.data <= data && (informado ? t.data > referencia : t.data >= referencia)) {
      centavos += Math.round(t.valor * 100) * (t.tipo === "C" ? 1 : -1);
    }
  }
  const ultimaTransacao = e.transacoes.filter((t) => t.data <= data && t.data >= referencia).map((t) => t.data).sort().at(-1);
  return { saldo: centavos / 100, referencia: ultimaTransacao ?? referencia };
}

export function balancoNaData(lista: Extrato[], ajustes: AjusteDia[], data: string) {
  return lista.map((e) => {
    const conhecido = saldoNaData(e, data);
    const ent = ajustes.filter((t) => t.destino === e.id).reduce((a, t) => a + Math.round(t.valor * 100), 0);
    const sai = ajustes.filter((t) => t.origem === e.id).reduce((a, t) => a + Math.round(t.valor * 100), 0);
    const base = conhecido?.saldo ?? null;
    return { e, base, referencia: conhecido?.referencia ?? "", ent: ent / 100, sai: sai / 100,
      final: base === null ? null : (Math.round(base * 100) + ent - sai) / 100 };
  });
}

export function despesasNaData<T extends DespesaPrevista>(itens: T[], data: string): T[] {
  return itens.filter((i) => i.tipo === "pagar" && i.vencimento === data);
}

export function somarValores(valores: number[]) {
  return valores.reduce((a, v) => a + Math.round(v * 100), 0) / 100;
}