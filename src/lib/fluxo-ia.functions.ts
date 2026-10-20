import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const analisarFluxo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { resumo: string }) => ({ resumo: String(d.resumo).slice(0, 60000) }))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { erro: "IA não configurada.", texto: "" };
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions:
          "Você é um consultor financeiro (tesouraria) brasileiro. Analise o fluxo de caixa projetado e responda em português simples, em tópicos curtos: 1) dias críticos com saldo negativo e valor faltante; 2) sugestões concretas (antecipar recebíveis, adiar/renegociar pagamentos específicos citando fornecedor e valor, transferências entre bancos, captação); 3) prioridade dos pagamentos (impostos e folha primeiro). Use valores em R$.",
        input: data.resumo,
      }),
    });
    if (!res.ok || !res.body) {
      const msg = res.status === 402 ? "Créditos de IA esgotados." : res.status === 429 ? "Muitas solicitações, tente em instantes." : `Falha na IA (${res.status}).`;
      return { erro: msg, texto: "" };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", texto = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const linhas = buf.split("\n");
      buf = linhas.pop() ?? "";
      for (const l of linhas) {
        if (!l.startsWith("data:")) continue;
        try {
          const ev = JSON.parse(l.slice(5).trim());
          if (ev.type === "response.output_text.delta") texto += ev.delta;
        } catch { /* ignora */ }
      }
    }
    return { erro: texto ? "" : "A IA não retornou resposta.", texto };
  });
