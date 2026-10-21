import { useState } from "react";
import { Copy, Download, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { documentoRelatorio, emailRelatorio } from "@/lib/relatorio-email";
import { exportar } from "@/lib/extrato/store";

interface Props { titulo: string; resumo: string; arquivo: string; obterRelatorio: () => HTMLElement | null; disabled?: boolean }
export function CompartilharRelatorio({ titulo, resumo, arquivo, obterRelatorio, disabled }: Props) {
  const [aberto, setAberto] = useState(false);
  const [destinatario, setDestinatario] = useState("");
  function documento() {
    const el = obterRelatorio();
    if (!el) { toast.error("Abra o relatório antes de compartilhar."); return null; }
    return documentoRelatorio(el, titulo);
  }
  function baixar() {
    const doc = documento();
    if (!doc) return;
    exportar(`${arquivo}.html`, doc.html, "text/html;charset=utf-8");
    toast.success("Relatório baixado. Anexe o arquivo ao e-mail.");
  }
  async function copiar() {
    const doc = documento();
    if (!doc) return;
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        toast.error("Este navegador não permite copiar o formato. Baixe o relatório para anexar."); return;
      }
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([doc.html], { type: "text/html" }),
        "text/plain": new Blob([doc.texto], { type: "text/plain" }),
      })]);
      toast.success("Relatório copiado. Cole no corpo do e-mail.");
    } catch { toast.error("Não foi possível copiar. Baixe o relatório para anexar."); }
  }
  return <>
    <Button variant="outline" disabled={disabled} onClick={() => setAberto(true)}><Mail /> E-mail</Button>
    <Dialog open={aberto} onOpenChange={setAberto}><DialogContent>
      <DialogHeader><DialogTitle>Enviar relatório por e-mail</DialogTitle><DialogDescription>Copie o relatório para colar no e-mail ou baixe o arquivo para anexar. O aplicativo do dispositivo não permite anexar automaticamente; a aparência ao colar depende do seu e-mail. Para PDF, use Imprimir / PDF.</DialogDescription></DialogHeader>
      <div className="space-y-2"><Label htmlFor={`email-${arquivo}`}>Destinatário (opcional)</Label><Input id={`email-${arquivo}`} type="email" value={destinatario} onChange={(e) => setDestinatario(e.target.value)} placeholder="E-mail da diretoria" /></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={copiar}><Copy /> Copiar formatado</Button><Button variant="outline" onClick={baixar}><Download /> Baixar relatório</Button></div>
      <Button onClick={() => {
        if (destinatario && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) { toast.error("Informe um e-mail válido."); return; }
        window.location.href = emailRelatorio(destinatario, titulo, resumo);
      }}><Mail /> Abrir e-mail do dispositivo</Button>
    </DialogContent></Dialog>
  </>;
}