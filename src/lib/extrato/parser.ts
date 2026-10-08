// Parser de extrato bancário a partir de linhas de texto (independente de pdf.js)
export type Tipo = "C" | "D";
export interface Transacao {
  id: string;
  data: string; // YYYY-MM-DD
  descricao: string;
  contraparte: string;
  documento: string;
  valor: number; // sempre positivo
  tipo: Tipo;
}
export interface SaldoDia {
  data: string;
  saldo: number;
}
export interface Extrato {
  id: string;
  banco: string;
  agencia: string;
  conta: string;
  titular: string;
  arquivo: string;
  importadoEm: string;
  saldoInicial: number;
  dataSaldoInicial: string;
  saldoFinalInformado: number | null;
  saldosInformados: SaldoDia[];
  transacoes: Transacao[];
}

export interface Fragmento {
  x: number;
  text: string;
}
export type Linha = Fragmento[];

const RE_DATA = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const RE_VALOR = /^-?\d{1,3}(\.\d{3})*,\d{2}$/;
const RE_DOC = /^(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})$/;

export const brl = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const iso = (d: string) => {
  const m = d.match(RE_DATA)!;
  return `${m[3]}-${m[2]}-${m[1]}`;
};

export function detectarBanco(texto: string): string {
  const t = texto.toUpperCase();
  if (t.includes("ITAU") || t.includes("ITAÚ")) return "Itaú";
  if (t.includes("BRADESCO")) return "Bradesco";
  if (t.includes("BANCO DO BRASIL")) return "Banco do Brasil";
  if (t.includes("SANTANDER")) return "Santander";
  if (t.includes("CAIXA ECON")) return "Caixa";
  if (t.includes("SICREDI")) return "Sicredi";
  if (t.includes("SICOOB")) return "Sicoob";
  if (t.includes("INTER ")) return "Inter";
  return "Banco";
}

// Divide fragmentos em tokens mantendo x
function tokens(l: Linha): Fragmento[] {
  return l.flatMap((f) =>
    f.text
      .split(/\s{2,}/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => ({ x: f.x, text: t })),
  );
}

