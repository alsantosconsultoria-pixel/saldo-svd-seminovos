import { describe, expect, it, vi } from "vitest";

const { insert } = vi.hoisted(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "usuario" } }, error: null }) },
  from: vi.fn(() => ({ insert })),
} }));
import { importarPrevisoes } from "./importar-previsoes";

describe("Importação de planilha pelo topo e arraste", () => {
  it("preserva acentos, data brasileira e valor decimal no CSV", async () => {
    const text = "Operação;Data vencimento;Cliente/Fornecedor;Nº documento;Valor título\nPagar;28/10/2026;Fornecedor;123;1,25\n";
    const file = { name: "previsoes.csv", text: async () => text } as File;
    expect(await importarPrevisoes(file)).toBe(1);
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({ tipo: "pagar", vencimento: "2026-10-28", valor: 1.25, contraparte: "Fornecedor", documento: "123" })]);
  });
});
import { valor } from "./importar-previsoes";
describe("Conversão de valores da planilha", () => {
  it("350000.00 vira 350.000,00", () => expect(valor("350000.00")).toBe(350000));
  it("350.000,00 continua 350.000,00", () => expect(valor("350.000,00")).toBe(350000));
  it("350.000 sem centavos é milhar", () => expect(valor("350.000")).toBe(350000));
  it("1,234.56 formato americano", () => expect(valor("1,234.56")).toBe(1234.56));
});
