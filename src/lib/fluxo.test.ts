import { describe, expect, it } from "vitest";
import { fluxoCaixa } from "./fluxo";

describe("fluxoCaixa", () => {
  it("usa o saldo final do dia anterior e aponta o faltante", () => {
    const f = fluxoCaixa(1000, [
      { tipo: "pagar", vencimento: "2026-10-20", valor: 1500 },
      { tipo: "receber", vencimento: "2026-10-21", valor: 200 },
    ], "2026-10-19");
    expect(f[0]).toMatchObject({ inicial: 1000, final: -500, faltante: 500 });
    expect(f[1]).toMatchObject({ inicial: -500, final: -300 });
  });
  it("joga vencidos para hoje", () => {
    expect(fluxoCaixa(0, [{ tipo: "receber", vencimento: "2026-10-01", valor: 10 }], "2026-10-19")[0]!.data).toBe("2026-10-19");
  });
});
