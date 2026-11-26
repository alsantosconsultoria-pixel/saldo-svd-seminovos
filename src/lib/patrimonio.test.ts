import { describe, expect, it } from "vitest";
import type { Extrato } from "@/lib/extrato/parser";
import type { Realizado } from "@/lib/realizado";
import {
  COMPLEMENTOS_INICIAIS,
  PREMISSAS_INICIAIS,
  compararPatrimonio,
  conciliarTitulosPatrimonio,
  datasDiarias,
  datasMensais,
  indicadoresPatrimonio,
  montarSeriePatrimonio,
  oscilacaoRelevante,
  type TituloPatrimonio,
} from "./patrimonio";

const extrato: Extrato = {
  id: "e1", banco: "Itaú", agencia: "1", conta: "123-4", titular: "", arquivo: "", importadoEm: "",
  saldoInicial: 1000, dataSaldoInicial: "2026-11-01", saldoFinalInformado: 1000,
  saldosInformados: [{ data: "2026-11-01", saldo: 1000 }], transacoes: [],
};

const realizado = (parcial: Partial<Realizado>): Realizado => ({
  id: "r1", chave: "r1", tipo: "receber", data: "2026-11-02", conta: "123-4", contraparte: "Cliente A",
  descricao: "", documento: "100", categoria: "Vendas", valor: 200, vinculo: null, ...parcial,
});

const previsao = (parcial: Partial<TituloPatrimonio>): TituloPatrimonio => ({
  id: "p1", tipo: "receber", vencimento: "2026-11-02", valor: 200, documento: "100", contraparte: "Cliente A", categoria: "Vendas", ...parcial,
});

describe("Análise de Patrimônio", () => {
  it("concilia pelo documento sem duplicar a previsão já realizada", () => {
    const baixas = conciliarTitulosPatrimonio([previsao({})], [realizado({})]);
    expect(baixas.get("p1")).toBe("2026-11-02");
    const [dia] = montarSeriePatrimonio({
      extratos: [extrato], previsoes: [previsao({})], realizados: [realizado({})], datas: ["2026-11-03"], de: "2026-11-01",
      cenarios: ["base"], premissas: PREMISSAS_INICIAIS, complementos: COMPLEMENTOS_INICIAIS,
    });
    expect(dia?.base).toMatchObject({ receberBruto: 0, resultado: 200 });
  });

  it("mantém Ativo Total igual a Passivo mais Patrimônio Líquido em todos os cenários", () => {
    const serie = montarSeriePatrimonio({
      extratos: [extrato], previsoes: [previsao({ documento: "200" }), previsao({ id: "p2", tipo: "pagar", valor: 80, documento: "300", contraparte: "Fornecedor B" })],
      realizados: [], datas: ["2026-11-01", "2026-11-03"], de: "2026-11-01", cenarios: ["base", "conservador", "otimista", "simulado"],
      premissas: PREMISSAS_INICIAIS, complementos: { ...COMPLEMENTOS_INICIAIS, imobilizado: 1000, capitalSocial: 500 },
    });
    for (const dia of serie) for (const s of Object.values(dia)) expect(s?.diferenca).toBe(0);
  });

  it("limita a reserva legal a 5% do lucro e a 20% do capital social", () => {
    const [dia] = montarSeriePatrimonio({
      extratos: [extrato], previsoes: [previsao({ vencimento: "2026-11-02", documento: "999" })], realizados: [], datas: ["2026-11-03"], de: "2026-11-01",
      cenarios: ["simulado"], premissas: { ...PREMISSAS_INICIAIS, pdd: 0, impostos: 0, depreciacaoAnual: 0 },
      complementos: { ...COMPLEMENTOS_INICIAIS, capitalSocial: 500 },
    });
    expect(dia?.simulado?.resultado).toBe(200);
    expect(dia?.simulado?.reservaLegal).toBe(10);
  });

  it("aplica o limiar configurável por percentual ou por valor", () => {
    expect(oscilacaoRelevante({ variacao: 50, percentual: 10 }, 5, "percentual")).toBe(true);
    expect(oscilacaoRelevante({ variacao: 50, percentual: 10 }, 60, "valor")).toBe(false);
    expect(oscilacaoRelevante({ variacao: 50, percentual: null }, 5, "percentual")).toBe(true);
  });

  it("calcula indicadores sem dividir por zero", () => {
    const [dia] = montarSeriePatrimonio({
      extratos: [extrato], previsoes: [], realizados: [], datas: ["2026-11-01"], de: "2026-11-01", cenarios: ["base"],
      premissas: PREMISSAS_INICIAIS, complementos: COMPLEMENTOS_INICIAIS,
    });
    expect(indicadoresPatrimonio(dia!.base!)).toMatchObject({ liquidezCorrente: null, capitalCirculante: 1000, roe: 0, roa: 0 });
  });

  it("gera datas diárias e fechamentos mensais corretos", () => {
    expect(datasDiarias("2026-11-01", "2026-11-03")).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(datasMensais(2024, 1, 3)).toEqual(["2024-01-31", "2024-02-29", "2024-03-31"]);
    const [dia] = montarSeriePatrimonio({
      extratos: [extrato], previsoes: [], realizados: [], datas: ["2026-11-01"], de: "2026-11-01", cenarios: ["base"],
      premissas: PREMISSAS_INICIAIS, complementos: COMPLEMENTOS_INICIAIS,
    });
    expect(compararPatrimonio(dia!.base!, { ...dia!.base!, disponibilidades: 1100, ativoCirculante: 1100, ativoTotal: 1100, patrimonioLiquido: 1100 }).find((l) => l.id === "disponibilidades")).toMatchObject({ variacao: 100, percentual: 10 });
  });
});
