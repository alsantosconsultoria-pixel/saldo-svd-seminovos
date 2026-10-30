import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import type { Extrato, Transacao } from "@/lib/extrato/parser";
import { data, norm, pega, valor } from "@/lib/importar-previsoes";

export interface Realizado {
  id: string; chave: string; tipo: "pagar" | "receber"; data: string; conta: string;
  contraparte: string; descricao: string; documento: string; categoria: string; valor: number; vinculo: string | null;
}
export type LinhaRealizado = Omit<Realizado, "id" | "vinculo">;

// Número da conta bancária no campo "Conta" (ex.: "99724-2 - 3835- Itau" → "997242"). Sem número com dígito = não é banco.
export function numeroConta(conta: string): string {
  const m = conta.trim().match(/^(\d+)-(\d)\b/);
  return m ? (m[1]! + m[2]!).replace(/^0+/, "") : "";
}
export function mesmaConta(contaPlanilha: string, e: Pick<Extrato, "conta">): boolean {
  const a = numeroConta(contaPlanilha);
  const b = e.conta.replace(/\D/g, "").replace(/^0+/, "");
  return !!a && !!b && (a.endsWith(b) || b.endsWith(a));
}

// Lê a planilha: só linhas com conta bancária e valor pago entram como realizado.
export function lerRealizado(rows: Record<string, unknown>[]): LinhaRealizado[] {
  return rows.flatMap((r) => {
    const conta = String(pega(r, "conta")).trim();
    if (!numeroConta(conta) || /^0+$/.test(numeroConta(conta) || "0")) return [];
    const d = data(pega(r, "data pagamento/recebimento", "data baixa"));
    const v = Math.abs(valor(pega(r, "total pago")) || valor(pega(r, "valor titulo")));
    const op = norm(String(pega(r, "operacao")));
    if (!d || !v || !(op.startsWith("pag") || op.startsWith("rec"))) return [];
    const tipo = op.startsWith("pag") ? "pagar" as const : "receber" as const;
    const documento = String(pega(r, "no documento", "nº documento")).trim();
    const contraparte = String(pega(r, "cliente/fornecedor")).trim();
    return [{
      tipo, data: d, conta, contraparte, documento, valor: v,
      descricao: String(pega(r, "descricao")).replace(/\s+/g, " ").trim(),
      categoria: String(pega(r, "categoria financeira")).trim(),
      chave: [tipo, d, numeroConta(conta), v.toFixed(2), documento, contraparte, String(pega(r, "data emissao"))].join("|"),
    }];
  });
}

export const chaveLanc = (extratoId: string, t: Pick<Transacao, "id">) => `${extratoId}|${t.id}`;

// Associação: vínculo manual primeiro; depois mesma conta, mesma data, mesmo valor e mesmo sentido (pagar=D, receber=C).
export function associar(realizados: Realizado[], extratos: Extrato[]) {
  const porLanc = new Map<string, Realizado[]>();
  const usados = new Set<string>();
  const pendentes: Realizado[] = [];
  const add = (k: string, r: Realizado) => porLanc.set(k, [...(porLanc.get(k) ?? []), r]);
  const auto: Realizado[] = [];
  for (const r of realizados) if (r.vinculo) { add(r.vinculo, r); usados.add(r.vinculo); } else auto.push(r);
  for (const r of auto) {
    let achou = "";
    for (const e of extratos) {
      if (!mesmaConta(r.conta, e)) continue;
      const t = e.transacoes.find((t) => t.data === r.data && Math.round(t.valor * 100) === Math.round(r.valor * 100)
        && t.tipo === (r.tipo === "pagar" ? "D" : "C") && !usados.has(chaveLanc(e.id, t)));
      if (t) { achou = chaveLanc(e.id, t); break; }
    }
    if (achou) { usados.add(achou); add(achou, r); } else pendentes.push(r);
  }
  return { porLanc, pendentes };
}

export interface DiaRealizado { data: string; pago: number; recebido: number }
export function realizadoPorDia(realizados: Pick<Realizado, "data" | "tipo" | "valor">[], de: string, ate: string): DiaRealizado[] {
  const m = new Map<string, DiaRealizado>();
  for (const r of realizados) {
    if (r.data < de || r.data > ate) continue;
    const d = m.get(r.data) ?? { data: r.data, pago: 0, recebido: 0 };
    if (r.tipo === "pagar") d.pago = Math.round((d.pago + r.valor) * 100) / 100; else d.recebido = Math.round((d.recebido + r.valor) * 100) / 100;
    m.set(r.data, d);
  }
  return [...m.values()].sort((a, b) => a.data.localeCompare(b.data));
}

export async function importarRealizado(f: File): Promise<{ novos: number; lidos: number }> {
  const wb = /\.csv$/i.test(f.name) ? XLSX.read(await f.text(), { type: "string", raw: true }) : XLSX.read(await f.arrayBuffer(), { cellDates: true });
  const folha = wb.Sheets[wb.SheetNames[0] ?? ""];
  if (!folha) throw new Error("A planilha não tem uma aba para leitura.");
  const linhas = lerRealizado(XLSX.utils.sheet_to_json<Record<string, unknown>>(folha));
  if (!linhas.length) throw new Error("Nenhuma linha com conta bancária. Confira as colunas Conta, Operação e Data pagamento/recebimento.");
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Entre novamente para importar a planilha.");
  const unicas = [...new Map(linhas.map((l) => [l.chave, l])).values()];
  let novos = 0;
  for (let i = 0; i < unicas.length; i += 500) {
    const { data: ins, error } = await supabase.from("realizados")
      .upsert(unicas.slice(i, i + 500).map((l) => ({ ...l, user_id: u.user!.id, arquivo: f.name })), { onConflict: "chave", ignoreDuplicates: true }).select("id");
    if (error) throw new Error("Não foi possível salvar o realizado. Tente novamente.");
    novos += ins?.length ?? 0;
  }
  return { novos, lidos: unicas.length };
}

export async function carregarRealizados(): Promise<Realizado[]> {
  const out: Realizado[] = [];
  for (let i = 0; ; i += 1000) {
    const { data: d } = await supabase.from("realizados").select("*").order("data").range(i, i + 999);
    out.push(...(d ?? []).map((r) => ({ ...r, tipo: r.tipo as Realizado["tipo"], valor: Number(r.valor) })));
    if (!d || d.length < 1000) return out;
  }
}
