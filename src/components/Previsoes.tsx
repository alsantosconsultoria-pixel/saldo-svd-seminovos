import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { fmt, fmtData } from "@/lib/extrato/store";

interface Prev { id: string; tipo: string; vencimento: string; descricao: string; contraparte: string; banco: string; categoria: string; valor: number }

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const pega = (r: Record<string, unknown>, ...nomes: string[]) => {
  const k = Object.keys(r).find((k) => nomes.includes(norm(k)));
  return k ? r[k] : "";
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

export function Previsoes() {
  const [itens, setItens] = useState<Prev[]>([]);
  const input = useRef<HTMLInputElement>(null);

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
        const venc = data(pega(r, "vencimento", "data", "data prevista"));
        let v = valor(pega(r, "valor"));
        const t = norm(String(pega(r, "tipo")));
        if (!venc || !v) return [];
        const tipo = t.startsWith("rec") || t === "c" || t.includes("entrada") ? "receber"
          : t.startsWith("pag") || t === "d" || t.includes("saida") ? "pagar" : v < 0 ? "pagar" : "receber";
        v = Math.abs(v);
        return [{
          user_id: u.user!.id, tipo, vencimento: venc, valor: v, arquivo: f.name,
          descricao: String(pega(r, "descricao", "historico")), contraparte: String(pega(r, "contraparte", "fornecedor", "cliente", "favorecido")),
          banco: String(pega(r, "banco", "conta")), categoria: String(pega(r, "categoria")),
        }];
      });
      if (!novos.length) { toast.error("Nenhuma linha válida. Confira as colunas Vencimento e Valor."); return undefined; }
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
    if (!confirm("Apagar todas as previsões?")) return;
    await supabase.from("previsoes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    carregar();
  }

  const rec = itens.filter((i) => i.tipo === "receber");
  const pag = itens.filter((i) => i.tipo === "pagar");
  const soma = (l: Prev[]) => l.reduce((a, b) => a + b.valor, 0);

  const Lista = ({ titulo, l, cor }: { titulo: string; l: Prev[]; cor: string }) => (
    <Card className="p-5">
      <div className="mb-3 flex items-baseline justify-between"><h3 className="font-semibold">{titulo}</h3><span className={`num font-semibold ${cor}`}>{fmt(soma(l))}</span></div>
      {l.length === 0 ? <p className="text-sm text-muted-foreground">Nada importado ainda.</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>Vencimento</TableHead><TableHead>Descrição</TableHead><TableHead>Banco</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
          <TableBody>{l.map((i) => (
            <TableRow key={i.id}>
              <TableCell className="num">{fmtData(i.vencimento)}</TableCell>
              <TableCell><div className="text-sm">{i.descricao || "—"}</div><div className="text-xs text-muted-foreground">{i.contraparte}{i.categoria && ` · ${i.categoria}`}</div></TableCell>
              <TableCell className="text-sm">{i.banco || "—"}</TableCell>
              <TableCell className={`num text-right ${cor}`}>{fmt(i.valor)}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      )}
    </Card>
  );

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="text-sm text-muted-foreground">
          Planilha (Excel ou CSV) com as colunas: <b>Tipo</b> (Receber/Pagar), <b>Vencimento</b>, <b>Valor</b>, Descrição, Contraparte, Banco, Categoria.
        </div>
        <div className="flex gap-2">
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => importar(e.target.files?.[0])} />
          <Button onClick={() => input.current?.click()}><FileSpreadsheet /> Importar planilha</Button>
          {itens.length > 0 && <Button variant="outline" onClick={limpar}><Trash2 /> Limpar</Button>}
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Lista titulo="A receber" l={rec} cor="text-credit" />
        <Lista titulo="A pagar" l={pag} cor="text-debit" />
      </div>
      <Card className="flex items-center justify-between p-5">
        <span className="font-semibold">Resultado previsto (receber − pagar)</span>
        <span className="num text-xl font-semibold">{fmt(soma(rec) - soma(pag))}</span>
      </Card>
    </div>
  );
}
