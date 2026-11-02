DROP POLICY IF EXISTS "equipe le" ON public.realizados;
CREATE POLICY "dono le" ON public.realizados FOR SELECT TO authenticated USING (auth.uid() = user_id);