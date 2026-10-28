import { describe, expect, it } from "vitest";
import type { Extrato, Transacao } from "./parser";
import { lancamentosDoDia } from "./composicao";

const base: Transacao = { id: "credito", data: "2026-10-28", tipo: "C", valor: 250, descricao: "Receita", contraparte: "Cliente", documento: "123" };
const conta: Extrato = { id: "banco", banco: "Itaú", agencia: "1", conta: "123", titular: "SVD", arquivo: "extrato.pdf", importadoEm: "", saldoInicial: 1000, dataSaldoInicial: "2026-10-27", saldoFinalInformado: null, saldosInformados: [], transacoes: [base, { ...base, id: "debito", tipo: "D", valor: 125 }, { ...base, id: "anterior", data: "2026-10-27" }], futuros: [{ ...base, id: "futuro" }] };

describe("Composição diária dos lançamentos realizados", () => {
  it("abre somente as receitas realizadas da conta e do dia", () => {
    expect(lancamentosDoDia(conta, "2026-10-28", "entradas").map((t) => t.id)).toEqual(["credito"]);
  });
  it("abre somente as despesas realizadas da conta e do dia", () => {
    expect(lancamentosDoDia(conta, "2026-10-28", "saidas").map((t) => t.id)).toEqual(["debito"]);
  });
  it("abre ambos os tipos no saldo e total diário sem incluir outros dias ou previsões", () => {
    const itens = lancamentosDoDia(conta, "2026-10-28");
    expect(itens.map((t) => t.id)).toEqual(["credito", "debito"]);
    expect(itens.reduce((a, t) => a + (t.tipo === "C" ? t.valor : -t.valor), 0)).toBe(125);
  });
});