DROP POLICY IF EXISTS "dono remove" ON public.previsoes;
CREATE POLICY "equipe remove" ON public.previsoes
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'user'::public.app_role));

DROP POLICY IF EXISTS "dono remove" ON public.realizados;
CREATE POLICY "equipe remove" ON public.realizados
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'user'::public.app_role));