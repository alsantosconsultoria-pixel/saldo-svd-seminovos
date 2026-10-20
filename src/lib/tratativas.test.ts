import { describe, expect, it } from "vitest";
import type { Extrato } from "./extrato/parser";
import { balancoNaData, despesasNaData, saldoNaData } from "./tratativas";

const conta: Extrato = { id: "itau", banco: "Itaú", agencia: "1", conta: "123", titular: "SVD", arquivo: "extrato.pdf", importadoEm: "", saldoInicial: 100, dataSaldoInicial: "2026-10-19", saldoFinalInformado: 900, saldosInformados: [{ data: "2026-10-19", saldo: 150 }, { data: "2026-10-21", saldo: 900 }], transacoes: [{ id: "1", data: "2026-10-20", tipo: "D", valor: 25.15, descricao: "Despesa", contraparte: "", documento: "" }] };

describe("Tratativas por data", () => {
  it("usa o saldo histórico sem antecipar saldos posteriores", () => {
    expect(saldoNaData(conta, "2026-10-20")?.saldo).toBe(124.85);
    expect(saldoNaData(conta, "2026-10-18")).toBeNull();
  });
  it("lista somente despesas a pagar com vencimento na data escolhida", () => {
    const itens = [{ tipo: "pagar", vencimento: "2026-10-20", valor: 50 }, { tipo: "receber", vencimento: "2026-10-20", valor: 10 }, { tipo: "pagar", vencimento: "2026-10-21", valor: 99 }];
    expect(despesasNaData(itens, "2026-10-20")).toEqual([itens[0]]);
  });
  it("ajusta contas positivas e negativas preservando o total em centavos", () => {
    const outra = { ...conta, id: "omni", saldosInformados: [{ data: "2026-10-20", saldo: -10 }] };
    const linhas = balancoNaData([conta, outra], [{ origem: "itau", destino: "omni", valor: 20.35 }], "2026-10-20");
    expect(linhas.map((l) => l.final)).toEqual([104.5, 10.35]);
    expect(linhas.reduce((a, l) => a + (l.final ?? 0), 0)).toBe(114.85);
  });
});