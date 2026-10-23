import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Landmark, Loader2, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RelatorioTratativas, type DespesaRelatorio, type TransferenciaRelatorio } from "@/components/RelatorioTratativas";
import { fmtData } from "@/lib/extrato/store";
import type { balancoNaData } from "@/lib/tratativas";

interface Conteudo {
  dia: string;
  linhas: ReturnType<typeof balancoNaData>;
  despesas: DespesaRelatorio[];
  transferencias: TransferenciaRelatorio[];
  total: number;
  pagamentos: number;
}
interface Demonstrativo {
  data: string;
  conteudo: Conteudo;
  decisao: string | null;
  ressalvas: string;
  aprovado_por: string;
  decidido_em: string | null;
  criador_email: string;
}

const ROTULO: Record<string, string> = {
  aprovado: "Aprovado",
  aprovado_com_ressalvas: "Aprovado com ressalvas",
  nao_aprovado: "Não aprovado",
};

export const Route = createFileRoute("/demonstrativo/$token")({
  head: () => ({
    meta: [
      { title: "Demonstrativo de tesouraria · Financeiro SVD SEMINOVOS" },
      { name: "description", content: "Demonstrativo de tesouraria para apreciação e aprovação da diretoria do Grupo SVD." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Demonstrativo de tesouraria · Financeiro SVD SEMINOVOS" },
      { property: "og:description", content: "Demonstrativo de tesouraria para apreciação e aprovação da diretoria do Grupo SVD." },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaDemonstrativo,
});

function PaginaDemonstrativo() {
  const { token } = Route.useParams();
  const [dem, setDem] = useState<Demonstrativo | null>(null);
  const [falha, setFalha] = useState(false);
  const [decisao, setDecisao] = useState("aprovado");
  const [nome, setNome] = useState("");
  const [ressalvas, setRessalvas] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [emailRetorno, setEmailRetorno] = useState("");

  useEffect(() => {
    let ativo = true;
    fetch(`/api/public/demonstrativo/${token}`)
      .then(async (r) => {
        if (!ativo) return;
        if (!r.ok) { setFalha(true); return; }
        const corpo = (await r.json()) as { demonstrativo: Demonstrativo };
        setDem(corpo.demonstrativo);
      })
      .catch(() => ativo && setFalha(true));
    return () => { ativo = false; };
  }, [token]);

  async function salvar() {
    if (!nome.trim()) { setErro("Informe seu nome para registrar a decisão."); return; }
    setSalvando(true); setErro("");
    try {
      const r = await fetch(`/api/public/demonstrativo/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decisao, ressalvas, aprovado_por: nome }),
      });
      const corpo = (await r.json()) as { ok?: boolean; erro?: string; criador_email?: string };
      if (!r.ok) {
        setErro(corpo.erro === "ja_decidido" ? "Este demonstrativo já recebeu uma decisão." : "Não foi possível salvar. Tente novamente.");
        return;
      }
      setEmailRetorno(corpo.criador_email ?? "");
      setDem((d) => d && { ...d, decisao, ressalvas, aprovado_por: nome.trim(), decidido_em: new Date().toISOString() });
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  function avisarPorEmail() {
    if (!dem) return;
    const assunto = `Deliberação da diretoria · Demonstrativo de ${fmtData(dem.data)}`;
    const corpo = `Prezados,\n\nRegistrei minha deliberação sobre o demonstrativo de tesouraria de ${fmtData(dem.data)}.\n\nDecisão: ${ROTULO[dem.decisao ?? ""] ?? dem.decisao}\nNome: ${dem.aprovado_por}\n${dem.ressalvas ? `Ressalvas: ${dem.ressalvas}\n` : ""}\nLink do demonstrativo: ${window.location.href}\n\nFinanceiro SVD SEMINOVOS · Grupo SVD`;
    window.location.href = `mailto:${encodeURIComponent(emailRetorno)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-primary"><Landmark className="size-5" /> Financeiro SVD SEMINOVOS</div>
      {falha ? (
        <p role="alert" className="border border-destructive/40 p-6 text-sm text-debit">Demonstrativo não encontrado. Confira se o link está completo ou peça um novo link à tesouraria.</p>
      ) : !dem ? (
        <p role="status" className="flex items-center gap-2 py-16 justify-center text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando demonstrativo…</p>
      ) : (
        <>
          <RelatorioTratativas
            dia={dem.conteudo.dia}
            linhas={dem.conteudo.linhas}
            despesas={dem.conteudo.despesas}
            transferencias={dem.conteudo.transferencias}
            total={dem.conteudo.total}
            pagamentos={dem.conteudo.pagamentos}
          />
          <section className="mt-8 border-2 border-primary p-6">
            <h2 className="text-xl font-semibold">Deliberação da diretoria</h2>
            {dem.decisao ? (
              <div className="mt-4 space-y-3">
                <p className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="size-5 text-credit" /> Decisão registrada: <b>{ROTULO[dem.decisao] ?? dem.decisao}</b></p>
                <p className="text-sm text-muted-foreground">Por {dem.aprovado_por}{dem.decidido_em ? ` em ${new Date(decodeURIComponent(dem.decidido_em)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}.</p>
                {dem.ressalvas && <p className="border-l-4 border-primary bg-muted/40 px-4 py-3 text-sm">Ressalvas: {dem.ressalvas}</p>}
                {emailRetorno && <Button variant="outline" onClick={avisarPorEmail}><Mail /> Avisar a tesouraria por e-mail</Button>}
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Decisão">
                  {Object.entries(ROTULO).map(([valor, rotulo]) => (
                    <Button key={valor} type="button" variant={decisao === valor ? "default" : "outline"} onClick={() => setDecisao(valor)} aria-pressed={decisao === valor}>{rotulo}</Button>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nome-diretor">Seu nome</Label>
                  <Input id="nome-diretor" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome de quem aprova" maxLength={120} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ressalvas">Observações / ressalvas (opcional)</Label>
                  <Textarea id="ressalvas" value={ressalvas} onChange={(e) => setRessalvas(e.target.value)} placeholder="Anote aqui condições, ajustes ou motivos da decisão" rows={4} maxLength={2000} />
                </div>
                {erro && <p role="alert" className="text-sm text-debit">{erro}</p>}
                <Button onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="animate-spin" /> : <Send />} {salvando ? "Salvando…" : "Salvar decisão"}</Button>
                <p className="text-xs text-muted-foreground">Uma decisão por demonstrativo. Após salvar, a tesouraria é avisada e o resultado fica registrado neste link.</p>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
