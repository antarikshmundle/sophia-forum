-- Sophia CMS · 7b · team_members, events, gallery_items (one column per existing Admin form field, plus
-- is_published) and site_content (the existing home/About text sections). Same pattern as faculty (migration 3):
-- RLS in the same migration, public read of published rows only, admin-only writes, explicit column grants, the
-- updated-fields trigger and the audit trigger (migration 6). URL columns keep the existing form rule:
-- an http(s) URL or a site path starting with "/". Ids are slugs (CrudManager SLUG_PATTERN) and insert-only.

-- ---------------------------------------------------------------- team_members (Team Manager)
create table public.team_members (
  id               text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name             text not null check (length(trim(name)) > 0),
  role             text not null check (length(trim(role)) > 0),
  category         text not null check (category in (
                     'President', 'Vice President', 'Secretary', 'Joint Secretary', 'Technical Team',
                     'Event Management Team', 'Social Media Team', 'Cultural Team', 'Promotional Team',
                     'Documentation Team', 'Girls Representative', 'Sports Team')),
  photo            text check (photo is null or photo ~ '^(https?://[^\s]+|/[^\s]*)$'),
  quote            text check (quote is null or length(trim(quote)) > 0),
  bio              text check (bio is null or length(trim(bio)) > 0),
  skills           text[] not null default '{}',
  linkedin         text check (linkedin is null or linkedin ~ '^(https?://[^\s]+|/[^\s]*)$'),
  github           text check (github is null or github ~ '^(https?://[^\s]+|/[^\s]*)$'),
  instagram        text check (instagram is null or instagram ~ '^(https?://[^\s]+|/[^\s]*)$'),
  twitter          text check (twitter is null or twitter ~ '^(https?://[^\s]+|/[^\s]*)$'),
  website          text check (website is null or website ~ '^(https?://[^\s]+|/[^\s]*)$'),
  sort_order       integer not null check (sort_order >= 0),
  is_creator_badge boolean not null default false,
  is_published     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid default auth.uid() references auth.users (id) on delete set null
);
create index team_members_published_order on public.team_members (is_published, sort_order);

-- ---------------------------------------------------------------- events (Events Manager)
create table public.events (
  id                text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name              text not null check (length(trim(name)) > 0),
  event_date        date not null,
  event_time        text check (event_time is null or length(trim(event_time)) > 0),
  venue             text not null check (length(trim(venue)) > 0),
  status            text not null default 'upcoming' check (status in ('upcoming', 'completed', 'past')),
  description       text not null check (length(trim(description)) > 0),
  poster            text not null check (poster ~ '^(https?://[^\s]+|/[^\s]*)$'),
  registration_link text check (registration_link is null or registration_link ~ '^(https?://[^\s]+|/[^\s]*)$'),
  is_featured       boolean not null default false,
  is_published      boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid default auth.uid() references auth.users (id) on delete set null,
  constraint events_featured_upcoming check (not is_featured or status = 'upcoming')   -- the form's existing rule
);
create index events_published_date on public.events (is_published, event_date);

-- ---------------------------------------------------------------- gallery_items (Gallery Manager)
create table public.gallery_items (
  id            text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title         text not null check (length(trim(title)) > 0),
  category      text not null check (category in ('photo', 'video')),
  event         text not null check (length(trim(event)) > 0),
  year          integer not null check (year between 2000 and 2100),
  url           text not null check (url ~ '^(https?://[^\s]+|/[^\s]*)$'),
  thumbnail_url text check (thumbnail_url is null or thumbnail_url ~ '^(https?://[^\s]+|/[^\s]*)$'),
  is_featured   boolean not null default false,
  is_published  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid default auth.uid() references auth.users (id) on delete set null
);
create index gallery_items_published on public.gallery_items (is_published, category, year);

