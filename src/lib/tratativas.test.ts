import { describe, expect, it } from "vitest";
import type { Extrato } from "./extrato/parser";
import { balancoNaData, despesasAteData, despesasNaData, saldoNaData, ultimoSaldoExtrato } from "./tratativas";

const conta: Extrato = { id: "itau", banco: "Itaú", agencia: "1", conta: "123", titular: "SVD", arquivo: "extrato.pdf", importadoEm: "", saldoInicial: 100, dataSaldoInicial: "2026-10-19", saldoFinalInformado: 900, saldosInformados: [{ data: "2026-10-19", saldo: 150 }, { data: "2026-10-21", saldo: 900 }], transacoes: [{ id: "1", data: "2026-10-20", tipo: "D", valor: 25.15, descricao: "Despesa", contraparte: "", documento: "" }] };

describe("Tratativas por data", () => {
  it("calcula saldo parcial a partir do inicial, das entradas e das saídas realizadas", () => {
    const parcial: Extrato = { ...conta, saldoInicial: 1000, saldoFinalInformado: null, saldosInformados: [], transacoes: [
      { ...conta.transacoes[0], id: "c", data: "2026-10-26", tipo: "C", valor: 250.50 },
      { ...conta.transacoes[0], id: "d", data: "2026-10-26", tipo: "D", valor: 125.25 },
    ], futuros: [{ ...conta.transacoes[0], data: "2026-10-27", tipo: "D", valor: 900 }] };
    expect(ultimoSaldoExtrato(parcial)).toEqual({ saldo: 1125.25, data: "2026-10-26", parcial: true });
  });
  it("não congela no saldo informado antigo quando há movimentações posteriores sem fechamento", () => {
    const parcial: Extrato = { ...conta, saldoFinalInformado: 900, transacoes: [
      ...conta.transacoes, { ...conta.transacoes[0], data: "2026-10-26", valor: 125.25 },
    ] };
    expect(ultimoSaldoExtrato(parcial)).toEqual({ saldo: 774.75, data: "2026-10-26", parcial: true });
    expect(saldoNaData(parcial, "2026-10-20")?.saldo).toBe(124.85);
  });
  it("prioriza fechamento informado na última data sem somar novamente as movimentações desse dia", () => {
    const fechado: Extrato = { ...conta, saldosInformados: [...conta.saldosInformados, { data: "2026-10-26", saldo: 800 }], transacoes: [{ ...conta.transacoes[0], data: "2026-10-26", valor: 100 }] };
    expect(ultimoSaldoExtrato(fechado)).toEqual({ saldo: 800, data: "2026-10-26", parcial: false });
  });
  it("sem base informada calcula apenas o resultado parcial das movimentações", () => {
    const parcial: Extrato = { ...conta, saldoInicial: 0, dataSaldoInicial: "", saldoFinalInformado: null, saldosInformados: [] };
    expect(ultimoSaldoExtrato(parcial).saldo).toBe(-25.15);
    expect(ultimoSaldoExtrato(parcial).parcial).toBe(true);
  });
  it("usa o saldo histórico sem antecipar saldos posteriores", () => {
    expect(saldoNaData(conta, "2026-10-20")?.saldo).toBe(124.85);
    expect(saldoNaData(conta, "2026-10-18")).toBeNull();
  });
  it("lista somente despesas a pagar com vencimento na data escolhida", () => {
    const itens = [{ tipo: "pagar", vencimento: "2026-10-20", valor: 50 }, { tipo: "receber", vencimento: "2026-10-20", valor: 10 }, { tipo: "pagar", vencimento: "2026-10-21", valor: 99 }];
    expect(despesasNaData(itens, "2026-10-20")).toEqual([itens[0]]);
  });
  it("traz títulos vencidos junto das despesas do dia, sem receitas nem vencimentos futuros", () => {
    const itens = [
      { tipo: "pagar", vencimento: "2026-10-18", valor: 30 },
      { tipo: "pagar", vencimento: "2026-10-20", valor: 50 },
      { tipo: "receber", vencimento: "2026-10-19", valor: 10 },
      { tipo: "pagar", vencimento: "2026-10-21", valor: 99 },
    ];
    expect(despesasAteData(itens, "2026-10-20")).toEqual([itens[0], itens[1]]);
  });
  it("ajusta contas positivas e negativas preservando o total em centavos", () => {
    const outra = { ...conta, id: "omni", saldosInformados: [{ data: "2026-10-20", saldo: -10 }] };
    const linhas = balancoNaData([conta, outra], [{ origem: "itau", destino: "omni", valor: 20.35 }], "2026-10-20");
    expect(linhas.map((l) => l.final)).toEqual([104.5, 10.35]);
    expect(linhas.reduce((a, l) => a + (l.final ?? 0), 0)).toBe(114.85);
  });
});