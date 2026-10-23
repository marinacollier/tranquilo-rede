-- Rede Tranquilo — banco de contas, inscrições e prontidão.
-- Rode este arquivo inteiro no SQL Editor do Supabase (uma vez). É idempotente: pode rodar de novo.
--
-- Perfis: artista e casa se cadastram sozinhos; equipe e adm são definidos pela administração.
-- Toda regra de acesso está nas políticas (RLS) abaixo: o navegador só consegue ler e gravar o que a política permite.


-- ---------- tipos ----------
do $$ begin
  create type tipo_perfil as enum ('artista', 'casa', 'equipe', 'adm');
exception when duplicate_object then null; end $$;
do $$ begin
  create type status_inscricao as enum ('rascunho', 'em_curadoria', 'ajustes', 'aprovada', 'reprovada_pre', 'reprovada');
exception when duplicate_object then null; end $$;
do $$ begin
  create type status_casa as enum ('rascunho', 'incompleto', 'em_analise', 'ajustes', 'habilitada', 'suspensa');
exception when duplicate_object then null; end $$;

-- ---------- tabelas ----------
create table if not exists perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nome text not null default '',
  tipo tipo_perfil not null default 'artista',
  whatsapp text,
  codigo_acesso text,          -- código do pacote de métricas vinculado (artista/casa/equipe/adm)
  vinculo_nome text,           -- nome da artista ou casa no Notion ao qual a conta foi vinculada
  criado_em timestamptz not null default now()
);

-- E-mails que viram administração automaticamente ao criar a conta.
create table if not exists admins_iniciais (email text primary key);

create table if not exists inscricoes_artistas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references perfis (id) on delete cascade,
  dados jsonb not null default '{}'::jsonb,   -- respostas do formulário
  status status_inscricao not null default 'rascunho',
  score int,
  faixa text,                                  -- Prioridade / Avaliar / Abaixo do corte
  score_detalhe jsonb,
  alertas jsonb,
  parecer text,                                -- mensagem da curadoria para a artista
  nota_interna text,                           -- só a equipe vê
  avaliado_por uuid references perfis (id),
  avaliado_em timestamptz,
  enviado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists cadastros_casas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references perfis (id) on delete cascade,
  dados jsonb not null default '{}'::jsonb,
  ja_parceira boolean not null default false,
  notion_casa_id text,                         -- quando a casa já existe no Notion
  status status_casa not null default 'rascunho',
  pendencias jsonb,                            -- bloqueios de habilitação / de match
  classificacao text check (classificacao in ('confiavel', 'desenvolvimento', 'correcao', 'suspenso')),
  parecer text,
  nota_interna text,
  avaliado_por uuid references perfis (id),
  avaliado_em timestamptz,
  enviado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Itens de "próximos passos" marcados por artista ou casa em cada data (evento do Notion).
create table if not exists checklist (
  user_id uuid not null references perfis (id) on delete cascade,
  evento_id text not null,
  item text not null,
  feito boolean not null default true,
  nota text,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, evento_id, item)
);

-- Registro da noite pela casa: público, ocorrências e exceções (método V0.1, seções 16 e 17).
create table if not exists registros_noite (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references perfis (id) on delete cascade,
  evento_id text not null,
  publico int,
  ocorrencia text,
  gravidade text check (gravidade in ('ordinaria', 'excecao')),
  como_resolveu text,
  criado_em timestamptz not null default now()
);

-- Códigos dos pacotes de equipe e adm, para quem entra por e-mail ver as métricas.
create table if not exists chaves_internas (
  tipo tipo_perfil primary key,
  codigo text not null
);

-- ---------- funções de apoio ----------
create or replace function eh_equipe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and tipo in ('equipe', 'adm'));
$$;

create or replace function eh_adm() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and tipo = 'adm');
$$;

-- Cria o perfil quando alguém cria a conta. O tipo pedido no cadastro só vale para artista/casa.
-- (Versão final desta função na seção v2, no fim do arquivo.)
create or replace function novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pedido text := coalesce(new.raw_user_meta_data ->> 'tipo', 'artista');
begin
  insert into perfis (id, email, nome, tipo)
  values (
    new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'nome', ''),
    case
      when exists (select 1 from admins_iniciais where email = lower(new.email)) then 'adm'::tipo_perfil
      when pedido = 'casa' then 'casa'::tipo_perfil
      else 'artista'::tipo_perfil
    end
  ) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users for each row execute function novo_usuario();

-- Quem não é adm não muda o próprio tipo nem o vínculo.
create or replace function proteger_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Aplicação de convite (feita pelo próprio banco, ver aplicar_convite) pode trocar tipo e vínculo.
  if current_setting('tq.sistema', true) = '1' then return new; end if;
  if not eh_adm() then
    new.tipo := old.tipo;
    new.email := old.email;
    if new.codigo_acesso is distinct from old.codigo_acesso and old.codigo_acesso is not null then
      new.codigo_acesso := old.codigo_acesso;   -- uma vez vinculada, só a adm troca
      new.vinculo_nome := old.vinculo_nome;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists antes_perfil on perfis;
create trigger antes_perfil before update on perfis for each row execute function proteger_perfil();

-- ---------- pré-curadoria automática ----------
-- Mesma regra do arquivo src/conta.js (função preCuradoria). Se mudar aqui, mude lá.
create or replace function pre_curadoria(d jsonb, cidades_rede text[] default array[
  'São Paulo','Belo Horizonte','Rio de Janeiro','Brasília','Curitiba','Florianópolis','Porto Alegre',
  'Campinas','Santos','Santo André','Sorocaba','Itajaí','Salvador','Recife']) returns jsonb
language plpgsql immutable as $$
declare
  ouvintes int := coalesce(nullif(d ->> 'ouvintes_mensais', '')::int, 0);
  seguidores int := coalesce(nullif(d ->> 'seguidores_instagram', '')::int, 0);
  links int := (case when coalesce(d ->> 'spotify', '') <> '' then 1 else 0 end)
             + (case when coalesce(d ->> 'youtube', '') <> '' then 1 else 0 end)
             + (case when coalesce(d ->> 'outro_link', '') <> '' then 1 else 0 end);
  integrantes int := coalesce(nullif(d ->> 'integrantes', '')::int, 1);
  cache int := coalesce(nullif(d ->> 'cache_minimo', '')::int, 0);
  cidades_ok int := 0;
  completude int := 0; tracao int := 0; tecnica int := 0; circulacao int := 0; condicoes int := 0;
  total int; faixa text; alertas jsonb := '[]'::jsonb;
begin
  -- Completude (20)
  if length(coalesce(d ->> 'release', '')) >= 200 then completude := completude + 5; end if;
  if coalesce(d ->> 'foto', '') <> '' then completude := completude + 5; end if;
  if links >= 2 then completude := completude + 5; end if;
  if coalesce(d ->> 'contato_producao', '') <> '' then completude := completude + 5; end if;
  -- Tração (35)
  tracao := case when ouvintes >= 50000 then 20 when ouvintes >= 10000 then 15 when ouvintes >= 2000 then 10 when ouvintes >= 500 then 5 else 0 end
          + case when seguidores >= 20000 then 15 when seguidores >= 5000 then 10 when seguidores >= 1000 then 5 else 0 end;
  -- Compatibilidade técnica (20) — V0.1, seção 7
  tecnica := case d ->> 'rider_tipo' when 'circulavel' then 20 when 'condicionado' then 10 when 'especial' then 3 else 0 end;
  -- Circulação (15): cidades de interesse que já estão na rede
  select count(*) into cidades_ok
  from jsonb_array_elements_text(coalesce(d -> 'cidades_interesse', '[]'::jsonb)) c
  where c = any (cidades_rede);
  circulacao := least(15, cidades_ok * 5);
  -- Condições (10)
  condicoes := case when (d ->> 'aceita_bonus') = 'true' then 10 when cache > 0 and cache <= 800 then 5 else 0 end;

  total := completude + tracao + tecnica + circulacao + condicoes;
  faixa := case when total >= 65 then 'Prioridade' when total >= 40 then 'Avaliar' else 'Abaixo do corte' end;

  if links = 0 then alertas := alertas || '["Sem link de áudio ou vídeo"]'::jsonb; end if;
  if integrantes > 5 then alertas := alertas || '["Formação com mais de 5 pessoas: rota condicionada"]'::jsonb; end if;
  if d ->> 'rider_tipo' = 'especial' then alertas := alertas || '["Rider de produção especial"]'::jsonb; end if;
  if cache > 1500 then alertas := alertas || '["Cachê mínimo acima de R$ 1.500"]'::jsonb; end if;
  if cidades_ok = 0 then alertas := alertas || '["Nenhuma cidade de interesse na rede atual"]'::jsonb; end if;

  return jsonb_build_object(
    'score', total, 'faixa', faixa, 'alertas', alertas,
    'detalhe', jsonb_build_object('completude', completude, 'tracao', tracao, 'tecnica', tecnica, 'circulacao', circulacao, 'condicoes', condicoes)
  );
end $$;

