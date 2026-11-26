import type { Extrato } from "@/lib/extrato/parser";
import { ehTransferenciaFinanceira } from "@/lib/plano";
import type { Realizado } from "@/lib/realizado";
import { saldoNaData, ultimoSaldoExtrato } from "@/lib/tratativas";

export type RegimePatrimonio = "competencia" | "caixa";
export type CenarioPatrimonio = "base" | "conservador" | "otimista" | "simulado";
export type GranularidadePatrimonio = "diaria" | "mensal";

export interface TituloPatrimonio {
  id: string;
  tipo: "pagar" | "receber";
  vencimento: string;
  valor: number;
  documento?: string;
  contraparte?: string;
  categoria?: string;
}

export interface PremissasPatrimonio {
  depreciacaoAnual: number;
  pdd: number;
  impostos: number;
  reservaLegal: boolean;
  regime: RegimePatrimonio;
}

export interface ComplementosPatrimonio {
  estoques: number;
  imobilizado: number;
  outrosAtivos: number;
  passivoLongoPrazo: number;
  capitalSocial: number;
  reservaLegalAcumulada: number;
}

export const PREMISSAS_INICIAIS: PremissasPatrimonio = {
  depreciacaoAnual: 10,
  pdd: 2,
  impostos: 34,
  reservaLegal: true,
  regime: "competencia",
};

export const COMPLEMENTOS_INICIAIS: ComplementosPatrimonio = {
  estoques: 0,
  imobilizado: 0,
  outrosAtivos: 0,
  passivoLongoPrazo: 0,
  capitalSocial: 0,
  reservaLegalAcumulada: 0,
};

export const CENARIOS: { id: CenarioPatrimonio; nome: string; descricao: string }[] = [
  { id: "base", nome: "Base / Realizado", descricao: "Sem ajustes gerenciais adicionais" },
  { id: "conservador", nome: "Conservador", descricao: "Recebimentos futuros −10%, pagamentos futuros +10% e PDD +5 p.p." },
  { id: "otimista", nome: "Otimista", descricao: "Recebimentos futuros +5%, pagamentos futuros −5% e PDD −2 p.p." },
  { id: "simulado", nome: "Simulado", descricao: "Aplica integralmente as premissas informadas" },
];

export interface SnapshotPatrimonio {
  data: string;
  cenario: CenarioPatrimonio;
  disponibilidades: number;
  receberBruto: number;
  pdd: number;
  estoques: number;
  imobilizado: number;
  depreciacao: number;
  outrosAtivos: number;
  ativoCirculante: number;
  ativoTotal: number;
  pagar: number;
  impostos: number;
  passivoLongoPrazo: number;
  passivoCirculante: number;
  passivoTotal: number;
  capitalSocial: number;
  resultado: number;
  reservaLegal: number;
  ajustePatrimonial: number;
  patrimonioLiquido: number;
  diferenca: number;
}

const cent = (n: number) => Math.round(n * 100);
const moeda = (n: number) => cent(n) / 100;
const limite = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
const normalizar = (s?: string) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\D/g, "");
const nome = (s?: string) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

function parametros(cenario: CenarioPatrimonio, p: PremissasPatrimonio) {
  const base = {
    pdd: limite(p.pdd),
    depreciacao: limite(p.depreciacaoAnual),
    impostos: limite(p.impostos),
    fatorReceber: 1,
    fatorPagar: 1,
    reserva: p.reservaLegal,
  };
  if (cenario === "base") return { ...base, pdd: 0, depreciacao: 0, impostos: 0, reserva: false };
  if (cenario === "conservador") return { ...base, pdd: limite(base.pdd + 5), fatorReceber: 0.9, fatorPagar: 1.1 };
  if (cenario === "otimista") return { ...base, pdd: limite(base.pdd - 2), fatorReceber: 1.05, fatorPagar: 0.95 };
  return base;
}

