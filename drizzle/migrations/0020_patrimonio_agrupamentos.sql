CREATE TABLE public.patrimonio_agrupamentos (id text PRIMARY KEY DEFAULT 'geral' CHECK (id = 'geral'), grupos jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(grupos) = 'array'));
GRANT SELECT, INSERT, UPDATE ON public.patrimonio_agrupamentos TO authenticated;
GRANT ALL ON public.patrimonio_agrupamentos TO service_role;
ALTER TABLE public.patrimonio_agrupamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe le agrupamentos" ON public.patrimonio_agrupamentos FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'));
CREATE POLICY "admin insere agrupamentos" ON public.patrimonio_agrupamentos FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin altera agrupamentos" ON public.patrimonio_agrupamentos FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
ALTER PUBLICATION supabase_realtime ADD TABLE public.patrimonio_agrupamentos;