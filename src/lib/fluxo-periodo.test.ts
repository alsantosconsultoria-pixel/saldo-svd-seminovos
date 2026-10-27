import { describe, it, expect } from "vitest";
import { fluxoCaixa, fluxoPeriodo } from "./fluxo";
describe("fluxoPeriodo", () => {
  it("preenche dias sem previsão repetindo o saldo", () => {
    const f = fluxoCaixa(100, [{ tipo: "pagar", vencimento: "2026-10-28", valor: 30 }, { tipo: "receber", vencimento: "2026-10-30", valor: 50 }], "2026-10-27");
    const p = fluxoPeriodo(f, 100, "2026-10-27", "2026-10-30");
    expect(p.map((d) => d.final)).toEqual([100, 70, 70, 120]);
  });
});