/** Concilia previsões e baixas sem duplicar o mesmo título no resultado ou no caixa projetado. */
export function conciliarTitulosPatrimonio(previsoes: TituloPatrimonio[], realizados: Realizado[]): Map<string, string> {
  const porDocumento = new Map<string, Realizado[]>();
  const porValorNome = new Map<string, Realizado[]>();
  const add = <T>(mapa: Map<string, T[]>, chave: string, item: T) => mapa.set(chave, [...(mapa.get(chave) ?? []), item]);
  for (const r of realizados) {
    if (ehTransferenciaFinanceira(r.categoria)) continue;
    const doc = normalizar(r.documento);
    if (doc) add(porDocumento, `${r.tipo}|${doc}`, r);
    const n = nome(r.contraparte);
    if (n) add(porValorNome, `${r.tipo}|${cent(r.valor)}|${n}`, r);
  }
  const usados = new Set<string>();
  const baixas = new Map<string, string>();
  const ordenado = (a: Realizado, b: Realizado) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id);
  for (const p of [...previsoes].sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.id.localeCompare(b.id))) {
    if (ehTransferenciaFinanceira(p.categoria)) continue;
    const doc = normalizar(p.documento);
    const n = nome(p.contraparte);
    const candidatos = doc
      ? (porDocumento.get(`${p.tipo}|${doc}`) ?? [])
      : n
        ? (porValorNome.get(`${p.tipo}|${cent(p.valor)}|${n}`) ?? [])
        : [];
    const baixa = [...candidatos].sort(ordenado).find((r) => !usados.has(r.id));
    if (baixa) {
      usados.add(baixa.id);
      baixas.set(p.id, baixa.data);
    }
  }
  return baixas;
}

export function diasEntre(de: string, ate: string) {
  const a = new Date(`${de}T12:00:00Z`).getTime();
  const b = new Date(`${ate}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function datasDiarias(de: string, ate: string) {
  if (!de || !ate || ate < de) return [];
  const total = Math.min(diasEntre(de, ate), 369);
  return Array.from({ length: total + 1 }, (_, i) => {
    const d = new Date(`${de}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export function datasMensais(ano: number, mesInicial: number, mesFinal: number) {
  if (mesFinal < mesInicial) return [];
  return Array.from({ length: mesFinal - mesInicial + 1 }, (_, i) => {
    const mes = mesInicial + i;
    return new Date(Date.UTC(ano, mes, 0, 12)).toISOString().slice(0, 10);
  });
}

function reservaLegalDoPeriodo(resultado: number, capitalSocial: number, reservaAcumulada: number, ativo: boolean) {
  if (!ativo || resultado <= 0) return 0;
  const limiteLegal = Math.max(0, capitalSocial * 0.2 - Math.max(0, reservaAcumulada));
  return moeda(Math.min(resultado * 0.05, limiteLegal));
}

interface BaseCalculo {
  extratos: Extrato[];
  previsoes: TituloPatrimonio[];
  realizados: Realizado[];
  de: string;
  premissas: PremissasPatrimonio;
  complementos: ComplementosPatrimonio;
  baixas: Map<string, string>;
  baseExtrato: string;
}

function snapshot(base: BaseCalculo, data: string, cenario: CenarioPatrimonio): SnapshotPatrimonio {
  const { extratos, previsoes, realizados, de, premissas, complementos, baixas, baseExtrato } = base;
  const par = parametros(cenario, premissas);
  const titulos = previsoes.filter((p) => !ehTransferenciaFinanceira(p.categoria));
  const realizadosValidos = realizados.filter((r) => !ehTransferenciaFinanceira(r.categoria));

  let disponibilidades = extratos.reduce((soma, e) => soma + (saldoNaData(e, data)?.saldo ?? 0), 0);
  const caixaPosterior = realizadosValidos
    .filter((r) => r.data > baseExtrato && r.data <= data)
    .reduce((soma, r) => soma + (r.tipo === "receber" ? r.valor : -r.valor), 0);
  const previsaoCaixa = titulos
    .filter((p) => !baixas.has(p.id) && p.vencimento > baseExtrato && p.vencimento <= data)
    .reduce((soma, p) => soma + (p.tipo === "receber" ? p.valor * par.fatorReceber : -p.valor * par.fatorPagar), 0);
  if (data > baseExtrato) disponibilidades += caixaPosterior + previsaoCaixa;

  const abertos = titulos.filter((p) => !baixas.has(p.id) || (baixas.get(p.id) ?? "") > data);
  const receberBruto = abertos.filter((p) => p.tipo === "receber").reduce((soma, p) => soma + p.valor, 0);
  const pagar = abertos.filter((p) => p.tipo === "pagar").reduce((soma, p) => soma + p.valor, 0);
  const pdd = receberBruto * par.pdd / 100;
  const depreciacao = Math.min(Math.max(0, complementos.imobilizado), Math.max(0, complementos.imobilizado) * par.depreciacao / 100 * diasEntre(de, data) / 365);

  const resultadoRealizado = realizadosValidos
    .filter((r) => r.data >= de && r.data <= data)
    .reduce((soma, r) => soma + (r.tipo === "receber" ? r.valor : -r.valor), 0);
  const resultadoPrevisto = premissas.regime === "competencia"
    ? titulos.filter((p) => !baixas.has(p.id) && p.vencimento >= de && p.vencimento <= data)
      .reduce((soma, p) => soma + (p.tipo === "receber" ? p.valor * par.fatorReceber : -p.valor * par.fatorPagar), 0)
    : 0;
  const despesasNaoCaixa = premissas.regime === "competencia" ? pdd + depreciacao : 0;
  const resultadoAntesImpostos = resultadoRealizado + resultadoPrevisto - despesasNaoCaixa;
  const impostos = Math.max(0, resultadoAntesImpostos) * par.impostos / 100;
  const resultado = resultadoAntesImpostos - impostos;

  const estoques = Math.max(0, complementos.estoques);
  const imobilizado = Math.max(0, complementos.imobilizado);
  const outrosAtivos = Math.max(0, complementos.outrosAtivos);
  const passivoLongoPrazo = Math.max(0, complementos.passivoLongoPrazo);
  const capitalSocial = Math.max(0, complementos.capitalSocial);
  const ativoCirculante = disponibilidades + receberBruto - pdd + estoques + outrosAtivos;
  const ativoTotal = ativoCirculante + imobilizado - depreciacao;
  const passivoCirculante = pagar + impostos;
  const passivoTotal = passivoCirculante + passivoLongoPrazo;
  const patrimonioLiquido = ativoTotal - passivoTotal;
  const reservaLegal = reservaLegalDoPeriodo(resultado, capitalSocial, complementos.reservaLegalAcumulada, par.reserva);
  const ajustePatrimonial = patrimonioLiquido - capitalSocial - resultado;

  const valores = {
    disponibilidades, receberBruto, pdd, estoques, imobilizado, depreciacao, outrosAtivos,
    ativoCirculante, ativoTotal, pagar, impostos, passivoLongoPrazo, passivoCirculante,
    passivoTotal, capitalSocial, resultado, reservaLegal, ajustePatrimonial, patrimonioLiquido,
  };
  const arredondados = Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, moeda(v)])) as Omit<SnapshotPatrimonio, "data" | "cenario" | "diferenca">;
  return { data, cenario, ...arredondados, diferenca: moeda(arredondados.ativoTotal - arredondados.passivoTotal - arredondados.patrimonioLiquido) };
}