-- Transições permitidas para a própria artista: rascunho/ajustes → em_curadoria (envio).
-- O score é sempre calculado aqui, no servidor; o que vem do navegador é ignorado.
create or replace function antes_inscricao() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  new.atualizado_em := now();
  if eh_equipe() and tg_op = 'UPDATE' and new.user_id <> auth.uid() then
    if new.status is distinct from old.status then
      new.avaliado_por := auth.uid(); new.avaliado_em := now();
    end if;
    return new;
  end if;
  -- daqui para baixo: a própria artista
  if tg_op = 'UPDATE' then
    if old.status not in ('rascunho', 'ajustes') then
      raise exception 'Inscrição em análise: aguarde o retorno da curadoria.';
    end if;
    new.parecer := old.parecer; new.nota_interna := old.nota_interna;
    new.avaliado_por := old.avaliado_por; new.avaliado_em := old.avaliado_em;
  else
    new.parecer := null; new.nota_interna := null;
  end if;
  if new.status not in ('rascunho', 'em_curadoria') then
    new.status := coalesce(old.status, 'rascunho');
  end if;
  r := pre_curadoria(new.dados);
  new.score := (r ->> 'score')::int; new.faixa := r ->> 'faixa';
  new.score_detalhe := r -> 'detalhe'; new.alertas := r -> 'alertas';
  if new.status = 'em_curadoria' then new.enviado_em := now(); end if;
  return new;
end $$;
drop trigger if exists trg_inscricao on inscricoes_artistas;
create trigger trg_inscricao before insert or update on inscricoes_artistas for each row execute function antes_inscricao();

-- ---------- habilitação mínima de casas (V0.1, seção 8) ----------
create or replace function pendencias_casa(d jsonb) returns jsonb
language plpgsql immutable as $$
declare hab jsonb := '[]'::jsonb; mat jsonb := '[]'::jsonb; enr jsonb := '[]'::jsonb;
begin
  -- Bloqueia habilitação
  if coalesce(d ->> 'responsavel', '') = '' then hab := hab || '["Responsável local"]'; end if;
  if coalesce(d ->> 'whatsapp', '') = '' then hab := hab || '["WhatsApp do responsável"]'; end if;
  if coalesce(d ->> 'endereco', '') = '' or coalesce(d ->> 'cidade', '') = '' then hab := hab || '["Endereço e cidade"]'; end if;
  if coalesce(nullif(d ->> 'capacidade', '')::int, 0) <= 0 then hab := hab || '["Capacidade de público"]'; end if;
  if coalesce(d ->> 'som', '') in ('', 'nao_tem') then hab := hab || '["Como resolve o som (PA próprio ou parceiro técnico)"]'; end if;
  if (d ->> 'aceite_responsabilidades') is distinct from 'true' then hab := hab || '["Aceite da matriz de responsabilidades da casa"]'; end if;
  -- Bloqueia determinado match
  if coalesce(d ->> 'palco', '') = '' then mat := mat || '["Medidas do palco"]'; end if;
  if coalesce(d ->> 'microfones', '') = '' then mat := mat || '["Microfones e DIs disponíveis"]'; end if;
  if coalesce(d ->> 'luz', '') = '' then mat := mat || '["Luz (frontal para rosto)"]'; end if;
  if coalesce(d ->> 'restricoes', '') = '' then mat := mat || '["Restrições de horário e volume"]'; end if;
  if coalesce(d ->> 'camarim', '') = '' then mat := mat || '["Camarim"]'; end if;
  -- Enriquecimento
  if coalesce(d ->> 'backline', '') = '' then enr := enr || '["Backline"]'; end if;
  if coalesce(d ->> 'acessibilidade', '') = '' then enr := enr || '["Acessibilidade"]'; end if;
  if coalesce(d ->> 'instagram', '') = '' then enr := enr || '["Instagram"]'; end if;
  if coalesce(d ->> 'como_chegar', '') = '' then enr := enr || '["Como chegar (transporte e estacionamento)"]'; end if;
  return jsonb_build_object('habilitacao', hab, 'match', mat, 'enriquecimento', enr);
end $$;

create or replace function antes_casa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if eh_equipe() and tg_op = 'UPDATE' and new.user_id <> auth.uid() then
    if new.status is distinct from old.status or new.classificacao is distinct from old.classificacao then
      new.avaliado_por := auth.uid(); new.avaliado_em := now();
    end if;
    new.pendencias := pendencias_casa(new.dados);
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.parecer := old.parecer; new.nota_interna := old.nota_interna; new.classificacao := old.classificacao;
    new.avaliado_por := old.avaliado_por; new.avaliado_em := old.avaliado_em;
    if old.status in ('habilitada', 'suspensa') then new.status := old.status;   -- só atualiza o cadastro
    elsif new.status not in ('rascunho', 'em_analise') then new.status := old.status; end if;
  else
    new.parecer := null; new.nota_interna := null; new.classificacao := null;
    if new.status not in ('rascunho', 'em_analise') then new.status := 'rascunho'; end if;
  end if;
  new.pendencias := pendencias_casa(new.dados);
  if new.status = 'em_analise' then
    if jsonb_array_length(new.pendencias -> 'habilitacao') > 0 then new.status := 'incompleto';
    else new.enviado_em := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_casa on cadastros_casas;
create trigger trg_casa before insert or update on cadastros_casas for each row execute function antes_casa();

-- ---------- permissões (RLS) ----------
alter table perfis enable row level security;
alter table inscricoes_artistas enable row level security;
alter table cadastros_casas enable row level security;
alter table checklist enable row level security;
alter table registros_noite enable row level security;
alter table chaves_internas enable row level security;
alter table admins_iniciais enable row level security;

drop policy if exists perfil_ler on perfis;
create policy perfil_ler on perfis for select using (id = auth.uid() or eh_equipe());
drop policy if exists perfil_editar on perfis;
create policy perfil_editar on perfis for update using (id = auth.uid() or eh_adm());

drop policy if exists insc_ler on inscricoes_artistas;
create policy insc_ler on inscricoes_artistas for select using (user_id = auth.uid() or eh_equipe());
drop policy if exists insc_criar on inscricoes_artistas;
create policy insc_criar on inscricoes_artistas for insert with check (user_id = auth.uid() and exists (select 1 from perfis where id = auth.uid() and tipo = 'artista'));
drop policy if exists insc_editar on inscricoes_artistas;
create policy insc_editar on inscricoes_artistas for update using (user_id = auth.uid() or eh_equipe());

drop policy if exists casa_ler on cadastros_casas;
create policy casa_ler on cadastros_casas for select using (user_id = auth.uid() or eh_equipe());
drop policy if exists casa_criar on cadastros_casas;
create policy casa_criar on cadastros_casas for insert with check (user_id = auth.uid() and exists (select 1 from perfis where id = auth.uid() and tipo = 'casa'));
drop policy if exists casa_editar on cadastros_casas;
create policy casa_editar on cadastros_casas for update using (user_id = auth.uid() or eh_equipe());

drop policy if exists chk_ler on checklist;
create policy chk_ler on checklist for select using (user_id = auth.uid() or eh_equipe());
drop policy if exists chk_gravar on checklist;
create policy chk_gravar on checklist for insert with check (user_id = auth.uid());
drop policy if exists chk_editar on checklist;
create policy chk_editar on checklist for update using (user_id = auth.uid());
drop policy if exists chk_apagar on checklist;
create policy chk_apagar on checklist for delete using (user_id = auth.uid());

drop policy if exists reg_ler on registros_noite;
create policy reg_ler on registros_noite for select using (user_id = auth.uid() or eh_equipe());
drop policy if exists reg_gravar on registros_noite;
create policy reg_gravar on registros_noite for insert with check (user_id = auth.uid());

drop policy if exists chave_ler on chaves_internas;
create policy chave_ler on chaves_internas for select using (
  (tipo = 'equipe' and eh_equipe()) or (tipo = 'adm' and eh_adm()));

grant usage on schema public to anon, authenticated;
grant select, update on perfis to authenticated;
grant select, insert, update on inscricoes_artistas, cadastros_casas to authenticated;
grant select, insert, update, delete on checklist to authenticated;
grant select, insert on registros_noite to authenticated;
grant select on chaves_internas to authenticated;
grant execute on function pre_curadoria(jsonb, text[]), pendencias_casa(jsonb), eh_equipe(), eh_adm() to authenticated;

-- =====================================================================
-- v2: convites, primeiro acesso (tutorial e senha) e "me avise na minha cidade"
-- =====================================================================
alter table perfis add column if not exists tutorial_visto_em timestamptz;
alter table perfis add column if not exists senha_definida boolean not null default true;

-- Convite feito pela equipe: e-mail já ligado a um perfil e, opcionalmente, a uma artista ou casa da rede.
-- O vínculo só é aplicado quando a pessoa confirma o e-mail (clicando no link), nunca antes.
create table if not exists convites (
  email text primary key check (email = lower(email)),
  tipo tipo_perfil not null,
  nome text not null default '',
  whatsapp text,
  codigo_acesso text,
  vinculo_nome text,
  criado_por uuid references perfis (id) on delete set null,
  criado_em timestamptz not null default now(),
  aceito_em timestamptz,
  tutorial_enviado_em timestamptz
);

create or replace function aplicar_convite(uid uuid, mail text) returns boolean
language plpgsql security definer set search_path = public as $$
declare c convites;
begin
  select * into c from convites where email = lower(mail) and aceito_em is null;
  if not found then return false; end if;
  perform set_config('tq.sistema', '1', true);
  update perfis p set
    tipo = c.tipo,
    nome = case when coalesce(p.nome, '') = '' then c.nome else p.nome end,
    whatsapp = coalesce(p.whatsapp, c.whatsapp),
    codigo_acesso = coalesce(c.codigo_acesso, p.codigo_acesso),
    vinculo_nome = coalesce(c.vinculo_nome, p.vinculo_nome)
  where p.id = uid;
  perform set_config('tq.sistema', '', true);
  update convites set aceito_em = now() where email = c.email;
  return true;
