// Parser de extrato bancário genérico (multi-bancos) a partir de linhas de texto posicionadas
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
  futuros?: Transacao[];
  ocr?: boolean;
}

export interface Fragmento {
  x: number;
  text: string;
}
export type Linha = Fragmento[];

const RE_DATA = /^(\d{2})\/(\d{2})(?:\/(\d{4}))?$/;
const RE_DATA_INICIO = /^(\d{2}\/\d{2}(?:\/\d{4})?)\s+(.+)$/;
// aceita 1.234,56 (BR) e 1,234.56 (US)
const RE_VALOR = /^-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}$/;
const RE_DOC = /^(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}|\d{5,})$/;

export function brl(s: string): number {
  const neg = s.startsWith("-");
  const limpo = s.replace(/^-/, "");
  const dec = limpo.slice(-3, -2); // separador decimal
  const inteiro = limpo.slice(0, -3).replace(/[.,]/g, "");
  const n = Number(`${inteiro}.${limpo.slice(-2)}`);
  void dec;
  return neg ? -n : n;
}

export function detectarBanco(texto: string): string {
  const t = texto.toUpperCase();
  if (t.includes("ITAU UNIBANCO") || t.includes("ITAÚ") || t.includes("ITAU.COM.BR")) return "Itaú";
  if (t.includes("BANCO C6") || t.includes("C6 S.A")) return "C6 Bank";
  if (t.includes("CAIXA")) return "Caixa";
  if (t.includes("OMNI")) return "Omni";
  if (t.includes("ORIGINAL")) return "Banco Original";
  if (t.includes("SICREDI")) return "Sicredi";
  if (t.includes("SICOOB")) return "Sicoob";
  if (t.includes("BRADESCO")) return "Bradesco";
  if (t.includes("BANCO DO BRASIL")) return "Banco do Brasil";
  if (t.includes("SANTANDER")) return "Santander";
  if (t.includes("ITAU")) return "Itaú";
  return "Banco";
}

// Normaliza fragmentos em tokens: junta "-", "R$", sufixo C/D ao valor
function tokens(l: Linha): Fragmento[] {
  const brutos = l.flatMap((f) =>
    f.text
      .replace(/(-)?\s*R\s?[$S]\s*/g, (_m, s) => (s ? " -" : " "))
      .replace(/-\s+(?=\d)/g, "-")
      .split(/\s{2,}|(?<=\d,\d{2}|\d\.\d{2})\s+(?=[CD]\b)/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => ({ x: f.x, text: t })),
  );
  // separa "07/10 SALDO ..." quando o OCR junta data + descrição
  const out: Fragmento[] = [];
  brutos.forEach((t, i) => {
    const m = i === 0 ? t.text.match(RE_DATA_INICIO) : null;
    if (m && !/^\d{2}:\d{2}/.test(m[2]!)) {
      out.push({ x: t.x, text: m[1]! }, { x: t.x + 1, text: m[2]! });
    } else out.push(t);
  });
  const res: Fragmento[] = [];
  for (const t of out) {
    const prev = res[res.length - 1];
    if (prev && /^-$/.test(prev.text) && RE_VALOR.test(t.text)) {
      prev.text = "-" + t.text;
    } else if (prev && /^[CD]$/.test(t.text) && RE_VALOR.test(prev.text)) {
      if (t.text === "D" && !prev.text.startsWith("-")) prev.text = "-" + prev.text;
    } else {
      // "551,61 C" no mesmo fragmento
      const cd = t.text.match(/^(-?[\d.,]+)\s+([CD])$/);
      if (cd && RE_VALOR.test(cd[1]!)) res.push({ x: t.x, text: cd[2] === "D" && !cd[1]!.startsWith("-") ? "-" + cd[1] : cd[1]! });
      else res.push({ ...t });
    }
  }
  return res;
}

