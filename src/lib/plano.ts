export interface ContaPlano { id: string; codigo: string; nome: string; tipo: "credito" | "debito" }
export interface ItemPlano { tipo: string; vencimento: string; categoria: string; valor: number }
export interface LinhaPlano { id: string; rotulo: string; valores: number[]; total: number; filhos: LinhaPlano[] }

const cent = (v: number) => Math.round(v * 100);

// Agrupa as previsões por grupo (Créditos/Débitos) → conta do plano → categoria, dia a dia.
// Vencidos entram em `hoje`, igual ao fluxo de caixa. Categoria sem conta vai para "Sem conta associada".
export function fluxoPorPlano(itens: ItemPlano[], dias: string[], contas: ContaPlano[], mapa: Record<string, string>, hoje: string): LinhaPlano[] {
  const idx = new Map(dias.map((d, i) => [d, i]));
  const porId = new Map(contas.map((c) => [c.id, c]));
  const grupos = [{ id: "credito", rotulo: "Créditos (a receber)", tipo: "receber" }, { id: "debito", rotulo: "Débitos (a pagar)", tipo: "pagar" }];
  return grupos.map((g) => {
    const contasMap = new Map<string, Map<string, number[]>>();
    const ordemNome = new Map<string, string>();
    for (const i of itens) {
      if ((i.tipo === "receber") !== (g.tipo === "receber")) continue;
      const d = idx.get(i.vencimento < hoje ? hoje : i.vencimento);
      if (d === undefined) continue;
      const cat = i.categoria || "Sem categoria";
      const c0 = porId.get(mapa[cat] ?? "");
      const conta = c0 ? c0.nome.trim() : "_sem";
      if (c0 && (!ordemNome.has(conta) || c0.codigo.localeCompare(ordemNome.get(conta)!, "pt-BR", { numeric: true }) < 0)) ordemNome.set(conta, c0.codigo);
      const cats = contasMap.get(conta) ?? new Map<string, number[]>();
      const v = cats.get(cat) ?? dias.map(() => 0);
      v[d] = (v[d] ?? 0) + cent(i.valor);
      cats.set(cat, v); contasMap.set(conta, cats);
    }
    const filhos = [...contasMap.entries()].map(([cid, cats]) => {
      const catLinhas = [...cats.entries()].sort().map(([cat, v]) => linha(`${g.id}|${cid}|${cat}`, cat, v, []));
      return linha(`${g.id}|${cid}`, cid === "_sem" ? "Sem conta associada" : cid, soma(catLinhas, dias.length), catLinhas, ordemNome.get(cid) ?? "");
    }).sort((a, b) => (!a.ordem ? 1 : !b.ordem ? -1 : a.ordem.localeCompare(b.ordem, "pt-BR", { numeric: true })));
    return linha(g.id, g.rotulo, soma(filhos, dias.length), filhos);
  });
}

function soma(l: { cent: number[] }[], n: number) {
  const v = Array.from({ length: n }, () => 0);
  for (const x of l) x.cent.forEach((c, i) => (v[i] = (v[i] ?? 0) + c));
  return v;
}
function linha(id: string, rotulo: string, c: number[], filhos: (LinhaPlano & { cent: number[] })[], ordem = "") {
  return { id, rotulo, cent: c, ordem, valores: c.map((x) => x / 100), total: c.reduce((a, b) => a + b, 0) / 100, filhos };
}
