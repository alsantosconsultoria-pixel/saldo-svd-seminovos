import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export const pega = (r: Record<string, unknown>, ...nomes: string[]) => {
  const k = Object.keys(r).find((k) => nomes.includes(norm(k)));
  return k && r[k] != null ? r[k] : "";
};
export function data(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const m = String(v).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null;
}
export function valor(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v).replace(/[^\d,.-]/g, "");
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s) || 0;
}

export async function importarPrevisoes(f: File): Promise<number> {
  const wb = /\.csv$/i.test(f.name)
    ? XLSX.read(await f.text(), { type: "string", raw: true })
    : XLSX.read(await f.arrayBuffer(), { cellDates: true });
  const nome = wb.SheetNames[0];
  const folha = nome ? wb.Sheets[nome] : undefined;
  if (!folha) throw new Error("A planilha não tem uma aba para leitura.");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(folha);
  const { data: u, error: authError } = await supabase.auth.getUser();
  if (authError || !u.user) throw new Error("Entre novamente para importar a planilha.");
  const userId = u.user.id;
  const novos = rows.flatMap((r) => {
    const venc = data(pega(r, "data vencimento", "vencimento", "data", "data prevista"));
    const v = valor(pega(r, "valor titulo", "valor do titulo", "valor"));
    const t = norm(String(pega(r, "operacao", "tipo")));
    if (!venc || !v) return [];
    const tipo = t.startsWith("rec") || t === "c" || t.includes("entrada") ? "receber"
      : t.startsWith("pag") || t === "d" || t.includes("saida") || t.includes("despesa") ? "pagar" : v < 0 ? "pagar" : "receber";
    return [{
      user_id: userId, tipo, vencimento: venc, valor: Math.abs(v), arquivo: f.name,
      descricao: String(pega(r, "descricao", "historico")).replace(/\s+/g, " ").trim(),
      contraparte: String(pega(r, "cliente/fornecedor", "cliente fornecedor", "contraparte", "fornecedor", "cliente", "favorecido")).trim(),
      documento: String(pega(r, "no documento", "nº documento", "n documento", "documento")).trim(),
      banco: String(pega(r, "conta", "banco")), categoria: String(pega(r, "categoria financeira", "categoria")),
    }];
  });
  if (!novos.length) throw new Error("Nenhuma linha válida. Confira as colunas Data vencimento e Valor título.");
  const { error } = await supabase.from("previsoes").insert(novos);
  if (error) throw new Error("Não foi possível salvar as previsões. Tente novamente.");
  return novos.length;
}