export interface ContaPlano { id: string; codigo: string; nome: string; tipo: "credito" | "debito" }
export interface ItemPlano { tipo: string; vencimento: string; categoria: string; valor: number }
export interface LinhaPlano { id: string; rotulo: string; valores: number[]; total: number; filhos: LinhaPlano[] }
export interface MovimentacaoFluxo { id: string; data: string; tipo: "entrada" | "saida"; conta: string; contraparte: string; valor: number }

// Categorias de transferência financeira entre contas: já refletidas no saldo, não compõem entradas/saídas.
export function ehTransferenciaFinanceira(categoria?: string | null): boolean {
  if (!categoria) return false;
  const n = categoria.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  return /^MOVIMENTACAO\s*-\s*TRANSFERENCIA FINANCEIRA\s*-\s*(ENTRADAS?|SAIDAS?)$/.test(n);
}

const cent = (v: number) => Math.round(v * 100);

// Concilia transferências entre contas: entradas (+) e saídas (-) devem zerar.
// Quando o saldo não bate zero, isola os lançamentos sem par (mesmo valor, priorizando mesma data).
export function conciliarMovimentacoes(movs: MovimentacaoFluxo[]): { saldo: number; divergentes: MovimentacaoFluxo[] } {
  const saldoCent = movs.reduce((s, m) => s + (m.tipo === "entrada" ? cent(m.valor) : -cent(m.valor)), 0);
  const saldo = saldoCent / 100;
  if (saldoCent === 0) return { saldo: 0, divergentes: [] };
  const usados = new Set<string>();
  const entradas = movs.filter((m) => m.tipo === "entrada");
  const saidas = movs.filter((m) => m.tipo === "saida");
  const parear = (mesmaData: boolean) => {
    for (const e of entradas) {
      if (usados.has(e.id)) continue;
      const par = saidas.find((s) => !usados.has(s.id) && cent(s.valor) === cent(e.valor) && (!mesmaData || s.data === e.data));
      if (par) { usados.add(e.id); usados.add(par.id); }
    }
  };
  parear(true);
  parear(false);
  return { saldo, divergentes: movs.filter((m) => !usados.has(m.id)) };
}

// Agrupa as previsões por grupo (Créditos/Débitos) → conta do plano → categoria, dia a dia.
// Vencidos entram em `hoje`, igual ao fluxo de caixa. Categoria sem conta vai para "Sem conta associada".
export function fluxoPorPlano(itens: ItemPlano[], dias: string[], contas: ContaPlano[], mapa: Record<string, string>, hoje: string): LinhaPlano[] {
  const idx = new Map(dias.map((d, i) => [d, i]));
  const porId = new Map(contas.map((c) => [c.id, c]));
  const grupos = [{ id: "credito", rotulo: "À Receber", tipo: "receber" }, { id: "debito", rotulo: "À pagar)", tipo: "pagar" }];
  return grupos.map((g) => {
    const contasMap = new Map<string, Map<string, number[]>>();
    const ordemNome = new Map<string, string>();
    for (const i of itens) {
      if (ehTransferenciaFinanceira(i.categoria)) continue;
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
    // Todas as categorias associadas às contas deste grupo aparecem, mesmo sem valor no período.
    for (const [cat, cid] of Object.entries(mapa)) {
      if (ehTransferenciaFinanceira(cat)) continue;
      const c0 = porId.get(cid);
      if (!c0 || c0.tipo !== g.id) continue;
      const nome = c0.nome.trim();
      if (!ordemNome.has(nome) || c0.codigo.localeCompare(ordemNome.get(nome)!, "pt-BR", { numeric: true }) < 0) ordemNome.set(nome, c0.codigo);
      const cats = contasMap.get(nome) ?? new Map<string, number[]>();
      if (!cats.has(cat)) cats.set(cat, dias.map(() => 0));
      contasMap.set(nome, cats);
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

// Totais por conta do plano (sem dias): mesma árvore Receita/Despesa → conta → categoria.
export function totaisPorPlano(itens: ItemPlano[], contas: ContaPlano[], mapa: Record<string, string>): LinhaPlano[] {
  return fluxoPorPlano(itens, ["~"], contas, mapa, "~");
}

// Id da linha de categoria usado pela árvore do plano (para abrir a composição).
export function idLinhaPlano(tipo: string, categoria: string, contas: ContaPlano[], mapa: Record<string, string>) {
  const cat = categoria || "Sem categoria";
  const c = contas.find((x) => x.id === mapa[cat]);
  return `${tipo === "receber" ? "credito" : "debito"}|${c ? c.nome.trim() : "_sem"}|${cat}`;
}

// Forecast: realizado até o corte (inclusive) e previsões depois do corte.
export function itensForecast(realizados: { tipo: string; data: string; categoria: string; valor: number }[], previsoes: ItemPlano[], corte: string): ItemPlano[] {
  return [
    ...realizados.filter((r) => r.data <= corte && !ehTransferenciaFinanceira(r.categoria)).map((r) => ({ tipo: r.tipo, vencimento: r.data, categoria: r.categoria, valor: r.valor })),
    ...previsoes.filter((p) => p.vencimento > corte && !ehTransferenciaFinanceira(p.categoria)),
  ];
}

// Programação das Tratativas como estimativa de dias ainda não realizados:
// no dia programado, os títulos marcados (do dia, trazidos de outras datas e manuais) substituem as despesas previstas.
export interface Programacao { dia: string; desmarcados: string[]; incluidos: string[]; manuais: { id: string; valor: number; categoria?: string }[] }
export function aplicarProgramacao<T extends ItemPlano & { id: string }>(prevs: T[], programas: Programacao[], corte: string): ItemPlano[] {
  const ativos = programas.filter((p) => p.dia > corte);
  if (!ativos.length) return prevs;
  const porId = new Map(prevs.map((p) => [p.id, p]));
  const remover = new Set<string>();
  const extras: ItemPlano[] = [];
  for (const g of ativos) {
    const fora = new Set(g.desmarcados);
    const base = prevs.filter((p) => p.tipo === "pagar" && p.vencimento === g.dia);
    const incl = g.incluidos.map((id) => porId.get(id)).filter((p): p is T => !!p);
    for (const p of [...base, ...incl]) {
      remover.add(p.id);
      if (!fora.has(p.id)) extras.push({ tipo: "pagar", vencimento: g.dia, categoria: p.categoria, valor: p.valor });
    }
    for (const m of g.manuais) if (!fora.has(m.id)) extras.push({ tipo: "pagar", vencimento: g.dia, categoria: m.categoria || "Sem categoria", valor: Number(m.valor) });
  }
  return [...prevs.filter((p) => !remover.has(p.id)), ...extras];
}