end $$;
-- Só o próprio banco chama esta função.
revoke all on function aplicar_convite(uuid, text) from public, anon, authenticated;

-- Perfil criado no cadastro; se o e-mail já chega confirmado (link de convite), o convite vale na hora.
create or replace function novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pedido text := coalesce(new.raw_user_meta_data ->> 'tipo', 'artista');
begin
  insert into perfis (id, email, nome, tipo, senha_definida)
  values (
    new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'nome', ''),
    case
      when exists (select 1 from admins_iniciais where email = lower(new.email)) then 'adm'::tipo_perfil
      when pedido = 'casa' then 'casa'::tipo_perfil
      else 'artista'::tipo_perfil
    end,
    coalesce(new.encrypted_password, '') <> ''
  ) on conflict (id) do nothing;
  if new.email_confirmed_at is not null then perform aplicar_convite(new.id, new.email); end if;
  return new;
end $$;

create or replace function ao_confirmar_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform aplicar_convite(new.id, new.email);
  end if;
  return new;
end $$;
drop trigger if exists ao_confirmar_usuario on auth.users;
create trigger ao_confirmar_usuario after update on auth.users for each row execute function ao_confirmar_email();

-- Para quem já tinha conta antes do convite: aplica ao entrar, se o e-mail estiver confirmado.
create or replace function reivindicar_convite() returns boolean
language plpgsql security definer set search_path = public as $$
declare u record;
begin
  select id, email, email_confirmed_at into u from auth.users where id = auth.uid();
  if u.id is null or u.email_confirmed_at is null then return false; end if;
  return aplicar_convite(u.id, u.email);
end $$;

alter table convites enable row level security;
drop policy if exists conv_ler on convites;
create policy conv_ler on convites for select using (eh_equipe());
drop policy if exists conv_criar on convites;
create policy conv_criar on convites for insert with check (eh_adm() or (eh_equipe() and tipo in ('artista', 'casa')));
drop policy if exists conv_editar on convites;
create policy conv_editar on convites for update using (eh_equipe()) with check (eh_adm() or (eh_equipe() and tipo in ('artista', 'casa')));
drop policy if exists conv_apagar on convites;
create policy conv_apagar on convites for delete using (eh_equipe() and aceito_em is null);

-- "Me avise de shows na minha cidade": qualquer visitante deixa o contato; só a equipe lê.
create table if not exists avisos_cidade (
  id uuid primary key default gen_random_uuid(),
  cidade text not null check (length(cidade) between 2 and 60),
  contato text not null check (length(contato) between 5 and 120),
  canal text not null check (canal in ('email', 'whatsapp')),
  consentimento boolean not null check (consentimento),
  criado_em timestamptz not null default now()
);
create unique index if not exists avisos_unico on avisos_cidade (lower(cidade), lower(contato));
alter table avisos_cidade enable row level security;
drop policy if exists aviso_criar on avisos_cidade;
create policy aviso_criar on avisos_cidade for insert with check (consentimento);
drop policy if exists aviso_ler on avisos_cidade;
create policy aviso_ler on avisos_cidade for select using (eh_equipe());
drop policy if exists aviso_apagar on avisos_cidade;
create policy aviso_apagar on avisos_cidade for delete using (eh_adm());

grant select, insert, update, delete on convites to authenticated;
grant insert on avisos_cidade to anon, authenticated;
grant select, delete on avisos_cidade to authenticated;
revoke all on function reivindicar_convite() from public, anon;
grant execute on function reivindicar_convite() to authenticated;

-- =====================================================================
-- v3: correções do QA de 21/10/2026 (backend e segurança). Idempotente.
-- =====================================================================

-- Números vindos do formulário: espelha parseInt do navegador (até 9 dígitos) e nunca derruba o salvamento.
create or replace function int_seguro(v text) returns int
language sql immutable set search_path = public as $$
  select coalesce(nullif(substring(coalesce(v, '') from '^\s*(-?\d{1,9})'), '')::int, 0)
$$;

create or replace function pre_curadoria(d jsonb, cidades_rede text[] default array[
  'São Paulo','Belo Horizonte','Rio de Janeiro','Brasília','Curitiba','Florianópolis','Porto Alegre',
  'Campinas','Santos','Santo André','Sorocaba','Itajaí','Salvador','Recife']) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  ouvintes int := int_seguro(d ->> 'ouvintes_mensais');
  seguidores int := int_seguro(d ->> 'seguidores_instagram');
  links int := (case when coalesce(d ->> 'spotify', '') <> '' then 1 else 0 end)
             + (case when coalesce(d ->> 'youtube', '') <> '' then 1 else 0 end)
             + (case when coalesce(d ->> 'outro_link', '') <> '' then 1 else 0 end);
  integrantes int := case when coalesce(d ->> 'integrantes', '') = '' then 1 else int_seguro(d ->> 'integrantes') end;
  cache int := int_seguro(d ->> 'cache_minimo');
  cidades jsonb := case when jsonb_typeof(d -> 'cidades_interesse') = 'array' then d -> 'cidades_interesse' else '[]'::jsonb end;
  cidades_ok int := 0;
  completude int := 0; tracao int := 0; tecnica int := 0; circulacao int := 0; condicoes int := 0;
  total int; faixa text; alertas jsonb := '[]'::jsonb;
begin
  if length(coalesce(d ->> 'release', '')) >= 200 then completude := completude + 5; end if;
  if coalesce(d ->> 'foto', '') <> '' then completude := completude + 5; end if;
  if links >= 2 then completude := completude + 5; end if;
  if coalesce(d ->> 'contato_producao', '') <> '' then completude := completude + 5; end if;
  tracao := case when ouvintes >= 50000 then 20 when ouvintes >= 10000 then 15 when ouvintes >= 2000 then 10 when ouvintes >= 500 then 5 else 0 end
          + case when seguidores >= 20000 then 15 when seguidores >= 5000 then 10 when seguidores >= 1000 then 5 else 0 end;
  tecnica := case d ->> 'rider_tipo' when 'circulavel' then 20 when 'condicionado' then 10 when 'especial' then 3 else 0 end;
  select count(*) into cidades_ok from jsonb_array_elements(cidades) c
  where jsonb_typeof(c) = 'string' and c #>> '{}' = any (cidades_rede);
  circulacao := least(15, cidades_ok * 5);
  condicoes := case when (d ->> 'aceita_bonus') = 'true' then 10 when cache > 0 and cache <= 800 then 5 else 0 end;
  total := completude + tracao + tecnica + circulacao + condicoes;
  faixa := case when total >= 65 then 'Prioridade' when total >= 40 then 'Avaliar' else 'Abaixo do corte' end;
  if links = 0 then alertas := alertas || '["Sem link de áudio ou vídeo"]'::jsonb; end if;
  if integrantes > 5 then alertas := alertas || '["Formação com mais de 5 pessoas: rota condicionada"]'::jsonb; end if;
  if d ->> 'rider_tipo' = 'especial' then alertas := alertas || '["Rider de produção especial"]'::jsonb; end if;
  if cache > 1500 then alertas := alertas || '["Cachê mínimo acima de R$ 1.500"]'::jsonb; end if;
  if cidades_ok = 0 then alertas := alertas || '["Nenhuma cidade de interesse na rede atual"]'::jsonb; end if;
  return jsonb_build_object(
    'score', total, 'faixa', faixa, 'alertas', alertas,
    'detalhe', jsonb_build_object('completude', completude, 'tracao', tracao, 'tecnica', tecnica, 'circulacao', circulacao, 'condicoes', condicoes)
  );
end $$;

