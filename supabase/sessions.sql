-- =============================================================================
-- GLOCAL — Date dei tour / esperienze e prenotazioni (es. Giacomo)
-- Da incollare in Supabase: SQL Editor -> New query -> Run. Si può rilanciare.
-- Richiede schema.sql già eseguito (venues, profiles, is_admin, my_venue_id).
--
-- Come funziona:
--   - Il partner (es. una guida) entra nel portale /partner e inserisce le date
--     del suo tour: giorno e ora, durata, posti, prezzo a persona, lingua.
--   - Il tour è una card del Google Sheet con booking = sessioni; il suo
--     "locale" in venues ha card_id = id della card.
--   - Il turista vede le prossime date con i posti rimasti e prenota subito
--     (pagamento sul posto). I posti si scalano in modo sicuro (book_session).
--   - I dati dei turisti NON sono leggibili dall'app pubblica: li vedono solo
--     il partner (per le proprie date) e l'admin.
-- =============================================================================

-- 1. DATE (sessioni)
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references public.venues on delete cascade,
  starts_at     timestamptz not null,
  duration_min  integer not null default 120 check (duration_min between 15 and 1440),
  capacity      integer not null check (capacity between 1 and 200),
  price_eur     numeric(8,2) check (price_eur is null or price_eur >= 0),
  language      text,
  note          text,
  cancelled     boolean not null default false,
  created_by    uuid references auth.users on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists sessions_venue_idx on public.sessions (venue_id, starts_at);

-- 2. PRENOTAZIONI
create table if not exists public.session_bookings (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions on delete cascade,
  people      integer not null check (people between 1 and 50),
  name        text not null,
  email       text not null,
  phone       text not null,
  notes       text,
  lang        text,
  source      text,
  status      text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at  timestamptz not null default now()
);
create index if not exists session_bookings_session_idx on public.session_bookings (session_id);

-- 3. REGOLE AUTOMATICHE: il partner crea date solo per il proprio locale
create or replace function public.sessions_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
    return new;
  end if;
  new.venue_id := public.my_venue_id();
  if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  return new;
end $$;

drop trigger if exists sessions_guard on public.sessions;
create trigger sessions_guard
  before insert or update on public.sessions
  for each row execute function public.sessions_guard();

-- 4. SICUREZZA
alter table public.sessions         enable row level security;
alter table public.session_bookings enable row level security;

-- l'app pubblica legge le date tramite la funzione sessions_for_card (sotto),
-- che restituisce solo date future e i posti rimasti, senza dati dei turisti.
drop policy if exists "sessions partner own" on public.sessions;
create policy "sessions partner own" on public.sessions for all
  using (venue_id = public.my_venue_id())
  with check (venue_id = public.my_venue_id());
drop policy if exists "sessions admin all" on public.sessions;
create policy "sessions admin all" on public.sessions for all
  using (public.is_admin()) with check (public.is_admin());

-- prenotazioni: le vede (e può annullarle) il partner della data, e l'admin.
-- Nessuno le inserisce direttamente: si passa da book_session.
drop policy if exists "bookings partner read" on public.session_bookings;
create policy "bookings partner read" on public.session_bookings for select
  using (exists (select 1 from public.sessions s where s.id = session_id and s.venue_id = public.my_venue_id()));
drop policy if exists "bookings partner update" on public.session_bookings;
create policy "bookings partner update" on public.session_bookings for update
  using (exists (select 1 from public.sessions s where s.id = session_id and s.venue_id = public.my_venue_id()))
  with check (exists (select 1 from public.sessions s where s.id = session_id and s.venue_id = public.my_venue_id()));
drop policy if exists "bookings admin all" on public.session_bookings;
create policy "bookings admin all" on public.session_bookings for all
  using (public.is_admin()) with check (public.is_admin());

-- 5. FUNZIONI PER L'APP PUBBLICA

