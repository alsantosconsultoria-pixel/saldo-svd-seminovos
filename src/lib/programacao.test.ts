import { describe, expect, it } from "vitest";
import { aplicarProgramacao } from "./plano";
const p = (id: string, vencimento: string, valor: number) => ({ id, tipo: "pagar", vencimento, categoria: "X", valor });
describe("programação das tratativas como estimativa", () => {
  it("no dia programado só entram os títulos marcados, incluídos e manuais", () => {
    const prevs = [p("a", "2026-11-17", 100), p("b", "2026-11-17", 50), p("c", "2026-11-20", 30)];
    const r = aplicarProgramacao(prevs, [{ dia: "2026-11-17", desmarcados: ["b"], incluidos: ["c"], manuais: [{ id: "m", valor: 5 }] }], "2026-11-16");
    expect(r.filter((x) => x.vencimento === "2026-11-17").reduce((a, x) => a + x.valor, 0)).toBe(135);
    expect(r.some((x) => x.vencimento === "2026-11-20")).toBe(false);
  });
  it("dias já realizados não usam a programação", () => {
    const prevs = [p("a", "2026-11-17", 100)];
    expect(aplicarProgramacao(prevs, [{ dia: "2026-11-17", desmarcados: ["a"], incluidos: [], manuais: [] }], "2026-11-17")).toEqual(prevs);
  });
});
