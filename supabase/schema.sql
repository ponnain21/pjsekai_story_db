-- Project Sekai Story DB minimal schema
-- Run this first in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.allowed_users (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

create table if not exists public.nodes (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('game', 'arc', 'session')),
  title text not null,
  parent_id uuid null references public.nodes (id) on delete cascade,
  scheduled_on date null,
  tags text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table if exists public.nodes
  add column if not exists scheduled_on date null;
alter table if exists public.nodes
  add column if not exists tags text[] not null default '{}';
alter table if exists public.nodes
  add column if not exists sort_order integer not null default 0;

create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.nodes (id) on delete cascade,
  title text not null,
  has_episodes boolean not null default false,
  scheduled_on date null,
  tags text[] not null default '{}',
  body text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table if exists public.threads
  add column if not exists has_episodes boolean not null default false;
alter table if exists public.threads
  add column if not exists scheduled_on date null;
alter table if exists public.threads
  add column if not exists tags text[] not null default '{}';
alter table if exists public.threads
  add column if not exists body text not null default '';
alter table if exists public.threads
  add column if not exists sort_order integer not null default 0;

create table if not exists public.subitem_episodes (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads (id) on delete cascade,
  title text not null,
  body text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table if exists public.subitem_episodes
  add column if not exists sort_order integer not null default 0;

create table if not exists public.subitem_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  scheduled_on date null,
  tags text[] not null default '{}',
  body text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table if exists public.subitem_templates
  add column if not exists sort_order integer not null default 0;

create table if not exists public.subitem_tag_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table if exists public.subitem_tag_presets
  add column if not exists sort_order integer not null default 0;

create table if not exists public.parser_filter_terms (
  id uuid primary key default gen_random_uuid(),
  term text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.parser_line_classifications (
  id uuid primary key default gen_random_uuid(),
  line_text text not null unique,
  classification text not null check (classification in ('speaker', 'direction')),
  created_at timestamptz not null default now()
);

create table if not exists public.speaker_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon_url text null,
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
create index if not exists idx_nodes_sort_order on public.nodes (sort_order);
create index if not exists idx_threads_node_id on public.threads (node_id);
create index if not exists idx_threads_sort_order on public.threads (sort_order);
create index if not exists idx_subitem_episodes_thread_id on public.subitem_episodes (thread_id);
create index if not exists idx_subitem_episodes_sort_order on public.subitem_episodes (sort_order);
create index if not exists idx_subitem_templates_sort_order on public.subitem_templates (sort_order);
create index if not exists idx_subitem_tag_presets_sort_order on public.subitem_tag_presets (sort_order);
create index if not exists idx_parser_filter_terms_term on public.parser_filter_terms (term);
create index if not exists idx_parser_line_classifications_line_text on public.parser_line_classifications (line_text);
create index if not exists idx_speaker_profiles_name on public.speaker_profiles (name);
create index if not exists idx_entries_thread_id on public.entries (thread_id);
