import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { associar, lerRealizado, realizadoPorDia, type Realizado } from "./realizado";
import type { Extrato } from "./extrato/parser";

const linha = (o: Record<string, unknown>) => ({ "Operação": "Pagar", "Data pagamento/recebimento": "06/10/2026", "Conta": "606000-9 - Banco OMNI", "Total pago": -500, "Cliente/Fornecedor": "F", ...o });

describe("Importar realizado", () => {
  it("só trata como realizado linhas com conta bancária; Pagar=despesa, Receber=receita", () => {
    const l = lerRealizado([linha({}), linha({ "Conta": "1006 - BAIXA ADMINISTRATIVA" }), linha({ "Operação": "Receber", "Total pago": 200 })]);
    expect(l.map((x) => [x.tipo, x.data, x.valor])).toEqual([["pagar", "2026-10-06", 500], ["receber", "2026-10-06", 200]]);
  });
  it("associa pela mesma conta, data e valor; sem par vai para pendências", () => {
    const ex = { id: "e1", conta: "606000-9", transacoes: [{ id: "t1", data: "2026-10-06", valor: 500, tipo: "D" }] } as unknown as Extrato;
    const base = { id: "a", chave: "a", tipo: "pagar", data: "2026-10-06", conta: "606000-9 - Banco OMNI", valor: 500, vinculo: null } as Realizado;
    const outraConta = { ...base, id: "b", conta: "99724-2 - 3835- Itau" };
    const r = associar([base, outraConta], [ex]);
    expect(r.porLanc.get("e1|t1")?.map((x) => x.id)).toEqual(["a"]);
    expect(r.pendentes.map((x) => x.id)).toEqual(["b"]);
  });
  it("soma realizado por dia", () => {
    expect(realizadoPorDia([{ data: "2026-10-06", tipo: "pagar", valor: 1.1 }, { data: "2026-10-06", tipo: "pagar", valor: 2.2 }], "2026-10-01", "2026-10-31")).toEqual([{ data: "2026-10-06", pago: 3.3, recebido: 0 }]);
  });
});
