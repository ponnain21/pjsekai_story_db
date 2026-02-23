-- Project Sekai Story DB minimal schema
-- Run this first in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.nodes (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('game', 'arc', 'session')),
  title text not null,
  parent_id uuid null references public.nodes (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.nodes (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads (id) on delete cascade,
  kind text not null check (kind in ('utterance', 'stage', 'note')),
  speaker_name text null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_nodes_parent_id on public.nodes (parent_id);
create index if not exists idx_threads_node_id on public.threads (node_id);
create index if not exists idx_entries_thread_id on public.entries (thread_id);
