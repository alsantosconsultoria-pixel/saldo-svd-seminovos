import { describe, expect, it } from "vitest";
import { fluxoPorPlano } from "./plano";

describe("fluxoPorPlano", () => {
  const contas = [{ id: "a", codigo: "2.1", nome: "Impostos", tipo: "debito" as const }];
  it("agrupa categorias na conta do plano e soma por dia", () => {
    const [cred, deb] = fluxoPorPlano([
      { tipo: "pagar", vencimento: "2026-11-10", categoria: "ICMS", valor: 10 },
      { tipo: "pagar", vencimento: "2026-11-10", categoria: "ISS", valor: 5 },
      { tipo: "pagar", vencimento: "2026-11-11", categoria: "Aluguel", valor: 7 },
      { tipo: "receber", vencimento: "2026-11-01", categoria: "Vendas", valor: 3 },
    ], ["2026-11-10", "2026-11-11"], contas, { ICMS: "a", ISS: "a" }, "2026-11-10");
    expect(deb!.valores).toEqual([15, 7]);
    expect(deb!.filhos[0]).toMatchObject({ rotulo: "Impostos", total: 15 });
    expect(deb!.filhos[1]).toMatchObject({ rotulo: "Sem conta associada", total: 7 });
    expect(cred!.valores).toEqual([3, 0]); // vencido entra hoje
  });
});

describe("forecast do painel", () => {
  const contas = [{ id: "a", codigo: "2.1", nome: "Impostos", tipo: "debito" as const }];
  it("realizado até o corte e previsões só depois do corte", async () => {
    const { itensForecast } = await import("./plano");
    const r = itensForecast(
      [{ tipo: "pagar", data: "2026-11-10", categoria: "ICMS", valor: 10 }, { tipo: "pagar", data: "2026-11-13", categoria: "ICMS", valor: 99 }],
      [{ tipo: "pagar", vencimento: "2026-11-12", categoria: "ICMS", valor: 1 }, { tipo: "pagar", vencimento: "2026-11-13", categoria: "ICMS", valor: 5 }],
      "2026-11-12",
    );
    expect(r.map((i) => i.valor)).toEqual([10, 5]);
  });
  it("totais por conta somam tudo sem dias", async () => {
    const { totaisPorPlano } = await import("./plano");
    const [, deb] = totaisPorPlano([{ tipo: "pagar", vencimento: "2026-01-01", categoria: "ICMS", valor: 10 }, { tipo: "pagar", vencimento: "2026-12-01", categoria: "ICMS", valor: 5 }], contas, { ICMS: "a" });
    expect(deb!.filhos[0]).toMatchObject({ rotulo: "Impostos", total: 15 });
  });
  it("ignora transferência financeira de entrada e saída nos saldos e no fluxo", async () => {
    const { ehTransferenciaFinanceira, itensForecast } = await import("./plano");
    const { fluxoCaixa } = await import("./fluxo");
    expect(ehTransferenciaFinanceira("MOVIMENTAÇÃO - TRANSFERÊNCIA FINANCEIRA - ENTRADA")).toBe(true);
    expect(ehTransferenciaFinanceira("MOVIMENTAÇÃO - TRANSFERÊNCIA FINANCEIRA - SAIDA")).toBe(true);
    expect(ehTransferenciaFinanceira("MOVIMENTAÇÃO - TRANSFERÊNCIA FINANCEIRA - SAIDAS")).toBe(true);
    expect(ehTransferenciaFinanceira("MOVIMENTAÇÃO - EMPRÉSTIMOS")).toBe(false);
    const itens = [
      { tipo: "receber", vencimento: "2026-11-10", categoria: "MOVIMENTAÇÃO - TRANSFERÊNCIA FINANCEIRA - ENTRADA", valor: 50000 },
      { tipo: "pagar", vencimento: "2026-11-10", categoria: "MOVIMENTAÇÃO - TRANSFERÊNCIA FINANCEIRA - SAIDA", valor: 50000 },
      { tipo: "pagar", vencimento: "2026-11-10", categoria: "ICMS", valor: 100 },
    ];
    const [cred, deb] = fluxoPorPlano(itens, ["2026-11-10"], contas, { ICMS: "a" }, "2026-11-10");
    expect(cred!.total).toBe(0);
    expect(deb!.total).toBe(100);
    const fc = fluxoCaixa(1000, itens, "2026-11-10");
    expect(fc[0]).toMatchObject({ receber: 0, pagar: 100, final: 900 });
    const forecast = itensForecast(
      [{ tipo: "pagar", data: "2026-11-10", categoria: "MOVIMENTAÇÃO - TRANSFERÊNCIA FINANCEIRA - SAIDAS", valor: 35000 }],
      itens,
      "2026-11-10",
    );
    expect(forecast).toEqual([]);
  });
});
