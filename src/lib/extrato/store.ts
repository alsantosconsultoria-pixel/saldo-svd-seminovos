import { useEffect, useState, useCallback, useRef } from "react";
import type { Extrato, Tipo } from "./parser";
import seed from "./seed.json";
import { supabase } from "@/integrations/supabase/client";

const KEY = "extratos-v2";
const demo = seed as unknown as Extrato[];

// Extratos sincronizados na nuvem (Lovable Cloud): qualquer dispositivo com
// login vê e altera os mesmos dados. localStorage fica só como cópia local
// para abrir rápido e funcionar sem internet momentaneamente.
export function useExtratos() {
  const [lista, setLista] = useState<Extrato[]>([]);
  const [pronto, setPronto] = useState(false);
  const remoto = useRef(false); // já carregou da nuvem
  const aplicandoRemoto = useRef(false); // evita eco: mudança vinda da nuvem não regrava

  // carga inicial: cópia local imediata, depois a nuvem manda
  useEffect(() => {
    const raw = localStorage.getItem(KEY);
    setLista(raw ? JSON.parse(raw) : demo);
    setPronto(true);
  }, []);

  // busca na nuvem e assina mudanças em tempo real (outros dispositivos)
  useEffect(() => {
    if (!pronto) return;
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let ativo = true;

    (async () => {
      const { data: sessao } = await supabase.auth.getUser();
      if (!sessao.user || !ativo) return;
      const { data, error } = await supabase.from("extratos").select("id, dados");
      if (!ativo) return;
      if (error) {
        console.error("Falha ao carregar extratos da nuvem", error);
        return;
      }
      const naNuvem = (data ?? []).map((r) => r.dados as unknown as Extrato);
      remoto.current = true;
      if (naNuvem.length) {
        // mescla nuvem com o que só existe localmente (ex.: dados deste PC antes do login)
        setLista((local) => {
          let merged = naNuvem;
          local.forEach((e) => {
            if (!naNuvem.some((n) => n.id === e.id)) merged = mesclar(merged, e);
          });
          return merged;
        });
      } else {
        // nuvem vazia: sobe o que há localmente
        setLista((local) => {
          local.forEach((e) => void subir(e));
          return local;
        });
      }
      canal = supabase
        .channel("extratos-sync")
        .on("postgres_changes", { event: "*", schema: "public", table: "extratos" }, (payload) => {
          aplicandoRemoto.current = true;
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string }).id;
            if (id) setLista((l) => l.filter((x) => x.id !== id));
          } else {
            const e = (payload.new as { dados: Extrato }).dados;
            setLista((l) => {
              const sem = l.filter((x) => x.id !== e.id);
              return [...sem, e];
            });
          }
          setTimeout(() => (aplicandoRemoto.current = false), 0);
        })
        .subscribe();
    })();

    return () => {
      ativo = false;
      if (canal) supabase.removeChannel(canal);
    };
  }, [pronto]);

  // grava cópia local sempre que a lista muda
  useEffect(() => {
    if (pronto) localStorage.setItem(KEY, JSON.stringify(lista));
  }, [lista, pronto]);

  const subir = useCallback(async (e: Extrato) => {
    const { data: sessao } = await supabase.auth.getUser();
    if (!sessao.user) return;
    const { error } = await supabase
      .from("extratos")
      .upsert({ id: e.id, user_id: sessao.user.id, dados: JSON.parse(JSON.stringify(e)), atualizado_em: new Date().toISOString() });
    if (error) console.error("Falha ao sincronizar extrato", error);
  }, []);

  const add = useCallback(
    (e: Extrato) =>
      setLista((l) => {
        const nova = mesclar(l, e);
        if (!aplicandoRemoto.current) {
          // mesclar pode fundir em conta existente: grava a conta resultante
          const alvo = nova.find((x) => x.id === e.id) ?? nova.find((x) => !l.some((o) => o.id === x.id));
          const antes = l.find((x) => x.id === alvo?.id);
          if (alvo && JSON.stringify(antes) !== JSON.stringify(alvo)) void subir(alvo);
        }
        return nova;
      }),
    [subir],
  );

  const remove = useCallback((id: string) => {
    setLista((l) => l.filter((x) => x.id !== id));
    void supabase.from("extratos").delete().eq("id", id).then(({ error }) => {
      if (error) console.error("Falha ao remover extrato da nuvem", error);
    });
  }, []);

  const reset = useCallback(() => {
    setLista(demo);
    demo.forEach((e) => void subir(e));
  }, [subir]);

  return { lista, add, remove, reset, pronto };
}

