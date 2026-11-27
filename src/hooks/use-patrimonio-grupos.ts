import { useEffect, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { GrupoPatrimonio } from '@/lib/patrimonio-grupos';
import type { ContaPlano } from '@/lib/plano';
export function usePatrimonioGrupos(versao = 0) {
  const [grupos,setGrupos] = useState<GrupoPatrimonio[]>([]);
  const [planos,setPlanos] = useState<ContaPlano[]>([]);
  const [categorias,setCategorias] = useState<Record<string,string>>({});
  const [erro,setErro] = useState(false);
  const [carregando,setCarregando] = useState(true);
  const carregar = useCallback(async () => {
    const [g,p,c] = await Promise.all([supabase.from('patrimonio_agrupamentos').select('grupos').eq('id','geral').maybeSingle(),supabase.from('plano_contas').select('*').order('nome'),supabase.from('plano_categorias').select('categoria,conta_id')]);
    setErro(Boolean(g.error || p.error || c.error));
    if (!g.error) setGrupos((g.data?.grupos ?? []) as unknown as GrupoPatrimonio[]);
    if (!p.error) setPlanos((p.data ?? []).map(p => ({ ...p, tipo: p.tipo === 'credito' ? 'credito' : 'debito' })));
    if (!c.error) setCategorias(Object.fromEntries((c.data ?? []).map(x=>[x.categoria,x.conta_id])));
    setCarregando(false);
  },[]);
  useEffect(()=> {
    void carregar();
    let timer: ReturnType<typeof setTimeout>;
    const atualizar = () => { clearTimeout(timer); timer = setTimeout(()=>void carregar(),150); };
    const canal = supabase.channel(`patrimonio-grupos-${Math.random()}`);
    for (const event of ['INSERT','UPDATE'] as const) canal.on('postgres_changes',{event,schema:'public',table:'patrimonio_agrupamentos',filter:'id=eq.geral'},atualizar);
    canal.subscribe(status=> { if(status === 'SUBSCRIBED') atualizar(); });
    const foco = () => void carregar();
    window.addEventListener('focus',foco);
    return ()=> { clearTimeout(timer); window.removeEventListener('focus',foco); void supabase.removeChannel(canal); };
  },[carregar,versao]);
  return {grupos,planos,categorias,erro,carregando,carregar};
}
