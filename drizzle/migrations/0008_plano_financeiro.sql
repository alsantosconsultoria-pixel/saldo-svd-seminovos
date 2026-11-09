CREATE TABLE public.plano_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('credito','debito')),
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plano_contas TO authenticated;
GRANT ALL ON public.plano_contas TO service_role;
ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe le" ON public.plano_contas FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin grava" ON public.plano_contas FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.plano_categorias (
  categoria text PRIMARY KEY,
  conta_id uuid NOT NULL REFERENCES public.plano_contas(id) ON DELETE CASCADE
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plano_categorias TO authenticated;
GRANT ALL ON public.plano_categorias TO service_role;
ALTER TABLE public.plano_categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe le" ON public.plano_categorias FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin grava" ON public.plano_categorias FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));