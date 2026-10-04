-- ============================================================
-- Anotações das reuniões — Gestão de Reuniões
--
-- Rode uma vez no painel do Supabase: SQL Editor › New query › cole este
-- arquivo inteiro › Run. Precisa da tabela reunioes já criada
-- (sql/reunioes.sql). Pode rodar de novo sem problema: nada é duplicado e
-- as regras são recriadas iguais.
--
-- Cada reunião tem uma página de anotações: uma linha, criada no primeiro
-- salvamento. O texto fica em HTML, com a formatação (fonte, tamanho, cor,
-- negrito, listas…), e o começo dele em texto puro vai para o resumo que
-- aparece no cartão da reunião. Só administrador (professores.papel =
-- 'admin') lê e escreve: as anotações são de quem conduz a reunião, e o
-- professor não as vê.
-- ============================================================

-- Sem a tabela de reuniões, para aqui com uma explicação. Quase sempre é o
-- SQL Editor aberto em outro projeto: o certo é o do sistema (o endereço
-- do painel tem /project/wrdguclwncirgzlpfgjq, o mesmo de
-- backend/config/env.js).
do $$
begin
  if to_regclass('public.reunioes') is null then
    raise exception 'A tabela public.reunioes não existe neste banco.'
      using hint = 'Confira se o SQL Editor está no projeto wrdguclwncirgzlpfgjq (o do sistema). Se estiver, rode antes o arquivo sql/reunioes.sql.';
  end if;
end
$$;

create table if not exists public.anotacoes_reuniao (
  reuniao_id bigint primary key references public.reunioes (id) on delete cascade,
  conteudo text not null default '' check (char_length(conteudo) <= 1000000),
  resumo text not null default '' check (char_length(resumo) <= 300),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references auth.users (id) on delete set null
);

comment on table public.anotacoes_reuniao is
  'Anotações da Gestão de Reuniões: a página de texto formatado de cada reunião.';

-- Quando e quem salvou por último: preenchido sempre pelo banco, nunca pelo
-- navegador.
create or replace function public.anotacoes_reuniao_carimbar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end;
$$;

drop trigger if exists anotacoes_reuniao_carimbar on public.anotacoes_reuniao;
create trigger anotacoes_reuniao_carimbar
  before insert or update on public.anotacoes_reuniao
  for each row execute function public.anotacoes_reuniao_carimbar();

-- ---------- Quem pode o quê (RLS) ----------

alter table public.anotacoes_reuniao enable row level security;

-- Logado lê, cria e salva por cima (a política abaixo deixa só admin);
-- ninguém apaga pela tela. A chave anônima não acessa nada. A função
-- gestao_reunioes_eh_admin() é criada por sql/reunioes.sql.
revoke all on table public.anotacoes_reuniao from anon, authenticated;
grant select, insert, update on table public.anotacoes_reuniao to authenticated;

drop policy if exists anotacoes_reuniao_admin on public.anotacoes_reuniao;
create policy anotacoes_reuniao_admin
  on public.anotacoes_reuniao
  for all
  to authenticated
  using ((select public.gestao_reunioes_eh_admin()))
  with check ((select public.gestao_reunioes_eh_admin()));