create or replace function pendencias_casa(d jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare hab jsonb := '[]'::jsonb; mat jsonb := '[]'::jsonb; enr jsonb := '[]'::jsonb;
begin
  if coalesce(d ->> 'responsavel', '') = '' then hab := hab || '["Responsável local"]'; end if;
  if coalesce(d ->> 'whatsapp', '') = '' then hab := hab || '["WhatsApp do responsável"]'; end if;
  if coalesce(d ->> 'endereco', '') = '' or coalesce(d ->> 'cidade', '') = '' then hab := hab || '["Endereço e cidade"]'; end if;
  if int_seguro(d ->> 'capacidade') <= 0 then hab := hab || '["Capacidade de público"]'; end if;
  if coalesce(d ->> 'som', '') in ('', 'nao_tem') then hab := hab || '["Como resolve o som (PA próprio ou parceiro técnico)"]'; end if;
  if (d ->> 'aceite_responsabilidades') is distinct from 'true' then hab := hab || '["Aceite da matriz de responsabilidades da casa"]'; end if;
  if coalesce(d ->> 'palco', '') = '' then mat := mat || '["Medidas do palco"]'; end if;
  if coalesce(d ->> 'microfones', '') = '' then mat := mat || '["Microfones e DIs disponíveis"]'; end if;
  if coalesce(d ->> 'luz', '') = '' then mat := mat || '["Luz (frontal para rosto)"]'; end if;
  if coalesce(d ->> 'restricoes', '') = '' then mat := mat || '["Restrições de horário e volume"]'; end if;
  if coalesce(d ->> 'camarim', '') = '' then mat := mat || '["Camarim"]'; end if;
  if coalesce(d ->> 'backline', '') = '' then enr := enr || '["Backline"]'; end if;
  if coalesce(d ->> 'acessibilidade', '') = '' then enr := enr || '["Acessibilidade"]'; end if;
  if coalesce(d ->> 'instagram', '') = '' then enr := enr || '["Instagram"]'; end if;
  if coalesce(d ->> 'como_chegar', '') = '' then enr := enr || '["Como chegar (transporte e estacionamento)"]'; end if;
  return jsonb_build_object('habilitacao', hab, 'match', mat, 'enriquecimento', enr);
end $$;

-- Perfil: vínculo só muda de vazio para um código (ou pela adm); a última adm não se rebaixa.
create or replace function proteger_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('tq.sistema', true) = '1' then return new; end if;
  if not eh_adm() then
    new.tipo := old.tipo;
    new.email := old.email;
    if old.codigo_acesso is not null or new.codigo_acesso is not distinct from old.codigo_acesso then
      new.codigo_acesso := old.codigo_acesso;
      new.vinculo_nome := old.vinculo_nome;
    end if;
  elsif old.tipo = 'adm' and new.tipo <> 'adm' and (select count(*) from perfis where tipo = 'adm') <= 1 then
    raise exception 'Esta é a última conta de administração: promova outra pessoa antes.';
  end if;
  return new;
end $$;

-- Inscrição: datas e avaliação vêm só do banco; a equipe avalia, mas não reescreve dados nem score.
create or replace function antes_inscricao() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  new.atualizado_em := now();
  if eh_equipe() and tg_op = 'UPDATE' and new.user_id <> auth.uid() then
    new.user_id := old.user_id; new.dados := old.dados; new.criado_em := old.criado_em; new.enviado_em := old.enviado_em;
    new.score := old.score; new.faixa := old.faixa; new.score_detalhe := old.score_detalhe; new.alertas := old.alertas;
    if new.status is distinct from old.status then new.avaliado_por := auth.uid(); new.avaliado_em := now();
    else new.avaliado_por := old.avaliado_por; new.avaliado_em := old.avaliado_em; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.status not in ('rascunho', 'ajustes') then
      raise exception 'Inscrição em análise: aguarde o retorno da curadoria.';
    end if;
    new.parecer := old.parecer; new.nota_interna := old.nota_interna;
    new.avaliado_por := old.avaliado_por; new.avaliado_em := old.avaliado_em;
    new.criado_em := old.criado_em; new.enviado_em := old.enviado_em;
  else
    new.parecer := null; new.nota_interna := null; new.avaliado_por := null; new.avaliado_em := null;
    new.criado_em := now(); new.enviado_em := null;
  end if;
  if new.status not in ('rascunho', 'em_curadoria') then
    new.status := coalesce(old.status, 'rascunho');
  end if;
  r := pre_curadoria(new.dados);
  new.score := (r ->> 'score')::int; new.faixa := r ->> 'faixa';
  new.score_detalhe := r -> 'detalhe'; new.alertas := r -> 'alertas';
  if new.status = 'em_curadoria' then new.enviado_em := now(); end if;
  return new;
end $$;

create or replace function antes_casa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if eh_equipe() and tg_op = 'UPDATE' and new.user_id <> auth.uid() then
    new.user_id := old.user_id; new.dados := old.dados; new.enviado_em := old.enviado_em;
    if new.status is distinct from old.status or new.classificacao is distinct from old.classificacao then
      new.avaliado_por := auth.uid(); new.avaliado_em := now();
    else new.avaliado_por := old.avaliado_por; new.avaliado_em := old.avaliado_em; end if;
    new.pendencias := pendencias_casa(new.dados);
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.parecer := old.parecer; new.nota_interna := old.nota_interna; new.classificacao := old.classificacao;
    new.avaliado_por := old.avaliado_por; new.avaliado_em := old.avaliado_em; new.enviado_em := old.enviado_em;
    if old.status in ('habilitada', 'suspensa') then new.status := old.status;
    elsif new.status not in ('rascunho', 'em_analise') then new.status := old.status; end if;
  else
    new.parecer := null; new.nota_interna := null; new.classificacao := null;
    new.avaliado_por := null; new.avaliado_em := null; new.enviado_em := null;
    if new.status not in ('rascunho', 'em_analise') then new.status := 'rascunho'; end if;
  end if;
  new.pendencias := pendencias_casa(new.dados);
  if new.status = 'em_analise' then
    if jsonb_array_length(new.pendencias -> 'habilitacao') > 0 then new.status := 'incompleto';
    else new.enviado_em := now(); end if;
  end if;
  return new;
end $$;

-- Adm da lista inicial só depois de confirmar o e-mail (ninguém "ocupa" o e-mail antes do dono).
create or replace function novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pedido text := coalesce(new.raw_user_meta_data ->> 'tipo', 'artista');
begin
  insert into perfis (id, email, nome, tipo, senha_definida)
  values (
    new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'nome', ''),
    case
      when new.email_confirmed_at is not null and exists (select 1 from admins_iniciais where email = lower(new.email)) then 'adm'::tipo_perfil
      when pedido = 'casa' then 'casa'::tipo_perfil
      else 'artista'::tipo_perfil
    end,
    coalesce(new.encrypted_password, '') <> ''
  ) on conflict (id) do nothing;
  if new.email_confirmed_at is not null then perform aplicar_convite(new.id, new.email); end if;
  return new;
end $$;

create or replace function ao_confirmar_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    if exists (select 1 from admins_iniciais where email = lower(new.email)) then
      perform set_config('tq.sistema', '1', true);
      update perfis set tipo = 'adm' where id = new.id;
      perform set_config('tq.sistema', '', true);
    end if;
    perform aplicar_convite(new.id, new.email);
  end if;
  return new;
end $$;

-- Convite para equipe/adm não carrega vínculo de artista/casa; convite da equipe nunca rebaixa equipe/adm.
create or replace function aplicar_convite(uid uuid, mail text) returns boolean
language plpgsql security definer set search_path = public as $$
declare c convites; atual tipo_perfil;
begin
  select * into c from convites where email = lower(mail) and aceito_em is null;
  if not found then return false; end if;
  select tipo into atual from perfis where id = uid;
  if atual in ('equipe', 'adm') and not exists (select 1 from perfis where id = c.criado_por and tipo = 'adm') then
    update convites set aceito_em = now() where email = c.email;
    return false;
  end if;
  perform set_config('tq.sistema', '1', true);
  update perfis p set
    tipo = c.tipo,
    nome = case when coalesce(p.nome, '') = '' then c.nome else p.nome end,
    whatsapp = coalesce(p.whatsapp, c.whatsapp),
    codigo_acesso = case when c.tipo in ('equipe', 'adm') then null else coalesce(c.codigo_acesso, p.codigo_acesso) end,
    vinculo_nome = case when c.tipo in ('equipe', 'adm') then null else coalesce(c.vinculo_nome, p.vinculo_nome) end
  where p.id = uid;
  perform set_config('tq.sistema', '', true);
  update convites set aceito_em = now() where email = c.email;
  return true;
end $$;
revoke all on function aplicar_convite(uuid, text) from public, anon, authenticated;

alter table convites alter column criado_por set default auth.uid();
drop policy if exists conv_criar on convites;
create policy conv_criar on convites for insert with check (
  criado_por = auth.uid() and (eh_adm() or (eh_equipe() and tipo in ('artista', 'casa')
    and not exists (select 1 from perfis p where p.email = convites.email and p.tipo in ('equipe', 'adm'))))
);
drop policy if exists conv_editar on convites;
create policy conv_editar on convites for update
  using (eh_adm() or (eh_equipe() and tipo in ('artista', 'casa') and aceito_em is null))
  with check (eh_adm() or (eh_equipe() and tipo in ('artista', 'casa') and aceito_em is null
    and not exists (select 1 from perfis p where p.email = convites.email and p.tipo in ('equipe', 'adm'))));

