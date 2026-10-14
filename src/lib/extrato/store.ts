import { useEffect, useState, useCallback } from "react";
import type { Extrato } from "./parser";
import seed from "./seed.json";

const KEY = "extratos-v2";
const demo = seed as unknown as Extrato[];

export function useExtratos() {
  const [lista, setLista] = useState<Extrato[]>([]);
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    const raw = localStorage.getItem(KEY);
    setLista(raw ? JSON.parse(raw) : demo);
    setPronto(true);
  }, []);
  useEffect(() => {
    if (pronto) localStorage.setItem(KEY, JSON.stringify(lista));
  }, [lista, pronto]);
  const add = useCallback((e: Extrato) => setLista((l) => mesclar(l, e)), []);
  const remove = useCallback((id: string) => setLista((l) => l.filter((x) => x.id !== id)), []);
  const reset = useCallback(() => setLista(demo), []);
  return { lista, add, remove, reset, pronto };
}

const chave = (e: Extrato) => `${e.banco}|${e.agencia.replace(/\D/g, "")}|${e.conta.replace(/\D/g, "")}`;
export const hoje = () => new Date().toISOString().slice(0, 10);

// Junta extrato da mesma conta/agência: acrescenta só as datas que ainda não existem
export function mesclar(lista: Extrato[], novo: Extrato): Extrato[] {
  const idx = lista.findIndex((x) => (x.agencia || x.conta) && chave(x) === chave(novo));
  if (idx < 0) return [...lista, novo];
  const atual = lista[idx]!;
  const dias = new Set([...atual.transacoes.map((t) => t.data), ...atual.saldosInformados.map((s) => s.data)]);
  const txNovas = novo.transacoes.filter((t) => !dias.has(t.data));
  const saldosNovos = novo.saldosInformados.filter((s) => !dias.has(s.data));
  const transacoes = [...atual.transacoes, ...txNovas].sort((a, b) => a.data.localeCompare(b.data));
  const saldosInformados = [...atual.saldosInformados, ...saldosNovos].sort((a, b) => a.data.localeCompare(b.data));
  // saldo inicial: o do extrato que começa antes
  const iniAtual = atual.dataSaldoInicial || transacoes[0]?.data || "9999";
  const iniNovo = novo.dataSaldoInicial || novo.transacoes[0]?.data || novo.saldosInformados[0]?.data || "9999";
  const usaNovo = iniNovo < iniAtual && txNovas.length + saldosNovos.length > 0;
  // futuros: mantém apenas os que ainda não aconteceram e não foram lançados
  const lancados = new Set(transacoes.map((t) => `${t.data}|${t.valor}|${t.tipo}`));
  const futuros = [...(atual.futuros ?? []), ...(novo.futuros ?? [])].filter(
    (f, i, arr) => !lancados.has(`${f.data}|${f.valor}|${f.tipo}`) && arr.findIndex((g) => g.data === f.data && g.valor === f.valor && g.descricao === f.descricao) === i,
  );
  const ultimo = saldosInformados.at(-1);
  const m: Extrato = {
    ...atual,
    arquivo: atual.arquivo.includes(novo.arquivo) ? atual.arquivo : `${atual.arquivo}, ${novo.arquivo}`,
    importadoEm: new Date().toISOString(),
    saldoInicial: usaNovo ? novo.saldoInicial : atual.saldoInicial,
    dataSaldoInicial: usaNovo ? novo.dataSaldoInicial : atual.dataSaldoInicial,
    saldoFinalInformado: ultimo?.saldo ?? atual.saldoFinalInformado,
    saldosInformados,
    transacoes,
    futuros,
  };
  return lista.map((x, i) => (i === idx ? m : x));
}

export const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fmtData = (d: string) => d.split("-").reverse().join("/");

export function exportar(nome: string, conteudo: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}
