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

// Títulos vencidos entram junto das despesas do dia, marcados como não pagos no vencimento.
export function despesasAteData<T extends DespesaPrevista>(itens: T[], data: string, incluirVencidas = true): T[] {
  return itens
    .filter((i) => i.tipo === "pagar" && (incluirVencidas ? i.vencimento <= data : i.vencimento === data))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

export function somarValores(valores: number[]) {
  return valores.reduce((a, v) => a + Math.round(v * 100), 0) / 100;
}

// Saldo da última data realizada: um saldo informado antigo não congela a conta.
// Previsões nunca entram neste cálculo e o saldo calculado não vira saldo informado.
export function ultimoSaldoExtrato(e: Extrato) {
  const data = [...e.transacoes.map((t) => t.data), ...e.saldosInformados.map((s) => s.data), e.dataSaldoInicial].filter(Boolean).sort().at(-1) ?? "";
  const conhecido = data ? saldoNaData(e, data) : null;
  const informado = e.saldosInformados.some((s) => s.data === data);
  return { saldo: conhecido?.saldo ?? e.saldoInicial, data, parcial: !informado };
}
// Seleção de pagamentos do dia: base do dia + títulos trazidos de outras datas + lançamentos manuais.
// Títulos novos entram marcados; só os marcados compõem o total a pagar.
export function montarPagamentos<T extends { id: string; valor: number }>(base: T[], incluidos: T[], manuais: T[], desmarcados: string[]) {
  const vistos = new Set<string>();
  const todos = [...base, ...incluidos, ...manuais].filter((d) => (vistos.has(d.id) ? false : (vistos.add(d.id), true)));
  const fora = new Set(desmarcados);
  const selecionados = todos.filter((d) => !fora.has(d.id));
  return { todos, selecionados, total: somarValores(selecionados.map((d) => d.valor)) };
}

// ============ Busca de títulos na base ============
// Cada palavra digitada é um filtro próprio: "Paccar sen4d22" só retorna títulos que tenham as duas.
const CAMPOS_DE_BUSCA = ["contraparte", "documento", "descricao", "categoria", "banco"] as const;
type CamposBusca = Partial<Record<(typeof CAMPOS_DE_BUSCA)[number], string | null>>;

export function normalizarBusca(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Separa o digitado em palavras, descartando símbolos que quebrariam o filtro do banco.
export function tokensDeBusca(termo: string): string[] {
  return termo.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

export function textoDeBusca(d: CamposBusca): string {
  return CAMPOS_DE_BUSCA.map((c) => d[c] ?? "").join(" ");
}

// Compara sem caixa e sem acentos: "AÇO" encontra "Aço".
export function contemTodosOsTokens(tokens: string[], texto: string) {
  const alvo = normalizarBusca(texto);
  return tokens.length > 0 && tokens.every((t) => alvo.includes(normalizarBusca(t)));
}

// Filtro enviado ao banco: a primeira palavra já reduz a base; as demais conferem no resultado.
export function clausulaDeBusca(token: string) {
  const limpo = token.replace(/[^\p{L}\p{N}]/gu, "");
  return limpo ? CAMPOS_DE_BUSCA.map((c) => `${c}.ilike.%${limpo}%`).join(",") : "";
}
