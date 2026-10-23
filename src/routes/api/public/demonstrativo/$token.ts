import { createFileRoute } from "@tanstack/react-router";

const DECISOES = new Set(["aprovado", "aprovado_com_ressalvas", "nao_aprovado"]);
const TOKEN_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(dados: unknown, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// Public route (under /api/public): the token in the URL is the only credential.
// It grants read access to one report snapshot and one decision write, nothing else.
export const Route = createFileRoute("/api/public/demonstrativo/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!TOKEN_VALIDO.test(params.token)) return json({ erro: "nao_encontrado" }, 404);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("demonstrativos")
          .select("data, conteudo, decisao, ressalvas, aprovado_por, decidido_em, criador_email")
          .eq("token", params.token)
          .maybeSingle();
        if (error || !data) return json({ erro: "nao_encontrado" }, 404);
        return json({ demonstrativo: data });
      },
      POST: async ({ params, request }) => {
        if (!TOKEN_VALIDO.test(params.token)) return json({ erro: "nao_encontrado" }, 404);
        let corpo: { decisao?: unknown; ressalvas?: unknown; aprovado_por?: unknown };
        try {
          corpo = await request.json();
        } catch {
          return json({ erro: "corpo_invalido" }, 400);
        }
        const decisao = String(corpo.decisao ?? "");
        if (!DECISOES.has(decisao)) return json({ erro: "decisao_invalida" }, 400);
        const aprovadoPor = String(corpo.aprovado_por ?? "").trim().slice(0, 120);
        if (!aprovadoPor) return json({ erro: "nome_obrigatorio" }, 400);
        const ressalvas = String(corpo.ressalvas ?? "").trim().slice(0, 2000);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: atual, error: erroLeitura } = await supabaseAdmin
          .from("demonstrativos")
          .select("id, decisao, data")
          .eq("token", params.token)
          .maybeSingle();
        if (erroLeitura || !atual) return json({ erro: "nao_encontrado" }, 404);
        if (atual.decisao) return json({ erro: "ja_decidido" }, 409);

        const { data: salvo, error } = await supabaseAdmin
          .from("demonstrativos")
          .update({ decisao, ressalvas, aprovado_por: aprovadoPor, decidido_em: new Date().toISOString() })
          .eq("id", atual.id)
          .is("decisao", null)
          .select("criador_email");
        if (error) return json({ erro: "falha_ao_salvar" }, 500);
        if (!salvo?.length) return json({ erro: "ja_decidido" }, 409);
        return json({ ok: true, criador_email: salvo[0]?.criador_email ?? "" });
      },
    },
  },
});
