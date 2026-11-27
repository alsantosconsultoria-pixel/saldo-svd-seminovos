import { Fragment, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ArrowLeft, ArrowRight, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePatrimonioGrupos } from '@/hooks/use-patrimonio-grupos';
import { matrizPatrimonio, type LinhaPatrimonio } from '@/lib/patrimonio-grupos';
import { datasDiarias, datasMensais, type GranularidadePatrimonio, type TituloPatrimonio } from '@/lib/patrimonio';
import type { Extrato } from '@/lib/extrato/parser';
import type { Realizado } from '@/lib/realizado';
import { fmt, fmtData } from '@/lib/extrato/store';
import { PatrimonioDetalhado } from './Patrimonio';
export function PatrimonioResumo(props:{lista:Extrato[];realizados:Realizado[];previsoes:TituloPatrimonio[];versao?:number}) {
  const hoje = new Date().toISOString().slice(0,10);
  const [de,setDe] = useState(`${hoje.slice(0,7)}-01`);
  const [ate,setAte] = useState(hoje);
  const [modo,setModo] = useState<GranularidadePatrimonio>('diaria');
  const [abertos,setAbertos] = useState<Set<string>>(new Set());
  const [categoriaAberta,setCategoriaAberta] = useState<{ plano: string; linha: LinhaPatrimonio } | null>(null);
  const [previstos,setPrevistos] = useState(true);
  const [detalhes,setDetalhes] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const {grupos,planos,categorias,erro,carregando} = usePatrimonioGrupos(props.versao);
  const datas = useMemo(()=> {
    if (!de || !ate || ate < de) return [];
    if(modo==='diaria') return datasDiarias(de,ate);
    const inicio = Number(de.slice(0,4)), final = Number(ate.slice(0,4));
    return Array.from({length:Math.min(final-inicio+1,31)},(_,i)=>datasMensais(inicio+i,inicio+i===inicio?Number(de.slice(5,7)):1,inicio+i===final?Number(ate.slice(5,7)):12)).flat();
  },[de,ate,modo]);
  const matriz = useMemo(()=>matrizPatrimonio({grupos,planos,categorias,realizados:props.realizados.filter(r=>r.data<=ate),previsoes:previstos?props.previsoes.filter(p=>p.vencimento<=ate):[],datas,de,granularidade:modo}),[grupos,planos,categorias,props.realizados,props.previsoes,datas,de,ate,modo,previstos]);
  const valor = (v:number)=>v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const variacao = (v:number)=>(v>0?'+':'')+valor(v);
  const alternar = (id: string) => setAbertos(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  function linha(l:LinhaPatrimonio, planoPai?: string) {
    const total = l.nivel === 'total';
    const plano = l.nivel === 'plano';
    const cat = l.nivel === 'categoria';
    const rowCls = total ? 'bg-primary/10 font-bold' : l.nivel === 'grupo' ? 'bg-muted/50 font-semibold' : plano ? 'bg-muted/20 font-medium' : 'text-muted-foreground';
    const cellBg = total || l.nivel === 'grupo' ? 'bg-muted' : 'bg-background';
    const recuo = plano ? 'pl-6' : cat ? 'pl-12' : '';
    const qtd = l.itens?.length ?? 0;
    return <TableRow key={l.id} className={rowCls}>
      <TableCell className={`sticky left-0 z-10 min-w-52 max-w-64 whitespace-normal ${cellBg} ${recuo}`}>
        {l.filhos.length ? (
          <Button variant="ghost" className="h-auto w-full justify-start whitespace-normal px-0 py-1 text-left" aria-expanded={abertos.has(l.id)} onClick={() => alternar(l.id)}>
            {abertos.has(l.id) ? <ChevronDown /> : <ChevronRight />}{l.nome}
          </Button>
        ) : cat ? (
          <Button variant="ghost" className="h-auto w-full justify-start whitespace-normal px-0 py-1 text-left font-normal text-foreground hover:underline" onClick={() => setCategoriaAberta({ plano: planoPai ?? '', linha: l })}>
            <span>{l.nome}{qtd > 0 ? <span className="ml-1.5 text-xs text-muted-foreground">({qtd})</span> : null}</span>
          </Button>
        ) : l.nome}
      </TableCell>
      {l.valores.map((v,i)=><TableCell key={datas[i]} className={`num min-w-36 whitespace-nowrap text-right ${v<0?'text-debit':v>0?'text-credit':''}`}>{valor(v)}</TableCell>)}
      <TableCell className="num min-w-40 border-l bg-accent/20 text-right"><span className={l.variacao<0?'text-debit':l.variacao>0?'text-credit':''}>{variacao(l.variacao)}</span><span className="mt-1 block text-[11px] font-normal text-muted-foreground">{l.percentual===null?'Sem base percentual':`${variacao(l.percentual)}%`}</span></TableCell>
    </TableRow>;
  }
  return <div className="min-w-0 space-y-5">
    <header><div className="flex items-center gap-2 text-muted-foreground"><Landmark className="size-4"/><span className="text-xs">Financeiro SVD SEMINOVOS · Posição gerencial</span></div><h2 className="mt-1 text-2xl font-semibold">Patrimônio</h2></header>
    <section className="flex flex-wrap items-end gap-3 border-y py-4">
      <div className="flex gap-1 rounded-md bg-muted p-1"><Button size="sm" variant={modo==='diaria'?'default':'ghost'} onClick={()=>setModo('diaria')}>Por data</Button><Button size="sm" variant={modo==='mensal'?'default':'ghost'} onClick={()=>setModo('mensal')}>Por mês</Button></div>
      <label className="text-xs text-muted-foreground">De<Input aria-label="Patrimônio de" className="mt-1 w-40" type={modo==='mensal'?'month':'date'} value={modo==='mensal'?de.slice(0,7):de} onChange={e=>{if(e.target.value)setDe(modo==='mensal'?`${e.target.value}-01`:e.target.value);}}/></label>
      <label className="text-xs text-muted-foreground">Até<Input aria-label="Patrimônio até" className="mt-1 w-40" type={modo==='mensal'?'month':'date'} value={modo==='mensal'?ate.slice(0,7):ate} onChange={e=>{if(e.target.value){const v=e.target.value;setAte(modo==='mensal'?new Date(Date.UTC(Number(v.slice(0,4)),Number(v.slice(5,7)),0,12)).toISOString().slice(0,10):v);}}}/></label>
      <Button size="sm" variant="outline" onClick={()=>{setDe(modo==='mensal'?`${hoje.slice(0,7)}-01`:hoje);setAte(hoje);}}>Hoje</Button>
      <label className="flex h-9 items-center gap-2 text-sm"><Checkbox checked={previstos} onCheckedChange={v=>setPrevistos(v===true)}/>Incluir previsões</label>
    </section>
    <div className="grid gap-4 border-b pb-5 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Resultado gerencial do período</p><p className={`num mt-1 text-xl font-semibold ${matriz.total.total<0?'text-debit':'text-credit'}`}>{fmt(matriz.total.total)}</p></div><div><p className="text-xs text-muted-foreground">Categorias patrimoniais</p><p className="num mt-1 text-xl font-semibold">{grupos.length}</p></div><div><p className="text-xs text-muted-foreground">Variação · último {modo==='mensal'?'mês':'dia'} − primeiro</p><p className="num mt-1 text-xl font-semibold">{fmt(matriz.total.variacao)}</p></div></div>
    {erro?<p className="text-debit">Não foi possível carregar as associações do Patrimônio.</p>:carregando?<p className="text-muted-foreground">Carregando agrupamentos…</p>:!datas.length?<p className="text-debit">Selecione um período válido.</p>:<section className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-2"><div><h3 className="font-semibold">Composição por {modo==='mensal'?'competência':'data'}</h3><p className="text-xs text-muted-foreground">Valores em R$ · Despesas negativas · Variação = última coluna − primeira</p></div><div className="flex gap-1"><Button size="icon" variant="outline" aria-label="Datas anteriores" onClick={()=>scroll.current?.scrollBy({left:-420,behavior:'smooth'})}><ArrowLeft/></Button><Button size="icon" variant="outline" aria-label="Próximas datas" onClick={()=>scroll.current?.scrollBy({left:420,behavior:'smooth'})}><ArrowRight/></Button></div></div>
      {!grupos.length && <p className="mb-3 text-sm text-muted-foreground">Nenhuma categoria patrimonial cadastrada na Administração.</p>}
      <div ref={scroll} className="max-w-full overflow-auto rounded-md border"><Table><TableHeader><TableRow><TableHead className="sticky left-0 z-20 min-w-52 bg-background">Categoria</TableHead>{datas.map(d=><TableHead key={d} className="min-w-36 text-right">{modo==='mensal'?`${d.slice(5,7)}/${d.slice(0,4)}`:`${d.slice(8,10)}/${d.slice(5,7)}`}<span className="block text-[10px] text-muted-foreground">{modo==='diaria'?d.slice(0,4):'Competência'}</span></TableHead>)}<TableHead className="border-l text-right">Variação R$ / %</TableHead></TableRow></TableHeader><TableBody>{matriz.linhas.map(g=><Fragment key={g.id}>{linha(g)}{abertos.has(g.id)&&g.filhos.map(p=><Fragment key={p.id}>{linha(p)}{abertos.has(p.id)&&p.filhos.map(c=>linha(c,p.nome))}</Fragment>)}</Fragment>)}{linha(matriz.total)}</TableBody></Table></div>
      <p className="mt-3 text-xs text-muted-foreground">{previstos?'Realizado e previsões · Datas já realizadas não repetem previsões':'Somente realizado'} · Transferências entre contas não compõem o resultado.</p>
    </section>}
    <Dialog open={categoriaAberta !== null} onOpenChange={(o) => { if (!o) setCategoriaAberta(null); }}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-auto">
        <DialogHeader>
          <DialogTitle>{categoriaAberta?.linha.nome}</DialogTitle>
          <DialogDescription>{categoriaAberta?.plano} · {categoriaAberta?.linha.itens?.length ?? 0} lançamento(s) no período · Total {fmt(categoriaAberta?.linha.total ?? 0)}</DialogDescription>
        </DialogHeader>
        {!categoriaAberta?.linha.itens?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum lançamento para esta categoria no período selecionado.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border"><Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Origem</TableHead><TableHead>Contraparte</TableHead><TableHead>Descrição</TableHead><TableHead>Documento</TableHead><TableHead>Conta</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
            <TableBody>{categoriaAberta.linha.itens.map((it) => {
              const assinado = it.tipo === 'pagar' ? -it.valor : it.valor;
              return <TableRow key={`${it.origem}-${it.id}`}>
                <TableCell className="whitespace-nowrap">{fmtData(it.data)}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{it.origem === 'realizado' ? 'Realizado' : 'Previsto'}</TableCell>
                <TableCell>{it.contraparte || '—'}</TableCell>
                <TableCell>{it.descricao || '—'}</TableCell>
                <TableCell className="whitespace-nowrap">{it.documento || '—'}</TableCell>
                <TableCell className="whitespace-nowrap">{it.conta || '—'}</TableCell>
                <TableCell className={`num whitespace-nowrap text-right ${assinado < 0 ? 'text-debit' : 'text-credit'}`}>{fmt(assinado)}</TableCell>
              </TableRow>;
            })}</TableBody>
          </Table></div>
        )}
      </DialogContent>
    </Dialog>
    <section className="border-t pt-4"><Button variant="ghost" className="px-0" aria-expanded={detalhes} onClick={()=>setDetalhes(!detalhes)}>{detalhes?<ChevronDown/>:<ChevronRight/>}Posição patrimonial e premissas contábeis</Button>{detalhes&&<div className="mt-4"><PatrimonioDetalhado {...props}/></div>}</section>
  </div>;
}
