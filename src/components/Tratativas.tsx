import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { saldoDiario, type Extrato } from "@/lib/extrato/parser";
import { fmt, hoje } from "@/lib/extrato/store";

interface Transf { id: string; data: string; origem: string; destino: string; valor: number }

export function saldoExtrato(e: Extrato) {
  if (e.saldoFinalInformado !== null) return e.saldoFinalInformado;
  return saldoDiario(e).at(-1)?.fechamento ?? e.saldoInicial;
}

const parseValor = (s: string) => Number(s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
const nome = (e: Extrato) => `${e.banco} · ${e.conta || "—"}`;

export function Tratativas({ lista }: { lista: Extrato[] }) {
  const dia = hoje();
  const [transf, setTransf] = useState<Transf[]>([]);
  const [digitado, setDigitado] = useState<Record<string, string>>({});
  const [pedido, setPedido] = useState<{ destino: Extrato; valor: number } | null>(null);
  const [origem, setOrigem] = useState("");

  async function carregar() {
    const { data } = await supabase.from("transferencias").select("*").eq("data", dia).order("criado_em");
    setTransf((data ?? []).map((r) => ({ ...r, valor: Number(r.valor) })));
  }
  useEffect(() => {
    carregar();
    const ch = supabase.channel("transf").on("postgres_changes", { event: "*", schema: "public", table: "transferencias" }, carregar).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const linhas = useMemo(() => lista.map((e) => {
    const base = saldoExtrato(e);
    const ent = transf.filter((t) => t.destino === e.id).reduce((a, t) => a + t.valor, 0);
    const sai = transf.filter((t) => t.origem === e.id).reduce((a, t) => a + t.valor, 0);
    return { e, base, ent, sai, final: Math.round((base + ent - sai) * 100) / 100 };
  }), [lista, transf]);

  const total = linhas.reduce((a, l) => a + l.final, 0);

  function pedir(e: Extrato) {
    const v = parseValor(digitado[e.id] ?? "");
    if (v <= 0) { toast.error("Informe um valor maior que zero."); return; }
    setOrigem("");
    setPedido({ destino: e, valor: v });
  }

  async function confirmar() {
    if (!pedido || !origem) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("transferencias").insert({
      user_id: u.user!.id, data: dia, origem, destino: pedido.destino.id, valor: pedido.valor,
    });
    if (error) { toast.error("Não foi possível salvar a transferência."); return; }
    setDigitado((d) => ({ ...d, [pedido.destino.id]: "" }));
    setPedido(null);
    toast.success("Transferência registrada.");
    carregar();
  }

  async function desfazer(id: string) {
    await supabase.from("transferencias").delete().eq("id", id);
    carregar();
  }

  const porId = (id: string) => lista.find((e) => e.id === id);
  const origemSel = linhas.find((l) => l.e.id === origem);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">Balanço do dia</h3>
          <span className="text-sm text-muted-foreground">Total geral: <span className="num font-semibold text-foreground">{fmt(total)}</span></span>
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Banco</TableHead><TableHead className="text-right">Saldo do extrato</TableHead>
            <TableHead className="text-right">Recebido</TableHead><TableHead className="text-right">Enviado</TableHead>
            <TableHead className="text-right">Saldo após ajustes</TableHead><TableHead>Valor a transferir</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {linhas.map(({ e, base, ent, sai, final }) => (
              <TableRow key={e.id}>
                <TableCell><div className="font-medium">{e.banco}</div><div className="text-xs text-muted-foreground">Ag {e.agencia || "—"} · CC {e.conta || "—"}</div></TableCell>
                <TableCell className={`num text-right ${base < 0 ? "text-debit" : ""}`}>{fmt(base)}</TableCell>
                <TableCell className="num text-right text-credit">{ent ? fmt(ent) : "—"}</TableCell>
                <TableCell className="num text-right text-debit">{sai ? fmt(sai) : "—"}</TableCell>
                <TableCell className={`num text-right font-semibold ${final < 0 ? "text-debit" : final === 0 ? "text-muted-foreground" : "text-credit"}`}>{fmt(final)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Input className="h-8 w-36" inputMode="decimal" placeholder={final < 0 ? fmt(-final) : "0,00"}
                      value={digitado[e.id] ?? ""} onChange={(ev) => setDigitado((d) => ({ ...d, [e.id]: ev.target.value }))}
                      onKeyDown={(ev) => ev.key === "Enter" && pedir(e)} />
                    <Button size="sm" variant="outline" onClick={() => pedir(e)}><ArrowRightLeft /> Cobrir</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Transferências de hoje</h3>
        {transf.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma transferência registrada hoje.</p> : (
          <Table><TableBody>
            {transf.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{porId(t.origem) ? nome(porId(t.origem)!) : "conta removida"}</TableCell>
                <TableCell className="text-muted-foreground">→</TableCell>
                <TableCell>{porId(t.destino) ? nome(porId(t.destino)!) : "conta removida"}</TableCell>
                <TableCell className="num text-right font-semibold">{fmt(t.valor)}</TableCell>
                <TableCell className="w-10"><Button variant="ghost" size="icon" aria-label="Desfazer" onClick={() => desfazer(t.id)}><Trash2 /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        )}
      </Card>

      <Dialog open={!!pedido} onOpenChange={(o) => !o && setPedido(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>De onde sairá o valor?</DialogTitle>
            <DialogDescription>{pedido && <>Transferir <b>{fmt(pedido.valor)}</b> para <b>{nome(pedido.destino)}</b>.</>}</DialogDescription>
          </DialogHeader>
          <Select value={origem} onValueChange={setOrigem}>
            <SelectTrigger><SelectValue placeholder="Escolha o banco de origem" /></SelectTrigger>
            <SelectContent>
              {linhas.filter((l) => l.e.id !== pedido?.destino.id).map((l) => (
                <SelectItem key={l.e.id} value={l.e.id}>{nome(l.e)} — {fmt(l.final)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {origemSel && pedido && origemSel.final - pedido.valor < 0 && (
            <p className="text-sm text-debit">Atenção: o banco de origem ficará com {fmt(origemSel.final - pedido.valor)}.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPedido(null)}>Cancelar</Button>
            <Button disabled={!origem} onClick={confirmar}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
