import { describe, expect, it } from "vitest";
import { lerPlanilhaPlano } from "./plano-planilha";

describe("lerPlanilhaPlano", () => {
  it("lê conta, nome e tipo e ignora linhas sem conta", () => {
    expect(lerPlanilhaPlano([
      { Categoria: "ICMS", Natureza: "Despesa", "Nº da conta": "2.1", "Nome da conta": "Impostos", "Tipo da conta": "Débito" },
      { Categoria: "Vendas", Natureza: "Receita", "Nº da conta": "1.1", "Nome da conta": "Receitas" },
      { Categoria: "Aluguel", Natureza: "Despesa", "Nº da conta": "" },
    ])).toEqual([
      { categoria: "ICMS", codigo: "2.1", nome: "Impostos", tipo: "debito" },
      { categoria: "Vendas", codigo: "1.1", nome: "Receitas", tipo: "credito" },
    ]);
  });
});
