-- Run this in Supabase SQL Editor if you need a minimal starting policy set.
-- Access is restricted to emails registered in public.allowed_users.

alter table if exists public.allowed_users enable row level security;
alter table if exists public.nodes enable row level security;
alter table if exists public.threads enable row level security;
alter table if exists public.entries enable row level security;

drop policy if exists "allowed_users_select_self" on public.allowed_users;
create policy "allowed_users_select_self"
on public.allowed_users for select
to authenticated
using (email = lower(auth.jwt() ->> 'email'));

drop policy if exists "nodes_select_authenticated" on public.nodes;
drop policy if exists "nodes_insert_authenticated" on public.nodes;
drop policy if exists "nodes_select_allowlisted" on public.nodes;
create policy "nodes_select_allowlisted"
on public.nodes for select
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "nodes_insert_allowlisted" on public.nodes;
create policy "nodes_insert_allowlisted"
on public.nodes for insert
to authenticated
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "threads_select_authenticated" on public.threads;
drop policy if exists "threads_insert_authenticated" on public.threads;
drop policy if exists "threads_select_allowlisted" on public.threads;
create policy "threads_select_allowlisted"
on public.threads for select
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "threads_insert_allowlisted" on public.threads;
create policy "threads_insert_allowlisted"
on public.threads for insert
to authenticated
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "entries_select_authenticated" on public.entries;
drop policy if exists "entries_insert_authenticated" on public.entries;
drop policy if exists "entries_select_allowlisted" on public.entries;
create policy "entries_select_allowlisted"
on public.entries for select
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "entries_insert_allowlisted" on public.entries;
create policy "entries_insert_allowlisted"
on public.entries for insert
to authenticated
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);