-- Prossime date di una card, con i posti rimasti.
create or replace function public.sessions_for_card(p_card_id text)
returns table (
  id uuid, starts_at timestamptz, duration_min integer, capacity integer,
  price_eur numeric, language text, note text, seats_left integer
)
language sql stable security definer set search_path = public as $$
  select s.id, s.starts_at, s.duration_min, s.capacity, s.price_eur, s.language, s.note,
         greatest(0, s.capacity - coalesce((
           select sum(b.people) from public.session_bookings b
           where b.session_id = s.id and b.status = 'confirmed'), 0))::integer as seats_left
  from public.sessions s
  join public.venues v on v.id = s.venue_id
  where v.card_id = p_card_id
    and not s.cancelled
    and s.starts_at > now() + interval '2 hours'
    and s.starts_at < now() + interval '120 days'
  order by s.starts_at
  limit 60;
$$;

-- Prenota: controlla i posti in modo sicuro (blocca la riga della data
-- finché ha finito) e restituisce l'id della prenotazione.
create or replace function public.book_session(
  p_session_id uuid, p_people integer, p_name text, p_email text, p_phone text,
  p_notes text default null, p_lang text default null, p_source text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s public.sessions%rowtype;
  taken integer;
  new_id uuid;
begin
  if p_people is null or p_people < 1 or p_people > 20 then raise exception 'invalid_people'; end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_email), '') = '' or coalesce(trim(p_phone), '') = '' then
    raise exception 'missing_fields';
  end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;

  select * into s from public.sessions where id = p_session_id for update;
  if not found or s.cancelled or s.starts_at <= now() + interval '2 hours' then
    raise exception 'session_unavailable';
  end if;

  select coalesce(sum(people), 0) into taken
  from public.session_bookings where session_id = p_session_id and status = 'confirmed';
  if taken + p_people > s.capacity then raise exception 'not_enough_seats'; end if;

  insert into public.session_bookings (session_id, people, name, email, phone, notes, lang, source)
  values (p_session_id, p_people, left(trim(p_name), 120), left(trim(p_email), 160), left(trim(p_phone), 40),
          nullif(left(trim(coalesce(p_notes, '')), 1000), ''), left(p_lang, 5), left(p_source, 120))
  returning id into new_id;
  return new_id;
end $$;

-- Email di conferma al turista (netlify/functions/booking-confirmation.js).
-- Restituisce i dati della prenotazione UNA SOLA VOLTA, entro 30 minuti dalla
-- prenotazione, e la segna come "conferma inviata": chi conosce l'id della
-- propria prenotazione non può usarla per mandare email a ripetizione.
alter table public.session_bookings add column if not exists confirmation_sent_at timestamptz;

create or replace function public.claim_booking_confirmation(p_booking_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  r json;
begin
  update public.session_bookings b
     set confirmation_sent_at = now()
   where b.id = p_booking_id
     and b.confirmation_sent_at is null
     and b.created_at > now() - interval '30 minutes';
  if not found then return null; end if;

  select json_build_object(
    'name', b.name, 'email', b.email, 'people', b.people, 'notes', b.notes, 'lang', b.lang,
    'starts_at', s.starts_at, 'duration_min', s.duration_min, 'price_eur', s.price_eur,
    'language', s.language, 'note', s.note, 'tour', v.name, 'address', v.address, 'card_id', v.card_id
  ) into r
  from public.session_bookings b
  join public.sessions s on s.id = b.session_id
  join public.venues v on v.id = s.venue_id
  where b.id = p_booking_id;
  return r;
end $$;

grant execute on function public.claim_booking_confirmation(uuid) to anon, authenticated;
grant execute on function public.sessions_for_card(text) to anon, authenticated;
grant execute on function public.book_session(uuid, integer, text, text, text, text, text, text) to anon, authenticated;

-- =============================================================================
-- FATTO. Per attivare un tour:
--   1. Portale /partner -> "Locali e account": aggiungi il locale scegliendo la
--      card del tour (così card_id è collegato) e collega l'account della guida.
--   2. Nel Google Sheet, sulla riga del tour: booking = sessioni
--   3. La guida (o tu) inserisce le date dal portale, scheda "Date e prenotazioni".
-- =============================================================================