const chave = (e: Extrato) => `${e.banco}|${e.agencia.replace(/\D/g, "")}|${e.conta.replace(/\D/g, "")}`;
export const hoje = () => new Date().toISOString().slice(0, 10);

// Junta extrato da mesma conta/agência: acrescenta só as datas que ainda não existem
export function mesclar(lista: Extrato[], novo: Extrato): Extrato[] {
  let idx = lista.findIndex((x) => (x.agencia || x.conta) && chave(x) === chave(novo));
  // extrato sem agência/conta legível (ex.: escaneado): junta à única conta do mesmo banco
  const semConta = (e: Extrato) => !e.agencia && !e.conta;
  if (idx < 0) {
    const mesmos = lista.map((x, i) => [x, i] as const).filter(([x]) => x.banco === novo.banco);
    if (mesmos.length === 1 && (semConta(novo) || semConta(mesmos[0]![0]))) idx = mesmos[0]![1];
  }
  if (idx >= 0 && semConta(lista[idx]!) && !semConta(novo)) {
    lista = lista.map((x, i) => (i === idx ? { ...x, agencia: novo.agencia, conta: novo.conta } : x));
  }
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
  // futuros: vale a previsão do extrato mais recente (substitui a anterior); remove os já lançados
  const ref = (e: Extrato) =>
    [...e.transacoes.map((t) => t.data), ...e.saldosInformados.map((s) => s.data)].sort().at(-1) ??
    (e.futuros ?? []).map((t) => t.data).sort()[0] ?? "";
  const base = ref(novo) >= ref(atual) ? (novo.futuros ?? []) : (atual.futuros ?? []);
  const futuros = base.filter((f) => !lancados.has(`${f.data}|${f.valor}|${f.tipo}`));
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

// Reconstrói extratos a partir do JSON exportado pelo app (extratos.json)
export function deJSON(texto: string): Extrato[] {
  const arr = JSON.parse(texto) as unknown;
  if (!Array.isArray(arr)) throw new Error("esperado array de contas");
  return arr.map((bruto, i) => {
    const o = bruto as Record<string, unknown>;
    const diario = (Array.isArray(o["saldo_diario"]) ? o["saldo_diario"] : []) as Record<string, unknown>[];
    const saldosInformados = diario
      .filter((d) => typeof d["informado"] === "number")
      .map((d) => ({ data: String(d["data"]), saldo: Number(d["informado"]) }));
    const transacoes = ((Array.isArray(o["transacoes"]) ? o["transacoes"] : []) as Record<string, unknown>[]).map((t, j) => ({
      id: `json-${i}-${j}`,
      data: String(t["data"] ?? ""),
      descricao: String(t["descricao"] ?? ""),
      contraparte: String(t["contraparte"] ?? ""),
      documento: String(t["documento"] ?? ""),
      valor: Number(t["valor"]) || 0,
      tipo: (t["tipo"] === "D" ? "D" : "C") as Tipo,
    }));
    const saldoFinal =
      o["saldo_final_informado"] == null
        ? (saldosInformados.at(-1)?.saldo ?? null)
        : Number(o["saldo_final_informado"]);
    return {
      id: `json-${i}`,
      banco: String(o["banco"] ?? "Banco"),
      agencia: String(o["agencia"] ?? ""),
      conta: String(o["conta"] ?? ""),
      titular: String(o["titular"] ?? ""),
      arquivo: "restaurado de JSON",
      importadoEm: new Date().toISOString(),
      saldoInicial: Number(o["saldo_inicial"]) || 0,
      dataSaldoInicial: transacoes[0]?.data || saldosInformados[0]?.data || "",
      saldoFinalInformado: saldoFinal,
      saldosInformados,
      transacoes,
    };
  });
}

export function exportar(nome: string, conteudo: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}
