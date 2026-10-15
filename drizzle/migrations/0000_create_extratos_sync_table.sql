CREATE TABLE public.extratos (
  id text PRIMARY KEY,
  user_id uuid NOT NULL,
  dados jsonb NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.extratos TO authenticated;
GRANT ALL ON public.extratos TO service_role;

ALTER TABLE public.extratos ENABLE ROW LEVEL SECURITY;

-- Modo equipe: qualquer usuário autenticado vê e edita todos os extratos
CREATE POLICY "equipe le todos" ON public.extratos FOR SELECT TO authenticated USING (true);
CREATE POLICY "equipe insere" ON public.extratos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "equipe atualiza" ON public.extratos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "equipe remove" ON public.extratos FOR DELETE TO authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.extratos;