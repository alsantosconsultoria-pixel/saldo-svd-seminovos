import { ehTransferenciaFinanceira } from './plano';
import type { Realizado } from './realizado';
import type { TituloPatrimonio, GranularidadePatrimonio } from './patrimonio';
export interface GrupoPatrimonio { id: string; nome: string; planos: string[] }
export interface LinhaPatrimonio { id: string; nome: string; valores: number[]; variacao: number; percentual: number | null; total: number; filhos: LinhaPatrimonio[] }
export function associarPlanoPatrimonio(grupos: GrupoPatrimonio[], plano: string, destino: string): GrupoPatrimonio[] {
  return grupos.map(g => ({ ...g, planos: [...g.planos.filter(p => p !== plano), ...(g.id === destino ? [plano] : [])] }));
}
export function matrizPatrimonio(args: { grupos: GrupoPatrimonio[]; planos: {id: string; nome: string}[]; categorias: Record<string,string>; realizados: Realizado[]; previsoes: TituloPatrimonio[]; datas: string[]; de: string; granularidade: GranularidadePatrimonio }) {
  const { grupos, planos, categorias, realizados, previsoes, datas, de, granularidade } = args;
  const indice = new Map(datas.map((d,i) => [granularidade === 'mensal' ? d.slice(0,7) : d, i]));
  const baixas = new Set(realizados.map(r => r.data));
  const itens = [...realizados.map(r => ({ data:r.data, categoria:r.categoria, tipo:r.tipo, valor:r.valor })), ...previsoes.filter(p => !baixas.has(p.vencimento)).map(p => ({data:p.vencimento, categoria:p.categoria ?? '', tipo:p.tipo, valor:p.valor}))];
  const valores = new Map<string, number[]>();
  for (const p of planos) valores.set(p.id, datas.map(() => 0));
  for (const item of itens) {
    if (item.data < de || item.data > (datas.at(-1) ?? '') || ehTransferenciaFinanceira(item.categoria)) continue;
    const i = indice.get(granularidade === 'mensal' ? item.data.slice(0,7) : item.data);
    if (i === undefined) continue;
    const id = categorias[item.categoria] ?? '_semplano';
    const v = valores.get(id) ?? datas.map(() => 0);
    v[i] = (v[i] ?? 0) + Math.round(item.valor * 100) * (item.tipo === 'pagar' ? -1 : 1);
    valores.set(id,v);
  }
  const linha = (id:string, nome:string, v:number[], filhos: LinhaPatrimonio[] = []): LinhaPatrimonio => {
    const primeiro = v[0] ?? 0, ultimo = v.at(-1) ?? 0;
    return { id, nome, valores:v.map(n => n/100), variacao:(ultimo-primeiro)/100, percentual:primeiro === 0 ? null : (ultimo-primeiro)/Math.abs(primeiro)*100, total:v.reduce((s,n)=>s+n,0)/100, filhos };
  };
  const usados = new Set<string>();
  const montar = (id:string, nome:string, ids:string[]) => {
    const filhos = ids.filter(p => !usados.has(p)).map(p => { usados.add(p); return linha(p, planos.find(x=>x.id===p)?.nome ?? 'Sem plano financeiro', valores.get(p) ?? datas.map(()=>0)); });
    return linha(id,nome,datas.map((_,i)=>filhos.reduce((s,f)=>s+Math.round((f.valores[i]??0)*100),0)),filhos);
  };
  const linhas = grupos.map(g => montar(g.id,g.nome,g.planos));
  const restantes = [...valores.keys()].filter(p => !usados.has(p));
  if (restantes.length) linhas.push(montar('_semgrupo','Sem grupo patrimonial',restantes));
  const total = linha('_resultado','Resultado do período',datas.map((_,i)=>linhas.reduce((s,l)=>s+Math.round((l.valores[i]??0)*100),0)));
  return {linhas,total};
}
