CREATE TABLE public.realizados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  chave text NOT NULL UNIQUE,
  tipo text NOT NULL,
  data date NOT NULL,
  conta text NOT NULL DEFAULT '',
  contraparte text NOT NULL DEFAULT '',
  descricao text NOT NULL DEFAULT '',
  documento text NOT NULL DEFAULT '',
  categoria text NOT NULL DEFAULT '',
  valor numeric NOT NULL,
  arquivo text NOT NULL DEFAULT '',
  vinculo text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.realizados TO authenticated;
GRANT ALL ON public.realizados TO service_role;
ALTER TABLE public.realizados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe le" ON public.realizados FOR SELECT TO authenticated USING (true);
CREATE POLICY "equipe insere" ON public.realizados FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dono atualiza" ON public.realizados FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dono remove" ON public.realizados FOR DELETE TO authenticated USING (auth.uid() = user_id);