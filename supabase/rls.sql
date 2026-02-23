-- Run this in Supabase SQL Editor if you need a minimal starting policy set.
-- Adjust for your real ownership model if needed.

alter table if exists public.nodes enable row level security;
alter table if exists public.threads enable row level security;
alter table if exists public.entries enable row level security;

drop policy if exists "nodes_select_authenticated" on public.nodes;
create policy "nodes_select_authenticated"
on public.nodes for select
to authenticated
using (true);

drop policy if exists "nodes_insert_authenticated" on public.nodes;
create policy "nodes_insert_authenticated"
on public.nodes for insert
to authenticated
with check (true);

drop policy if exists "threads_select_authenticated" on public.threads;
create policy "threads_select_authenticated"
on public.threads for select
to authenticated
using (true);

drop policy if exists "threads_insert_authenticated" on public.threads;
create policy "threads_insert_authenticated"
on public.threads for insert
to authenticated
with check (true);

drop policy if exists "entries_select_authenticated" on public.entries;
create policy "entries_select_authenticated"
on public.entries for select
to authenticated
using (true);

drop policy if exists "entries_insert_authenticated" on public.entries;
create policy "entries_insert_authenticated"
on public.entries for insert
to authenticated
with check (true);
