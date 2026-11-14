import { useEffect, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { listarUsuarios } from "@/lib/admin.functions";
import { ABAS, IMPORTACOES, TUDO, type Permissoes } from "@/lib/permissoes";

type Usuario = Awaited<ReturnType<typeof listarUsuarios>>[number];

export function AdminPermissoes() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [perms, setPerms] = useState<Record<string, Permissoes>>({});
  const carregar = async () => {
    try {
      const [u, p] = await Promise.all([listarUsuarios(), supabase.from("permissoes_usuario").select("user_id,abas,importacoes,backup")]);
      setUsuarios(u);
      setPerms(Object.fromEntries((p.data ?? []).map((r) => [r.user_id, { abas: r.abas, importacoes: r.importacoes, backup: r.backup }])));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao carregar permissões."); }
  };
  useEffect(() => { carregar(); }, []);

  async function salvar(userId: string, nova: Permissoes) {
    setPerms((p) => ({ ...p, [userId]: nova }));
    const { error } = await supabase.from("permissoes_usuario").upsert({ user_id: userId, ...nova, atualizado_em: new Date().toISOString() });
    if (error) { toast.error("Não foi possível salvar a permissão."); carregar(); }
  }
  const alternar = (lista: string[], id: string, v: boolean) => (v ? [...new Set([...lista, id])] : lista.filter((x) => x !== id));

  return <Card className="p-5">
    <h3 className="mb-1 flex items-center gap-2 font-semibold"><LayoutGrid className="size-4" /> Abas, importações e backup por usuário</h3>
    <p className="mb-3 text-xs text-muted-foreground">Marque o que cada pessoa pode ver e fazer. Administradores sempre têm acesso completo. As mudanças valem na hora.</p>
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead rowSpan={2}>Usuário</TableHead>
            <TableHead colSpan={ABAS.length} className="text-center">Abas</TableHead>
            <TableHead colSpan={IMPORTACOES.length} className="border-l text-center">Importações</TableHead>
            <TableHead rowSpan={2} className="border-l text-center">Backup</TableHead>
          </TableRow>
          <TableRow>
            {ABAS.map((a) => <TableHead key={a.id} className="text-center text-xs">{a.nome}</TableHead>)}
            {IMPORTACOES.map((i, n) => <TableHead key={i.id} className={`text-center text-xs ${n === 0 ? "border-l" : ""}`}>{i.nome}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>{usuarios.map((u) => {
          const p = perms[u.id] ?? TUDO;
          const bloqueado = u.admin;
          return <TableRow key={u.id}>
            <TableCell className="whitespace-nowrap">{u.email}{u.admin && <span className="ml-2 text-xs text-muted-foreground">(admin)</span>}</TableCell>
            {ABAS.map((a) => <TableCell key={a.id} className="text-center"><Checkbox aria-label={`${a.nome} para ${u.email}`} disabled={bloqueado} checked={bloqueado || p.abas.includes(a.id)} onCheckedChange={(v) => salvar(u.id, { ...p, abas: alternar(p.abas, a.id, v === true) })} /></TableCell>)}
            {IMPORTACOES.map((i, n) => <TableCell key={i.id} className={`text-center ${n === 0 ? "border-l" : ""}`}><Checkbox aria-label={`Importar ${i.nome} para ${u.email}`} disabled={bloqueado} checked={bloqueado || p.importacoes.includes(i.id)} onCheckedChange={(v) => salvar(u.id, { ...p, importacoes: alternar(p.importacoes, i.id, v === true) })} /></TableCell>)}
            <TableCell className="border-l text-center"><Checkbox aria-label={`Backup para ${u.email}`} disabled={bloqueado} checked={bloqueado || p.backup} onCheckedChange={(v) => salvar(u.id, { ...p, backup: v === true })} /></TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">Backup = botões Restaurar JSON, CSV e JSON.</p>
  </Card>;
}
