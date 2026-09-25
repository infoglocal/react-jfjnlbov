-- =============================================================================
-- GLOCAL — Eventi (popup locandine + portale partner)
-- Da incollare in Supabase: SQL Editor -> New query -> Run. Si può rilanciare.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. LOCALI (venues)
--    Un locale partner. card_id = id della card nel Google Sheet, se esiste:
--    così l'evento eredita il collegamento alla scheda del posto.
-- ---------------------------------------------------------------------------
create table if not exists public.venues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  card_id     text,
  address     text,
  lat         double precision,
  lng         double precision,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. PROFILI — uno per ogni account (creato in automatico all'invito).
--    role: 'admin' (tu) oppure 'partner' (un locale, collegato a venue_id).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text,
  role        text not null default 'partner' check (role in ('admin', 'partner')),
  venue_id    uuid references public.venues on delete set null,
  created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. EVENTI
--    schedule_type:
--      'single'    -> start_date (+ orari facoltativi)
--      'range'     -> dal start_date al end_date (es. una mostra)
--      'recurring' -> ogni settimana nei giorni "weekdays", da start_date,
--                     fino a end_date (vuoto = senza fine)
--    weekdays: 0 = domenica, 1 = lunedì … 6 = sabato
--    Date e orari sono ora locale di Bologna.
--    status: draft (bozza) · pending (da approvare) · approved · rejected
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id             uuid primary key default gen_random_uuid(),
  venue_id       uuid references public.venues on delete set null,
  created_by     uuid references auth.users on delete set null,

  title_it       text not null,
  title_en       text,
  desc_it        text,
  desc_en        text,
  poster_url     text not null,
  link_url       text,

  -- luogo, se l'evento non è legato a un locale (venue_id vuoto)
  place_name     text,
  address        text,
  lat            double precision,
  lng            double precision,

  schedule_type  text not null default 'single'
                 check (schedule_type in ('single', 'range', 'recurring')),
  start_date     date not null,
  end_date       date,
  start_time     time,
  end_time       time,
  weekdays       smallint[],

  status         text not null default 'pending'
                 check (status in ('draft', 'pending', 'approved', 'rejected')),
  review_note    text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint events_range_ok check (end_date is null or end_date >= start_date),
  constraint events_recurring_days check (
    schedule_type <> 'recurring' or coalesce(array_length(weekdays, 1), 0) > 0
  )
);

create index if not exists events_status_idx on public.events (status, start_date);
create index if not exists events_venue_idx  on public.events (venue_id);

-- ---------------------------------------------------------------------------
-- 4. FUNZIONI DI SUPPORTO (chi sono? sono admin? qual è il mio locale?)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_venue_id()
returns uuid language sql stable security definer set search_path = public as $$
  select venue_id from public.profiles where id = auth.uid();
$$;

-- Regole automatiche sugli eventi dei partner:
--  - l'evento è sempre del locale del partner (non può sceglierne un altro)
--  - un partner non può approvarsi da solo: tutto va in 'pending'
--  - se modifica un evento già approvato, torna in revisione
create or replace function public.events_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is null or public.is_admin() then
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
    return new;
  end if;
  new.venue_id := public.my_venue_id();
  new.status := case when new.status = 'draft' then 'draft' else 'pending' end;
  new.review_note := case when tg_op = 'UPDATE' then null else new.review_note end;
  if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  return new;
end $$;

drop trigger if exists events_guard on public.events;
create trigger events_guard
  before insert or update on public.events
  for each row execute function public.events_guard();

-- ---------------------------------------------------------------------------
-- 5. SICUREZZA (Row Level Security)
-- ---------------------------------------------------------------------------
alter table public.venues   enable row level security;
alter table public.profiles enable row level security;
alter table public.events   enable row level security;

-- VENUES: nome e indirizzo sono pubblici (servono all'app); scrive solo l'admin
drop policy if exists "venues public read" on public.venues;
create policy "venues public read" on public.venues for select using (true);
drop policy if exists "venues admin write" on public.venues;
create policy "venues admin write" on public.venues for all
  using (public.is_admin()) with check (public.is_admin());

-- PROFILES: ognuno vede il proprio; l'admin vede e modifica tutti.
-- (Nessuno può cambiarsi il ruolo da solo.)
drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own" on public.profiles for select
  using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles admin write" on public.profiles;
create policy "profiles admin write" on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- EVENTS
-- chiunque (anche i turisti non loggati) vede solo gli eventi approvati
drop policy if exists "events public read approved" on public.events;
create policy "events public read approved" on public.events for select
  using (status = 'approved');
-- il partner vede tutti gli eventi del proprio locale (anche bozze e in attesa)
drop policy if exists "events partner read own" on public.events;
create policy "events partner read own" on public.events for select
  using (venue_id is not null and venue_id = public.my_venue_id());
-- il partner crea / modifica / cancella solo gli eventi del proprio locale
drop policy if exists "events partner insert" on public.events;
create policy "events partner insert" on public.events for insert
  with check (venue_id is not null and venue_id = public.my_venue_id());
drop policy if exists "events partner update" on public.events;
create policy "events partner update" on public.events for update
  using (venue_id = public.my_venue_id())
  with check (venue_id = public.my_venue_id());
drop policy if exists "events partner delete" on public.events;
create policy "events partner delete" on public.events for delete
  using (venue_id = public.my_venue_id());
-- l'admin può tutto
drop policy if exists "events admin all" on public.events;
create policy "events admin all" on public.events for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. STORAGE — bucket "posters" per le locandine
--    Lettura pubblica; max 5 MB; solo jpg/png/webp.
--    Ogni utente carica solo nella propria cartella (<id utente>/file.jpg).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posters', 'posters', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "posters upload own folder" on storage.objects;
create policy "posters upload own folder" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'posters'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
drop policy if exists "posters delete own folder" on storage.objects;
create policy "posters delete own folder" on storage.objects for delete to authenticated
  using (
    bucket_id = 'posters'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- =============================================================================
-- FATTO. Dopo aver invitato te stesso (Authentication -> Users -> Invite user)
-- e aver cliccato il link nell'email, rendi admin il tuo account:
--
--   update public.profiles set role = 'admin' where email = 'LA-TUA-EMAIL';
-- =============================================================================
