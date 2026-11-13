CREATE TABLE public.tratativa_selecao (
  dia date PRIMARY KEY,
  desmarcados text[] NOT NULL DEFAULT '{}',
  incluidos uuid[] NOT NULL DEFAULT '{}',
  manuais jsonb NOT NULL DEFAULT '[]'::jsonb,
  user_id uuid NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tratativa_selecao TO authenticated;
GRANT ALL ON public.tratativa_selecao TO service_role;
ALTER TABLE public.tratativa_selecao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "membros leem" ON public.tratativa_selecao FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'));
CREATE POLICY "membros inserem" ON public.tratativa_selecao FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user')) AND auth.uid() = user_id);
CREATE POLICY "membros atualizam" ON public.tratativa_selecao FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user')) WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user')) AND auth.uid() = user_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.tratativa_selecao;