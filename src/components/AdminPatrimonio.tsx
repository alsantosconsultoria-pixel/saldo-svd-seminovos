import { useState } from 'react';
import { Plus, Trash2, Landmark, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { usePatrimonioGrupos } from '@/hooks/use-patrimonio-grupos';
import { associarPlanoPatrimonio, type GrupoPatrimonio } from '@/lib/patrimonio-grupos';
export function AdminPatrimonio() {
  const {grupos,planos,erro,carregando,carregar} = usePatrimonioGrupos();
  const [nome,setNome] = useState('');
  const [busca,setBusca] = useState('');
  const [salvando,setSalvando] = useState(false);
  async function salvar(proximos:GrupoPatrimonio[]) {
    setSalvando(true);
    const {error} = await supabase.from('patrimonio_agrupamentos').upsert({id:'geral',grupos:JSON.parse(JSON.stringify(proximos))});
    if(error) toast.error('Não foi possível salvar os agrupamentos.');
    else { await carregar(); toast.success('Agrupamentos do Patrimônio salvos.'); }
    setSalvando(false);
  }
  return <section className="space-y-4 border-t pt-5">
    <h3 className="flex items-center gap-2 text-lg font-semibold"><Landmark className="size-5"/> Agrupamentos do Patrimônio</h3>
    {erro && <p className="text-sm text-debit">Não foi possível carregar os agrupamentos.</p>}
    <div className="flex flex-wrap gap-2"><Input aria-label="Nova categoria patrimonial" placeholder="Nome da categoria patrimonial" className="min-w-0 flex-1" value={nome} onChange={e=>setNome(e.target.value)}/><Button disabled={salvando || carregando || erro || !nome.trim()} onClick={()=>{ if(grupos.some(g=>g.nome.toLocaleLowerCase()===nome.trim().toLocaleLowerCase())) {toast.error('Esta categoria já existe.');return;} void salvar([...grupos,{id:crypto.randomUUID(),nome:nome.trim(),planos:[]}]); setNome(''); }}><Plus/> Criar categoria</Button></div>
    <div className="divide-y border-y">{grupos.map(g=><div key={g.id} className="flex flex-wrap items-center gap-2 py-2"><Input aria-label={`Nome de ${g.nome}`} className="w-56" defaultValue={g.nome} key={`${g.id}-${g.nome}`} onBlur={e=>{const n=e.target.value.trim();if(n && n!==g.nome) void salvar(grupos.map(x=>x.id===g.id?{...x,nome:n}:x));}}/><span className="text-xs text-muted-foreground">{g.planos.length} plano(s) financeiro(s)</span><Button aria-label={`Excluir ${g.nome}`} title="Excluir categoria" variant="ghost" size="icon" disabled={salvando} onClick={()=>{if(confirm(`Excluir ${g.nome}? Os planos financeiros serão preservados.`)) void salvar(grupos.filter(x=>x.id!==g.id));}}><Trash2/></Button></div>)}</div>
    <Input aria-label="Buscar plano financeiro para patrimônio" placeholder="Buscar plano financeiro" value={busca} onChange={e=>setBusca(e.target.value)}/>
    <div className="max-h-96 divide-y overflow-auto">{planos.filter(p=>p.nome.toLocaleLowerCase().includes(busca.toLocaleLowerCase())).map(p=><div key={p.id} className="grid items-center gap-2 py-2 sm:grid-cols-2"><span className="text-sm">{p.nome}</span><select aria-label={`Grupo patrimonial de ${p.nome}`} className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={salvando || erro} value={grupos.find(g=>g.planos.includes(p.id))?.id ?? ''} onChange={e=>void salvar(associarPlanoPatrimonio(grupos,p.id,e.target.value))}><option value="">Sem grupo patrimonial</option>{grupos.map(g=><option value={g.id} key={g.id}>{g.nome}</option>)}</select></div>)}</div>
    <p className="flex items-center gap-2 text-xs text-muted-foreground"><Save className="size-3"/>{salvando?'Salvando…':'Associações exclusivas do Patrimônio · Plano do Fluxo preservado'}</p>
  </section>;
}