-- "Me avise": sem duplicata por espaço, formato do contato conferido, data do banco e freio contra enxurrada.
drop index if exists avisos_unico;
create unique index if not exists avisos_unico_v3 on avisos_cidade (lower(btrim(cidade)), lower(btrim(contato)));
alter table avisos_cidade drop constraint if exists aviso_contato_formato;
alter table avisos_cidade add constraint aviso_contato_formato check (
  (canal = 'email' and contato ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') or (canal = 'whatsapp' and contato ~ '^[0-9]{10,13}$')) not valid;
create or replace function antes_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.id := gen_random_uuid(); new.criado_em := now();
  new.cidade := btrim(new.cidade); new.contato := lower(btrim(new.contato));
  if (select count(*) from avisos_cidade where criado_em > now() - interval '1 minute') >= 30 then
    raise exception 'Muitos pedidos agora. Tente de novo em instantes.';
  end if;
  return new;
end $$;
drop trigger if exists trg_aviso on avisos_cidade;
create trigger trg_aviso before insert on avisos_cidade for each row execute function antes_aviso();

-- Registro da noite: só casa, público não negativo.
alter table registros_noite drop constraint if exists publico_nao_negativo;
alter table registros_noite add constraint publico_nao_negativo check (publico is null or publico >= 0) not valid;
drop policy if exists reg_gravar on registros_noite;
create policy reg_gravar on registros_noite for insert with check (
  user_id = auth.uid() and exists (select 1 from perfis where id = auth.uid() and tipo = 'casa'));

-- Privilégios: o Supabase concede tudo por padrão (inclusive TRUNCATE, que ignora RLS).
-- Tira tudo e devolve só o que o site usa.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
grant select, update on perfis to authenticated;
grant select, insert, update on inscricoes_artistas, cadastros_casas to authenticated;
grant select, insert, update, delete on checklist to authenticated;
grant select, insert on registros_noite to authenticated;
grant select on chaves_internas to authenticated;
grant select, insert, update, delete on convites to authenticated;
grant insert on avisos_cidade to anon, authenticated;
grant select, delete on avisos_cidade to authenticated;
grant execute on function int_seguro(text) to anon, authenticated;

-- Registro da noite: um por casa e por noite; registrar de novo corrige o anterior.
create unique index if not exists registro_unico on registros_noite (user_id, evento_id);
drop policy if exists reg_corrigir on registros_noite;
create policy reg_corrigir on registros_noite for update using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table registros_noite drop constraint if exists publico_teto;
alter table registros_noite add constraint publico_teto check (publico is null or publico <= 20000) not valid;
grant update on registros_noite to authenticated;

-- =====================================================================
-- v4: diário de uso (testes de 21/10/2026 em diante). Idempotente.
-- =====================================================================
-- Telas, cliques, mensagens e erros enviados pelo site (src/diario.js). Nunca o que a pessoa digita.
create table if not exists diario (
  id bigserial primary key,
  criado_em timestamptz not null default now(),
  sessao text not null check (length(sessao) between 6 and 40),
  user_id uuid,
  perfil text check (length(perfil) <= 40),
  acao text not null check (length(acao) <= 40),
  tela text check (length(tela) <= 80),
  detalhe jsonb check (pg_column_size(detalhe) < 4096),
  pagina text check (length(pagina) <= 200),
  navegador text check (length(navegador) <= 300),
  quando_cliente timestamptz
);
create index if not exists diario_quando on diario (criado_em);
create index if not exists diario_user on diario (user_id, criado_em);
create index if not exists diario_sessao on diario (sessao, criado_em);
alter table diario enable row level security;
create or replace function antes_diario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.criado_em := now();
  new.user_id := auth.uid();   -- quem está logado vem do token, não do navegador
  if (select count(*) from diario where sessao = new.sessao and criado_em > now() - interval '1 minute') >= 300 then
    return null;               -- excesso de uma mesma aba: descarta em silêncio
  end if;
  return new;
end $$;
drop trigger if exists trg_diario on diario;
create trigger trg_diario before insert on diario for each row execute function antes_diario();
revoke all on function antes_diario() from public, anon, authenticated;
drop policy if exists diario_gravar on diario;
create policy diario_gravar on diario for insert with check (true);
drop policy if exists diario_ler on diario;
create policy diario_ler on diario for select using (eh_equipe());

-- Cópia dos registros do Supabase (erros de chamada, eventos de conta), que o serviço apaga em cerca de 1 dia.
create table if not exists diario_servidor (
  id text primary key,
  quando timestamptz not null,
  fonte text not null,
  status int,
  metodo text,
  caminho text,
  mensagem text,
  dados jsonb,
  copiado_em timestamptz not null default now()
);
create index if not exists diario_servidor_quando on diario_servidor (quando);
alter table diario_servidor enable row level security;
drop policy if exists diario_servidor_ler on diario_servidor;
create policy diario_servidor_ler on diario_servidor for select using (eh_equipe());

revoke all on diario, diario_servidor from anon, authenticated;
grant insert on diario to anon, authenticated;
grant select on diario, diario_servidor to authenticated;
grant usage on sequence diario_id_seq to anon, authenticated;

-- =====================================================================
-- v5: documentos da data, lembretes de prazo e configuração interna. Idempotente.
-- (Pasta de materiais no armazenamento: supabase/armazenamento.sql. Função: supabase/functions/lembretes.)
-- =====================================================================
create table if not exists documentos (
  id uuid primary key default gen_random_uuid(),
  evento_id text,
  user_id uuid references perfis (id) on delete cascade,
  tipo text not null check (tipo in ('contrato', 'modelo', 'outro')),
  titulo text not null check (length(titulo) between 2 and 120),
  url text not null check (url ~* '^https://' and length(url) <= 500),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists documentos_user on documentos (user_id, evento_id);
alter table documentos enable row level security;
drop policy if exists documentos_ler on documentos;
create policy documentos_ler on documentos for select using (user_id = auth.uid() or user_id is null or eh_equipe());
drop policy if exists documentos_criar on documentos;
create policy documentos_criar on documentos for insert with check (eh_equipe() and criado_por = auth.uid());
drop policy if exists documentos_apagar on documentos;
create policy documentos_apagar on documentos for delete using (eh_equipe());
revoke all on documentos from anon, authenticated;
grant select, insert, delete on documentos to authenticated;

create table if not exists lembretes (
  user_id uuid not null,
  evento_id text not null,
  item text not null,
  momento text not null,
  enviado_em timestamptz not null default now(),
  situacao text not null,
  detalhe text,
  primary key (user_id, evento_id, item, momento)
);
alter table lembretes enable row level security;
drop policy if exists lembretes_ler on lembretes;
create policy lembretes_ler on lembretes for select using (eh_equipe());
revoke all on lembretes from anon, authenticated;
grant select on lembretes to authenticated;

-- Chave de disparo e liga/desliga dos lembretes: sem políticas, nenhuma conta lê.
create table if not exists config_interna (nome text primary key, valor text not null, atualizado_em timestamptz not null default now());
alter table config_interna enable row level security;
revoke all on config_interna from anon, authenticated;

-- =====================================================================
-- v6: correções da auditoria de segurança de 21/10/2026 (tests/seguranca.test.mjs). Idempotente.
-- =====================================================================
-- Convite feito pela equipe não muda o tipo nem troca o vínculo de quem já tinha conta de verdade
-- (vínculo, inscrição ou cadastro de casa). Isso continua sendo papel só da administração, em Pessoas.
create or replace function aplicar_convite(uid uuid, mail text) returns boolean
language plpgsql security definer set search_path = public as $$
declare c convites; atual perfis; do_adm boolean;
begin
  select * into c from convites where email = lower(mail) and aceito_em is null;
  if not found then return false; end if;
  select * into atual from perfis where id = uid;
  do_adm := exists (select 1 from perfis where id = c.criado_por and tipo = 'adm');
  if not do_adm and (atual.tipo in ('equipe', 'adm') or atual.codigo_acesso is not null
      or (atual.tipo is distinct from c.tipo and (exists (select 1 from inscricoes_artistas where user_id = uid)
                                                  or exists (select 1 from cadastros_casas where user_id = uid)))) then
    update convites set aceito_em = now() where email = c.email;
    return false;
  end if;
  perform set_config('tq.sistema', '1', true);
  update perfis p set
    tipo = c.tipo,
    nome = case when coalesce(p.nome, '') = '' then c.nome else p.nome end,
    whatsapp = coalesce(p.whatsapp, c.whatsapp),
    codigo_acesso = case when c.tipo in ('equipe', 'adm') then null else coalesce(c.codigo_acesso, p.codigo_acesso) end,
    vinculo_nome = case when c.tipo in ('equipe', 'adm') then null else coalesce(c.vinculo_nome, p.vinculo_nome) end
  where p.id = uid;
  perform set_config('tq.sistema', '', true);
  update convites set aceito_em = now() where email = c.email;
  return true;
end $$;
revoke all on function aplicar_convite(uuid, text) from public, anon, authenticated;

-- A equipe só apaga convites de artista ou casa ainda não aceitos (não os de equipe feitos pela adm).
drop policy if exists conv_apagar on convites;
create policy conv_apagar on convites for delete using (eh_adm() or (eh_equipe() and tipo in ('artista', 'casa') and aceito_em is null));

-- Pontuação, faixa e detalhe da pré-curadoria sempre calculados pelo banco a partir das respostas,
-- inclusive quando a equipe salva a decisão (ninguém grava texto livre nesses campos).
create or replace function calcular_inscricao() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  r := pre_curadoria(new.dados);
  new.score := (r ->> 'score')::int; new.faixa := r ->> 'faixa';
  new.score_detalhe := r -> 'detalhe'; new.alertas := r -> 'alertas';
  return new;
end $$;
drop trigger if exists trg_inscricao_zcalculo on inscricoes_artistas;   -- "z": roda depois de trg_inscricao
create trigger trg_inscricao_zcalculo before insert or update on inscricoes_artistas for each row execute function calcular_inscricao();

-- Casa habilitada que apaga um dado mínimo volta para "faltam dados mínimos" até completar de novo.
create or replace function casa_rehabilitar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id = auth.uid() and new.status = 'habilitada' and jsonb_array_length(coalesce(new.pendencias -> 'habilitacao', '[]')) > 0 then
    new.status := 'incompleto';
  end if;
  return new;
end $$;
drop trigger if exists trg_casa_zhabilitacao on cadastros_casas;
create trigger trg_casa_zhabilitacao before update on cadastros_casas for each row execute function casa_rehabilitar();

-- Nota interna da curadoria e da habilitação: só a equipe lê. Antes ficava na mesma linha da inscrição ou do
-- cadastro, que a própria artista ou casa consegue ler inteira; agora fica numa tabela à parte.
create table if not exists notas_internas (
  alvo text not null check (alvo in ('insc', 'casa')),
  alvo_id uuid not null,
  nota text check (length(nota) <= 4000),
  autor uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  primary key (alvo, alvo_id)
);
alter table notas_internas enable row level security;
drop policy if exists nota_equipe on notas_internas;
create policy nota_equipe on notas_internas for all using (eh_equipe()) with check (eh_equipe());
grant select, insert, update, delete on notas_internas to authenticated;
insert into notas_internas (alvo, alvo_id, nota)
  select 'insc', id, nota_interna from inscricoes_artistas where coalesce(nota_interna, '') <> '' on conflict do nothing;
insert into notas_internas (alvo, alvo_id, nota)
  select 'casa', id, nota_interna from cadastros_casas where coalesce(nota_interna, '') <> '' on conflict do nothing;
-- A coluna antiga fica sempre vazia daqui para a frente.
create or replace function sem_nota_na_linha() returns trigger
language plpgsql as $$ begin new.nota_interna := null; return new; end $$;
alter table inscricoes_artistas disable trigger user;
alter table cadastros_casas disable trigger user;
update inscricoes_artistas set nota_interna = null where nota_interna is not null;
update cadastros_casas set nota_interna = null where nota_interna is not null;
alter table inscricoes_artistas enable trigger user;
alter table cadastros_casas enable trigger user;
drop trigger if exists trg_inscricao_znota on inscricoes_artistas;
create trigger trg_inscricao_znota before insert or update on inscricoes_artistas for each row execute function sem_nota_na_linha();
drop trigger if exists trg_casa_znota on cadastros_casas;
create trigger trg_casa_znota before insert or update on cadastros_casas for each row execute function sem_nota_na_linha();
-- ============================================================================================
-- v3 — Materiais, versões e ciência de leitura (Partner Hub, item A6)
-- Nome "materiais" para não colidir com "documentos" (anexos por data: contrato, rider etc.).
-- O conteúdo continua na fonte oficial (site do Bruno, Notion, Canva): aqui fica só o cadastro,
-- a versão vigente e quem declarou ciência de cada versão.
-- "Ciência" é declaração de leitura, NÃO é assinatura contratual: contratos seguem no fluxo jurídico.
-- Versões e ciências não são editáveis nem apagáveis por usuários: o histórico fica preservado.
-- ============================================================================================
create or replace function meu_tipo() returns tipo_perfil
language sql stable security definer set search_path = public as $$
  select tipo from perfis where id = auth.uid();
$$;

create table if not exists materiais (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  titulo text not null check (length(titulo) between 3 and 160),
  area text not null default 'operacoes'
    check (area in ('marketing', 'operacoes', 'comercial', 'producao', 'gestao_praca', 'marca', 'bilheteria', 'geral')),
  funcao text,                 -- ex.: anfitriao, social_media, lideranca_local; vazio = todas
  etapa text check (etapa is null or etapa in ('pre', 'dia', 'pos', 'continuo')),
  tipo_material text not null default 'guia'
    check (tipo_material in ('guia', 'playbook', 'politica', 'termo', 'template', 'briefing', 'checklist', 'outro')),
  publico tipo_perfil[] not null default '{casa}',          -- quem pode ler (equipe e adm sempre leem)
  fonte_url text not null check (fonte_url ~ '^https://'),  -- onde o conteúdo é mantido
  fonte_tipo text not null default 'link' check (fonte_tipo in ('link', 'notion', 'site_bruno', 'canva', 'arquivo')),
  responsavel text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists material_versoes (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materiais (id) on delete restrict,
  versao text not null check (length(versao) between 1 and 20),
  resumo text,                                   -- o que mudou nesta versão
  url text check (url is null or url ~ '^https://'),  -- link específico da versão, se a fonte tiver
  exige_ciencia boolean not null default false,
  publicada_em timestamptz not null default now(),
  publicada_por uuid references perfis (id),
  unique (material_id, versao)
);
create index if not exists versoes_material on material_versoes (material_id, publicada_em desc);

create table if not exists ciencias (
  versao_id uuid not null references material_versoes (id) on delete restrict,
  user_id uuid not null default auth.uid() references perfis (id) on delete cascade,
  evento_id text,                                -- opcional: ciência dada no contexto de uma data
  registrada_em timestamptz not null default now(),
  primary key (versao_id, user_id)
);

-- Versão vigente = a mais recente publicada de cada documento.
create or replace function versao_vigente(doc uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from material_versoes where material_id = doc order by publicada_em desc, id desc limit 1;
$$;

-- Quem publica e quando registra não vêm do navegador.
create or replace function carimbar_material_versao() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.publicada_por := auth.uid(); new.publicada_em := clock_timestamp(); return new; end $$;
drop trigger if exists carimbo_material_versao on material_versoes;
create trigger carimbo_material_versao before insert on material_versoes for each row execute function carimbar_material_versao();

create or replace function carimbar_ciencia() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.registrada_em := now(); return new; end $$;
drop trigger if exists carimbo_ciencia on ciencias;
create trigger carimbo_ciencia before insert on ciencias for each row execute function carimbar_ciencia();

alter table materiais enable row level security;
alter table material_versoes enable row level security;
alter table ciencias enable row level security;

drop policy if exists mat_ler on materiais;
create policy mat_ler on materiais for select using (eh_equipe() or (ativo and meu_tipo() = any (publico)));
drop policy if exists mat_criar on materiais;
create policy mat_criar on materiais for insert with check (eh_equipe());
drop policy if exists mat_editar on materiais;
create policy mat_editar on materiais for update using (eh_equipe()) with check (eh_equipe());

drop policy if exists ver_ler on material_versoes;
create policy ver_ler on material_versoes for select using (exists (select 1 from materiais d where d.id = material_id));
drop policy if exists ver_criar on material_versoes;
create policy ver_criar on material_versoes for insert with check (eh_equipe());

-- Ciência: só em nome próprio, só na versão vigente de um documento que a pessoa pode ler e que pede ciência.
drop policy if exists cie_ler on ciencias;
create policy cie_ler on ciencias for select using (user_id = auth.uid() or eh_equipe());
drop policy if exists cie_criar on ciencias;
create policy cie_criar on ciencias for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from material_versoes v join materiais d on d.id = v.material_id
    where v.id = versao_id and v.exige_ciencia and d.ativo and v.id = versao_vigente(d.id)
      and (eh_equipe() or meu_tipo() = any (d.publico))
  )
);

-- Pendências de ciência de quem está logado (respeita as políticas acima).
create or replace function minhas_ciencias_pendentes()
returns table (material_id uuid, slug text, titulo text, versao_id uuid, versao text, publicada_em timestamptz)
language sql stable security invoker set search_path = public as $$
  select d.id, d.slug, d.titulo, v.id, v.versao, v.publicada_em
  from materiais d join material_versoes v on v.id = versao_vigente(d.id)
  where d.ativo and v.exige_ciencia
    and not exists (select 1 from ciencias c where c.versao_id = v.id and c.user_id = auth.uid())
  order by v.publicada_em;
$$;

grant select, insert, update on materiais to authenticated;
grant select, insert on material_versoes, ciencias to authenticated;
revoke all on function minhas_ciencias_pendentes(), versao_vigente(uuid), meu_tipo() from public, anon;
grant execute on function minhas_ciencias_pendentes(), versao_vigente(uuid), meu_tipo() to authenticated;

-- ============================================================================================
-- v4 — Campanhas da casa com "feito" compartilhado (Partner Hub A7/C2)
-- O conteúdo da campanha é do Bruno (importado da página dele, sem alterá-la).
-- O Hub guarda só o andamento: quem marcou cada dia como feito e quando. Uma marcação vale
-- para toda a equipe da casa (não por aparelho) e a matriz acompanha.
-- ============================================================================================
-- A casa de quem está logado. Vale só o vínculo dado pela equipe num convite já aceito
-- (e-mail confirmado). O campo perfis.vinculo_nome NÃO é usado aqui: hoje ele pode ser
-- gravado pela própria conta (achado P02 em tests/seguranca.test.mjs).
-- Quando houver várias pessoas e casas por praça, só esta função muda.
create or replace function posso_casa(ref text) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_equipe() or exists (
    select 1 from perfis p
      join auth.users u on u.id = p.id
      join convites c on c.email = lower(u.email)
    where p.id = auth.uid() and p.tipo = 'casa' and c.tipo = 'casa'
      and c.aceito_em is not null and u.email_confirmed_at is not null
      and c.vinculo_nome is not null and lower(c.vinculo_nome) = lower(ref)
  );
$$;

create table if not exists campanhas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  titulo text not null,
  casa_ref text not null,                 -- nome da casa (o mesmo do vínculo da conta)
  fonte_url text check (fonte_url is null or fonte_url ~ '^https://'),
  importada_em timestamptz not null default now(),
  importada_por uuid references perfis (id)
);

create table if not exists campanha_itens (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references campanhas (id) on delete cascade,
  chave text not null,                    -- a mesma chave da página do Bruno (ex.: d1020)
  dia date not null,
  rotulo text,
  acoes jsonb not null default '[]',      -- canal, show, texto e links, como na página
  ativo boolean not null default true,    -- some da campanha quando o Bruno tira o dia
  unique (campanha_id, chave)
);

create table if not exists campanha_feitos (
  item_id uuid primary key references campanha_itens (id) on delete cascade,
  feito_por uuid not null default auth.uid() references perfis (id),
  feito_em timestamptz not null default now(),
  nota text check (nota is null or length(nota) <= 500)
);

-- Histórico de marcar e desmarcar (não editável por ninguém pelo navegador).
create table if not exists campanha_historico (
  id bigserial primary key,
  item_id uuid not null,
  acao text not null check (acao in ('feito', 'desfeito')),
  por uuid,
  em timestamptz not null default now()
);

create or replace function registrar_feito() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.feito_por := auth.uid(); new.feito_em := now();
    insert into campanha_historico (item_id, acao, por) values (new.item_id, 'feito', auth.uid());
    return new;
  end if;
  insert into campanha_historico (item_id, acao, por) values (old.item_id, 'desfeito', auth.uid());
  return old;
end $$;
drop trigger if exists feito_carimbo on campanha_feitos;
create trigger feito_carimbo before insert or delete on campanha_feitos for each row execute function registrar_feito();

-- Importa (ou reimporta) a campanha a partir do JSON gerado por scripts/importar-campanha.mjs.
-- Reimportar atualiza textos e links sem apagar o que já foi marcado como feito.
create or replace function importar_campanha(dados jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare cid uuid; it jsonb;
begin
  -- Pelo site: só equipe. Pelo SQL Editor do Supabase (sem usuário logado): permitido à administração do banco.
  if auth.uid() is not null and not eh_equipe() then raise exception 'Só a equipe importa campanhas.'; end if;
  if jsonb_array_length(coalesce(dados -> 'itens', '[]')) = 0 then raise exception 'Campanha sem dias: nada importado.'; end if;
  insert into campanhas (slug, titulo, casa_ref, fonte_url, importada_por)
  values (dados ->> 'slug', coalesce(dados ->> 'titulo', 'Campanha'), dados ->> 'casa', dados ->> 'fonte_url', auth.uid())
  on conflict (slug) do update set titulo = excluded.titulo, casa_ref = excluded.casa_ref, fonte_url = excluded.fonte_url,
    importada_em = now(), importada_por = auth.uid()
  returning id into cid;
  update campanha_itens set ativo = false where campanha_id = cid
    and chave not in (select x ->> 'chave' from jsonb_array_elements(dados -> 'itens') x);
  for it in select * from jsonb_array_elements(dados -> 'itens') loop
    insert into campanha_itens (campanha_id, chave, dia, rotulo, acoes, ativo)
    values (cid, it ->> 'chave', (it ->> 'dia')::date, it ->> 'rotulo', coalesce(it -> 'acoes', '[]'), true)
    on conflict (campanha_id, chave) do update set dia = excluded.dia, rotulo = excluded.rotulo, acoes = excluded.acoes, ativo = true;
  end loop;
  return cid;
end $$;

alter table campanhas enable row level security;
alter table campanha_itens enable row level security;
alter table campanha_feitos enable row level security;
alter table campanha_historico enable row level security;

drop policy if exists camp_ler on campanhas;
create policy camp_ler on campanhas for select using (posso_casa(casa_ref));
drop policy if exists camp_equipe on campanhas;
create policy camp_equipe on campanhas for all using (eh_equipe()) with check (eh_equipe());
drop policy if exists citem_ler on campanha_itens;
create policy citem_ler on campanha_itens for select using (exists (select 1 from campanhas c where c.id = campanha_id));
drop policy if exists citem_equipe on campanha_itens;
create policy citem_equipe on campanha_itens for all using (eh_equipe()) with check (eh_equipe());

drop policy if exists feito_ler on campanha_feitos;
create policy feito_ler on campanha_feitos for select using (exists (select 1 from campanha_itens i where i.id = item_id));
drop policy if exists feito_marcar on campanha_feitos;
create policy feito_marcar on campanha_feitos for insert with check (
  exists (select 1 from campanha_itens i join campanhas c on c.id = i.campanha_id where i.id = item_id and i.ativo and posso_casa(c.casa_ref)));
drop policy if exists feito_desmarcar on campanha_feitos;
create policy feito_desmarcar on campanha_feitos for delete using (
  exists (select 1 from campanha_itens i join campanhas c on c.id = i.campanha_id where i.id = item_id and posso_casa(c.casa_ref)));
drop policy if exists hist_ler on campanha_historico;
create policy hist_ler on campanha_historico for select using (eh_equipe());

-- Andamento por campanha, para a matriz e para a casa (respeita as políticas).
create or replace function andamento_campanhas()
returns table (campanha_id uuid, slug text, titulo text, casa_ref text, dias int, feitos int, atrasados int, proximo date)
language sql stable security invoker set search_path = public as $$
  select c.id, c.slug, c.titulo, c.casa_ref,
    count(i.id)::int,
    count(f.item_id)::int,
    count(i.id) filter (where f.item_id is null and i.dia < (now() at time zone 'America/Sao_Paulo')::date)::int,
    min(i.dia) filter (where f.item_id is null and i.dia >= (now() at time zone 'America/Sao_Paulo')::date)
  from campanhas c join campanha_itens i on i.campanha_id = c.id and i.ativo
  left join campanha_feitos f on f.item_id = i.id
  group by c.id order by c.casa_ref, c.slug;
$$;

grant select, insert, update, delete on campanhas, campanha_itens to authenticated;
grant select, insert, delete on campanha_feitos to authenticated;
grant select on campanha_historico to authenticated;
revoke all on function importar_campanha(jsonb), andamento_campanhas(), posso_casa(text) from public, anon;
grant execute on function importar_campanha(jsonb), andamento_campanhas(), posso_casa(text) to authenticated;

-- v4.1 — material pode ser de uma casa só (ex.: "Plano de Ação do Rooftap"). Vazio = todas as casas.
alter table materiais add column if not exists casa_ref text;
drop policy if exists mat_ler on materiais;
create policy mat_ler on materiais for select using (
  eh_equipe() or (ativo and meu_tipo() = any (publico) and (casa_ref is null or posso_casa(casa_ref)))
);

-- =====================================================================
-- v7 — Contrato automático: a equipe gera o contrato a partir de um modelo, a artista (ou a casa) completa os
-- dados dela, lê até o fim e assina digitando o nome. Fica registrado o texto exato assinado (com hash SHA-256),
-- quando, o IP e o navegador. Nada vai para o Notion. Idempotente.
-- =====================================================================
create table if not exists modelos_contrato (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(nome) between 2 and 120),
  texto text not null check (length(texto) between 50 and 60000),
  ativo boolean not null default true,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
alter table modelos_contrato enable row level security;
drop policy if exists modcontr_equipe on modelos_contrato;
create policy modcontr_equipe on modelos_contrato for all using (eh_equipe()) with check (eh_equipe());
revoke all on modelos_contrato from anon, authenticated;
grant select, insert, update on modelos_contrato to authenticated;

create table if not exists contratos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references perfis (id) on delete cascade,
  evento_id text,
  titulo text not null check (length(titulo) between 2 and 160),
  modelo_id uuid references modelos_contrato (id) on delete set null,
  -- Minuta com os dados da equipe já preenchidos; os campos da pessoa ficam como {{chave}}.
  texto text not null check (length(texto) between 50 and 80000),
  campos jsonb not null default '[]' check (jsonb_typeof(campos) = 'array'),   -- [{"chave","rotulo"}] que a pessoa preenche
  dados jsonb not null default '{}' check (jsonb_typeof(dados) = 'object'),
  status text not null default 'enviado' check (status in ('enviado', 'assinado', 'cancelado')),
  lido_fim_em timestamptz,
  texto_final text,
  hash text,
  assinado_nome text,
  assinado_em timestamptz,
  ip text,
  navegador text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists contratos_user on contratos (user_id, evento_id);
alter table contratos enable row level security;
drop policy if exists contratos_ler on contratos;
create policy contratos_ler on contratos for select using (user_id = auth.uid() or eh_equipe());
drop policy if exists contratos_criar on contratos;
create policy contratos_criar on contratos for insert with check (eh_equipe() and criado_por = auth.uid() and status = 'enviado'
  and assinado_em is null and texto_final is null and lido_fim_em is null and dados = '{}'::jsonb);
-- A equipe só cancela; o resto muda pelas funções abaixo.
drop policy if exists contratos_cancelar on contratos;
create policy contratos_cancelar on contratos for update using (eh_equipe() and status = 'enviado') with check (eh_equipe() and status = 'cancelado');
revoke all on contratos from anon, authenticated;
grant select, insert on contratos to authenticated;
grant update (status) on contratos to authenticated;

-- Texto com os campos da pessoa substituídos (mesma regra do site, src/contrato.js).
create or replace function contrato_texto(t text, campos jsonb, dados jsonb) returns text language plpgsql immutable as $$
declare c jsonb;
begin
  for c in select * from jsonb_array_elements(campos) loop
    t := replace(t, '{{' || (c->>'chave') || '}}', coalesce(dados->>(c->>'chave'), ''));
  end loop;
  return t;
end $$;

-- Depois de assinado, ninguém altera nada (nem a equipe, nem as funções).
create or replace function contrato_travado() returns trigger language plpgsql as $$
begin
  if old.status = 'assinado' then raise exception 'Contrato assinado não pode ser alterado.'; end if;
  if old.status = 'cancelado' then raise exception 'Contrato cancelado não pode ser alterado.'; end if;
  if new.user_id <> old.user_id or new.texto <> old.texto or new.campos <> old.campos or new.criado_por is distinct from old.criado_por then
    raise exception 'O texto e a pessoa do contrato não mudam depois de enviado. Cancele e gere outro.';
  end if;
  return new;
end $$;
drop trigger if exists trg_contrato_travado on contratos;
create trigger trg_contrato_travado before update on contratos for each row execute function contrato_travado();
drop trigger if exists trg_contrato_apagar on contratos;
create trigger trg_contrato_apagar before delete on contratos for each row when (old.status = 'assinado') execute function contrato_travado();

create or replace function contrato_salvar_dados(cid uuid, d jsonb) returns void language plpgsql security definer set search_path = public as $$
declare k record; c contratos;
begin
  select * into c from contratos where id = cid and user_id = auth.uid() and status = 'enviado';
  if not found then raise exception 'Contrato não encontrado ou já assinado.'; end if;
  if jsonb_typeof(d) <> 'object' then raise exception 'Dados inválidos.'; end if;
  for k in select * from jsonb_each(d) loop
    if not exists (select 1 from jsonb_array_elements(c.campos) x where x->>'chave' = k.key) then raise exception 'Campo % não existe neste contrato.', k.key; end if;
    if jsonb_typeof(k.value) <> 'string' or length(k.value #>> '{}') > 300 or (k.value #>> '{}') ~ '[{}]{2}' then raise exception 'Valor inválido em %.', k.key; end if;
  end loop;
  update contratos set dados = d, lido_fim_em = null where id = cid;   -- mudou o texto: precisa ler de novo até o fim
end $$;

create or replace function contrato_li_ate_o_fim(cid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update contratos set lido_fim_em = coalesce(lido_fim_em, now()) where id = cid and user_id = auth.uid() and status = 'enviado';
end $$;

-- h = SHA-256 do texto que a pessoa viu na tela: só assina se for o mesmo texto que o banco monta.
create or replace function assinar_contrato(cid uuid, nome text, h text) returns contratos language plpgsql security definer set search_path = public as $$
declare c contratos; t text; hd json; falta text;
begin
  select * into c from contratos where id = cid and user_id = auth.uid() and status = 'enviado' for update;
  if not found then raise exception 'Contrato não encontrado ou já assinado.'; end if;
  select string_agg(x->>'rotulo', ', ') into falta from jsonb_array_elements(c.campos) x where coalesce(btrim(c.dados->>(x->>'chave')), '') = '';
  if falta is not null then raise exception 'Faltam dados — preencha antes de assinar: %.', falta; end if;
  if c.lido_fim_em is null then raise exception 'Leia o contrato até o fim antes de assinar.'; end if;
  nome := btrim(regexp_replace(coalesce(nome, ''), '\s+', ' ', 'g'));
  if length(nome) < 5 or nome !~ '\s' then raise exception 'Digite o seu nome completo para assinar (é a sua assinatura).'; end if;
  t := contrato_texto(c.texto, c.campos, c.dados);
  if encode(sha256(convert_to(t, 'UTF8')), 'hex') <> lower(coalesce(h, '')) then raise exception 'O contrato mudou enquanto você lia. Recarregue a página e leia de novo.'; end if;
  begin hd := current_setting('request.headers', true)::json; exception when others then hd := null; end;
  update contratos set status = 'assinado', texto_final = t, hash = lower(h), assinado_nome = left(nome, 160), assinado_em = now(),
    ip = left(btrim(split_part(coalesce(hd->>'x-forwarded-for', hd->>'x-real-ip', ''), ',', 1)), 64), navegador = left(hd->>'user-agent', 300)
  where id = cid returning * into c;
  return c;
end $$;
revoke all on function contrato_salvar_dados(uuid, jsonb), contrato_li_ate_o_fim(uuid), assinar_contrato(uuid, text, text) from public, anon;
grant execute on function contrato_salvar_dados(uuid, jsonb), contrato_li_ate_o_fim(uuid), assinar_contrato(uuid, text, text) to authenticated;

-- =====================================================================
-- v8: segurança — P09, V13 e X03 (tests/seguranca.test.mjs). Só banco, compatível com o site no ar.
-- P02, P12 e P13 dependem de mudança no site e ficam para a v9.
-- =====================================================================

-- P09: o gatilho não confia mais na configuração tq.sistema, que qualquer sessão consegue mudar.
-- Passa direto só o que o próprio banco faz: as funções do sistema rodam como dona da tabela
-- (security definer); quem usa o site roda como "authenticated" ou "anon" e não consegue trocar isso.
create or replace function proteger_perfil() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if not eh_adm() then
    new.tipo := old.tipo;
    new.email := old.email;
    if old.codigo_acesso is not null or new.codigo_acesso is not distinct from old.codigo_acesso then
      new.codigo_acesso := old.codigo_acesso;
      new.vinculo_nome := old.vinculo_nome;
    end if;
  elsif old.tipo = 'adm' and new.tipo <> 'adm' and (select count(*) from perfis where tipo = 'adm') <= 1 then
    raise exception 'Esta é a última conta de administração: promova outra pessoa antes.';
  end if;
  return new;
end $$;
revoke all on function proteger_perfil() from public, anon, authenticated;

-- V13: convite de equipe ou administração só vale com prova de que a pessoa é dona da caixa de e-mail:
-- a passagem de "não confirmado" para "confirmado" (clique no link). Cadastrar-se com o e-mail convidado
-- não basta, mesmo se o Supabase estiver com a confirmação de e-mail desligada. Quem já tem conta e foi
-- convidada para equipe/adm é promovida pela administração, em Pessoas.
create or replace function aplicar_convite_interno(uid uuid, mail text, caixa_provada boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare c convites; atual perfis; do_adm boolean;
begin
  select * into c from convites where email = lower(mail) and aceito_em is null;
  if not found then return false; end if;
  if c.tipo in ('equipe', 'adm') and not caixa_provada then return false; end if;  -- convite continua pendente
  select * into atual from perfis where id = uid;
  do_adm := exists (select 1 from perfis where id = c.criado_por and tipo = 'adm');
  if not do_adm and (atual.tipo in ('equipe', 'adm') or atual.codigo_acesso is not null
      or (atual.tipo is distinct from c.tipo and (exists (select 1 from inscricoes_artistas where user_id = uid)
                                                  or exists (select 1 from cadastros_casas where user_id = uid)))) then
    update convites set aceito_em = now() where email = c.email;
    return false;
  end if;
  update perfis p set
    tipo = c.tipo,
    nome = case when coalesce(p.nome, '') = '' then c.nome else p.nome end,
    whatsapp = coalesce(p.whatsapp, c.whatsapp),
    codigo_acesso = case when c.tipo in ('equipe', 'adm') then null else coalesce(c.codigo_acesso, p.codigo_acesso) end,
    vinculo_nome = case when c.tipo in ('equipe', 'adm') then null else coalesce(c.vinculo_nome, p.vinculo_nome) end
  where p.id = uid;
  update convites set aceito_em = now() where email = c.email;
  return true;
end $$;
revoke all on function aplicar_convite_interno(uuid, text, boolean) from public, anon, authenticated;

-- Caminhos sem prova da caixa (cadastro, reivindicar ao entrar): só convites de artista e casa.
create or replace function aplicar_convite(uid uuid, mail text) returns boolean
language sql security definer set search_path = public as $$
  select aplicar_convite_interno(uid, mail, false);
$$;
revoke all on function aplicar_convite(uuid, text) from public, anon, authenticated;

-- Confirmação do e-mail é a prova da caixa: aqui convites de equipe/adm valem.
create or replace function ao_confirmar_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    if exists (select 1 from admins_iniciais where email = lower(new.email)) then
      update perfis set tipo = 'adm' where id = new.id;
    end if;
    perform aplicar_convite_interno(new.id, new.email, true);
  end if;
  return new;
end $$;
revoke all on function ao_confirmar_email() from public, anon, authenticated;

-- X03: links nos dados de artista e casa só podem ser http(s). Bloqueia javascript:, data:, vbscript: e file:
-- em qualquer campo de texto do formulário (inclusive listas), porque viram <a href> nas telas da equipe.
create or replace function sem_link_perigoso() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.dados is not null and exists (
    select 1 from jsonb_path_query(new.dados, 'lax $.** ? (@.type() == "string")') v
    where (v #>> '{}') ~* '^[[:space:]]*(javascript|data|vbscript|file)[[:space:]]*:'
  ) then
    raise exception 'Link inválido: use um endereço que comece com http:// ou https://.' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function sem_link_perigoso() from public, anon, authenticated;
drop trigger if exists trg_inscricao_alinks on inscricoes_artistas;
create trigger trg_inscricao_alinks before insert or update on inscricoes_artistas for each row execute function sem_link_perigoso();
drop trigger if exists trg_casa_alinks on cadastros_casas;
create trigger trg_casa_alinks before insert or update on cadastros_casas for each row execute function sem_link_perigoso();

-- V13 (cadastro): a conta que já nasce confirmada e SEM senha veio de link mágico ou convite por e-mail,
-- ou seja, a pessoa clicou num link que chegou na caixa dela: isso prova a caixa. Já quem se cadastra
-- com senha e nasce confirmada (confirmação de e-mail desligada no Supabase) não provou nada:
-- não vira adm pela lista inicial nem herda convite de equipe/adm; isso só vale ao confirmar o e-mail.
create or replace function novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pedido text := coalesce(new.raw_user_meta_data ->> 'tipo', 'artista');
  caixa_provada boolean := new.email_confirmed_at is not null and coalesce(new.encrypted_password, '') = '';
begin
  insert into perfis (id, email, nome, tipo, senha_definida)
  values (
    new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'nome', ''),
    case
      when caixa_provada and exists (select 1 from admins_iniciais where email = lower(new.email)) then 'adm'::tipo_perfil
      when pedido = 'casa' then 'casa'::tipo_perfil
      else 'artista'::tipo_perfil
    end,
    coalesce(new.encrypted_password, '') <> ''
  ) on conflict (id) do nothing;
  if new.email_confirmed_at is not null then perform aplicar_convite_interno(new.id, new.email, caixa_provada); end if;
  return new;
end $$;
revoke all on function novo_usuario() from public, anon, authenticated;
