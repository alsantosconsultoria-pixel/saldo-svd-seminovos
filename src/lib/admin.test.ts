import { describe, expect, it } from "vitest";
import { recortarExtratoPeriodo, validarGrupos, validarPeriodo } from "./admin.functions";
import type { Extrato } from "./extrato/parser";

describe("limpeza de dados da administração", () => {
  it("aceita só os grupos conhecidos", () => {
    expect(validarGrupos({ grupos: ["extratos", "previsoes"] })).toEqual({ grupos: ["extratos", "previsoes"] });
  });
  it("descarta nomes que não são tabelas do app", () => {
    expect(validarGrupos({ grupos: ["extratos", "auth", "users"] })).toEqual({ grupos: ["extratos"] });
  });
  it("recusa apagar sem escolher nada", () => {
    expect(() => validarGrupos({ grupos: [] })).toThrow("Escolha o que deseja apagar.");
    expect(() => validarGrupos({ grupos: ["auth"] })).toThrow("Escolha o que deseja apagar.");
    expect(() => validarGrupos({})).toThrow("Escolha o que deseja apagar.");
  });
});

const extratoBase = (): Extrato => ({
  id: "e1",
  banco: "Itaú",
  agencia: "1234",
  conta: "56789-0",
  titular: "SVD",
  arquivo: "itau.pdf",
  importadoEm: "2026-11-26T00:00:00Z",
  saldoInicial: 1000,
  dataSaldoInicial: "2026-11-01",
  saldoFinalInformado: 1500,
  saldosInformados: [
    { data: "2026-11-05", saldo: 1200 },
    { data: "2026-11-15", saldo: 1400 },
    { data: "2026-11-25", saldo: 1500 },
  ],
  transacoes: [
    { id: "t1", data: "2026-11-05", descricao: "A", contraparte: "", documento: "", valor: 200, tipo: "C" },
    { id: "t2", data: "2026-11-15", descricao: "B", contraparte: "", documento: "", valor: 200, tipo: "C" },
    { id: "t3", data: "2026-11-25", descricao: "C", contraparte: "", documento: "", valor: 100, tipo: "C" },
  ],
  futuros: [
    { id: "f1", data: "2026-11-18", descricao: "F", contraparte: "", documento: "", valor: 50, tipo: "D" },
  ],
});

describe("limpeza por período", () => {
  it("valida faixa e grupos permitidos", () => {
    expect(validarPeriodo({ grupos: ["extratos", "realizados", "demonstrativos"], de: "2026-11-01", ate: "2026-11-15" }))
      .toEqual({ grupos: ["extratos", "realizados"], de: "2026-11-01", ate: "2026-11-15" });
    expect(() => validarPeriodo({ grupos: ["realizados"], de: "2026-11-20", ate: "2026-11-10" }))
      .toThrow("A data inicial não pode ser maior que a data final.");
    expect(() => validarPeriodo({ grupos: ["realizados"], de: "", ate: "2026-11-10" }))
      .toThrow("Informe a data inicial e a data final.");
  });

  it("remove apenas lançamentos, saldos e futuros dentro do período e preserva o restante", () => {
    const { extrato, removidos } = recortarExtratoPeriodo(extratoBase(), "2026-11-10", "2026-11-20");
    expect(removidos).toBe(3);
    expect(extrato?.transacoes.map((t) => t.data)).toEqual(["2026-11-05", "2026-11-25"]);
    expect(extrato?.saldosInformados.map((s) => s.data)).toEqual(["2026-11-05", "2026-11-25"]);
    expect(extrato?.futuros).toEqual([]);
    expect(extrato?.saldoFinalInformado).toBe(1500);
  });

  it("remove a conta inteira quando todos os dados caem na faixa selecionada", () => {
    const { extrato, removidos } = recortarExtratoPeriodo(extratoBase(), "2026-11-01", "2026-11-30");
    expect(removidos).toBe(7);
    expect(extrato).toBeNull();
  });
});
