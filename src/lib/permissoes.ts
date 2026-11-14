import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const ABAS = [
  { id: "painel", nome: "Painel" }, { id: "diario", nome: "Saldo diário" }, { id: "lanc", nome: "Lançamentos" },
  { id: "contas", nome: "Contas" }, { id: "tratativas", nome: "Tratativas do dia" }, { id: "previsoes", nome: "Fluxo" },
] as const;
export const IMPORTACOES = [
  { id: "extrato", nome: "Extrato PDF" }, { id: "previsoes", nome: "Previsões" }, { id: "realizado", nome: "Realizado" },
] as const;

export type Permissoes = { abas: string[]; importacoes: string[]; backup: boolean };
export const TUDO: Permissoes = { abas: ABAS.map((a) => a.id), importacoes: IMPORTACOES.map((i) => i.id), backup: true };

/** Sem registro definido pelo administrador, o usuário tem acesso completo; administradores sempre têm tudo. */
export function permissoesEfetivas(linha: Permissoes | null | undefined, admin: boolean): Permissoes {
  if (admin || !linha) return TUDO;
  return { abas: linha.abas, importacoes: linha.importacoes, backup: linha.backup };
}

export function useMinhasPermissoes(admin: boolean, versao = 0) {
  const [linha, setLinha] = useState<Permissoes | null>(null);
  useEffect(() => {
    let ativo = true;
    const ler = async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("permissoes_usuario").select("abas,importacoes,backup").eq("user_id", u.user.id).maybeSingle();
      if (ativo) setLinha(data ?? null);
    };
    ler();
    const ch = supabase.channel(`perm-${Math.random().toString(36).slice(2)}`).on("postgres_changes", { event: "*", schema: "public", table: "permissoes_usuario" }, ler).subscribe();
    return () => { ativo = false; supabase.removeChannel(ch); };
  }, [versao]);
  return permissoesEfetivas(linha, admin);
}
