DROP POLICY IF EXISTS "dono remove" ON public.extratos;
CREATE POLICY "membros removem" ON public.extratos FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));