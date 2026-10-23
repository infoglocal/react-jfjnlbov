-- =============================================================================
-- GLOCAL — Eventi importati in automatico (BolognaToday)
-- Da incollare in Supabase: SQL Editor -> New query -> Run. Si può rilanciare.
-- Va lanciato DOPO schema.sql.
--
-- La funzione Netlify "import-events" ogni mattina legge gli eventi da
-- BolognaToday e li inserisce qui come "pending" (Da approvare).
-- Tu li vedi nel portale /partner, li ritocchi se serve e li approvi.
-- =============================================================================

-- source:      'bolognatoday' per gli eventi importati, vuoto per quelli caricati a mano
-- source_url:  pagina originale dell'evento. È unica: lo stesso evento non viene
--              mai importato due volte, nemmeno se l'hai rifiutato o eliminato
--              (resta nella tabella import_seen qui sotto).
-- category:    categoria indicata dalla fonte (es. "Concerti", "Mostre")
alter table public.events add column if not exists source     text;
alter table public.events add column if not exists source_url text;
alter table public.events add column if not exists category   text;

create unique index if not exists events_source_url_key
  on public.events (source_url) where source_url is not null;

-- Pagine già viste dall'importatore (anche quelle scartate dai filtri o che
-- poi hai eliminato): così non ricompaiono ogni mattina.
create table if not exists public.import_seen (
  source_url  text primary key,
  source      text not null,
  outcome     text not null,          -- 'imported' | 'skipped:<motivo>'
  seen_at     timestamptz not null default now()
);

alter table public.import_seen enable row level security;
drop policy if exists "import_seen admin read" on public.import_seen;
create policy "import_seen admin read" on public.import_seen for select
  using (public.is_admin());
-- nessuna policy di scrittura: scrive solo la funzione Netlify con la chiave
-- service_role (che ignora le regole RLS).
