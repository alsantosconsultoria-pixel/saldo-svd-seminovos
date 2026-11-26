import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Extrato } from "@/lib/extrato/parser";

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
export const GRUPOS_PERIODO = ["extratos", "previsoes", "realizados"] as const;
export type GrupoPeriodo = (typeof GRUPOS_PERIODO)[number];

const RE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const noPeriodo = (data: string, de: string, ate: string) => data >= de && data <= ate;

// aceita apenas grupos conhecidos; nada conhecido = nada a apagar
export function validarGrupos(d: { grupos?: unknown }): { grupos: Grupo[] } {
  const bruto = Array.isArray(d?.grupos) ? d.grupos : [];
  const grupos = bruto.filter((g): g is Grupo => (GRUPOS as readonly string[]).includes(g as Grupo));
  if (!grupos.length) throw new Error("Escolha o que deseja apagar.");
  return { grupos };
}

export function validarFaixa(d: { de?: unknown; ate?: unknown }): { de: string; ate: string } {
  const de = String(d?.de ?? "").trim();
  const ate = String(d?.ate ?? "").trim();
  if (!RE_ISO.test(de) || !RE_ISO.test(ate)) throw new Error("Informe a data inicial e a data final.");
  if (de > ate) throw new Error("A data inicial não pode ser maior que a data final.");
  return { de, ate };
}

export function validarPeriodo(d: { grupos?: unknown; de?: unknown; ate?: unknown }): { grupos: GrupoPeriodo[]; de: string; ate: string } {
  const { de, ate } = validarFaixa(d);
  const bruto = Array.isArray(d?.grupos) ? d.grupos : [];
  const grupos = bruto.filter((g): g is GrupoPeriodo => (GRUPOS_PERIODO as readonly string[]).includes(g as GrupoPeriodo));
  if (!grupos.length) throw new Error("Escolha o que deseja apagar.");
  return { grupos, de, ate };
}

// remove apenas transações, saldos e futuros dentro do período [de, ate]
export function recortarExtratoPeriodo(e: Extrato, de: string, ate: string): { extrato: Extrato | null; removidos: number } {
  const transacoes = e.transacoes.filter((t) => !noPeriodo(t.data, de, ate));
  const saldosInformados = e.saldosInformados.filter((s) => !noPeriodo(s.data, de, ate));
  const futurosOrig = e.futuros ?? [];
  const futuros = futurosOrig.filter((f) => !noPeriodo(f.data, de, ate));
  const removidos =
    (e.transacoes.length - transacoes.length) +
    (e.saldosInformados.length - saldosInformados.length) +
    (futurosOrig.length - futuros.length);
  if (removidos === 0) return { extrato: e, removidos: 0 };
  if (!transacoes.length && !saldosInformados.length && !futuros.length) return { extrato: null, removidos };
  const atualizado: Extrato = {
    ...e,
    transacoes,
    saldosInformados,
    saldoFinalInformado: saldosInformados.at(-1)?.saldo ?? null,
    ...(e.futuros ? { futuros } : {}),
  };
  return { extrato: atualizado, removidos };
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

export const contarDadosPeriodo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validarFaixa)
  .handler(async ({ context, data: { de, ate } }) => {
    await exigirAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [real, prev, ext] = await Promise.all([
      supabaseAdmin.from("realizados").select("id", { count: "exact", head: true }).gte("data", de).lte("data", ate),
      supabaseAdmin.from("previsoes").select("id", { count: "exact", head: true }).gte("vencimento", de).lte("vencimento", ate),
      supabaseAdmin.from("extratos").select("id, dados"),
    ]);
    const extCount = (ext.data ?? []).reduce(
      (acc, r) => acc + recortarExtratoPeriodo(r.dados as unknown as Extrato, de, ate).removidos,
      0,
    );
    return { extratos: extCount, previsoes: prev.count ?? 0, realizados: real.count ?? 0 } satisfies Record<GrupoPeriodo, number>;
  });

export const limparDadosPeriodo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validarPeriodo)
  .handler(async ({ context, data: { grupos, de, ate } }) => {
    await exigirAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const apagados: Record<string, number> = {};
    for (const g of grupos) {
      if (g === "realizados") {
        const { count } = await supabaseAdmin.from("realizados").select("id", { count: "exact", head: true }).gte("data", de).lte("data", ate);
        const { error } = await supabaseAdmin.from("realizados").delete().gte("data", de).lte("data", ate);
        if (error) throw new Error("Não foi possível apagar os realizados do período.");
        apagados[g] = count ?? 0;
      } else if (g === "previsoes") {
        const { count } = await supabaseAdmin.from("previsoes").select("id", { count: "exact", head: true }).gte("vencimento", de).lte("vencimento", ate);
        const { error } = await supabaseAdmin.from("previsoes").delete().gte("vencimento", de).lte("vencimento", ate);
        if (error) throw new Error("Não foi possível apagar as previsões do período.");
        apagados[g] = count ?? 0;
      } else if (g === "extratos") {
        const { data: rows, error: errSel } = await supabaseAdmin.from("extratos").select("id, dados");
        if (errSel) throw new Error("Não foi possível ler os extratos.");
        let total = 0;
        for (const r of rows ?? []) {
          const { extrato, removidos } = recortarExtratoPeriodo(r.dados as unknown as Extrato, de, ate);
          if (!removidos) continue;
          const { error } = extrato
            ? await supabaseAdmin.from("extratos").update({ dados: JSON.parse(JSON.stringify(extrato)), atualizado_em: new Date().toISOString() }).eq("id", r.id)
            : await supabaseAdmin.from("extratos").delete().eq("id", r.id);
          if (error) throw new Error("Não foi possível atualizar os extratos do período.");
          total += removidos;
        }
        apagados[g] = total;
      }
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
