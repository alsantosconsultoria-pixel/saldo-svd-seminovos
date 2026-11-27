import { ehTransferenciaFinanceira } from './plano';
import type { Realizado } from './realizado';
import type { TituloPatrimonio, GranularidadePatrimonio } from './patrimonio';
export interface GrupoPatrimonio { id: string; nome: string; planos: string[] }
export interface ItemPatrimonio {
  id: string;
  data: string;
  origem: 'realizado' | 'previsao';
  tipo: 'pagar' | 'receber';
  categoria: string;
  contraparte: string;
  descricao: string;
  documento: string;
  conta: string;
  valor: number;
}
export interface LinhaPatrimonio {
  id: string;
  nome: string;
  nivel: 'grupo' | 'plano' | 'categoria' | 'total';
  valores: number[];
  variacao: number;
  percentual: number | null;
  total: number;
  filhos: LinhaPatrimonio[];
  itens?: ItemPatrimonio[];
}
export function associarPlanoPatrimonio(grupos: GrupoPatrimonio[], plano: string, destino: string): GrupoPatrimonio[] {
  return grupos.map(g => ({ ...g, planos: [...g.planos.filter(p => p !== plano), ...(g.id === destino ? [plano] : [])] }));
}
export function matrizPatrimonio(args: { grupos: GrupoPatrimonio[]; planos: {id: string; nome: string}[]; categorias: Record<string,string>; realizados: Realizado[]; previsoes: TituloPatrimonio[]; datas: string[]; de: string; granularidade: GranularidadePatrimonio }) {
  const { grupos, planos, categorias, realizados, previsoes, datas, de, granularidade } = args;
  const indice = new Map(datas.map((d,i) => [granularidade === 'mensal' ? d.slice(0,7) : d, i]));
  const baixas = new Set(realizados.map(r => r.data));
  const itens: ItemPatrimonio[] = [
    ...realizados.map(r => ({ id: r.id, data: r.data, origem: 'realizado' as const, tipo: r.tipo, categoria: r.categoria, contraparte: r.contraparte, descricao: r.descricao, documento: r.documento, conta: r.conta, valor: r.valor })),
    ...previsoes.filter(p => !baixas.has(p.vencimento)).map(p => ({ id: p.id, data: p.vencimento, origem: 'previsao' as const, tipo: p.tipo, categoria: p.categoria ?? '', contraparte: p.contraparte ?? '', descricao: '', documento: p.documento ?? '', conta: '', valor: p.valor })),
  ];
  const porPlanoCat = new Map<string, Map<string, { valores: number[]; itens: ItemPatrimonio[] }>>();
  const garantirCat = (planoId: string, cat: string) => {
    let mapa = porPlanoCat.get(planoId);
    if (!mapa) { mapa = new Map(); porPlanoCat.set(planoId, mapa); }
    let reg = mapa.get(cat);
    if (!reg) { reg = { valores: datas.map(() => 0), itens: [] }; mapa.set(cat, reg); }
    return reg;
  };
  for (const p of planos) if (!porPlanoCat.has(p.id)) porPlanoCat.set(p.id, new Map());
  for (const [cat, planoId] of Object.entries(categorias)) garantirCat(planoId, cat);
  const ultimoDia = datas.at(-1) ?? '';
  for (const item of itens) {
    if (item.data < de || item.data > ultimoDia || ehTransferenciaFinanceira(item.categoria)) continue;
    const i = indice.get(granularidade === 'mensal' ? item.data.slice(0,7) : item.data);
    if (i === undefined) continue;
    const id = categorias[item.categoria] ?? '_semplano';
    const cat = item.categoria.trim() || 'Sem categoria';
    const reg = garantirCat(id, cat);
    reg.valores[i] = (reg.valores[i] ?? 0) + Math.round(item.valor * 100) * (item.tipo === 'pagar' ? -1 : 1);
    reg.itens.push(item);
  }
  const somar = (lista: LinhaPatrimonio[]) => datas.map((_, i) => lista.reduce((s, f) => s + Math.round((f.valores[i] ?? 0) * 100), 0));
  const linha = (id:string, nome:string, nivel: LinhaPatrimonio['nivel'], v:number[], filhos: LinhaPatrimonio[] = [], listaItens?: ItemPatrimonio[]): LinhaPatrimonio => {
    const primeiro = v[0] ?? 0, ultimo = v.at(-1) ?? 0;
    return { id, nome, nivel, valores:v.map(n => n/100), variacao:(ultimo-primeiro)/100, percentual:primeiro === 0 ? null : (ultimo-primeiro)/Math.abs(primeiro)*100, total:v.reduce((s,n)=>s+n,0)/100, filhos, ...(listaItens ? { itens: listaItens } : {}) };
  };
  const usados = new Set<string>();
  const montar = (id:string, nome:string, ids:string[]) => {
    const porNome = new Map<string, { chave: string; nome: string; cats: Map<string, { valores: number[]; itens: ItemPatrimonio[] }> }>();
    for (const p of ids) {
      if (usados.has(p)) continue;
      usados.add(p);
      const nomePlano = (planos.find(x => x.id === p)?.nome ?? 'Sem plano financeiro').trim();
      const chave = nomePlano.toLocaleLowerCase('pt-BR');
      let bloco = porNome.get(chave);
      if (!bloco) { bloco = { chave: `${id}::${chave}`, nome: nomePlano, cats: new Map() }; porNome.set(chave, bloco); }
      for (const [cat, reg] of porPlanoCat.get(p) ?? []) {
        let atual = bloco.cats.get(cat);
        if (!atual) { atual = { valores: datas.map(() => 0), itens: [] }; bloco.cats.set(cat, atual); }
        for (let i = 0; i < datas.length; i++) atual.valores[i] = (atual.valores[i] ?? 0) + (reg.valores[i] ?? 0);
        atual.itens.push(...reg.itens);
      }
    }
    const filhos = [...porNome.values()].map(b => {
      const cats = [...b.cats.entries()].sort((a, c) => a[0].localeCompare(c[0], 'pt-BR')).map(([cat, reg]) =>
        linha(`${b.chave}::${cat}`, cat, 'categoria', reg.valores, [], [...reg.itens].sort((a, c) => a.data.localeCompare(c.data)))
      );
      return linha(b.chave, b.nome, 'plano', somar(cats), cats);
    });
    return linha(id, nome, 'grupo', somar(filhos), filhos);
  };
  const linhas = grupos.map(g => montar(g.id,g.nome,g.planos));
  const restantes = [...porPlanoCat.keys()].filter(p => !usados.has(p));
  if (restantes.length) linhas.push(montar('_semgrupo','Sem grupo patrimonial',restantes));
  const total = linha('_resultado','Resultado do período','total',somar(linhas));
  return {linhas,total};
}
