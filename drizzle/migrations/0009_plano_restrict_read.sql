DROP POLICY "equipe le" ON public.plano_contas;
DROP POLICY "equipe le" ON public.plano_categorias;
CREATE POLICY "membros leem" ON public.plano_contas FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'));
CREATE POLICY "membros leem" ON public.plano_categorias FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'));