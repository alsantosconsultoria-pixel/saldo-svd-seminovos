export interface PrevItem { tipo: string; vencimento: string; valor: number }
export interface DiaFluxo { data: string; inicial: number; receber: number; pagar: number; final: number; faltante: number }

// Fluxo de caixa: começa no saldo atual dos bancos e soma/subtrai as previsões dia a dia.
// Previsões vencidas (antes de hoje) entram no primeiro dia. Faltante = quanto falta para pagar os compromissos do dia.
export function fluxoCaixa(saldoInicial: number, itens: PrevItem[], hoje: string): DiaFluxo[] {
  const mapa = new Map<string, { r: number; p: number }>();
  for (const i of itens) {
    const d = i.vencimento < hoje ? hoje : i.vencimento;
    const m = mapa.get(d) ?? { r: 0, p: 0 };
    if (i.tipo === "receber") m.r += Math.round(i.valor * 100); else m.p += Math.round(i.valor * 100);
    mapa.set(d, m);
  }
  let saldo = Math.round(saldoInicial * 100);
  return [...mapa.keys()].sort().map((data) => {
    const { r, p } = mapa.get(data)!;
    const inicial = saldo;
    saldo = inicial + r - p;
    return { data, inicial: inicial / 100, receber: r / 100, pagar: p / 100, final: saldo / 100, faltante: saldo < 0 ? Math.min(-saldo, p) / 100 : 0 };
  });
}
