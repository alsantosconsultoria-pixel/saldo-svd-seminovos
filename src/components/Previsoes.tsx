import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileSpreadsheet, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { fmt, fmtData, hoje } from "@/lib/extrato/store";
import type { Extrato } from "@/lib/extrato/parser";
import { saldoExtrato } from "@/components/Tratativas";
import { fluxoCaixa } from "@/lib/fluxo";
import { analisarFluxo } from "@/lib/fluxo-ia.functions";

interface Prev { id: string; tipo: string; vencimento: string; descricao: string; contraparte: string; documento: string; banco: string; categoria: string; valor: number }

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const pega = (r: Record<string, unknown>, ...nomes: string[]) => {
  const k = Object.keys(r).find((k) => nomes.includes(norm(k)));
  return k && r[k] != null ? r[k] : "";
};
function data(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const m = String(v).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null;
}
function valor(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v).replace(/[^\d,.-]/g, "");
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s) || 0;
}

export function Previsoes({ lista }: { lista: Extrato[] }) {
  const [itens, setItens] = useState<Prev[]>([]);
  const [ia, setIa] = useState("");
  const [pensando, setPensando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const dia = hoje();

  async function carregar() {
    const { data } = await supabase.from("previsoes").select("*").order("vencimento");
    setItens((data ?? []).map((r) => ({ ...r, valor: Number(r.valor) })));
  }
  useEffect(() => {
    carregar();
    const ch = supabase.channel("prev").on("postgres_changes", { event: "*", schema: "public", table: "previsoes" }, carregar).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function importar(f: File | undefined) {
    if (!f) return undefined;
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]!]!);
      const { data: u } = await supabase.auth.getUser();
      const novos = rows.flatMap((r) => {
        const venc = data(pega(r, "data vencimento", "vencimento", "data", "data prevista"));
        let v = valor(pega(r, "valor titulo", "valor do titulo", "valor"));
        const t = norm(String(pega(r, "operacao", "tipo")));
        if (!venc || !v) return [];
        const tipo = t.startsWith("rec") || t === "c" || t.includes("entrada") ? "receber"
          : t.startsWith("pag") || t === "d" || t.includes("saida") || t.includes("despesa") ? "pagar" : v < 0 ? "pagar" : "receber";
        v = Math.abs(v);
        return [{
          user_id: u.user!.id, tipo, vencimento: venc, valor: v, arquivo: f.name,
          descricao: String(pega(r, "descricao", "historico")).replace(/\s+/g, " ").trim(),
          contraparte: String(pega(r, "cliente/fornecedor", "cliente fornecedor", "contraparte", "fornecedor", "cliente", "favorecido")).trim(),
          documento: String(pega(r, "no documento", "nº documento", "n documento", "documento")).trim(),
          banco: String(pega(r, "conta", "banco")), categoria: String(pega(r, "categoria financeira", "categoria")),
        }];
      });
      if (!novos.length) { toast.error("Nenhuma linha válida. Confira as colunas Data vencimento e Valor título."); return undefined; }
      const { error } = await supabase.from("previsoes").insert(novos);
      if (error) throw error;
      toast.success(`${novos.length} previsões importadas.`);
      carregar();
    } catch {
      toast.error("Não foi possível ler a planilha.");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  async function limpar() {
    if (!confirm("Apagar todas as previsões que você importou?")) return;
    await supabase.from("previsoes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    carregar();
  }

  const saldoBancos = lista.reduce((a, e) => a + saldoExtrato(e), 0);
  const fluxo = useMemo(() => fluxoCaixa(saldoBancos, itens, dia), [saldoBancos, itens, dia]);
  const criticos = fluxo.filter((d) => d.faltante > 0);
  const rec = itens.filter((i) => i.tipo === "receber");
  const pag = itens.filter((i) => i.tipo === "pagar");
  const soma = (l: Prev[]) => l.reduce((a, b) => a + b.valor, 0);

  async function analisar() {
    setPensando(true); setIa("");
    const maiores = [...pag].sort((a, b) => b.valor - a.valor).slice(0, 40)
      .map((p) => `${fmtData(p.vencimento)} | ${p.contraparte} | ${p.categoria} | doc ${p.documento} | ${fmt(p.valor)}`).join("\n");
    const resumo = `Hoje: ${fmtData(dia)}\nSaldos atuais por banco:\n${lista.map((e) => `${e.banco} ${e.conta}: ${fmt(saldoExtrato(e))}`).join("\n")}\nTotal: ${fmt(saldoBancos)}\n\nFluxo diário (data | inicial | receber | pagar | final | faltante):\n${fluxo.map((d) => `${fmtData(d.data)} | ${fmt(d.inicial)} | ${fmt(d.receber)} | ${fmt(d.pagar)} | ${fmt(d.final)} | ${fmt(d.faltante)}`).join("\n")}\n\nMaiores pagamentos previstos:\n${maiores}`;
    try {
      const r = await analisarFluxo({ data: { resumo } });
      if (r.erro) toast.error(r.erro); else setIa(r.texto);
    } catch { toast.error("Não foi possível falar com a IA."); }
    setPensando(false);
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="text-sm text-muted-foreground">
          Planilha com as colunas: <b>Operação</b> (Pagar/Receber), <b>Data vencimento</b>, <b>Cliente/Fornecedor</b>, <b>Nº documento</b>, <b>Valor título</b>.
        </div>
        <div className="flex gap-2">
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => importar(e.target.files?.[0])} />
          <Button onClick={() => input.current?.click()}><FileSpreadsheet /> Importar planilha</Button>
          {itens.length > 0 && <Button variant="outline" onClick={limpar}><Trash2 /> Limpar</Button>}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Saldo atual dos bancos</div><div className="num text-lg font-semibold">{fmt(saldoBancos)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">A receber</div><div className="num text-lg font-semibold text-credit">{fmt(soma(rec))}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">A pagar</div><div className="num text-lg font-semibold text-debit">{fmt(soma(pag))}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Saldo final previsto</div><div className="num text-lg font-semibold">{fmt(fluxo.at(-1)?.final ?? saldoBancos)}</div></Card>
      </div>

      {criticos.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5 p-5">
          <div className="mb-2 flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="size-4" /> Dias sem saldo suficiente</div>
          <ul className="space-y-1 text-sm">
            {criticos.map((d) => <li key={d.data}><b>{fmtData(d.data)}</b>: faltam <span className="num font-semibold text-destructive">{fmt(d.faltante)}</span> para pagar {fmt(d.pagar)} em compromissos</li>)}
          </ul>
        </Card>
      )}

      {fluxo.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-3 font-semibold">Curva dos saldos</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={fluxo.map((d) => ({ ...d, dia: fmtData(d.data).slice(0, 5) }))}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="dia" fontSize={12} />
                <YAxis fontSize={12} width={90} tickFormatter={(v) => fmt(v).replace(",00", "")} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <ReferenceLine y={0} stroke="var(--destructive)" />
                <Area type="monotone" dataKey="final" name="Saldo final" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Fluxo de caixa diário</h3>
        {fluxo.length === 0 ? <p className="text-sm text-muted-foreground">Nada importado ainda.</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Dia</TableHead><TableHead className="text-right">Saldo inicial</TableHead><TableHead className="text-right">A receber</TableHead><TableHead className="text-right">A pagar</TableHead><TableHead className="text-right">Saldo final</TableHead><TableHead className="text-right">Faltante</TableHead></TableRow></TableHeader>
            <TableBody>{fluxo.map((d) => (
              <TableRow key={d.data} className={d.faltante > 0 ? "bg-destructive/5" : ""}>
                <TableCell className="num">{fmtData(d.data)}</TableCell>
                <TableCell className="num text-right">{fmt(d.inicial)}</TableCell>
                <TableCell className="num text-right text-credit">{fmt(d.receber)}</TableCell>
                <TableCell className="num text-right text-debit">{fmt(d.pagar)}</TableCell>
                <TableCell className={`num text-right font-semibold ${d.final < 0 ? "text-destructive" : ""}`}>{fmt(d.final)}</TableCell>
                <TableCell className="num text-right">{d.faltante > 0 ? <span className="inline-flex items-center gap-1 font-semibold text-destructive"><AlertTriangle className="size-3" />{fmt(d.faltante)}</span> : "—"}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Análise da IA para os próximos dias</h3>
          <Button onClick={analisar} disabled={pensando || fluxo.length === 0}><Sparkles /> {pensando ? "Analisando..." : "Analisar fluxo"}</Button>
        </div>
        {ia ? <div className="whitespace-pre-wrap text-sm leading-relaxed">{ia}</div> : <p className="text-sm text-muted-foreground">Clique em "Analisar fluxo" para receber sugestões sobre os dias críticos.</p>}
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Títulos previstos</h3>
        {itens.length === 0 ? <p className="text-sm text-muted-foreground">Nada importado ainda.</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Vencimento</TableHead><TableHead>Operação</TableHead><TableHead>Cliente/Fornecedor</TableHead><TableHead>Nº documento</TableHead><TableHead className="text-right">Valor título</TableHead></TableRow></TableHeader>
            <TableBody>{itens.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="num">{fmtData(i.vencimento)}</TableCell>
                <TableCell>{i.tipo === "receber" ? "Receber" : "Pagar"}</TableCell>
                <TableCell><div className="text-sm">{i.contraparte || "—"}</div><div className="text-xs text-muted-foreground">{i.categoria}</div></TableCell>
                <TableCell className="text-sm">{i.documento || "—"}</TableCell>
                <TableCell className={`num text-right ${i.tipo === "receber" ? "text-credit" : "text-debit"}`}>{fmt(i.valor)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
