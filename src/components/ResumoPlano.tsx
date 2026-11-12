import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { fmt } from "@/lib/extrato/store";
import type { LinhaPlano } from "@/lib/plano";

// Árvore recolhida: saldo clicável abre as contas/categorias; a categoria abre a composição.
export function ResumoPlano({ linhas, onCategoria, abrirPrimeiro = false }: { linhas: LinhaPlano[]; onCategoria: (id: string, rotulo: string) => void; abrirPrimeiro?: boolean }) {
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(abrirPrimeiro ? [] : []));
  const alternar = (id: string) => setAbertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const visiveis = (l: LinhaPlano[]) => l.filter((x) => x.total !== 0);
  const Item = ({ l, nivel }: { l: LinhaPlano; nivel: number }) => {
    const cor = l.id.startsWith("credito") ? "text-credit" : "text-debit";
    const filhos = visiveis(l.filhos);
    const aberto = abertos.has(l.id);
    const folha = filhos.length === 0;
    return <li>
      <button type="button" onClick={() => (folha ? onCategoria(l.id, l.rotulo) : alternar(l.id))}
        className={`group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted ${nivel === 0 ? "font-semibold" : nivel === 1 ? "text-sm" : "text-sm text-muted-foreground"}`}
        style={{ paddingLeft: 8 + nivel * 18 }}>
        {folha ? <span className="size-3.5" /> : <ChevronRight className={`size-3.5 shrink-0 transition-transform ${aberto ? "rotate-90" : ""}`} />}
        <span className="min-w-0 flex-1 truncate">{l.rotulo}</span>
        <span className={`num shrink-0 ${cor} ${folha ? "underline decoration-dotted underline-offset-4" : ""}`}>{fmt(l.total)}</span>
      </button>
      {!folha && aberto && <ul className="border-l border-border/60 ml-3">{filhos.map((f) => <Item key={f.id} l={f} nivel={nivel + 1} />)}</ul>}
    </li>;
  };
  const vis = visiveis(linhas);
  if (!vis.length) return <p className="text-sm text-muted-foreground">Sem valores no período selecionado.</p>;
  return <ul className="divide-y">{vis.map((l) => <Item key={l.id} l={l} nivel={0} />)}</ul>;
}
