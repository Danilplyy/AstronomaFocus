-- Информационные разделы АРСЕНАЛА. Повторный запуск безопасен.
create table if not exists public.arsenal_public_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.arsenal_country_events (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references public.countries(code) on delete cascade,
  title text not null,
  body text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.arsenal_newspaper_posts (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references public.countries(code) on delete cascade,
  title text not null,
  body text not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz
);
alter table public.arsenal_public_posts enable row level security;
alter table public.arsenal_country_events enable row level security;
alter table public.arsenal_newspaper_posts enable row level security;

drop policy if exists "arsenal news read authenticated" on public.arsenal_public_posts;
create policy "arsenal news read authenticated" on public.arsenal_public_posts
 for select to authenticated using (true);
drop policy if exists "arsenal news admin insert" on public.arsenal_public_posts;
create policy "arsenal news admin insert" on public.arsenal_public_posts
 for insert to authenticated with check (public.is_admin() and created_by=auth.uid());
drop policy if exists "arsenal news admin delete" on public.arsenal_public_posts;
create policy "arsenal news admin delete" on public.arsenal_public_posts
 for delete to authenticated using (public.is_admin());

drop policy if exists "arsenal events country read" on public.arsenal_country_events;
create policy "arsenal events country read" on public.arsenal_country_events
 for select to authenticated using (
   public.is_admin() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.country_code=arsenal_country_events.country_code)
 );
drop policy if exists "arsenal events admin insert" on public.arsenal_country_events;
create policy "arsenal events admin insert" on public.arsenal_country_events
 for insert to authenticated with check (public.is_admin() and created_by=auth.uid());
drop policy if exists "arsenal events admin update" on public.arsenal_country_events;
create policy "arsenal events admin update" on public.arsenal_country_events
 for update to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "arsenal events admin delete" on public.arsenal_country_events;
create policy "arsenal events admin delete" on public.arsenal_country_events
 for delete to authenticated using(public.is_admin());

drop policy if exists "arsenal papers visible" on public.arsenal_newspaper_posts;
create policy "arsenal papers visible" on public.arsenal_newspaper_posts
 for select to authenticated using(status='approved' or created_by=auth.uid() or public.is_admin());
drop policy if exists "arsenal papers submit own" on public.arsenal_newspaper_posts;
create policy "arsenal papers submit own" on public.arsenal_newspaper_posts
 for insert to authenticated with check (
   created_by=auth.uid() and status='pending' and exists(
     select 1 from public.profiles p where p.id=auth.uid() and p.country_code=arsenal_newspaper_posts.country_code
   )
 );
drop policy if exists "arsenal papers admin moderate" on public.arsenal_newspaper_posts;
create policy "arsenal papers admin moderate" on public.arsenal_newspaper_posts
 for update to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "arsenal papers admin delete" on public.arsenal_newspaper_posts;
create policy "arsenal papers admin delete" on public.arsenal_newspaper_posts
 for delete to authenticated using(public.is_admin());

grant select,insert,update,delete on public.arsenal_public_posts to authenticated;
grant select,insert,update,delete on public.arsenal_country_events to authenticated;
grant select,insert,update,delete on public.arsenal_newspaper_posts to authenticated;
