-- Run this in Supabase SQL Editor if you need a minimal starting policy set.
-- Access is restricted to emails registered in public.allowed_users.

alter table if exists public.allowed_users enable row level security;
alter table if exists public.nodes enable row level security;
alter table if exists public.threads enable row level security;
alter table if exists public.subitem_episodes enable row level security;
alter table if exists public.entries enable row level security;
alter table if exists public.subitem_templates enable row level security;
alter table if exists public.subitem_tag_presets enable row level security;
alter table if exists public.episode_tag_presets enable row level security;
alter table if exists public.body_tag_presets enable row level security;
alter table if exists public.parser_filter_terms enable row level security;
alter table if exists public.parser_line_classifications enable row level security;
alter table if exists public.speaker_profiles enable row level security;

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

drop policy if exists "nodes_update_allowlisted" on public.nodes;
create policy "nodes_update_allowlisted"
on public.nodes for update
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
)
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "nodes_delete_allowlisted" on public.nodes;
create policy "nodes_delete_allowlisted"
on public.nodes for delete
to authenticated
using (
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

drop policy if exists "threads_update_allowlisted" on public.threads;
create policy "threads_update_allowlisted"
on public.threads for update
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
)
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "threads_delete_allowlisted" on public.threads;
create policy "threads_delete_allowlisted"
on public.threads for delete
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "subitem_episodes_select_allowlisted" on public.subitem_episodes;
create policy "subitem_episodes_select_allowlisted"
on public.subitem_episodes for select
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "subitem_episodes_insert_allowlisted" on public.subitem_episodes;
create policy "subitem_episodes_insert_allowlisted"
on public.subitem_episodes for insert
to authenticated
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "subitem_episodes_update_allowlisted" on public.subitem_episodes;
create policy "subitem_episodes_update_allowlisted"
on public.subitem_episodes for update
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
)
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "subitem_episodes_delete_allowlisted" on public.subitem_episodes;
create policy "subitem_episodes_delete_allowlisted"
on public.subitem_episodes for delete
to authenticated
using (
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

drop policy if exists "entries_update_allowlisted" on public.entries;
create policy "entries_update_allowlisted"
on public.entries for update
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
)
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "entries_delete_allowlisted" on public.entries;
create policy "entries_delete_allowlisted"
on public.entries for delete
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "subitem_templates_select_allowlisted" on public.subitem_templates;
create policy "subitem_templates_select_allowlisted"
on public.subitem_templates for select
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "subitem_templates_insert_allowlisted" on public.subitem_templates;
create policy "subitem_templates_insert_allowlisted"
on public.subitem_templates for insert
to authenticated
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "subitem_templates_update_allowlisted" on public.subitem_templates;
create policy "subitem_templates_update_allowlisted"
on public.subitem_templates for update
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
)
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "subitem_templates_delete_allowlisted" on public.subitem_templates;
create policy "subitem_templates_delete_allowlisted"
on public.subitem_templates for delete
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "subitem_tag_presets_select_allowlisted" on public.subitem_tag_presets;
create policy "subitem_tag_presets_select_allowlisted"
on public.subitem_tag_presets for select
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "subitem_tag_presets_insert_allowlisted" on public.subitem_tag_presets;
create policy "subitem_tag_presets_insert_allowlisted"
on public.subitem_tag_presets for insert
to authenticated
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "subitem_tag_presets_update_allowlisted" on public.subitem_tag_presets;
create policy "subitem_tag_presets_update_allowlisted"
on public.subitem_tag_presets for update
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
)
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "subitem_tag_presets_delete_allowlisted" on public.subitem_tag_presets;
create policy "subitem_tag_presets_delete_allowlisted"
on public.subitem_tag_presets for delete
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "episode_tag_presets_select_allowlisted" on public.episode_tag_presets;
create policy "episode_tag_presets_select_allowlisted"
on public.episode_tag_presets for select
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "episode_tag_presets_insert_allowlisted" on public.episode_tag_presets;
create policy "episode_tag_presets_insert_allowlisted"
on public.episode_tag_presets for insert
to authenticated
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "episode_tag_presets_update_allowlisted" on public.episode_tag_presets;
create policy "episode_tag_presets_update_allowlisted"
on public.episode_tag_presets for update
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
)
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "episode_tag_presets_delete_allowlisted" on public.episode_tag_presets;
create policy "episode_tag_presets_delete_allowlisted"
on public.episode_tag_presets for delete
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "body_tag_presets_select_allowlisted" on public.body_tag_presets;
create policy "body_tag_presets_select_allowlisted"
on public.body_tag_presets for select
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "body_tag_presets_insert_allowlisted" on public.body_tag_presets;
create policy "body_tag_presets_insert_allowlisted"
on public.body_tag_presets for insert
to authenticated
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "body_tag_presets_update_allowlisted" on public.body_tag_presets;
create policy "body_tag_presets_update_allowlisted"
on public.body_tag_presets for update
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
)
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "body_tag_presets_delete_allowlisted" on public.body_tag_presets;
create policy "body_tag_presets_delete_allowlisted"
on public.body_tag_presets for delete
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "parser_filter_terms_select_allowlisted" on public.parser_filter_terms;
create policy "parser_filter_terms_select_allowlisted"
on public.parser_filter_terms for select
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "parser_filter_terms_insert_allowlisted" on public.parser_filter_terms;
create policy "parser_filter_terms_insert_allowlisted"
on public.parser_filter_terms for insert
to authenticated
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "parser_filter_terms_update_allowlisted" on public.parser_filter_terms;
create policy "parser_filter_terms_update_allowlisted"
on public.parser_filter_terms for update
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
)
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "parser_filter_terms_delete_allowlisted" on public.parser_filter_terms;
create policy "parser_filter_terms_delete_allowlisted"
on public.parser_filter_terms for delete
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "parser_line_classifications_select_allowlisted" on public.parser_line_classifications;
create policy "parser_line_classifications_select_allowlisted"
on public.parser_line_classifications for select
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "parser_line_classifications_insert_allowlisted" on public.parser_line_classifications;
create policy "parser_line_classifications_insert_allowlisted"
on public.parser_line_classifications for insert
to authenticated
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "parser_line_classifications_update_allowlisted" on public.parser_line_classifications;
create policy "parser_line_classifications_update_allowlisted"
on public.parser_line_classifications for update
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
)
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "parser_line_classifications_delete_allowlisted" on public.parser_line_classifications;
create policy "parser_line_classifications_delete_allowlisted"
on public.parser_line_classifications for delete
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "speaker_profiles_select_allowlisted" on public.speaker_profiles;
create policy "speaker_profiles_select_allowlisted"
on public.speaker_profiles for select
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "speaker_profiles_insert_allowlisted" on public.speaker_profiles;
create policy "speaker_profiles_insert_allowlisted"
on public.speaker_profiles for insert
to authenticated
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "speaker_profiles_update_allowlisted" on public.speaker_profiles;
create policy "speaker_profiles_update_allowlisted"
on public.speaker_profiles for update
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
)
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "speaker_profiles_delete_allowlisted" on public.speaker_profiles;
create policy "speaker_profiles_delete_allowlisted"
on public.speaker_profiles for delete
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.email = lower(auth.jwt() ->> 'email')
  )
);
