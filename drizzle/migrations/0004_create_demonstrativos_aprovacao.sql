CREATE TABLE public.demonstrativos (
  id uuid primary key default gen_random_uuid(),
  token uuid not null default gen_random_uuid() unique,
  user_id uuid not null,
  criador_email text not null default '',
  data date not null,
  conteudo jsonb not null,
  decisao text,
  ressalvas text not null default '',
  aprovado_por text not null default '',
  decidido_em timestamptz,
  criado_em timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demonstrativos TO authenticated;
GRANT ALL ON public.demonstrativos TO service_role;
ALTER TABLE public.demonstrativos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe le" ON public.demonstrativos FOR SELECT TO authenticated USING (true);
CREATE POLICY "dono insere" ON public.demonstrativos FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dono atualiza" ON public.demonstrativos FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dono remove" ON public.demonstrativos FOR DELETE TO authenticated USING (auth.uid() = user_id);