import { useCallback, useEffect, useState } from "react";
import { Database, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KEY as CHAVE_EXTRATOS } from "@/lib/extrato/store";
import { contarDados, limparDados, type Grupo } from "@/lib/admin.functions";

const ROTULOS: Record<Grupo, string> = {
  extratos: "Extratos importados",
  previsoes: "Previsões do fluxo",
  realizados: "Realizado importado",
  transferencias: "Transferências das tratativas",
  demonstrativos: "Aprovações da diretoria",
};
const ORDEM: Grupo[] = ["extratos", "previsoes", "realizados", "transferencias", "demonstrativos"];
const msg = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir.");

export function AdminDados() {
  const [totais, setTotais] = useState<Record<string, number>>({});
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => contarDados().then(setTotais).catch((e) => toast.error(msg(e))), []);
  useEffect(() => { carregar(); }, [carregar]);

  async function apagar(grupos: Grupo[], aviso: string) {
    if (!confirm(aviso)) return;
    setOcupado(true);
    try {
      const { apagados } = await limparDados({ data: { grupos } });
      const n = Object.values(apagados).reduce((a, b) => a + b, 0);
      // a cópia local precisa ficar vazia, senão o app reenvia o que apagou
      if (grupos.includes("extratos")) localStorage.setItem(CHAVE_EXTRATOS, "[]");
      toast.success(`${n} registro(s) apagado(s). Recarregando...`);
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      toast.error(msg(e));
      setOcupado(false);
      carregar();
    }
  }

  return (
    <Card className="p-5">
      <h3 className="mb-1 flex items-center gap-2 font-semibold"><Database className="size-4" /> Limpar dados</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Apaga o que está gravado na nuvem para toda a equipe, em todos os dispositivos. Não dá para desfazer.
      </p>
      <ul className="space-y-2">
        {ORDEM.map((g) => (
          <li key={g} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
            <span className="text-sm">
              {ROTULOS[g]}
              <span className="num ml-2 text-xs text-muted-foreground">{totais[g] ?? "—"} registro(s)</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={ocupado || !totais[g]}
              onClick={() => apagar([g], `Apagar todos os ${ROTULOS[g].toLowerCase()}?`)}
            >
              <Trash2 /> Apagar
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-5 border-t pt-4">
        <h4 className="text-sm font-semibold">Limpar tudo</h4>
        <p className="mb-2 text-xs text-muted-foreground">Digite LIMPAR para confirmar.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Input className="w-40" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="LIMPAR" />
          <Button
            variant="destructive"
            disabled={ocupado || texto.trim().toUpperCase() !== "LIMPAR"}
            onClick={() => apagar(ORDEM, "Apagar TODOS os dados de toda a equipe? Esta ação não pode ser desfeita.")}
          >
            <Trash2 /> Apagar tudo
          </Button>
          <Button variant="ghost" size="sm" onClick={carregar}><RotateCcw /> Atualizar contagem</Button>
        </div>
      </div>
    </Card>
  );
}
