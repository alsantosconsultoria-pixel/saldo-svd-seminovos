DROP POLICY IF EXISTS "dono atualiza" ON public.extratos;
CREATE POLICY "membros atualizam" ON public.extratos FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'));