export function montarSeriePatrimonio(args: {
  extratos: Extrato[];
  previsoes: TituloPatrimonio[];
  realizados: Realizado[];
  datas: string[];
  de: string;
  cenarios: CenarioPatrimonio[];
  premissas: PremissasPatrimonio;
  complementos: ComplementosPatrimonio;
}) {
  const { extratos, previsoes, realizados, datas, de, cenarios, premissas, complementos } = args;
  const baseExtrato = extratos.map((e) => ultimoSaldoExtrato(e).data).filter(Boolean).sort().at(-1) ?? "";
  const base: BaseCalculo = { extratos, previsoes, realizados, de, premissas, complementos, baixas: conciliarTitulosPatrimonio(previsoes, realizados), baseExtrato };
  return datas.map((data) => Object.fromEntries(cenarios.map((c) => [c, snapshot(base, data, c)])) as Partial<Record<CenarioPatrimonio, SnapshotPatrimonio>>);
}

export interface IndicadoresPatrimonio {
  liquidezCorrente: number | null;
  liquidezSeca: number | null;
  liquidezGeral: number | null;
  endividamento: number | null;
  capitalCirculante: number;
  roe: number | null;
  roa: number | null;
}

const divisao = (a: number, b: number) => b === 0 ? null : a / b;
export function indicadoresPatrimonio(s: SnapshotPatrimonio): IndicadoresPatrimonio {
  return {
    liquidezCorrente: divisao(s.ativoCirculante, s.passivoCirculante),
    liquidezSeca: divisao(s.ativoCirculante - s.estoques, s.passivoCirculante),
    liquidezGeral: divisao(s.ativoCirculante, s.passivoTotal),
    endividamento: divisao(s.passivoTotal, s.ativoTotal),
    capitalCirculante: moeda(s.ativoCirculante - s.passivoCirculante),
    roe: s.patrimonioLiquido > 0 ? divisao(s.resultado, s.patrimonioLiquido) : null,
    roa: s.ativoTotal > 0 ? divisao(s.resultado, s.ativoTotal) : null,
  };
}

