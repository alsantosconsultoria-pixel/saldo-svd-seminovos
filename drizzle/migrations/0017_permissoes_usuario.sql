CREATE TABLE public.permissoes_usuario (
  user_id uuid PRIMARY KEY,
  abas text[] NOT NULL DEFAULT ARRAY['painel','diario','lanc','contas','tratativas','previsoes'],
  importacoes text[] NOT NULL DEFAULT ARRAY['extrato','previsoes','realizado'],
  backup boolean NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.permissoes_usuario TO authenticated;
GRANT ALL ON public.permissoes_usuario TO service_role;
ALTER TABLE public.permissoes_usuario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proprio ou admin le" ON public.permissoes_usuario FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin grava" ON public.permissoes_usuario FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
ALTER PUBLICATION supabase_realtime ADD TABLE public.permissoes_usuario;