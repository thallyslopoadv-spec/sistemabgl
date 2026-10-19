-- Esquema do Sistema BGL no Supabase.
--
-- Rode este arquivo inteiro uma única vez, no SQL Editor do projeto.
--
-- Modelo: a base do escritório continua sendo um único documento JSON (o
-- mesmo que hoje fica no Gist), guardado na tabela "base". A diferença é o
-- que fica em volta dele:
--   · só contas cadastradas em "membros" leem ou gravam (RLS);
--   · cada gravação envia apenas as partes que mudaram e informa sobre qual
--     versão foi feita. Se outra pessoa gravou antes, nada é sobrescrito: o
--     aplicativo recebe o aviso, mescla e tenta de novo;
--   · uma cópia da base é guardada no histórico no máximo uma vez por hora;
--   · cada gravação registra quem gravou e quais partes mudaram.
-- Nenhuma tabela aceita gravação direta; tudo passa pelas funções abaixo.

-- ─── TABELAS ───────────────────────────────────────────────
create table public.membros(
  user_id    uuid primary key references auth.users(id) on delete cascade,
  usuario    text not null unique,   -- o "usuário" do sistema (DB.usuarios[].user)
  nome       text not null,
  criado_em  timestamptz not null default now()
);

create table public.base(
  id             smallint primary key default 1 check (id = 1),
  dados          jsonb not null default '{}'::jsonb,
  versao         bigint not null default 0,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);
insert into public.base(id) values (1);

create table public.base_historico(
  id         bigint generated always as identity primary key,
  versao     bigint not null,
  dados      jsonb not null,
  gravado_em timestamptz not null default now()
);
create index base_historico_gravado_em on public.base_historico(gravado_em);

create table public.alteracoes_log(
  id      bigint generated always as identity primary key,
  versao  bigint not null,
  usuario uuid references auth.users(id) on delete set null,
  chaves  text[] not null,
  em      timestamptz not null default now()
);
create index alteracoes_log_em on public.alteracoes_log(em);

-- ─── ACESSO ────────────────────────────────────────────────
alter table public.membros        enable row level security;
alter table public.base           enable row level security;
alter table public.base_historico enable row level security;
alter table public.alteracoes_log enable row level security;

create function public.eh_membro() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.membros where user_id = (select auth.uid())) $$;

create policy "cada um vê o próprio cadastro" on public.membros
  for select to authenticated using (user_id = (select auth.uid()));
create policy "membros leem a base" on public.base
  for select to authenticated using ((select public.eh_membro()));
create policy "membros leem o histórico" on public.base_historico
  for select to authenticated using ((select public.eh_membro()));
create policy "membros leem o registro de alterações" on public.alteracoes_log
  for select to authenticated using ((select public.eh_membro()));

-- o Supabase concede tudo por padrão aos papéis da API; aqui sobra só a leitura,
-- e só para quem fez login (as políticas acima ainda filtram por membro)
revoke all on public.membros, public.base, public.base_historico, public.alteracoes_log from anon, authenticated;
grant select on public.membros, public.base, public.base_historico, public.alteracoes_log to authenticated;

-- ─── GRAVAÇÃO ──────────────────────────────────────────────
-- p_versao_base: a versão sobre a qual o aplicativo fez as alterações.
-- p_alteracoes:  só as chaves de primeiro nível que mudaram; valor null apaga a chave.
-- Retorna {ok:true, versao:nova} ou, se alguém gravou antes, {ok:false, versao:atual}.
create function public.gravar_alteracoes(p_versao_base bigint, p_alteracoes jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_atual   public.base%rowtype;
  v_remover text[];
  v_nova    bigint;
begin
  if not public.eh_membro() then
    raise exception 'sem acesso à base do escritório' using errcode = '42501';
  end if;
  if p_alteracoes is null or jsonb_typeof(p_alteracoes) <> 'object' then
    raise exception 'alterações inválidas' using errcode = '22023';
  end if;

  select * into v_atual from public.base where id = 1 for update;
  if v_atual.versao = 0 then
    raise exception 'a base ainda está vazia; faça primeiro a importação inicial' using errcode = '55000';
  end if;
  if v_atual.versao <> p_versao_base then
    return jsonb_build_object('ok', false, 'versao', v_atual.versao);
  end if;

  -- cópia da versão anterior, no máximo uma por hora
  if v_atual.versao > 0 and not exists(
    select 1 from public.base_historico where gravado_em > now() - interval '1 hour') then
    insert into public.base_historico(versao, dados) values (v_atual.versao, v_atual.dados);
    perform public.podar_historico();
  end if;

  select coalesce(array_agg(key), '{}') into v_remover
    from jsonb_each(p_alteracoes) where value = 'null'::jsonb;
  v_nova := v_atual.versao + 1;
  update public.base
     set dados = (dados || p_alteracoes) - v_remover,
         versao = v_nova, atualizado_em = now(), atualizado_por = auth.uid()
   where id = 1;
  insert into public.alteracoes_log(versao, usuario, chaves)
    values (v_nova, auth.uid(), array(select jsonb_object_keys(p_alteracoes)));
  return jsonb_build_object('ok', true, 'versao', v_nova);
end $$;

-- Primeira carga: só funciona com a base vazia. Não há como, por engano,
-- substituir uma base em uso por um backup importado.
create function public.importar_base_inicial(p_dados jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_atual public.base%rowtype;
begin
  if not public.eh_membro() then
    raise exception 'sem acesso à base do escritório' using errcode = '42501';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object'
     or coalesce(jsonb_typeof(p_dados -> 'usuarios'), '') <> 'array' then
    raise exception 'o arquivo não contém uma base válida do sistema' using errcode = '22023';
  end if;
  select * into v_atual from public.base where id = 1 for update;
  if v_atual.versao <> 0 or v_atual.dados <> '{}'::jsonb then
    raise exception 'a base já tem dados; a importação inicial só vale para uma base vazia' using errcode = '55000';
  end if;
  update public.base
     set dados = p_dados, versao = 1, atualizado_em = now(), atualizado_por = auth.uid()
   where id = 1;
  insert into public.alteracoes_log(versao, usuario, chaves) values (1, auth.uid(), array['importação inicial']);
  return jsonb_build_object('ok', true, 'versao', 1);
end $$;

-- Mantém tudo das últimas 48 horas, a última cópia de cada dia até 60 dias,
-- e o registro de alterações por 180 dias.
create function public.podar_historico() returns void
language sql security definer set search_path = ''
as $$
  delete from public.base_historico h
   where h.gravado_em < now() - interval '60 days'
      or (h.gravado_em < now() - interval '48 hours'
          and h.id not in (
            select distinct on ((gravado_em at time zone 'America/Sao_Paulo')::date) id
              from public.base_historico
             order by (gravado_em at time zone 'America/Sao_Paulo')::date, gravado_em desc));
  delete from public.alteracoes_log where em < now() - interval '180 days';
$$;

revoke execute on function public.gravar_alteracoes(bigint, jsonb), public.importar_base_inicial(jsonb),
  public.podar_historico(), public.eh_membro() from public, anon, authenticated;
grant execute on function public.gravar_alteracoes(bigint, jsonb), public.importar_base_inicial(jsonb)
  to authenticated;
grant execute on function public.eh_membro() to authenticated;
