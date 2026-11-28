-- Discord notifications for newly published global news.
-- Run once in Supabase SQL Editor.
create table if not exists public.arsenal_discord_news_notifications (
  post_id uuid primary key references public.arsenal_public_posts(id) on delete cascade,
  status text not null default 'sending' check (status in ('sending','sent')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.arsenal_discord_news_notifications enable row level security;
revoke all on public.arsenal_discord_news_notifications from anon, authenticated;
grant all on public.arsenal_discord_news_notifications to service_role;