export interface LinhaComparacaoPatrimonio {
  id: keyof SnapshotPatrimonio | "grupo-ativo" | "grupo-passivo" | "grupo-pl";
  rotulo: string;
  tipo: "grupo" | "conta" | "total" | "memo";
  a: number;
  b: number;
  variacao: number;
  percentual: number | null;
}

const ESTRUTURA: { id: LinhaComparacaoPatrimonio["id"]; rotulo: string; tipo: LinhaComparacaoPatrimonio["tipo"] }[] = [
  { id: "grupo-ativo", rotulo: "ATIVO", tipo: "grupo" },
  { id: "disponibilidades", rotulo: "Disponibilidades", tipo: "conta" },
  { id: "receberBruto", rotulo: "Contas a receber", tipo: "conta" },
  { id: "pdd", rotulo: "(-) PDD / PCLD estimada", tipo: "conta" },
  { id: "estoques", rotulo: "Estoques (complemento informado)", tipo: "conta" },
  { id: "outrosAtivos", rotulo: "Outros ativos circulantes (complemento)", tipo: "conta" },
  { id: "ativoCirculante", rotulo: "ATIVO CIRCULANTE", tipo: "total" },
  { id: "imobilizado", rotulo: "Imobilizado (complemento informado)", tipo: "conta" },
  { id: "depreciacao", rotulo: "(-) Depreciação acumulada simulada", tipo: "conta" },
  { id: "ativoTotal", rotulo: "ATIVO TOTAL", tipo: "total" },
  { id: "grupo-passivo", rotulo: "PASSIVO", tipo: "grupo" },
  { id: "pagar", rotulo: "Contas a pagar", tipo: "conta" },
  { id: "impostos", rotulo: "IRPJ / CSLL estimados", tipo: "conta" },
  { id: "passivoCirculante", rotulo: "PASSIVO CIRCULANTE", tipo: "total" },
  { id: "passivoLongoPrazo", rotulo: "Passivo de longo prazo (complemento)", tipo: "conta" },
  { id: "passivoTotal", rotulo: "PASSIVO TOTAL", tipo: "total" },
  { id: "grupo-pl", rotulo: "PATRIMÔNIO LÍQUIDO", tipo: "grupo" },
  { id: "capitalSocial", rotulo: "Capital social informado", tipo: "conta" },
  { id: "resultado", rotulo: "Resultado líquido estimado no período", tipo: "conta" },
  { id: "ajustePatrimonial", rotulo: "Ajustes e saldos contábeis não disponíveis", tipo: "conta" },
  { id: "reservaLegal", rotulo: "Reserva legal do período (destinação informativa)", tipo: "memo" },
  { id: "patrimonioLiquido", rotulo: "PATRIMÔNIO LÍQUIDO", tipo: "total" },
];

const valorLinha = (s: SnapshotPatrimonio, id: LinhaComparacaoPatrimonio["id"]) => {
  if (id.startsWith("grupo-")) return 0;
  const valor = s[id as keyof SnapshotPatrimonio];
  if (typeof valor !== "number") return 0;
  return id === "pdd" || id === "depreciacao" ? -valor : valor;
};

export function compararPatrimonio(a: SnapshotPatrimonio, b: SnapshotPatrimonio): LinhaComparacaoPatrimonio[] {
  return ESTRUTURA.map((linha) => {
    const va = valorLinha(a, linha.id);
    const vb = valorLinha(b, linha.id);
    const variacao = moeda(vb - va);
    return { ...linha, a: va, b: vb, variacao, percentual: va === 0 ? null : variacao / Math.abs(va) * 100 };
  });
}

export function oscilacaoRelevante(linha: Pick<LinhaComparacaoPatrimonio, "variacao" | "percentual">, limiar: number, modo: "percentual" | "valor") {
  if (modo === "valor") return Math.abs(linha.variacao) >= Math.max(0, limiar);
  return linha.percentual === null ? Math.abs(linha.variacao) > 0 : Math.abs(linha.percentual) >= Math.max(0, limiar);
}
