import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — SVD Controle de Saldos" },
      { name: "description", content: "Acesse o controle de saldos do Grupo SVD." },
      { property: "og:title", content: "Entrar — SVD Controle de Saldos" },
      { property: "og:description", content: "Acesse o controle de saldos do Grupo SVD." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [modo, setModo] = useState<"entrar" | "cadastrar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    setEnviando(true);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        navigate({ to: "/", replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) {
          navigate({ to: "/", replace: true });
        } else {
          toast.success("Cadastro criado! Confirme o e-mail que enviamos para entrar.");
          setModo("entrar");
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível entrar. Confira e-mail e senha.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm space-y-6 p-8">
        <div className="space-y-1 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Grupo SVD</p>
          <h1 className="text-2xl font-semibold">Controle de Saldos</h1>
          <p className="text-sm text-muted-foreground">
            {modo === "entrar" ? "Entre para acessar os extratos da equipe." : "Crie seu acesso com e-mail e senha."}
          </p>
        </div>
        <form onSubmit={enviar} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input id="senha" type="password" required minLength={6} autoComplete={modo === "entrar" ? "current-password" : "new-password"} value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando ? "Aguarde..." : modo === "entrar" ? "Entrar" : "Criar conta"}
          </Button>
        </form>
        <button
          type="button"
          className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setModo(modo === "entrar" ? "cadastrar" : "entrar")}
        >
          {modo === "entrar" ? "Ainda não tem acesso? Criar conta" : "Já tem conta? Entrar"}
        </button>
      </Card>
    </div>
  );
}
