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