const IGNORAR = /^(LIMITE|TOTAL DISPON)|^SALDO.*(VINCULADO|BLOQUEADO|LIMITE)/;
const SALDO_INICIAL = /SALDO ANTERIOR|SALDO (DISPONIVEL |DISPONÍVEL )?INICIAL/;

export function parseLinhas(linhas: Linha[], arquivo: string, ocr = false): Extrato {
  const textoLinhas = linhas.map((l) => l.map((f) => f.text).join(" "));
  const textoTotal = textoLinhas.join("\n");
  const banco = detectarBanco(textoTotal);
  const ano = textoTotal.match(/\d{2}\/\d{2}\/(\d{4})/)?.[1] ?? String(new Date().getFullYear());
  // layout com rótulos numa linha e valores na seguinte (ex.: Omni "Agência: Conta:" / "1 606000-9")
  const empilhado = textoTotal.match(/Ag[eê]ncia:?\s+Conta:?\s*\n\s*(\d+)\s+([\d.-]{4,})/i);
  const ag = empilhado?.[1] ?? textoTotal.match(/(?:Ag[eê]ncia|Cooperativa):?\s*(\d+)/i)?.[1] ?? "";
  const ct = empilhado?.[2] ?? textoTotal.match(/Conta(?: Corrente)?:?\s*([\d.-]{4,})/i)?.[1] ?? "";
  const titular =
    textoLinhas.slice(0, 20).map((t) => t.match(/([A-Z][A-Z .&]+(?:LTDA|S\.A\.|EIRELI|ME|VEICUL\w*))/)?.[1]).find(Boolean)?.trim() ?? "";

  const iso = (d: string) => {
    const m = d.match(RE_DATA)!;
    return `${m[3] ?? ano}-${m[2]}-${m[1]}`;
  };

  const tx: Transacao[] = [];
  const futuros: Transacao[] = [];
  const saldos: SaldoDia[] = [];
  let saldoInicial: number | null = null;
  let dataSaldoInicial = "";
  let saldoFinal: number | null = null;
  let modoFuturo = false;
  let dataPendente: string | null = null; // data em linha própria (layout Caixa)

  const isDataLinha = (l: Linha) => RE_DATA.test(tokens(l)[0]?.text ?? "");

  linhas.forEach((linha, i) => {
    const txt = textoLinhas[i]!.toUpperCase();
    if (/LAN[ÇC]AMENTOS FUTUROS/.test(txt)) modoFuturo = true;
    let tk = tokens(linha);
    if (!tk.length) return;

    let data: string;
    if (RE_DATA.test(tk[0]!.text)) {
      data = iso(tk[0]!.text);
      tk = tk.slice(1);
    } else if (dataPendente) {
      data = dataPendente;
    } else {
      // saldo anterior sem data na linha
      const v = tk.filter((t) => RE_VALOR.test(t.text));
      if (SALDO_INICIAL.test(txt) && v.length && saldoInicial === null) saldoInicial = brl(v.at(-1)!.text);
      return;
    }
    const dateX = linha[0]?.x ?? 0;
    const valores = tk.filter((t) => RE_VALOR.test(t.text));
    const docs = tk.filter((t) => RE_DOC.test(t.text));
    const textos = tk.filter((t) => !RE_VALOR.test(t.text) && !RE_DOC.test(t.text) && !/^\d{2}:\d{2}$/.test(t.text));
    if (!valores.length) {
      // linha só com data: valores devem vir na linha seguinte
      dataPendente = RE_DATA.test(tokens(linha)[0]!.text) && !textos.length ? data : null;
      return;
    }
    dataPendente = null;

    const valX = valores[0]!.x;
    const corte = dateX + 0.3 * (valX - dateX);
    let descricao = textos.filter((t) => t.x < corte || textos.length === 1).map((t) => t.text).join(" ");
    let contraparte = textos.filter((t) => t.x >= corte && textos.length > 1).map((t) => t.text).join(" ");
    const vizinhos = [linhas[i - 1], linhas[i + 1]].filter((l): l is Linha => !!l && !isDataLinha(l));
    const vizTk = vizinhos.flatMap((l) => tokens(l)).filter((t) => !RE_VALOR.test(t.text) && t.x < valX);
    if (descricao.length < 3) descricao = vizTk.filter((t) => t.x < corte).map((t) => t.text).join(" ");
    const extraCp = vizTk.filter((t) => t.x >= corte).map((t) => t.text).join(" ");
    if (!contraparte && extraCp && !/aviso|atualizado/i.test(extraCp)) contraparte = extraCp;

    const up = descricao.toUpperCase();
    if (IGNORAR.test(up)) return;
    const ultimo = brl(valores.at(-1)!.text);
    if (SALDO_INICIAL.test(up)) {
      if (saldoInicial === null) {
        saldoInicial = ultimo;
        dataSaldoInicial = data;
      }
      return;
    }
    if (up.startsWith("SALDO")) {
      if (!modoFuturo) {
        saldos.push({ data, saldo: ultimo });
        saldoFinal = ultimo;
      }
      return;
    }
    const v = brl(valores[0]!.text);
    const t: Transacao = {
      id: `${data}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      data,
      descricao: descricao.replace(/\s+/g, " ").trim() || "Lançamento",
      contraparte: contraparte.replace(/\s+/g, " ").trim(),
      documento: docs.find((d) => !/^0+$/.test(d.text))?.text ?? "",
      valor: Math.abs(v),
      tipo: v < 0 ? "D" : "C",
    };
    if (modoFuturo) {
      futuros.push(t);
      return;
    }
    tx.push(t);
    if (valores.length > 1) {
      saldos.push({ data, saldo: ultimo });
      saldoFinal = ultimo;
    }
  });

  // extrato só com saldo (ex.: resumo de conta sem lançamentos)
  if (!tx.length && !saldos.length) {
    textoLinhas.forEach((t, i) => {
      if (saldoFinal !== null || !/SALDO (ATUAL|DISPON)/i.test(t)) return;
      const v = tokens(linhas[i]!).filter((x) => RE_VALOR.test(x.text));
      if (!v.length) return;
      const d =
        t.match(/em (\d{2}\/\d{2}(?:\/\d{4})?)/i)?.[1] ??
        textoTotal.match(/Saldo em (\d{2}\/\d{2}\/\d{4})/i)?.[1] ??
        textoTotal.match(/\d{2}\/\d{2}\/\d{4}/)?.[0];
      saldoFinal = brl(v.at(-1)!.text);
      if (d) saldos.push({ data: iso(d), saldo: saldoFinal });
    });
  }

  // sem saldo inicial explícito: deduz pelo primeiro saldo informado
  if (saldoInicial === null) {
    const primeiro = saldos[0];
    if (primeiro) {
      const mov = tx.filter((t) => t.data <= primeiro.data).reduce((a, t) => a + (t.tipo === "C" ? t.valor : -t.valor), 0);
      saldoInicial = tx.length ? Math.round((primeiro.saldo - mov) * 100) / 100 : primeiro.saldo;
    } else saldoInicial = 0;
  }

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
    futuros,
    ocr,
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
    const fechamento = saldo / 100;
    const ok = inf === null ? null : Math.round(inf * 100) === saldo;
    // A conferência continua mostrando divergências; o próximo dia parte do saldo do banco.
    if (inf !== null) saldo = Math.round(inf * 100);
    return { data: d, abertura, entradas, saidas, fechamento, informado: inf, ok };
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
  if (d.includes("TRIBUTO") || d.includes("DARF") || d.includes("GRU")) return "Tributos";
  if (d.includes("TAR") || d.includes("JUROS") || d.includes("IOF") || d.includes("CESTA")) return "Tarifas/Juros";
  if (d.includes("GIRO") || d.includes("EMPREST")) return "Empréstimos";
  if (d.includes("REND") || d.includes("APLIC")) return "Rendimentos";
  if (d.includes("PEDAGIO")) return "Pedágio";
  return "Outros";
}
