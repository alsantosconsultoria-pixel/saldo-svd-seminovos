import type { Extrato } from "./parser";

export type EscopoDiario = "entradas" | "saidas" | "todos";

export function lancamentosDoDia(extrato: Extrato, data: string, escopo: EscopoDiario = "todos") {
  return extrato.transacoes.filter((t) => t.data === data && (
    escopo === "todos" || t.tipo === (escopo === "entradas" ? "C" : "D")
  ));
}