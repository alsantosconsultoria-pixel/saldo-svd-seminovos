import { useEffect, useState, useCallback } from "react";
import type { Extrato } from "./parser";
import seed from "./seed.json";

const KEY = "extratos-v1";
const demo = seed as Extrato;

export function useExtratos() {
  const [lista, setLista] = useState<Extrato[]>([]);
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    const raw = localStorage.getItem(KEY);
    setLista(raw ? JSON.parse(raw) : [demo]);
    setPronto(true);
  }, []);
  useEffect(() => {
    if (pronto) localStorage.setItem(KEY, JSON.stringify(lista));
  }, [lista, pronto]);
  const add = useCallback((e: Extrato) => setLista((l) => [...l, e]), []);
  const remove = useCallback((id: string) => setLista((l) => l.filter((x) => x.id !== id)), []);
  const reset = useCallback(() => setLista([demo]), []);
  return { lista, add, remove, reset, pronto };
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
