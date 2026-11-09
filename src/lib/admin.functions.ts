import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" | "user" }) => PromiseLike<{ data: boolean | null }> }; userId: string };

async function exigirAdmin(context: Ctx) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Acesso restrito a administradores.");
}

export const souAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    return { admin: !!data };
  });

export const listarUsuarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw new Error("Não foi possível listar os usuários.");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const admins = new Set((roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id));
    return data.users.map((u) => ({
      id: u.id, email: u.email ?? "", criado: u.created_at, ultimoAcesso: u.last_sign_in_at ?? null,
      admin: admins.has(u.id), voce: u.id === context.userId,
    }));
  });

export const definirAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; admin: boolean }) => ({ userId: String(d.userId), admin: !!d.admin }))
  .handler(async ({ context, data }) => {
    await exigirAdmin(context as unknown as Ctx);
    if (data.userId === context.userId && !data.admin) throw new Error("Você não pode remover seu próprio acesso de administrador.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = data.admin
      ? await supabaseAdmin.from("user_roles").upsert({ user_id: data.userId, role: "admin" }, { onConflict: "user_id,role", ignoreDuplicates: true })
      : await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).eq("role", "admin");
    if (r.error) throw new Error("Não foi possível alterar a permissão.");
    return { ok: true };
  });

export const criarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; senha: string; admin: boolean }) => {
    const email = String(d.email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("E-mail inválido.");
    if (String(d.senha).length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
    return { email, senha: String(d.senha), admin: !!d.admin };
  })
  .handler(async ({ context, data }) => {
    await exigirAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u, error } = await supabaseAdmin.auth.admin.createUser({ email: data.email, password: data.senha, email_confirm: true });
    if (error || !u.user) throw new Error(error?.message.includes("already") ? "Este e-mail já tem cadastro." : "Não foi possível criar o usuário.");
    await supabaseAdmin.from("user_roles").insert([{ user_id: u.user.id, role: "user" as const }, ...(data.admin ? [{ user_id: u.user.id, role: "admin" as const }] : [])]);
    return { ok: true };
  });

export const removerUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => ({ userId: String(d.userId) }))
  .handler(async ({ context, data }) => {
    await exigirAdmin(context as unknown as Ctx);
    if (data.userId === context.userId) throw new Error("Você não pode remover a própria conta.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error("Não foi possível remover o usuário.");
    return { ok: true };
  });

// ===== Limpeza de dados (somente administradores) =====
export const GRUPOS = ["extratos", "previsoes", "realizados", "transferencias", "demonstrativos"] as const;
export type Grupo = (typeof GRUPOS)[number];

// aceita apenas grupos conhecidos; nada conhecido = nada a apagar
export function validarGrupos(d: { grupos?: unknown }): { grupos: Grupo[] } {
  const bruto = Array.isArray(d?.grupos) ? d.grupos : [];
  const grupos = bruto.filter((g): g is Grupo => (GRUPOS as readonly string[]).includes(g as Grupo));
  if (!grupos.length) throw new Error("Escolha o que deseja apagar.");
  return { grupos };
}

export const contarDados = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const totais: Record<string, number> = {};
    for (const g of GRUPOS) {
      const { count } = await supabaseAdmin.from(g).select("id", { count: "exact", head: true });
      totais[g] = count ?? 0;
    }
    return totais;
  });

export const limparDados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validarGrupos)
  .handler(async ({ context, data }) => {
    await exigirAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const apagados: Record<string, number> = {};
    for (const g of data.grupos) {
      const { count } = await supabaseAdmin.from(g).select("id", { count: "exact", head: true });
      const { error } = await supabaseAdmin.from(g).delete().not("id", "is", null);
      if (error) throw new Error(`Não foi possível apagar os dados de ${g}.`);
      apagados[g] = count ?? 0;
    }
    return { apagados };
  });

export const definirSenha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; senha: string }) => {
    if (String(d.senha).length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
    return { userId: String(d.userId), senha: String(d.senha) };
  })
  .handler(async ({ context, data }) => {
    await exigirAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.senha });
    if (error) throw new Error("Não foi possível alterar a senha.");
    return { ok: true };
  });
