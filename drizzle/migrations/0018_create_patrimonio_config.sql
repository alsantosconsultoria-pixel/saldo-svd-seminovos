CREATE TABLE public.patrimonio_config (
  id text PRIMARY KEY,
  user_id uuid NOT NULL,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.patrimonio_config TO authenticated;
GRANT ALL ON public.patrimonio_config TO service_role;

ALTER TABLE public.patrimonio_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipe le configuracao patrimonio"
ON public.patrimonio_config FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'user'::public.app_role));

CREATE POLICY "equipe cria configuracao patrimonio"
ON public.patrimonio_config FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'user'::public.app_role)));

CREATE POLICY "equipe atualiza configuracao patrimonio"
ON public.patrimonio_config FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'user'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'user'::public.app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.patrimonio_config;