import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRightLeft, CalendarDays, ChevronLeft, ChevronRight, FileText, Link2, Printer, Stamp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { type Extrato } from "@/lib/extrato/parser";
import { fmt, fmtData, hoje } from "@/lib/extrato/store";
import { balancoNaData, despesasAteData, somarValores, ultimoSaldoExtrato } from "@/lib/tratativas";
import { RelatorioTratativas, type DespesaRelatorio } from "@/components/RelatorioTratativas";
import { CompartilharRelatorio } from "@/components/CompartilharRelatorio";

interface Transf { id: string; data: string; origem: string; destino: string; valor: number; user_id: string }
export function saldoExtrato(e: Extrato) {
  return ultimoSaldoExtrato(e).saldo;
}
const parseValor = (s: string) => Number(s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
const ROTULO: Record<string, string> = { aprovado: "aprovado", aprovado_com_ressalvas: "aprovado com ressalvas", nao_aprovado: "não aprovado" };
const nome = (e: Extrato) => `${e.banco} · Ag ${e.agencia || "—"} · CC ${e.conta || "—"}`;

export function Tratativas({ lista }: { lista: Extrato[] }) {
  const [dia, setDia] = useState(hoje);
  const [incluirVencidas, setIncluirVencidas] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const [transf, setTransf] = useState<Transf[]>([]);
  const [itens, setItens] = useState<DespesaRelatorio[]>([]);
  const [usuario, setUsuario] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [relatorio, setRelatorio] = useState(false);
  const relatorioRef = useRef<HTMLDivElement>(null);
  const [digitado, setDigitado] = useState<Record<string, string>>({});
  const [pedido, setPedido] = useState<{ destino: Extrato; valor: number } | null>(null);
  const [origem, setOrigem] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [link, setLink] = useState("");
  const [gerando, setGerando] = useState(false);
  const [aprovacoes, setAprovacoes] = useState<{ id: string; user_id: string; token: string; decisao: string; aprovado_por: string; ressalvas: string }[]>([]);

  // decisões da diretoria somente para a data selecionada
  useEffect(() => {
    let ativo = true;
    setAprovacoes([]);
    async function ler() {
      const { data } = await supabase.from("demonstrativos").select("id, user_id, token, decisao, aprovado_por, ressalvas")
        .eq("data", dia).not("decisao", "is", null).order("decidido_em", { ascending: false });
      if (ativo && data) setAprovacoes(data as typeof aprovacoes);
    }
    void ler();
    const ch = supabase.channel(`aprov-${dia}`).on("postgres_changes", { event: "*", schema: "public", table: "demonstrativos" }, ler).subscribe();
    return () => { ativo = false; void supabase.removeChannel(ch); };
  }, [dia, recarga]);

  const carregar = useCallback(async () => {
    const [t, p] = await Promise.all([
      supabase.from("transferencias").select("*").eq("data", dia).order("criado_em"),
      (incluirVencidas
        ? supabase.from("previsoes").select("*").eq("tipo", "pagar").lte("vencimento", dia)
        : supabase.from("previsoes").select("*").eq("tipo", "pagar").eq("vencimento", dia)
      ).order("vencimento").order("contraparte"),
    ]);
    return { t, p };
  }, [dia, incluirVencidas]);

  useEffect(() => {
    let ativo = true;
    setCarregando(true); setErro(false); setTransf([]); setItens([]);
    async function atualizar() {
      try {
      const { t, p } = await carregar();
      if (!ativo) return;
      if (t.error || p.error) { setErro(true); setCarregando(false); return; }
      setTransf((t.data ?? []).map((r) => ({ ...r, valor: Number(r.valor) })));
      setItens((p.data ?? []).map((r) => ({ ...r, valor: Number(r.valor) })));
      setErro(false); setCarregando(false);
      } catch {
        if (ativo) { setErro(true); setCarregando(false); }
      }
    }
    void atualizar();
    void supabase.auth.getUser().then(({ data }) => { if (ativo) setUsuario(data.user?.id ?? ""); });
    const ch = supabase.channel(`tratativas-${dia}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transferencias" }, atualizar)
      .on("postgres_changes", { event: "*", schema: "public", table: "previsoes" }, atualizar).subscribe();
    return () => { ativo = false; void supabase.removeChannel(ch); };
  }, [carregar, dia, recarga]);

  const linhas = useMemo(() => balancoNaData(lista, transf, dia), [lista, transf, dia]);
  const despesas = useMemo(() => despesasAteData(itens, dia, incluirVencidas), [itens, dia, incluirVencidas]);
  const vencidas = despesas.filter((d) => d.vencimento < dia).length;
  const total = somarValores(linhas.map((l) => l.final ?? 0));
  const pagamentos = somarValores(despesas.map((d) => d.valor));
  const ajustes = somarValores(transf.map((t) => t.valor));
  const incompleto = linhas.some((l) => l.base === null);
  const origemSel = linhas.find((l) => l.e.id === origem);
  const porId = (id: string) => { const e = lista.find((c) => c.id === id); return e ? nome(e) : "Conta não disponível"; };

  function mudarData(valor: string, comVencidas = true) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return;
    setDia(valor); setIncluirVencidas(comVencidas); setRecarga((r) => r + 1);
    setDigitado({}); setPedido(null); setLink(""); setCarregando(true);
  }
  function avancar(delta: number) {
    const data = new Date(`${dia}T12:00:00Z`);
    data.setUTCDate(data.getUTCDate() + delta);
    mudarData(data.toISOString().slice(0, 10));
  }
  function pedir(e: Extrato) {
    const v = Math.round(parseValor(digitado[e.id] ?? "") * 100) / 100;
    if (!Number.isFinite(v) || v <= 0) { toast.error("Informe um valor maior que zero."); return; }
    setOrigem(""); setPedido({ destino: e, valor: v });
  }
  async function confirmar() {
    if (!pedido || !origem || salvando) return;
    setSalvando(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { toast.error("Entre novamente para registrar o ajuste."); setSalvando(false); return; }
    const { error } = await supabase.from("transferencias").insert({
      user_id: u.user.id, data: dia, origem, destino: pedido.destino.id, valor: pedido.valor,
    });
    setSalvando(false);
    if (error) { toast.error("Não foi possível salvar a transferência."); return; }
    setDigitado((d) => ({ ...d, [pedido.destino.id]: "" })); setPedido(null);
    toast.success(`Transferência registrada em ${fmtData(dia)}.`);
    const { t } = await carregar();
    if (!t.error) setTransf((t.data ?? []).map((r) => ({ ...r, valor: Number(r.valor) })));
  }
  async function desfazer(id: string) {
    const { data, error } = await supabase.from("transferencias").delete().eq("id", id).select("id");
    if (error || !data?.length) { toast.error("Somente quem registrou pode desfazer este ajuste."); return; }
    setTransf((t) => t.filter((r) => r.id !== id)); toast.success("Ajuste desfeito.");
  }
  async function excluirAprovacao(id: string) {
    if (!confirm("Excluir esta aprovação? O link volta a aceitar uma nova decisão da diretoria.")) return;
    const { data, error } = await supabase.from("demonstrativos")
      .update({ decisao: null, ressalvas: "", aprovado_por: "", decidido_em: null }).eq("id", id).select("id");
    if (error || !data?.length) { toast.error("Somente quem gerou o link pode excluir a aprovação."); return; }
    setAprovacoes((l) => l.filter((a) => a.id !== id)); toast.success("Aprovação excluída.");
  }
  async function gerarLink() {
    if (gerando) return;
    setGerando(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { toast.error("Entre novamente para gerar o link."); setGerando(false); return; }
    const { data, error } = await supabase.from("demonstrativos").insert({
      user_id: u.user.id,
      criador_email: u.user.email ?? "",
      data: dia,
      conteudo: JSON.parse(JSON.stringify({ dia, linhas, despesas, transferencias: transf, total, pagamentos })),
    }).select("token").single();
    setGerando(false);
    if (error || !data) { toast.error("Não foi possível gerar o link."); return; }
    const url = `${window.location.origin}/demonstrativo/${data.token}`;
    setLink(url);
    try { await navigator.clipboard.writeText(url); } catch { /* cópia manual abaixo */ }
    toast.success("Link gerado e copiado. Envie para a diretoria.");
  }

  return (
    <div className={`treasury-workspace space-y-6 ${relatorio ? "treasury-presentation" : ""}`}>
      <div className="treasury-controls flex flex-wrap items-end justify-between gap-4 border-b pb-5 print:hidden">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">TESOURARIA · GRUPO SVD</p>
          <h2 className="text-2xl font-semibold">Tratativas e pagamentos</h2>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label htmlFor="data-tratativa" className="mr-1 flex items-center gap-2 text-sm font-medium"><CalendarDays className="size-4 text-muted-foreground" /> Data</label>
            <Button variant="outline" size="icon" aria-label="Dia anterior" onClick={() => avancar(-1)} disabled={salvando}><ChevronLeft /></Button>
            <Input id="data-tratativa" type="date" className="w-40 bg-card" value={dia} onChange={(e) => mudarData(e.target.value)} disabled={salvando} />
            <Button variant="outline" size="icon" aria-label="Próximo dia" onClick={() => avancar(1)} disabled={salvando}><ChevronRight /></Button>
            <Button variant="ghost" size="sm" onClick={() => mudarData(hoje(), false)} disabled={salvando}>Hoje</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={relatorio ? "secondary" : "outline"} onClick={() => setRelatorio((r) => !r)} disabled={carregando || erro}><FileText />{relatorio ? "Voltar às tratativas" : "Relatório para diretoria"}</Button>
          <Button onClick={() => window.print()} disabled={carregando || erro}><Printer /> Imprimir / PDF</Button>
          {relatorio && <Button variant="outline" onClick={gerarLink} disabled={carregando || erro || gerando}><Link2 /> {gerando ? "Gerando…" : "Link para diretoria"}</Button>}
          {relatorio && <CompartilharRelatorio titulo={`Demonstrativo de tesouraria · ${fmtData(dia)}`} resumo={`Saldo após ajustes: ${fmt(total)}. Pagamentos propostos: ${fmt(pagamentos)}. Saldo projetado: ${fmt(total - pagamentos)}.${link ? ` Aprovação on-line: ${link}` : ""}`} arquivo={`tesouraria-${dia}`} obterRelatorio={() => relatorioRef.current?.querySelector("article") ?? null} disabled={carregando || erro} />}
        </div>
      </div>
      {aprovacoes.map((a) => <div key={a.token} role="status" className="flex flex-wrap items-center gap-2 border border-primary/40 bg-primary/5 px-4 py-3 text-sm print:hidden"><Stamp className="size-4 shrink-0 text-primary" /><span>O dia <b>{fmtData(dia)}</b> foi {ROTULO[a.decisao] ?? a.decisao} por <b>{a.aprovado_por}</b>{a.decisao === "aprovado_com_ressalvas" && a.ressalvas ? ` — ressalvas: ${a.ressalvas}` : ""}.</span><a className="font-medium text-primary underline" href={`/demonstrativo/${a.token}`} target="_blank" rel="noreferrer">Clique aqui para visualizar</a>{a.user_id === usuario && <Button size="sm" variant="ghost" className="ml-auto text-debit" onClick={() => excluirAprovacao(a.id)}><Trash2 /> Excluir aprovação</Button>}</div>)}
      {relatorio && link && <p className="treasury-controls flex flex-wrap items-center gap-2 border border-primary/40 bg-primary/5 px-4 py-3 text-sm print:hidden"><Link2 className="size-4 shrink-0 text-primary" /><span className="font-medium">Link de aprovação:</span><a className="break-all underline" href={link} target="_blank" rel="noreferrer">{link}</a></p>}
      {carregando ? <p role="status" className="py-10 text-center text-muted-foreground">Carregando dados de {fmtData(dia)}…</p> : erro ? <p role="alert" className="border border-destructive/40 p-5 text-debit">Não foi possível carregar os dados desta data. Selecione a data novamente para tentar.</p> : <>
        <div className={`treasury-editor space-y-6 ${relatorio ? "hidden" : ""}`}>
          <div className="grid gap-5 border-b pb-6 sm:grid-cols-2 lg:grid-cols-4">
            <Resumo titulo={`Saldo após ajustes${incompleto ? " (parcial)" : ""}`} valor={total} detalhe={`${lista.length} contas bancárias`} />
            <Resumo titulo="Despesas do dia" valor={pagamentos} detalhe={`${despesas.length} títulos a pagar${vencidas ? ` · ${vencidas} vencido${vencidas > 1 ? "s" : ""}` : ""}`} />
            <Resumo titulo="Transferências internas" valor={ajustes} detalhe={`${transf.length} ajustes registrados`} />
            <Resumo titulo="Após pagamentos previstos" valor={total - pagamentos} detalhe="Projeção, sem baixa nos bancos" />
          </div>
          {(incompleto || total < pagamentos) && <div role="status" className="flex items-start gap-3 border-l-4 border-destructive bg-destructive/5 p-4 text-sm"><AlertTriangle className="size-5 shrink-0 text-debit" /><div><p className="font-semibold">{incompleto ? "Há contas sem saldo conhecido para esta data." : `Faltam ${fmt(pagamentos - total)} para os pagamentos do dia.`}</p><p className="mt-1 text-muted-foreground">{incompleto ? "O total é parcial; confira as bases antes de apresentar para aprovação." : "Transferências entre contas não aumentam o saldo consolidado."}</p></div></div>}
          <section>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-lg font-semibold">Posição e ajustes das contas</h3><span className="text-xs text-muted-foreground">Referência: {fmtData(dia)}</span></div>
            <Table><TableHeader><TableRow><TableHead>Banco / conta</TableHead><TableHead className="text-right">Saldo do extrato</TableHead><TableHead className="text-right">Recebido</TableHead><TableHead className="text-right">Enviado</TableHead><TableHead className="text-right">Após ajustes</TableHead><TableHead>Valor a transferir</TableHead></TableRow></TableHeader><TableBody>
              {linhas.map(({ e, base, referencia, ent, sai, final }) => <TableRow key={e.id}>
                <TableCell><p className="font-semibold">{e.banco}</p><p className="text-xs text-muted-foreground">Ag {e.agencia || "—"} · CC {e.conta || "—"}</p><p className="mt-1 text-xs text-muted-foreground">{referencia ? `Base: ${fmtData(referencia)}` : "Sem base para a data"}</p></TableCell>
                <TableCell className={`num text-right ${base !== null && base < 0 ? "text-debit" : ""}`}>{base === null ? "Indisponível" : fmt(base)}</TableCell>
                <TableCell className="num text-right text-credit">{ent ? fmt(ent) : "—"}</TableCell><TableCell className="num text-right text-debit">{sai ? fmt(sai) : "—"}</TableCell>
                <TableCell className={`num text-right font-semibold ${final !== null && final < 0 ? "text-debit" : "text-credit"}`}>{final === null ? "Indisponível" : fmt(final)}</TableCell>
                <TableCell><div className="flex items-center gap-2"><Input className="h-9 w-28" aria-label={`Valor a transferir para ${nome(e)}`} inputMode="decimal" placeholder={final !== null && final < 0 ? fmt(-final) : "0,00"} value={digitado[e.id] ?? ""} onChange={(ev) => setDigitado((d) => ({ ...d, [e.id]: ev.target.value }))} onKeyDown={(ev) => ev.key === "Enter" && pedir(e)} /><Button size="sm" variant="outline" onClick={() => pedir(e)}><ArrowRightLeft /> Ajustar</Button></div></TableCell>
              </TableRow>)}
              {lista.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhuma conta importada.</TableCell></TableRow>}
            </TableBody></Table>
          </section>
          <section>
            <h3 className="mb-4 text-lg font-semibold">Transferências de {fmtData(dia)}</h3>
            {transf.length === 0 ? <p className="border-y py-5 text-sm text-muted-foreground">Nenhuma transferência registrada nesta data.</p> : <Table><TableHeader><TableRow><TableHead>Origem</TableHead><TableHead>Destino</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{transf.map((t) => <TableRow key={t.id}><TableCell>{porId(t.origem)}</TableCell><TableCell>{porId(t.destino)}</TableCell><TableCell className="num text-right font-semibold">{fmt(t.valor)}</TableCell><TableCell>{t.user_id === usuario && <Button variant="ghost" size="icon" aria-label="Desfazer" onClick={() => desfazer(t.id)}><Trash2 /></Button>}</TableCell></TableRow>)}</TableBody></Table>}
          </section>
          <section>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-lg font-semibold">Despesas a pagar</h3><span className="text-sm text-muted-foreground">Vencimento {incluirVencidas ? "até " : "em "}{fmtData(dia)}{vencidas ? ` · ${vencidas} vencido${vencidas > 1 ? "s" : ""}` : ""}</span></div>
            {despesas.length === 0 ? <p className="border-y py-5 text-sm text-muted-foreground">Nenhuma despesa com vencimento {incluirVencidas ? "até esta" : "nesta"} data.</p> : <Table><TableHeader><TableRow><TableHead>Fornecedor / despesa</TableHead><TableHead>Vencimento</TableHead><TableHead>Nº documento</TableHead><TableHead>Banco indicado</TableHead><TableHead className="text-right">Valor do título</TableHead></TableRow></TableHeader><TableBody>{despesas.map((d) => <TableRow key={d.id}><TableCell><p className="font-medium">{d.contraparte || "Não informado"}</p><p className="text-xs text-muted-foreground">{d.descricao || d.categoria || "—"}</p>{d.vencimento < dia && <p className="mt-1 inline-flex items-center gap-1 border border-destructive/40 bg-destructive/5 px-2 py-0.5 text-xs font-medium text-debit">Não pago no vencimento</p>}</TableCell><TableCell className="num">{fmtData(d.vencimento)}</TableCell><TableCell>{d.documento || "—"}</TableCell><TableCell>{d.banco || "Não definido"}</TableCell><TableCell className="num text-right">{fmt(d.valor)}</TableCell></TableRow>)}</TableBody></Table>}
            <p className="mt-3 text-xs text-muted-foreground">Previsões da planilha, sem baixa nos saldos. {incluirVencidas ? 'Títulos vencidos permanecem na lista até serem pagos, marcados como "não pago no vencimento".' : "Somente títulos com vencimento hoje."}</p>
          </section>
        </div>
        <div ref={relatorioRef} className={`treasury-report-container ${relatorio ? "" : "hidden"}`}><RelatorioTratativas dia={dia} linhas={linhas} despesas={despesas} transferencias={transf} total={total} pagamentos={pagamentos} incluirVencidas={incluirVencidas} /></div>
      </>}
      <Dialog open={!!pedido} onOpenChange={(o) => !o && !salvando && setPedido(null)}><DialogContent><DialogHeader><DialogTitle>De onde sairá o valor?</DialogTitle><DialogDescription>{pedido && <>Transferir <b>{fmt(pedido.valor)}</b> para <b>{nome(pedido.destino)}</b> em {fmtData(dia)}.</>}</DialogDescription></DialogHeader>
        <Select value={origem} onValueChange={setOrigem}><SelectTrigger><SelectValue placeholder="Escolha o banco de origem" /></SelectTrigger><SelectContent>{linhas.filter((l) => l.e.id !== pedido?.destino.id).map((l) => <SelectItem key={l.e.id} value={l.e.id}>{nome(l.e)} — {l.final === null ? "Saldo indisponível" : fmt(l.final)}</SelectItem>)}</SelectContent></Select>
        {origemSel && pedido && (origemSel.final === null ? <p className="text-sm text-debit">Saldo da origem indisponível para a data; confira antes de confirmar.</p> : origemSel.final - pedido.valor < 0 && <p className="text-sm text-debit">Atenção: a origem ficará com {fmt(origemSel.final - pedido.valor)}.</p>)}
        <DialogFooter><Button variant="outline" onClick={() => setPedido(null)} disabled={salvando}>Cancelar</Button><Button disabled={!origem || salvando} onClick={confirmar}>{salvando ? "Registrando…" : "Confirmar"}</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
}
function Resumo({ titulo, valor, detalhe }: { titulo: string; valor: number; detalhe: string }) {
  return <div><p className="text-xs font-medium text-muted-foreground">{titulo}</p><p className={`num mt-2 break-words text-xl font-semibold ${valor < 0 ? "text-debit" : ""}`}>{fmt(valor)}</p><p className="mt-1 text-xs text-muted-foreground">{detalhe}</p></div>;
}
