import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { criarUsuario, definirAdmin, definirSenha, listarUsuarios, removerUsuario } from "@/lib/admin.functions";

type Usuario = Awaited<ReturnType<typeof listarUsuarios>>[number];
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Nunca");
const msg = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir.");

export function AdminUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [novoAdmin, setNovoAdmin] = useState(false);
  const carregar = () => listarUsuarios().then(setUsuarios).catch((e) => toast.error(msg(e)));
  useEffect(() => { carregar(); }, []);

  async function criar() {
    try { await criarUsuario({ data: { email, senha, admin: novoAdmin } }); toast.success("Usuário criado. Informe a senha a ele."); setEmail(""); setSenha(""); setNovoAdmin(false); carregar(); }
    catch (e) { toast.error(msg(e)); }
  }
  async function alternar(u: Usuario, admin: boolean) {
    try { await definirAdmin({ data: { userId: u.id, admin } }); carregar(); } catch (e) { toast.error(msg(e)); }
  }
  async function novaSenha(u: Usuario) {
    const senha = prompt(`Nova senha para ${u.email} (mínimo 8 caracteres):`);
    if (!senha) return;
    try { await definirSenha({ data: { userId: u.id, senha } }); toast.success("Senha alterada. Informe a nova senha ao usuário."); } catch (e) { toast.error(msg(e)); }
  }
  async function remover(u: Usuario) {
    if (!confirm(`Remover o acesso de ${u.email}?`)) return;
    try { await removerUsuario({ data: { userId: u.id } }); toast.success("Usuário removido."); carregar(); } catch (e) { toast.error(msg(e)); }
  }

  return <div className="space-y-4">
    <Card className="p-5">
      <h3 className="mb-3 flex items-center gap-2 font-semibold"><UserPlus className="size-4" /> Novo usuário</h3>
      <div className="flex flex-wrap items-center gap-3">
        <Input className="w-64" type="email" placeholder="email@empresa.com.br" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input className="w-48" type="text" placeholder="Senha (mín. 8)" value={senha} onChange={(e) => setSenha(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><Switch checked={novoAdmin} onCheckedChange={setNovoAdmin} /> Administrador</label>
        <Button onClick={criar} disabled={!email || !senha}>Criar</Button>
      </div>
    </Card>
    <Card className="p-5">
      <h3 className="mb-3 flex items-center gap-2 font-semibold"><ShieldCheck className="size-4" /> Usuários e permissões</h3>
      <Table>
        <TableHeader><TableRow><TableHead>E-mail</TableHead><TableHead>Cadastro</TableHead><TableHead>Último acesso</TableHead><TableHead>Administrador</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{usuarios.map((u) => <TableRow key={u.id}>
          <TableCell>{u.email}{u.voce && <span className="ml-2 text-xs text-muted-foreground">(você)</span>}</TableCell>
          <TableCell className="text-sm">{dt(u.criado)}</TableCell>
          <TableCell className="text-sm">{dt(u.ultimoAcesso)}</TableCell>
          <TableCell><Switch checked={u.admin} disabled={u.voce} onCheckedChange={(v) => alternar(u, v)} /></TableCell>
          <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => novaSenha(u)}><KeyRound /> Nova senha</Button>{!u.voce && <Button variant="ghost" size="sm" onClick={() => remover(u)}><Trash2 /> Remover</Button>}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
      <p className="mt-3 text-xs text-muted-foreground">Administradores gerenciam usuários e permissões. Os demais usam o painel normalmente.</p>
    </Card>
  </div>;
}