-- ---------------------------------------------------------------- site_content (Content tab)
-- One row per existing page section (e.g. 'home.hero', 'about.pillars'); the app defines the sections and their
-- fields. Sections are never deleted through the API.
create table public.site_content (
  id         text primary key check (id ~ '^[a-z]+\.[a-z]+(-[a-z]+)*$'),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 65536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

-- ---------------------------------------------------------------- triggers (shared functions from migrations 1 and 6)
create trigger team_members_set_updated_fields before update on public.team_members for each row execute function public.set_updated_fields();
create trigger events_set_updated_fields before update on public.events for each row execute function public.set_updated_fields();
create trigger gallery_items_set_updated_fields before update on public.gallery_items for each row execute function public.set_updated_fields();
create trigger site_content_set_updated_fields before update on public.site_content for each row execute function public.set_updated_fields();

create trigger team_members_audit after insert or update or delete on public.team_members for each row execute function public.write_audit_log();
create trigger events_audit after insert or update or delete on public.events for each row execute function public.write_audit_log();
create trigger gallery_items_audit after insert or update or delete on public.gallery_items for each row execute function public.write_audit_log();
create trigger site_content_audit after insert or update or delete on public.site_content for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------- RLS
alter table public.team_members enable row level security;
alter table public.events enable row level security;
alter table public.gallery_items enable row level security;
alter table public.site_content enable row level security;

create policy team_members_public_read on public.team_members for select to anon, authenticated using (is_published);
create policy team_members_admin_read on public.team_members for select to authenticated using ((select public.app_role()) = 'admin');
create policy team_members_admin_insert on public.team_members for insert to authenticated with check ((select public.app_role()) = 'admin');
create policy team_members_admin_update on public.team_members for update to authenticated using ((select public.app_role()) = 'admin') with check ((select public.app_role()) = 'admin');
create policy team_members_admin_delete on public.team_members for delete to authenticated using ((select public.app_role()) = 'admin');

create policy events_public_read on public.events for select to anon, authenticated using (is_published);
create policy events_admin_read on public.events for select to authenticated using ((select public.app_role()) = 'admin');
create policy events_admin_insert on public.events for insert to authenticated with check ((select public.app_role()) = 'admin');
create policy events_admin_update on public.events for update to authenticated using ((select public.app_role()) = 'admin') with check ((select public.app_role()) = 'admin');
create policy events_admin_delete on public.events for delete to authenticated using ((select public.app_role()) = 'admin');

create policy gallery_items_public_read on public.gallery_items for select to anon, authenticated using (is_published);
create policy gallery_items_admin_read on public.gallery_items for select to authenticated using ((select public.app_role()) = 'admin');
create policy gallery_items_admin_insert on public.gallery_items for insert to authenticated with check ((select public.app_role()) = 'admin');
create policy gallery_items_admin_update on public.gallery_items for update to authenticated using ((select public.app_role()) = 'admin') with check ((select public.app_role()) = 'admin');
create policy gallery_items_admin_delete on public.gallery_items for delete to authenticated using ((select public.app_role()) = 'admin');

create policy site_content_public_read on public.site_content for select to anon, authenticated using (true);
create policy site_content_admin_insert on public.site_content for insert to authenticated with check ((select public.app_role()) = 'admin');
create policy site_content_admin_update on public.site_content for update to authenticated using ((select public.app_role()) = 'admin') with check ((select public.app_role()) = 'admin');

-- ---------------------------------------------------------------- explicit grants (the public key never reads updated_by; ids are insert-only)
revoke all on table public.team_members, public.events, public.gallery_items, public.site_content from anon, authenticated;

grant select (id, name, role, category, photo, quote, bio, skills, linkedin, github, instagram, twitter, website, sort_order, is_creator_badge, is_published)
  on table public.team_members to anon;
grant select on table public.team_members to authenticated;
grant insert (id, name, role, category, photo, quote, bio, skills, linkedin, github, instagram, twitter, website, sort_order, is_creator_badge, is_published)
  on table public.team_members to authenticated;
grant update (name, role, category, photo, quote, bio, skills, linkedin, github, instagram, twitter, website, sort_order, is_creator_badge, is_published)
  on table public.team_members to authenticated;
grant delete on table public.team_members to authenticated;

grant select (id, name, event_date, event_time, venue, status, description, poster, registration_link, is_featured, is_published)
  on table public.events to anon;
grant select on table public.events to authenticated;
grant insert (id, name, event_date, event_time, venue, status, description, poster, registration_link, is_featured, is_published)
  on table public.events to authenticated;
grant update (name, event_date, event_time, venue, status, description, poster, registration_link, is_featured, is_published)
  on table public.events to authenticated;
grant delete on table public.events to authenticated;

grant select (id, title, category, event, year, url, thumbnail_url, is_featured, is_published)
  on table public.gallery_items to anon;
grant select on table public.gallery_items to authenticated;
grant insert (id, title, category, event, year, url, thumbnail_url, is_featured, is_published)
  on table public.gallery_items to authenticated;
grant update (title, category, event, year, url, thumbnail_url, is_featured, is_published)
  on table public.gallery_items to authenticated;
grant delete on table public.gallery_items to authenticated;

grant select (id, data) on table public.site_content to anon;
grant select on table public.site_content to authenticated;
grant insert (id, data) on table public.site_content to authenticated;
grant update (data) on table public.site_content to authenticated;
