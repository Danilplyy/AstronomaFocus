-- Индивидуальные отметки прочтения новостей АРСЕНАЛА.
-- Выполнить в Supabase SQL Editor один раз.

create table if not exists public.arsenal_news_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  section text not null check (section in ('home', 'papers', 'events')),
  post_id text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, section, post_id)
);

-- Расширяем перечень разделов для уже созданной таблицы.
alter table public.arsenal_news_reads drop constraint if exists arsenal_news_reads_section_check;
alter table public.arsenal_news_reads
  add constraint arsenal_news_reads_section_check
  check (section in ('home', 'papers', 'events'));

alter table public.arsenal_news_reads enable row level security;

drop policy if exists "Users read own news receipts" on public.arsenal_news_reads;
create policy "Users read own news receipts"
  on public.arsenal_news_reads for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users insert own news receipts" on public.arsenal_news_reads;
create policy "Users insert own news receipts"
  on public.arsenal_news_reads for insert
  to authenticated
  with check (auth.uid() = user_id);

grant select, insert on public.arsenal_news_reads to authenticated;
