import { norm, pega } from "./importar-previsoes";

export interface LinhaPlanilhaPlano { categoria: string; codigo: string; nome: string; tipo: "credito" | "debito" }

// Lê as linhas da planilha modelo (Categoria, Natureza, Nº da conta, Nome da conta, Tipo da conta).
// Linhas sem número de conta são ignoradas; o tipo vem da coluna "Tipo da conta" ou, na falta, da natureza da categoria.
export function lerPlanilhaPlano(rows: Record<string, unknown>[]): LinhaPlanilhaPlano[] {
  return rows.flatMap((r) => {
    const codigo = String(pega(r, "no da conta", "nº da conta", "n da conta", "conta", "codigo")).trim();
    const categoria = String(pega(r, "categoria", "categoria financeira")).trim();
    if (!codigo || !categoria) return [];
    const nome = String(pega(r, "nome da conta", "nome")).trim() || codigo;
    const t = norm(String(pega(r, "tipo da conta", "tipo")) || String(pega(r, "natureza")));
    const tipo = t.startsWith("cred") || t.startsWith("rec") ? "credito" : "debito";
    return [{ categoria, codigo, nome, tipo }];
  });
}
