import { describe, expect, it } from "vitest";
import { validarGrupos } from "./admin.functions";

describe("limpeza de dados da administração", () => {
  it("aceita só os grupos conhecidos", () => {
    expect(validarGrupos({ grupos: ["extratos", "previsoes"] })).toEqual({ grupos: ["extratos", "previsoes"] });
  });
  it("descarta nomes que não são tabelas do app", () => {
    expect(validarGrupos({ grupos: ["extratos", "auth", "users"] })).toEqual({ grupos: ["extratos"] });
  });
  it("recusa apagar sem escolher nada", () => {
    expect(() => validarGrupos({ grupos: [] })).toThrow("Escolha o que deseja apagar.");
    expect(() => validarGrupos({ grupos: ["auth"] })).toThrow("Escolha o que deseja apagar.");
    expect(() => validarGrupos({})).toThrow("Escolha o que deseja apagar.");
  });
});
