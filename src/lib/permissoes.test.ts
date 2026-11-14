import { describe, expect, it } from "vitest";
import { permissoesEfetivas, TUDO } from "./permissoes";

describe("permissoesEfetivas", () => {
  const restrito = { abas: ["painel"], importacoes: [], backup: false };
  it("usuário sem definição tem acesso completo", () => expect(permissoesEfetivas(null, false)).toEqual(TUDO));
  it("administrador sempre tem tudo", () => expect(permissoesEfetivas(restrito, true)).toEqual(TUDO));
  it("usuário comum segue o definido pelo administrador", () => expect(permissoesEfetivas(restrito, false)).toEqual(restrito));
});
