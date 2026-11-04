import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function MinhaSenha() {
  async function trocar() {
    const senha = prompt("Digite sua nova senha (mínimo 8 caracteres):");
    if (senha === null) return;
    if (senha.length < 8) { toast.error("A senha precisa ter pelo menos 8 caracteres."); return; }
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) toast.error("Não foi possível alterar a senha."); else toast.success("Senha alterada.");
  }
  return <Button variant="secondary" onClick={trocar}><KeyRound /> Alterar senha</Button>;
}
