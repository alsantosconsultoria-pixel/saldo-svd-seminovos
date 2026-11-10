import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, ListTree, Plus, Trash2, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { useRef } from "react";
import { lerPlanilhaPlano } from "@/lib/plano-planilha";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { ContaPlano } from "@/lib/plano";

export function AdminPlano() {
  const [contas, setContas] = useState<ContaPlano[]>([]);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const [cats, setCats] = useState<{ categoria: string; tipo: string }[]>([]);
  const [nova, setNova] = useState({ codigo: "", nome: "", tipo: "debito" as "credito" | "debito" });

  async function carregar() {
    const [c, m, p, r] = await Promise.all([
      supabase.from("plano_contas").select("*").order("codigo"),
      supabase.from("plano_categorias").select("*"),
      supabase.from("previsoes").select("categoria,tipo"),
      supabase.from("realizados").select("categoria,tipo"),
    ]);
    setContas((c.data ?? []) as ContaPlano[]);
    setMapa(Object.fromEntries((m.data ?? []).map((x) => [x.categoria, x.conta_id])));
    const u = new Map<string, string>();
    for (const x of [...(p.data ?? []), ...(r.data ?? [])]) if (x.categoria && !u.has(x.categoria)) u.set(x.categoria, x.tipo);
    setCats([...u.entries()].map(([categoria, tipo]) => ({ categoria, tipo })).sort((a, b) => a.categoria.localeCompare(b.categoria)));
  }
  useEffect(() => { carregar(); }, []);

  async function criar() {
    if (!nova.codigo.trim() || !nova.nome.trim()) { toast.error("Informe o número e o nome da conta."); return; }
    const { error } = await supabase.from("plano_contas").insert({ codigo: nova.codigo.trim(), nome: nova.nome.trim(), tipo: nova.tipo });
    if (error) { toast.error(error.code === "23505" ? "Já existe uma conta com esse número." : error.message); return; }
    setNova({ ...nova, codigo: "", nome: "" }); carregar();
  }
  async function remover(c: ContaPlano) {
    if (!confirm(`Remover a conta ${c.codigo} · ${c.nome}? As categorias ficam sem conta.`)) return;
    await supabase.from("plano_contas").delete().eq("id", c.id); carregar();
  }
  async function associar(categoria: string, conta: string) {
    const { error } = conta
      ? await supabase.from("plano_categorias").upsert({ categoria, conta_id: conta })
      : await supabase.from("plano_categorias").delete().eq("categoria", categoria);
    if (error) { toast.error(error.message); return; }
    setMapa((m) => { const n = { ...m }; if (conta) n[categoria] = conta; else delete n[categoria]; return n; });
  }

  const arq = useRef<HTMLInputElement>(null);
  const natureza = (t: string) => (t === "receber" ? "Receita" : "Despesa");
  function salvar(linhas: Record<string, string>[], aba: string, nome: string, extra?: Record<string, string>[]) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(linhas);
    ws["!cols"] = [{ wch: 50 }, { wch: 12 }, { wch: 14 }, { wch: 36 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, aba);
    if (extra) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(extra), "Contas");
    XLSX.writeFile(wb, nome);
  }
  const porId = new Map(contas.map((c) => [c.id, c]));
  const linhaCat = (c: { categoria: string; tipo: string }, vazia: boolean) => {
    const k = vazia ? undefined : porId.get(mapa[c.categoria] ?? "");
    return { Categoria: c.categoria, Natureza: natureza(c.tipo), "Nº da conta": k?.codigo ?? "", "Nome da conta": k?.nome ?? "", "Tipo da conta": k ? (k.tipo === "credito" ? "Crédito" : "Débito") : "" };
  };
  function baixarPlano() {
    salvar(cats.map((c) => linhaCat(c, false)), "Plano", "plano-financeiro.xlsx",
      contas.map((c) => ({ "Nº da conta": c.codigo, "Nome da conta": c.nome, "Tipo da conta": c.tipo === "credito" ? "Crédito" : "Débito", Categorias: String(Object.values(mapa).filter((v) => v === c.id).length) })));
  }
  function baixarModelo() { salvar(cats.map((c) => linhaCat(c, false)), "Plano", "modelo-plano-financeiro.xlsx"); }
  async function enviar(f: File) {
    try {
      const wb = XLSX.read(await f.arrayBuffer());
      const folha = wb.Sheets[wb.SheetNames[0] ?? ""];
      const linhas = folha ? lerPlanilhaPlano(XLSX.utils.sheet_to_json<Record<string, unknown>>(folha, { raw: false })) : [];
      if (!linhas.length) { toast.error("Nenhuma linha com Nº da conta preenchido."); return; }
      const ids = new Map(contas.map((c) => [c.codigo, c.id]));
      const novas = [...new Map(linhas.filter((l) => !ids.has(l.codigo)).map((l) => [l.codigo, { codigo: l.codigo, nome: l.nome, tipo: l.tipo }])).values()];
      if (novas.length) {
        const { data, error } = await supabase.from("plano_contas").insert(novas).select("id,codigo");
        if (error) throw error;
        for (const c of data ?? []) ids.set(c.codigo, c.id);
      }
      const assoc = [...new Map(linhas.map((l) => [l.categoria, { categoria: l.categoria, conta_id: ids.get(l.codigo)! }])).values()];
      const { error } = await supabase.from("plano_categorias").upsert(assoc);
      if (error) throw error;
      toast.success(`${novas.length} conta(s) criada(s) e ${assoc.length} categoria(s) associada(s).`);
      carregar();
    } catch (e) { toast.error("Não foi possível ler a planilha: " + (e as Error).message); }
    finally { if (arq.current) arq.current.value = ""; }
  }

  const sel = "h-9 rounded-md border bg-background px-2 text-sm";
  return (
    <Card className="space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold"><ListTree className="size-4" /> Plano financeiro</div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={baixarPlano} disabled={!contas.length}><Download /> Baixar plano</Button>
          <Button size="sm" variant="outline" onClick={baixarModelo} disabled={!cats.length}><FileSpreadsheet /> Planilha modelo</Button>
          <Button size="sm" onClick={() => arq.current?.click()}><Upload /> Enviar planilha</Button>
          <input ref={arq} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); }} />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div><label className="text-xs text-muted-foreground">Nº da conta</label><Input className="w-28" placeholder="2.01.003" value={nova.codigo} onChange={(e) => setNova({ ...nova, codigo: e.target.value })} /></div>
        <div className="flex-1"><label className="text-xs text-muted-foreground">Nome</label><Input placeholder="Despesas com pessoal" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} /></div>
        <div><label className="text-xs text-muted-foreground">Natureza</label><select className={sel + " block"} value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value as "credito" | "debito" })}><option value="credito">Crédito (receita)</option><option value="debito">Débito (despesa)</option></select></div>
        <Button onClick={criar}><Plus /> Criar conta</Button>
      </div>
      {contas.length > 0 && <ul className="divide-y rounded-md border text-sm">{contas.map((c) => (
        <li key={c.id} className="flex items-center justify-between px-3 py-2">
          <span><b className="num">{c.codigo}</b> · {c.nome} <span className={`ml-2 text-xs ${c.tipo === "credito" ? "text-credit" : "text-debit"}`}>{c.tipo === "credito" ? "Crédito" : "Débito"}</span> <span className="ml-2 text-xs text-muted-foreground">{Object.values(mapa).filter((v) => v === c.id).length} categoria(s)</span></span>
          <Button size="sm" variant="ghost" onClick={() => remover(c)}><Trash2 /></Button>
        </li>))}</ul>}
      <div>
        <h4 className="mb-2 text-sm font-semibold">Categorias financeiras → conta do plano</h4>
        {cats.length === 0 ? <p className="text-sm text-muted-foreground">Importe previsões ou realizado para listar as categorias.</p> : (
          <div className="max-h-96 divide-y overflow-auto rounded-md border text-sm">{cats.map((c) => (
            <div key={c.categoria} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span>{c.categoria} <span className="text-xs text-muted-foreground">({c.tipo === "receber" ? "receita" : "despesa"})</span></span>
              <select className={sel + " w-64"} value={mapa[c.categoria] ?? ""} onChange={(e) => associar(c.categoria, e.target.value)}>
                <option value="">— sem conta —</option>
                {contas.map((k) => <option key={k.id} value={k.id}>{k.codigo} · {k.nome}</option>)}
              </select>
            </div>))}</div>)}
      </div>
    </Card>
  );
}
