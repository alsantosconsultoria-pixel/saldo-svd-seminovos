import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export const pega = (r: Record<string, unknown>, ...nomes: string[]) => {
  const k = Object.keys(r).find((k) => nomes.includes(norm(k)));
  return k && r[k] != null ? r[k] : "";
};
export const pegaMarcador = (r: Record<string, unknown>) => {
  const k = Object.keys(r).find((k) => /^(marcador|tag|etiqueta)/.test(norm(k)));
  return k && r[k] != null ? String(r[k]).trim() : "";
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
  let s = String(v).trim();
  const neg = /^\(.*\)$/.test(s) || /-/.test(s);
  s = s.replace(/[^\d,.]/g, "");
  if (!s) return 0;
  const ul = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  // Último separador seguido de 1–2 dígitos = decimal (350000.00, 350.000,00, 1,234.56); demais são milhar (350.000).
  const dec = ul >= 0 && s.length - ul - 1 <= 2 ? ul : -1;
  const n = dec >= 0 ? Number(s.slice(0, dec).replace(/[.,]/g, "") + "." + s.slice(dec + 1)) : Number(s.replace(/[.,]/g, ""));
  return (neg ? -n : n) || 0;
}

export function faixaDatas(datas: string[]): { de: string; ate: string } | null {
  if (!datas.length) return null;
  const ord = [...datas].sort();
  return { de: ord[0]!, ate: ord[ord.length - 1]! };
}

export function filtrarPrevisoesSemRealizado<T extends { vencimento: string }>(itens: T[], datasRealizadas: Iterable<string>): { manter: T[]; removidos: number } {
  const realizadas = new Set(datasRealizadas);
  const manter = itens.filter((i) => !realizadas.has(i.vencimento));
  return { manter, removidos: itens.length - manter.length };
}

export interface ResultadoImportacaoPrevisoes {
  importados: number;
  ignoradosRealizado: number;
  de: string;
  ate: string;
}

export async function importarPrevisoes(f: File): Promise<ResultadoImportacaoPrevisoes> {
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
      marcador: pegaMarcador(r),
    }];
  });
  if (!novos.length) throw new Error("Nenhuma linha válida. Confira as colunas Data vencimento e Valor título.");
  const faixa = faixaDatas(novos.map((n) => n.vencimento))!;

  // Dias que já possuem realizado deixam de ser previstos.
  const datasRealizadas = new Set<string>();
  for (let i = 0; ; i += 1000) {
    const { data: real, error: errReal } = await supabase
      .from("realizados")
      .select("data")
      .gte("data", faixa.de)
      .lte("data", faixa.ate)
      .range(i, i + 999);
    if (errReal) throw new Error("Não foi possível verificar os dias já realizados. Tente novamente.");
    for (const r of real ?? []) if (r.data) datasRealizadas.add(r.data);
    if (!real || real.length < 1000) break;
  }

  const { manter, removidos } = filtrarPrevisoesSemRealizado(novos, datasRealizadas);

  // Sobrepõe o período da planilha sem duplicar lançamentos.
  const { error: errDel } = await supabase
    .from("previsoes")
    .delete()
    .gte("vencimento", faixa.de)
    .lte("vencimento", faixa.ate);
  if (errDel) throw new Error("Não foi possível substituir as previsões do período. Tente novamente.");

  for (let i = 0; i < manter.length; i += 500) {
    const { error } = await supabase.from("previsoes").insert(manter.slice(i, i + 500));
    if (error) throw new Error("Não foi possível salvar as previsões. Tente novamente.");
  }
  return { importados: manter.length, ignoradosRealizado: removidos, de: faixa.de, ate: faixa.ate };
}