export function parseLinhas(linhas: Linha[], arquivo: string): Extrato {
  const textoTotal = linhas.map((l) => l.map((f) => f.text).join(" ")).join("\n");
  const banco = detectarBanco(textoTotal);
  const ag = textoTotal.match(/Ag[eê]ncia:?\s*(\d+)/i)?.[1] ?? "";
  const ct = textoTotal.match(/Conta:?\s*([\d.-]+)/i)?.[1] ?? "";
  const titular = (linhas[0]?.map((f) => f.text).join(" ") ?? "").split(/CNPJ|Ag[eê]ncia/i)[0].trim();

  const tx: Transacao[] = [];
  const saldos: SaldoDia[] = [];
  let saldoInicial = 0;
  let dataSaldoInicial = "";
  let saldoFinal: number | null = null;

  const isDataLinha = (l: Linha) => RE_DATA.test(tokens(l)[0]?.text ?? "");

  linhas.forEach((linha, i) => {
    const tk = tokens(linha);
    if (!tk.length || !RE_DATA.test(tk[0].text)) return;
    const data = iso(tk[0].text);
    const resto = tk.slice(1);
    const valores = resto.filter((t) => RE_VALOR.test(t.text));
    const docs = resto.filter((t) => RE_DOC.test(t.text));
    const textos = resto.filter((t) => !RE_VALOR.test(t.text) && !RE_DOC.test(t.text));
    if (!valores.length) return;

    // descrição + contraparte; completa com linhas vizinhas sem data (layouts multi-linha)
    let descricao = textos[0]?.text ?? "";
    let contraparte = textos.slice(1).map((t) => t.text).join(" ");
    const vizinhos = [linhas[i - 1], linhas[i + 1]].filter((l) => l && !isDataLinha(l));
    const vizTk = vizinhos.flatMap((l) => tokens(l!)).filter((t) => !RE_VALOR.test(t.text));
    if (!descricao || descricao.length < 3) {
      descricao = vizTk.filter((t) => t.x < 150).map((t) => t.text).join(" ");
    }
    const extraCp = vizTk.filter((t) => t.x >= 150 && t.x < 420).map((t) => t.text).join(" ");
    if (!contraparte && extraCp && !/aviso|atualizado/i.test(extraCp)) contraparte = [contraparte, extraCp].filter(Boolean).join(" ");

    const up = descricao.toUpperCase();
    const ultimo = brl(valores[valores.length - 1].text);
    if (up.includes("SALDO ANTERIOR")) {
      saldoInicial = ultimo;
      dataSaldoInicial = data;
      return;
    }
    if (up.startsWith("SALDO")) {
      saldos.push({ data, saldo: ultimo });
      saldoFinal = ultimo;
      return;
    }
    const v = brl(valores[0].text);
    tx.push({
      id: `${data}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      data,
      descricao: descricao.replace(/\s+/g, " ").trim(),
      contraparte: contraparte.replace(/\s+/g, " ").trim(),
      documento: docs[0]?.text ?? "",
      valor: Math.abs(v),
      tipo: v < 0 ? "D" : "C",
    });
    if (valores.length > 1) saldos.push({ data, saldo: ultimo });
  });

  // mantém último saldo informado por dia
  const porDia = new Map<string, number>();
  saldos.forEach((s) => porDia.set(s.data, s.saldo));

  return {
    id: Math.random().toString(36).slice(2),
    banco,
    agencia: ag,
    conta: ct,
    titular,
    arquivo,
    importadoEm: new Date().toISOString(),
    saldoInicial,
    dataSaldoInicial,
    saldoFinalInformado: saldoFinal,
    saldosInformados: [...porDia].map(([data, saldo]) => ({ data, saldo })),
    transacoes: tx,
  };
}

export interface LinhaDiaria {
  data: string;
  abertura: number;
  entradas: number;
  saidas: number;
  fechamento: number;
  informado: number | null;
  ok: boolean | null;
}

export function saldoDiario(e: Extrato): LinhaDiaria[] {
  const dias = [...new Set(e.transacoes.map((t) => t.data).concat(e.saldosInformados.map((s) => s.data)))].sort();
  let saldo = Math.round(e.saldoInicial * 100);
  return dias.map((d) => {
    const t = e.transacoes.filter((x) => x.data === d);
    const entradas = t.filter((x) => x.tipo === "C").reduce((a, b) => a + b.valor, 0);
    const saidas = t.filter((x) => x.tipo === "D").reduce((a, b) => a + b.valor, 0);
    const abertura = saldo / 100;
    saldo = saldo + Math.round(entradas * 100) - Math.round(saidas * 100);
    const inf = e.saldosInformados.find((s) => s.data === d)?.saldo ?? null;
    return { data: d, abertura, entradas, saidas, fechamento: saldo / 100, informado: inf, ok: inf === null ? null : Math.round(inf * 100) === saldo };
  });
}

export function categoria(desc: string): string {
  const d = desc.toUpperCase();
  if (d.includes("PIX")) return "PIX";
  if (d.includes("TED") || d.includes("DOC")) return "TED/DOC";
  if (d.includes("BOLETOS RECEBIDOS")) return "Boletos recebidos";
  if (d.includes("BOLETO")) return "Boletos pagos";
  if (d.includes("CONS")) return "Consórcio";
  if (d.includes("SALARIO")) return "Folha";
  if (d.startsWith("PAGAMENTO")) return "Pagamentos";
  if (d.includes("TRIBUTO") || d.includes("DARF")) return "Tributos";
  if (d.includes("TAR") || d.includes("JUROS") || d.includes("IOF")) return "Tarifas/Juros";
  if (d.includes("GIRO") || d.includes("EMPREST")) return "Empréstimos";
  if (d.includes("REND") || d.includes("APLIC")) return "Rendimentos";
  return "Outros";
}
