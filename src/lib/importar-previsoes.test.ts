import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insertPrevisoes: vi.fn().mockResolvedValue({ error: null }),
  deletePrevisoesGte: vi.fn(),
  deletePrevisoesLte: vi.fn().mockResolvedValue({ error: null }),
  deleteRealizadosGte: vi.fn(),
  deleteRealizadosLte: vi.fn().mockResolvedValue({ error: null }),
  insertRealizados: vi.fn().mockResolvedValue({ error: null }),
  deletePrevisoesIn: vi.fn(),
  realizadosDatas: [] as { data: string }[],
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "usuario" } }, error: null }) },
  from: vi.fn((tabela: string) => {
    if (tabela === "realizados") {
      return {
        select: () => ({ gte: () => ({ lte: () => ({ range: async () => ({ data: mocks.realizadosDatas, error: null }) }) }) }),
        delete: () => ({ gte: (col: string, de: string) => { mocks.deleteRealizadosGte(col, de); return { lte: (col2: string, ate: string) => mocks.deleteRealizadosLte(col2, ate) }; } }),
        insert: mocks.insertRealizados,
      };
    }
    return {
      delete: () => ({
        gte: (col: string, de: string) => { mocks.deletePrevisoesGte(col, de); return { lte: (col2: string, ate: string) => mocks.deletePrevisoesLte(col2, ate) }; },
        in: (col: string, vals: string[]) => { mocks.deletePrevisoesIn(col, vals); return { select: async () => ({ data: vals.map((id) => ({ id })), error: null }) }; },
      }),
      insert: mocks.insertPrevisoes,
    };
  }),
} }));
import { filtrarPrevisoesSemRealizado, importarPrevisoes, valor } from "./importar-previsoes";
import { importarRealizado } from "./realizado";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.realizadosDatas = [];
});

describe("Importação de planilha pelo topo e arraste", () => {
  it("preserva acentos, data brasileira, valor decimal e sobrepõe o período sem duplicar", async () => {
    const text = "Operação;Data vencimento;Cliente/Fornecedor;Nº documento;Valor título\nPagar;28/10/2026;Fornecedor;123;1,25\n";
    const file = { name: "previsoes.csv", text: async () => text } as File;
    const res = await importarPrevisoes(file);
    expect(res).toEqual({ importados: 1, ignoradosRealizado: 0, de: "2026-10-28", ate: "2026-10-28" });
    expect(mocks.deletePrevisoesGte).toHaveBeenCalledWith("vencimento", "2026-10-28");
    expect(mocks.deletePrevisoesLte).toHaveBeenCalledWith("vencimento", "2026-10-28");
    expect(mocks.insertPrevisoes).toHaveBeenCalledWith([expect.objectContaining({ tipo: "pagar", vencimento: "2026-10-28", valor: 1.25, contraparte: "Fornecedor", documento: "123" })]);
  });

  it("ignora previstos de dias que já constam como realizados", async () => {
    mocks.realizadosDatas = [{ data: "2026-10-28" }];
    const text = "Operação;Data vencimento;Cliente/Fornecedor;Nº documento;Valor título\nPagar;28/10/2026;Forn A;1;100,00\nPagar;29/10/2026;Forn B;2;200,00\n";
    const file = { name: "previsoes.csv", text: async () => text } as File;
    const res = await importarPrevisoes(file);
    expect(res).toEqual({ importados: 1, ignoradosRealizado: 1, de: "2026-10-28", ate: "2026-10-29" });
    expect(mocks.insertPrevisoes).toHaveBeenCalledWith([expect.objectContaining({ vencimento: "2026-10-29", valor: 200 })]);
  });

  it("filtrarPrevisoesSemRealizado remove exatamente as datas realizadas", () => {
    const r = filtrarPrevisoesSemRealizado([{ vencimento: "2026-11-10" }, { vencimento: "2026-11-11" }], ["2026-11-10"]);
    expect(r).toEqual({ manter: [{ vencimento: "2026-11-11" }], removidos: 1 });
  });
});

describe("Sobreposição do realizado e remoção de previstos do mesmo dia", () => {
  it("sobrepõe o período do realizado e remove previsões das datas realizadas", async () => {
    const text = "Conta;Operação;Data pagamento/recebimento;Total pago;Cliente/Fornecedor;Nº documento;Descrição;Categoria financeira\n99724-2 - Itau;Pagar;25/11/2026;500,00;Forn X;10;Compra;Despesas\n99724-2 - Itau;Receber;26/11/2026;800,00;Cli Y;11;Venda;Receitas\n";
    const file = { name: "realizado.csv", text: async () => text } as File;
    const res = await importarRealizado(file);
    expect(res).toEqual({ lidos: 2, previsoesRemovidas: 2, de: "2026-11-25", ate: "2026-11-26" });
    expect(mocks.deleteRealizadosGte).toHaveBeenCalledWith("data", "2026-11-25");
    expect(mocks.deleteRealizadosLte).toHaveBeenCalledWith("data", "2026-11-26");
    expect(mocks.insertRealizados).toHaveBeenCalledTimes(1);
    expect(mocks.deletePrevisoesIn).toHaveBeenCalledWith("vencimento", ["2026-11-25", "2026-11-26"]);
  });
});

describe("Conversão de valores da planilha", () => {
  it("350000.00 vira 350.000,00", () => expect(valor("350000.00")).toBe(350000));
  it("350.000,00 continua 350.000,00", () => expect(valor("350.000,00")).toBe(350000));
  it("350.000 sem centavos é milhar", () => expect(valor("350.000")).toBe(350000));
  it("1,234.56 formato americano", () => expect(valor("1,234.56")).toBe(1234.56));
});
