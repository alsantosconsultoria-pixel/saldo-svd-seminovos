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
    expect(deb!.filhos[0]).toMatchObject({ rotulo: "2.1 · Impostos", total: 15 });
    expect(deb!.filhos[1]).toMatchObject({ rotulo: "Sem conta associada", total: 7 });
    expect(cred!.valores).toEqual([3, 0]); // vencido entra hoje
  });
});
