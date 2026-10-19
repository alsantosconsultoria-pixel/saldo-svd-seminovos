CREATE TABLE public.transferencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  data date NOT NULL DEFAULT current_date,
  origem text NOT NULL,
  destino text NOT NULL,
  valor numeric(14,2) NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transferencias TO authenticated;
GRANT ALL ON public.transferencias TO service_role;
ALTER TABLE public.transferencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe le" ON public.transferencias FOR SELECT TO authenticated USING (true);
CREATE POLICY "equipe insere" ON public.transferencias FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "equipe remove" ON public.transferencias FOR DELETE TO authenticated USING (true);

CREATE TABLE public.previsoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipo text NOT NULL,
  vencimento date NOT NULL,
  descricao text NOT NULL DEFAULT '',
  contraparte text NOT NULL DEFAULT '',
  banco text NOT NULL DEFAULT '',
  categoria text NOT NULL DEFAULT '',
  valor numeric(14,2) NOT NULL,
  arquivo text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.previsoes TO authenticated;
GRANT ALL ON public.previsoes TO service_role;
ALTER TABLE public.previsoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe le" ON public.previsoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "equipe insere" ON public.previsoes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "equipe remove" ON public.previsoes FOR DELETE TO authenticated USING (true);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transferencias;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.previsoes;
  END IF;
END $$;