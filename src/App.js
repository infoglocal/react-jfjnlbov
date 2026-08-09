import React, { useState, useMemo, useEffect, useRef } from "react";
import Papa from "papaparse";

/* ============================================================================
   GLOCAL — web app (mobile-first)
   ----------------------------------------------------------------------------
   Si apre direttamente sulle sezioni per INTERESSE:
   Cibo · Bere · Natura · Musei, arte e cultura · Shopping.
   In ogni sezione, in cima, il blocco "Bologna doc" (i classici col consiglio
   da local) — le righe con doc = "yes".
   Due tab: Home · Itinerario. Nessuna welcome, nessuna profilazione, no mappa.
   Dati dal Google Sheet (CSV) + prenotazioni via Formspree.

   Colonne foglio:
   id | interests | title_it | title_en | desc_it | desc_en | image | images |
   bookable | price | location | address | lat | lng | contact | doc | tip_it | tip_en

   - interests: una o più tra food, drink, nature, museums, shopping (virgola).
                Determina in quale/quali sezioni appare la card.
   - doc:       "yes" -> la card entra nel blocco "Bologna doc" della/e sua/e
                sezione/i (un classico da vedere). Altro/vuoto -> card normale.
   - tip_it/tip_en: (facoltativo) il consiglio da local mostrato sulle card doc.
   - bookable:  "yes" -> pulsante Prenota. Altro/vuoto -> nascosto.
   - images:    URL extra separati da virgola (galleria nel dettaglio).
   - address:   indirizzo cliccabile (apre Google Maps).
   ============================================================================ */

const BRAND = {
  green: "#38b04a", greenDark: "#2a8f39",
  red: "#e5383b",
  bg: "#FBF8F0", card: "#ffffff",
  border: "#e6e0d0", ink: "#1a1a1a", muted: "#7a7568",
};

// Le SEZIONI dell'app = interessi. L'ordine qui è l'ordine in Home.
const SECTIONS = [
  { id: "food",     it: "Cibo",                  en: "Food",             emoji: "🍝" },
  { id: "drink",    it: "Bere",                  en: "Drinks",           emoji: "🍷" },
  { id: "nature",   it: "Natura",                en: "Nature",           emoji: "🌿" },
  { id: "museums",  it: "Musei, arte e cultura", en: "Museums & culture",emoji: "🏛️" },
  { id: "shopping", it: "Shopping",              en: "Shopping",         emoji: "🛍️" },
];

// -------- CONTENUTI dal Google Sheet pubblicato come CSV --------------------
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTDteVaj56DqRzerlc3EP5YqmpeQYOydBBadXfBE0CozUnO3lcTRN6zrWSghznYtBd5aWYp8D2ALcbL/pub?gid=1251495453&single=true&output=csv";

// -------- GOOGLE ANALYTICS 4 -----------------------------------------------
const GA_ID = "G-SDH5FJLQSP";
// carica lo script GA una sola volta
function initGA() {
  if (typeof window === "undefined" || window.__gaLoaded) return;
  window.__gaLoaded = true;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", GA_ID);
}
// invia un evento a GA (no-op se GA non è pronto)
function track(event, params) {
  try { if (window.gtag) window.gtag("event", event, params || {}); } catch {}
}

/* ------------------------------- I18N ------------------------------------- */
const T = {
  it: {
    loading: "Caricamento…",
    pickTitle: "Cosa ti interessa?",
    pickSub: "Scegli uno o più temi. Ti mostriamo solo quello che ti piace.",
    pickCta: "Vedi i risultati", pickHint: "Scegline almeno uno",
    editInterests: "Interessi",
    docTitle: "Bologna doc", docSub: "I classici, col consiglio di un local",
    localTip: "Il consiglio del local", localTipsBtn: "Local tips",
    emptySection: "Presto nuovi contenuti in questa sezione.",
    book: "Prenota", addItinShort: "Itinerario", inItinShort: "Aggiunto",
    addItin: "Aggiungi all'itinerario", inItin: "Nell'itinerario",
    of: "di",
    tabHome: "Home", tabItin: "Itinerario",
    itinTitle: "Il tuo itinerario",
    itinEmpty: "Aggiungi luoghi ed esperienze dalla Home per costruire il tuo itinerario.",
    remove: "Rimuovi", clearAll: "Svuota", goHome: "Vai alla Home",
    tripDates: "Date del viaggio", from: "Dal", to: "Al",
    planBtn: "✨ Suggerisci un itinerario", planning: "Sto pianificando…",
    planTitle: "Il tuo itinerario giorno per giorno", planRegen: "Rigenera",
    planMorning: "Mattina", planLunch: "Pranzo", planAfternoon: "Pomeriggio", planEvening: "Sera",
    openInMaps: "Apri in Google Maps", shareWa: "Condividi su WhatsApp", day: "Giorno",
    booking: "Prenota", name: "Nome e cognome", email: "Email",
    people: "Persone", date: "Data", notes: "Note (facoltative)",
    send: "Invia richiesta", sending: "Invio…",
    thanks: "Richiesta inviata", thanksSub: "Non è ancora una conferma: il local ti risponde via email entro 24 ore.",
    whatsapp: "Scrivi su WhatsApp", close: "Chiudi", required: "Compila i campi obbligatori.",
  },
  en: {
    loading: "Loading…",
    pickTitle: "What are you into?",
    pickSub: "Pick one or more themes. We'll show you only what you like.",
    pickCta: "See results", pickHint: "Pick at least one",
    editInterests: "Interests",
    docTitle: "Bologna doc", docSub: "The classics, with a local's tip",
    localTip: "The local's tip", localTipsBtn: "Local tips",
    emptySection: "New content coming soon in this section.",
    book: "Book", addItinShort: "Itinerary", inItinShort: "Added",
    addItin: "Add to itinerary", inItin: "In itinerary",
    of: "of",
    tabHome: "Home", tabItin: "Itinerary",
    itinTitle: "Your itinerary",
    itinEmpty: "Add places and experiences from Home to build your itinerary.",
    remove: "Remove", clearAll: "Clear", goHome: "Go to Home",
    tripDates: "Trip dates", from: "From", to: "To",
    planBtn: "✨ Suggest an itinerary", planning: "Planning…",
    planTitle: "Your day-by-day itinerary", planRegen: "Regenerate",
    planMorning: "Morning", planLunch: "Lunch", planAfternoon: "Afternoon", planEvening: "Evening",
    openInMaps: "Open in Google Maps", shareWa: "Share on WhatsApp", day: "Day",
    booking: "Book", name: "Full name", email: "Email",
    people: "People", date: "Date", notes: "Notes (optional)",
    send: "Send request", sending: "Sending…",
    thanks: "Request sent", thanksSub: "Not a confirmation yet: the local will email you within 24 hours.",
    whatsapp: "Message on WhatsApp", close: "Close", required: "Please fill in the required fields.",
  },
};

/* --------------------------- PERSISTENZA ---------------------------------- */
const store = window.localStorage;
const load = (k, fb) => { try { const v = store.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
const save = (k, v) => { try { store.setItem(k, JSON.stringify(v)); } catch {} };

const hasInterest = (p, id) => String(p.interests || "").split(",").map((s) => s.trim()).includes(id);
const isDoc = (p) => String(p.doc || "").trim().toLowerCase() === "yes";

/* --------------------------- LOGO ----------------------------------------- */
function Logo({ height = 26 }) {
  return <img src="/glocal-logo.png" alt="Glocal" style={{ height, width: "auto", display: "block" }} />;
}

/* ------------------------------- APP -------------------------------------- */
export default function App() {
  const [lang, setLang] = useState(() => load("gl_lang", "it"));
  const [tab, setTab] = useState("home");
  const [chosen, setChosen] = useState([]);          // interessi scelti (rivisti ogni apertura)
  const [picking, setPicking] = useState(true);      // true = schermata scelta interessi
  const [booking, setBooking] = useState(null);
  const [detail, setDetail] = useState(null);
  const [itinerary, setItinerary] = useState(() => load("gl_itin", []));
  const [dateFrom, setDateFrom] = useState(() => load("gl_dfrom", ""));
  const [dateTo, setDateTo] = useState(() => load("gl_dto", ""));
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const t = T[lang];

  useEffect(() => save("gl_lang", lang), [lang]);
  useEffect(() => save("gl_itin", itinerary), [itinerary]);
  useEffect(() => save("gl_dfrom", dateFrom), [dateFrom]);
  useEffect(() => save("gl_dto", dateTo), [dateTo]);

  useEffect(() => {
    initGA();
    Papa.parse(CSV_URL, {
      download: true, header: true,
      complete: (res) => {
        const rows = (res.data || []).filter((r) => r && r.id)
          .map((r) => ({ ...r, lat: Number(r.lat) || null, lng: Number(r.lng) || null }));
        setPlaces(rows); setLoading(false);
      },
      error: () => setLoading(false),
    });
  }, []);

  const toggleIn = (list, setList, id) => setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const byId = (id) => places.find((p) => p.id === id);
  const toggleChosen = (id) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  // schermata iniziale: scelta interessi (obbligatoria, rivista a ogni apertura)
  if (picking) {
    return (
      <div style={{ minHeight: "100vh", background: BRAND.bg, color: BRAND.ink, fontFamily: "'Archivo', system-ui, sans-serif" }}>
        <FontLink />
        <header style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${BRAND.border}` }}>
          <span />
          <div style={{ justifySelf: "center" }}><Logo /></div>
          <div style={{ justifySelf: "end" }}><LangToggle lang={lang} setLang={setLang} /></div>
        </header>
        <InterestPicker t={t} lang={lang} chosen={chosen} onToggle={toggleChosen} onDone={() => { track("select_interests", { interests: chosen.join(",") }); setTab("home"); setPicking(false); }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: BRAND.bg, color: BRAND.ink, fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <FontLink />
      <header style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "14px 18px", position: "sticky", top: 0, background: "rgba(251,248,240,0.92)", backdropFilter: "blur(10px)", zIndex: 30, borderBottom: `1px solid ${BRAND.border}` }}>
        <span style={{ justifySelf: "start" }}>{loading && <Spinner />}</span>
        <div style={{ justifySelf: "center" }}><Logo /></div>
        <div style={{ justifySelf: "end" }}><LangToggle lang={lang} setLang={setLang} /></div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "0 0 96px" }}>
        {tab === "home" && (
          <HomeTab t={t} lang={lang} loading={loading} places={places} chosen={chosen}
            onEditInterests={() => setPicking(true)}
            onBook={setBooking} onDetail={setDetail}
            itinerary={itinerary} onToggleItin={(id) => toggleIn(itinerary, setItinerary, id)} />
        )}
        {tab === "itin" && (
          <ItineraryTab t={t} lang={lang} items={itinerary.map(byId).filter(Boolean)}
            onRemove={(id) => toggleIn(itinerary, setItinerary, id)} onClear={() => setItinerary([])} onGoHome={() => setTab("home")}
            dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
        )}
      </main>

      <TabBar t={t} tab={tab} setTab={setTab} itinCount={itinerary.length} />

      {detail && <DetailModal place={detail} lang={lang} t={t} onClose={() => setDetail(null)} onBook={(p) => { setDetail(null); setBooking(p); }} onToggleItin={(id) => toggleIn(itinerary, setItinerary, id)} inItin={detail ? itinerary.includes(detail.id) : false} />}
      {booking && <BookingModal place={booking} lang={lang} t={t} onClose={() => setBooking(null)} />}
    </div>
  );
}

/* --------------------------- INTEREST PICKER ------------------------------ */
function InterestPicker({ t, lang, chosen, onToggle, onDone }) {
  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "0 22px", minHeight: "calc(100vh - 60px)", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", paddingTop: 44, paddingBottom: 28 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(30px, 7vw, 42px)", letterSpacing: "-0.02em", margin: "0 0 10px", lineHeight: 1.08 }}>{t.pickTitle}</h1>
        <p style={{ color: BRAND.muted, margin: "0 0 30px", fontSize: 16, lineHeight: 1.5 }}>{t.pickSub}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, alignContent: "start" }}>
          {SECTIONS.map((o) => {
            const active = chosen.includes(o.id);
            return (
              <button key={o.id} onClick={() => onToggle(o.id)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "18px 18px", borderRadius: 16, cursor: "pointer", background: active ? BRAND.green : BRAND.card, color: active ? "#fff" : BRAND.ink, border: `1.5px solid ${active ? BRAND.green : BRAND.border}`, fontSize: 15.5, fontWeight: 500, fontFamily: "inherit", textAlign: "left", transition: "all .15s" }}>
                <span style={{ fontSize: 24 }}>{o.emoji}</span><span>{o[lang]}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ position: "sticky", bottom: 0, background: BRAND.bg, paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0))", paddingTop: 12 }}>
        <button onClick={onDone} disabled={chosen.length === 0} style={{ width: "100%", background: chosen.length ? BRAND.green : "#d9d3c4", color: "#fff", border: "none", borderRadius: 16, padding: 17, fontSize: 17, fontWeight: 700, cursor: chosen.length ? "pointer" : "default", fontFamily: "inherit", transition: "background .15s" }}>
          {chosen.length ? t.pickCta : t.pickHint}
        </button>
      </div>
    </main>
  );
}

/* ------------------------------ HOME TAB ---------------------------------- */
function HomeTab({ t, lang, loading, places, chosen, onEditInterests, onBook, onDetail, itinerary, onToggleItin }) {
  if (loading) return <div style={{ padding: "22px 18px" }}><DeckSkeleton /></div>;
  const visibleSections = SECTIONS.filter((s) => chosen.length === 0 || chosen.includes(s.id));
  const docs = places.filter(isDoc); // TUTTI i classici, sempre, a prescindere dagli interessi

  return (
    <div style={{ padding: "8px 18px 0" }}>
      {/* barra: modifica interessi */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", paddingTop: 14 }}>
        <button onClick={onEditInterests} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "transparent", color: BRAND.ink, border: `1.5px solid ${BRAND.border}`, borderRadius: 999, padding: "8px 15px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          <span>⚙︎</span>{t.editInterests}
          {chosen.length > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: BRAND.green, color: "#fff", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{chosen.length}</span>}
        </button>
      </div>

      {/* SEZIONI per interesse scelto — solo contenuti NON doc */}
      {visibleSections.map((sec) => {
        const normal = places.filter((p) => hasInterest(p, sec.id) && !isDoc(p));
        if (normal.length === 0) return null;
        return (
          <section key={sec.id} style={{ marginTop: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 22 }}>{sec.emoji}</span>
              <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(24px, 5vw, 30px)", margin: 0, letterSpacing: "-0.02em" }}>{sec[lang]}</h2>
            </div>
            <Deck items={normal} lang={lang} t={t} onBook={onBook} onDetail={onDetail}
              itinerary={itinerary} onToggleItin={onToggleItin} />
          </section>
        );
      })}
      {/* BOLOGNA DOC — sezione fissa IN FONDO, sempre visibile, uguale per tutti */}
      {docs.length > 0 && (
        <section style={{ marginTop: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 22 }}>★</span>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(24px, 5vw, 30px)", margin: 0, letterSpacing: "-0.02em" }}>{t.docTitle}</h2>
          </div>
          <p style={{ fontSize: 13.5, color: BRAND.muted, margin: "4px 0 12px" }}>{t.docSub}</p>
          <Deck items={docs} lang={lang} t={t} onBook={onBook} onDetail={onDetail}
            itinerary={itinerary} onToggleItin={onToggleItin} isDocDeck />
        </section>
      )}

      <div style={{ height: 20 }} />
    </div>
  );
}

/* -------------------------------- DECK ------------------------------------ */
function Deck({ items, lang, t, onBook, onDetail, itinerary, onToggleItin, isDocDeck }) {
  const ref = useRef(null);
  const [idx, setIdx] = useState(0);
  const drag = useRef({ down: false, x: 0, s: 0, moved: false });
  const onScroll = () => { const el = ref.current; if (!el) return; setIdx(Math.round(el.scrollLeft / el.clientWidth)); };
  const go = (dir) => { const el = ref.current; if (!el) return; el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" }); };
  const onDown = (e) => { const el = ref.current; if (!el) return; drag.current = { down: true, x: e.pageX, s: el.scrollLeft, moved: false }; };
  const onMove = (e) => { const el = ref.current; if (!el || !drag.current.down) return; const dx = e.pageX - drag.current.x; if (Math.abs(dx) > 4) drag.current.moved = true; el.scrollLeft = drag.current.s - dx; };
  const end = () => { drag.current.down = false; };
  const onClickCapture = (e) => { if (drag.current.moved) { e.stopPropagation(); e.preventDefault(); drag.current.moved = false; } };

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, color: BRAND.muted, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{idx + 1} {t.of} {items.length}</span>
      </div>
      <div ref={ref} className="gl-deck" onScroll={onScroll} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={end} onMouseLeave={end} onClickCapture={onClickCapture}>
        {items.map((p) => (
          <div key={p.id} className="gl-deck-slide">
            <DeckCard place={p} lang={lang} t={t} onBook={onBook} onDetail={onDetail}
              inItin={itinerary.includes(p.id)} onToggleItin={() => onToggleItin(p.id)} />
          </div>
        ))}
      </div>
      {idx > 0 && <DeckArrow dir="left" onClick={() => go(-1)} />}
      {idx < items.length - 1 && <DeckArrow dir="right" onClick={() => go(1)} />}
      {items.length > 1 && items.length <= 12 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 10 }}>
          {items.map((_, i) => (
            <span key={i} style={{ width: i === idx ? 18 : 6, height: 6, borderRadius: 999, background: i === idx ? (isDocDeck ? BRAND.red : BRAND.green) : BRAND.border, transition: "all .2s" }} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeckArrow({ dir, onClick }) {
  return (
    <button onClick={onClick} aria-label={dir === "left" ? "Precedente" : "Successivo"} className="gl-deck-arrow"
      style={{ position: "absolute", top: "42%", [dir === "left" ? "left" : "right"]: 8, transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.92)", color: BRAND.ink, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.18)", zIndex: 4, backdropFilter: "blur(4px)" }}>
      {dir === "left" ? "‹" : "›"}
    </button>
  );
}

/* ----------------------------- DECK CARD ---------------------------------- */
function DeckCard({ place, lang, t, onBook, onDetail, inItin, onToggleItin }) {
  const title = place[`title_${lang}`];
  const desc = place[`desc_${lang}`];
  const tip = place[`tip_${lang}`];
  const bookable = String(place.bookable).trim().toLowerCase() === "yes";
  const [showTip, setShowTip] = useState(false);

  return (
    <article style={{ background: BRAND.card, borderRadius: 22, overflow: "hidden", border: `1px solid ${BRAND.border}`, boxShadow: "0 6px 22px rgba(40,30,15,0.08)", height: "100%", display: "flex", flexDirection: "column" }}>
      <div onClick={() => { track("view_card", { card: place.title_it || place.id, section: place.interests }); onDetail(place); }} style={{ position: "relative", aspectRatio: "4/3", background: "#eee", overflow: "hidden", cursor: "pointer" }}>
        <img src={place.image} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(20,16,10,0.72), rgba(20,16,10,0) 42%)" }} />
        {place.location && <span style={{ position: "absolute", top: 14, left: 14, background: "rgba(255,255,255,0.92)", color: BRAND.ink, fontSize: 12.5, fontWeight: 700, padding: "6px 12px", borderRadius: 999 }}>{place.location}</span>}
        <div style={{ position: "absolute", left: 18, bottom: 14, right: 18 }}>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(24px, 6.5vw, 32px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: "#fff", margin: 0 }}>{title}</h3>
        </div>
      </div>

      <div style={{ padding: 18, display: "flex", flexDirection: "column", flex: 1 }}>
        <p onClick={() => { track("view_card", { card: place.title_it || place.id, section: place.interests }); onDetail(place); }} style={{ fontSize: 15, lineHeight: 1.5, color: "#4a463d", margin: "0 0 14px", flex: 1, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", cursor: "pointer" }}>{desc}</p>

        {place.price && <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.red, fontFamily: "'Fraunces', serif", marginBottom: 12 }}>{place.price}</div>}

        {tip && (
          <button onClick={() => { track("open_local_tip", { card: place.title_it || place.id }); setShowTip(true); }} style={{ display: "inline-flex", alignItems: "center", gap: 7, alignSelf: "flex-start", background: "rgba(229,56,59,0.08)", color: BRAND.red, border: `1.5px solid ${BRAND.red}`, borderRadius: 999, padding: "8px 14px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 12 }}>
            <span style={{ fontSize: 15 }}>💬</span>{t.localTipsBtn}
          </button>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { if (!inItin) track("add_to_itinerary", { card: place.title_it || place.id }); onToggleItin(); }} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, background: inItin ? BRAND.greenDark : "transparent", color: inItin ? "#fff" : BRAND.ink, border: `1.5px solid ${inItin ? BRAND.greenDark : BRAND.border}`, borderRadius: 14, padding: "13px 12px", fontSize: 14.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ fontSize: 16 }}>{inItin ? "✓" : "＋"}</span>{inItin ? t.inItinShort : t.addItinShort}
          </button>
          {bookable && (
            <button onClick={() => { track("start_booking", { card: place.title_it || place.id }); onBook(place); }} style={{ flex: 1, background: BRAND.red, color: "#fff", border: "none", borderRadius: 14, padding: "13px 12px", fontSize: 14.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{t.book}</button>
          )}
        </div>
      </div>

      {showTip && tip && (
        <div onClick={() => setShowTip(false)} style={{ ...overlay, alignItems: "center", zIndex: 58 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: BRAND.bg, borderRadius: 20, maxWidth: 380, width: "calc(100% - 48px)", padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 20 }}>💬</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: BRAND.red }}>{t.localTip}</span>
            </div>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: "#3a3630", margin: "0 0 20px" }}>{tip}</p>
            <button onClick={() => setShowTip(false)} style={{ width: "100%", background: BRAND.ink, color: "#fff", border: "none", borderRadius: 12, padding: 13, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{t.close}</button>
          </div>
        </div>
      )}
    </article>
  );
}

/* --------------------------- DETAIL GALLERY ------------------------------- */
function DetailGallery({ images, alt }) {
  const ref = useRef(null);
  const [idx, setIdx] = useState(0);
  const onScroll = () => { const el = ref.current; if (!el) return; setIdx(Math.round(el.scrollLeft / el.clientWidth)); };
  const single = images.length <= 1;
  return (
    <div style={{ position: "relative" }}>
      <div ref={ref} onScroll={onScroll} className="gl-gallery" style={single ? { overflow: "hidden" } : undefined}>
        {images.map((src, i) => (
          <img key={i} src={src} alt={`${alt} ${i + 1}`} className="gl-gallery-img" style={{ borderRadius: i === 0 ? "22px 22px 0 0" : 0 }} loading={i === 0 ? "eager" : "lazy"} />
        ))}
      </div>
      {!single && (
        <div style={{ position: "absolute", bottom: 54, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6, zIndex: 2, pointerEvents: "none" }}>
          {images.map((_, i) => (
            <span key={i} style={{ width: i === idx ? 18 : 6, height: 6, borderRadius: 999, background: i === idx ? "#fff" : "rgba(255,255,255,0.55)", transition: "all .2s" }} />
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------- DETAIL MODAL --------------------------------- */
function DetailModal({ place, lang, t, onClose, onBook, onToggleItin, inItin }) {
  const title = place[`title_${lang}`];
  const desc = place[`desc_${lang}`];
  const bookable = String(place.bookable).trim().toLowerCase() === "yes";
  const extra = String(place.images || "").split(",").map((s) => s.trim()).filter(Boolean);
  const gallery = [place.image, ...extra].filter(Boolean);
  const address = String(place.address || "").trim();
  const mapsUrl = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;

  return (
    <div onClick={onClose} style={{ ...overlay, zIndex: 55 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...sheet, maxWidth: 540, padding: 0, maxHeight: "94vh" }}>
        <div style={{ position: "relative" }}>
          <DetailGallery images={gallery} alt={title} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(20,16,10,0.55), transparent 50%)", borderRadius: "22px 22px 0 0", pointerEvents: "none" }} />
          <button onClick={onClose} aria-label={t.close} style={{ position: "absolute", top: 14, right: 14, width: 38, height: 38, borderRadius: "50%", background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1, backdropFilter: "blur(4px)", zIndex: 3 }}>×</button>
          <div style={{ position: "absolute", left: 20, bottom: 16, right: 20, pointerEvents: "none" }}>
            {place.location && <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#fff", opacity: 0.9, marginBottom: 6 }}>📍 {place.location}</span>}
            <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(26px, 6vw, 34px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: "#fff", margin: 0 }}>{title}</h2>
          </div>
        </div>

        <div style={{ padding: 22, overflowY: "auto" }}>
          {place.price && <p style={{ fontSize: 22, fontWeight: 600, margin: "0 0 16px", color: BRAND.red, fontFamily: "'Fraunces', serif" }}>{place.price}</p>}
          <p style={{ fontSize: 16.5, lineHeight: 1.65, color: "#4a463d", margin: "0 0 20px", whiteSpace: "pre-line" }}>{desc}</p>

          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: BRAND.ink, background: BRAND.card, border: `1.5px solid ${BRAND.border}`, borderRadius: 14, padding: "13px 15px", marginBottom: 24 }}>
              <span style={{ fontSize: 18 }}>📍</span>
              <span style={{ flex: 1, fontSize: 14.5, fontWeight: 500, lineHeight: 1.35 }}>{address}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: BRAND.green }}>{lang === "it" ? "Apri" : "Open"} →</span>
            </a>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {bookable && <button onClick={() => { track("start_booking", { card: place.title_it || place.id, from: "detail" }); onBook(place); }} style={{ width: "100%", background: BRAND.red, color: "#fff", border: "none", borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{t.book}</button>}
            <button onClick={() => { if (!inItin) track("add_to_itinerary", { card: place.title_it || place.id, from: "detail" }); onToggleItin(place.id); }} style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: inItin ? "rgba(56,176,74,0.12)" : "transparent", color: inItin ? BRAND.greenDark : BRAND.ink, border: `1.5px solid ${inItin ? BRAND.green : BRAND.border}`, borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ fontSize: 16 }}>{inItin ? "✓" : "＋"}</span>{inItin ? t.inItin : t.addItin}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------- PLANNER (suggerimento a regole) -------------------- */
function buildPlan(items, nDays) {
  const isFood = (p) => hasInterest(p, "food");
  const isDrink = (p) => hasInterest(p, "drink");
  const days = Math.max(1, nDays || 1);
  const evening = items.filter((p) => isDrink(p) && !isFood(p));
  const meals = items.filter((p) => isFood(p));
  const daytime = items.filter((p) => !isFood(p) && !(isDrink(p) && !isFood(p)));
  const perDay = Array.from({ length: days }, () => ({ morning: [], lunch: [], afternoon: [], evening: [] }));
  daytime.forEach((p, i) => { const d = i % days; (i % 2 === 0 ? perDay[d].morning : perDay[d].afternoon).push(p); });
  meals.forEach((p, i) => { const d = i % days; (i % 2 === 0 ? perDay[d].lunch : perDay[d].evening).push(p); });
  evening.forEach((p, i) => { perDay[i % days].evening.push(p); });
  return perDay;
}

function googleMapsDirUrl(items) {
  const pts = items.filter((p) => p.lat && p.lng);
  if (pts.length === 0) return null;
  if (pts.length === 1) return `https://www.google.com/maps/search/?api=1&query=${pts[0].lat},${pts[0].lng}`;
  const origin = `${pts[0].lat},${pts[0].lng}`;
  const destination = `${pts[pts.length - 1].lat},${pts[pts.length - 1].lng}`;
  const waypoints = pts.slice(1, -1).map((p) => `${p.lat},${p.lng}`).join("|");
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=walking`;
  if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`;
  return url;
}

/* --------------------------- ITINERARY TAB -------------------------------- */
function ItineraryTab({ t, lang, items, onRemove, onClear, onGoHome, dateFrom, dateTo, setDateFrom, setDateTo }) {
  const [plan, setPlan] = useState(null);
  const [planning, setPlanning] = useState(false);

  const groups = useMemo(() => {
    const m = {}; items.forEach((p) => { const z = p.location || "—"; (m[z] = m[z] || []).push(p); });
    return Object.entries(m);
  }, [items]);

  const nDays = useMemo(() => {
    if (!dateFrom || !dateTo) return 1;
    const d = Math.round((new Date(dateTo) - new Date(dateFrom)) / 86400000) + 1;
    return Math.min(Math.max(d, 1), 14);
  }, [dateFrom, dateTo]);

  const runPlan = () => { setPlanning(true); setPlan(null); setTimeout(() => { setPlan(buildPlan(items, nDays)); setPlanning(false); }, 700); };

  const shareWhatsApp = () => {
    const lines = [`${t.itinTitle} — Bologna`, ""];
    groups.forEach(([zone, list]) => { lines.push(`📍 ${zone}`); list.forEach((p) => lines.push(`• ${p[`title_${lang}`]}${p.price ? ` (${p.price})` : ""}`)); lines.push(""); });
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  };

  const mapsUrl = googleMapsDirUrl(items);
  const slotLabel = { morning: t.planMorning, lunch: t.planLunch, afternoon: t.planAfternoon, evening: t.planEvening };
  const slotEmoji = { morning: "🌅", lunch: "🍽️", afternoon: "☀️", evening: "🌙" };

  return (
    <div style={{ padding: "20px 18px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 26, margin: 0, letterSpacing: "-0.01em" }}>{t.itinTitle}</h2>
        {items.length > 0 && <button onClick={onClear} style={{ background: "none", border: "none", color: BRAND.red, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{t.clearAll}</button>}
      </div>

      {items.length === 0 ? (
        <EmptyState msg={t.itinEmpty} cta={t.goHome} onCta={onGoHome} icon="🗺️" />
      ) : (
        <>
          <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <p style={{ ...sheetLabel, marginBottom: 10 }}>{t.tripDates}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <label style={{ flex: 1 }}><span style={{ display: "block", fontSize: 12, color: BRAND.muted, marginBottom: 4 }}>{t.from}</span><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inp} /></label>
              <label style={{ flex: 1 }}><span style={{ display: "block", fontSize: 12, color: BRAND.muted, marginBottom: 4 }}>{t.to}</span><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inp} /></label>
            </div>
          </div>

          <button onClick={runPlan} disabled={planning} style={{ width: "100%", background: BRAND.green, color: "#fff", border: "none", borderRadius: 16, padding: 16, fontSize: 16, fontWeight: 700, cursor: planning ? "default" : "pointer", fontFamily: "inherit", marginBottom: 16, opacity: planning ? 0.7 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {planning ? <><Spinner />{t.planning}</> : t.planBtn}
          </button>

          {plan && (
            <div style={{ background: BRAND.card, border: `1.5px solid ${BRAND.green}`, borderRadius: 18, padding: 18, marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 18, margin: 0 }}>{t.planTitle}</h3>
                <button onClick={runPlan} style={{ background: "none", border: "none", color: BRAND.green, fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>↻ {t.planRegen}</button>
              </div>
              {plan.map((d, i) => {
                const hasAny = ["morning", "lunch", "afternoon", "evening"].some((s) => d[s].length);
                if (!hasAny) return null;
                return (
                  <div key={i} style={{ marginBottom: i < plan.length - 1 ? 18 : 0 }}>
                    {plan.length > 1 && <div style={{ fontWeight: 700, fontSize: 14, color: BRAND.red, marginBottom: 8 }}>{t.day} {i + 1}</div>}
                    {["morning", "lunch", "afternoon", "evening"].map((slot) => (
                      d[slot].length > 0 && (
                        <div key={slot} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                          <span style={{ fontSize: 16, flexShrink: 0 }}>{slotEmoji[slot]}</span>
                          <div>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: BRAND.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{slotLabel[slot]}</span>
                            <div style={{ fontSize: 14.5, color: BRAND.ink }}>{d[slot].map((p) => p[`title_${lang}`]).join(" · ")}</div>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: BRAND.card, color: BRAND.ink, textDecoration: "none", border: `1.5px solid ${BRAND.border}`, borderRadius: 14, padding: "13px 12px", fontSize: 14, fontWeight: 700 }}>
                <span>🗺️</span>{t.openInMaps}
              </a>
            )}
            <button onClick={shareWhatsApp} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#25D366", color: "#fff", border: "none", borderRadius: 14, padding: "13px 12px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              <span>💬</span>{t.shareWa}
            </button>
          </div>

          {groups.map(([zone, list]) => (
            <div key={zone} style={{ marginBottom: 26 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
                <span style={{ fontSize: 15 }}>📍</span>
                <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 18 }}>{zone}</span>
                <span style={{ flex: 1, height: 2, background: BRAND.green, opacity: 0.8, borderRadius: 2 }} />
              </div>
              <ul style={listReset}>
                {list.map((p) => (
                  <li key={p.id} style={rowCard}>
                    <img src={p.image} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 15.5, lineHeight: 1.25 }}>{p[`title_${lang}`]}</div>
                      {p.price && <div style={{ fontSize: 13.5, color: BRAND.red, marginTop: 2, fontWeight: 600 }}>{p.price}</div>}
                    </div>
                    <button onClick={() => onRemove(p.id)} aria-label={t.remove} style={rowX}>×</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function EmptyState({ msg, cta, onCta, icon }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: BRAND.muted }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>{icon}</div>
      <p style={{ margin: "0 0 20px", fontSize: 15.5, lineHeight: 1.5, maxWidth: 320, marginInline: "auto" }}>{msg}</p>
      <button onClick={onCta} style={{ background: BRAND.green, color: "#fff", border: "none", borderRadius: 14, padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{cta}</button>
    </div>
  );
}

/* ------------------------------ TAB BAR ----------------------------------- */
function TabIcon({ name, active }) {
  const c = active ? "#e5383b" : "#7a7568"; const sw = 1.9;
  if (name === "home") return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/><path d="M9.5 21v-6h5v6"/></svg>);
  return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/></svg>);
}

function TabBar({ t, tab, setTab, itinCount }) {
  const tabs = [{ id: "home", label: t.tabHome }, { id: "itin", label: t.tabItin, count: itinCount }];
  return (
    <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40, background: "rgba(251,248,240,0.96)", backdropFilter: "blur(12px)", borderTop: `1px solid ${BRAND.border}`, display: "flex", paddingBottom: "env(safe-area-inset-bottom, 0)" }}>
      {tabs.map((tb) => {
        const active = tab === tb.id;
        return (
          <button key={tb.id} onClick={() => setTab(tb.id)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "9px 8px 11px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, fontFamily: "inherit", color: active ? BRAND.red : BRAND.muted }}>
            <span style={{ position: "relative", display: "inline-flex" }}>
              <TabIcon name={tb.id} active={active} />
              {tb.count > 0 && <span style={{ position: "absolute", top: -5, right: -9, minWidth: 16, height: 16, borderRadius: 8, background: BRAND.green, color: "#fff", fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{tb.count}</span>}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: active ? 700 : 500 }}>{tb.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* --------------------------- BOOKING MODAL -------------------------------- */
function BookingModal({ place, lang, t, onClose }) {
  const [form, setForm] = useState({ name: "", email: "", people: "2", date: "", notes: "" });
  const [status, setStatus] = useState("idle");
  const title = place[`title_${lang}`];
  const contact = String(place.contact || "").replace(/[^0-9]/g, "");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const FORMSPREE_ENDPOINT = "https://formspree.io/f/mnpaapzq";
  const submit = async () => {
    if (!form.name || !form.email || !form.date) { setStatus("error"); return; }
    setStatus("sending");
    try {
      const res = await fetch(FORMSPREE_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ esperienza: title, nome: form.name, email: form.email, persone: form.people, data: form.date, note: form.notes, _subject: `Nuova prenotazione Glocal: ${title}` }) });
      if (res.ok) setStatus("done"); else setStatus("error");
    } catch { setStatus("error"); }
  };
  const waText = encodeURIComponent(lang === "it"
    ? `Ciao! Ho inviato una richiesta di prenotazione tramite Glocal per "${title}" per il ${form.date || "—"}, ${form.people} persone. A nome di ${form.name || "—"}.`
    : `Hi! I sent a booking request via Glocal for "${title}" on ${form.date || "—"}, ${form.people} people. Under the name ${form.name || "—"}.`);

  return (
    <div onClick={onClose} style={{ ...overlay, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...sheet, maxWidth: 520, padding: 24 }}>
        {status === "done" ? (
          <div style={{ textAlign: "center", padding: "28px 8px" }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(56,176,74,0.14)", color: BRAND.green, fontSize: 32, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>✓</div>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 25, margin: "0 0 10px" }}>{t.thanks}</h3>
            <p style={{ color: "#5a554a", margin: "0 auto 24px", fontSize: 15, lineHeight: 1.55, maxWidth: 380 }}>{t.thanksSub}</p>
            {contact && <a href={`https://wa.me/${contact}?text=${waText}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#25D366", color: "#fff", textDecoration: "none", borderRadius: 14, padding: "13px 22px", fontSize: 15, fontWeight: 700, marginBottom: 12 }}><span>💬</span>{t.whatsapp}</a>}
            <div><button onClick={onClose} style={{ background: "none", border: "none", color: BRAND.muted, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginTop: 4 }}>{t.close}</button></div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.14em", color: BRAND.green, fontWeight: 700 }}>{t.booking}</span>
              <button onClick={onClose} style={xBtn}>×</button>
            </div>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 23, margin: "0 0 20px" }}>{title}</h3>
            <Field label={t.name}><input style={inp} value={form.name} onChange={set("name")} /></Field>
            <Field label={t.email}><input style={inp} type="email" value={form.email} onChange={set("email")} /></Field>
            <div style={{ display: "flex", gap: 12 }}>
              <Field label={t.people} flex><input style={inp} type="number" min="1" value={form.people} onChange={set("people")} /></Field>
              <Field label={t.date} flex><input style={inp} type="date" value={form.date} onChange={set("date")} /></Field>
            </div>
            <Field label={t.notes}><textarea style={{ ...inp, minHeight: 72, resize: "vertical" }} value={form.notes} onChange={set("notes")} /></Field>
            {status === "error" && <p style={{ color: BRAND.red, fontSize: 14, margin: "4px 0 12px" }}>{t.required}</p>}
            <button onClick={submit} disabled={status === "sending"} style={{ width: "100%", background: BRAND.red, color: "#fff", border: "none", borderRadius: 14, padding: 15, fontSize: 16, fontWeight: 700, cursor: status === "sending" ? "default" : "pointer", fontFamily: "inherit", marginTop: 8, opacity: status === "sending" ? 0.7 : 1 }}>
              {status === "sending" ? t.sending : t.send}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------- SKELETON / SPINNER ----------------------------- */
function DeckSkeleton() {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ height: 26, width: 160, background: "#efe9db", borderRadius: 8, marginBottom: 14 }} className="gl-pulse" />
      <div style={{ aspectRatio: "4/3", background: "#efe9db", borderRadius: 22, marginBottom: 14 }} className="gl-pulse" />
      <div style={{ height: 48, background: "#efe9db", borderRadius: 14 }} className="gl-pulse" />
    </div>
  );
}
function Spinner() { return <span style={{ width: 14, height: 14, border: `2px solid ${BRAND.border}`, borderTopColor: BRAND.red, borderRadius: "50%", display: "inline-block" }} className="gl-spin" />; }

/* ----------------------------- SMALL BITS --------------------------------- */
const overlay = { position: "fixed", inset: 0, background: "rgba(26,20,12,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 };
const sheet = { background: BRAND.bg, width: "100%", borderRadius: "22px 22px 0 0", overflowY: "auto", maxHeight: "92vh", boxShadow: "0 -10px 50px rgba(0,0,0,0.25)" };
const inp = { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${BRAND.border}`, background: BRAND.card, fontSize: 15, fontFamily: "inherit", color: BRAND.ink, outline: "none" };
const xBtn = { background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#999", lineHeight: 1 };
const sheetLabel = { fontSize: 12.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: BRAND.muted, margin: "0 0 12px" };
const listReset = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 };
const rowCard = { display: "flex", gap: 13, alignItems: "center", background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 11 };
const rowX = { background: "none", border: "none", color: "#bbb", fontSize: 22, cursor: "pointer", flexShrink: 0, lineHeight: 1 };

function Field({ label, children, flex }) {
  return (<label style={{ display: "block", marginBottom: 14, flex: flex ? 1 : undefined }}><span style={{ display: "block", fontSize: 12.5, fontWeight: 700, marginBottom: 6, color: "#3a3630" }}>{label}</span>{children}</label>);
}
function LangToggle({ lang, setLang }) {
  return (
    <div style={{ display: "flex", border: `1.5px solid ${BRAND.border}`, borderRadius: 999, overflow: "hidden" }}>
      {["it", "en"].map((l) => (<button key={l} onClick={() => setLang(l)} style={{ padding: "6px 13px", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", background: lang === l ? BRAND.ink : "transparent", color: lang === l ? "#fff" : "#999", textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</button>))}
    </div>
  );
}
function FontLink() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Archivo:wght@400;500;600;700&display=swap');
      * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      body { margin: 0; }
      button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid ${BRAND.green}; outline-offset: 2px; }
      input:focus, textarea:focus { border-color: ${BRAND.green} !important; }
      .gl-deck { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; -ms-overflow-style: none; cursor: grab; -webkit-overflow-scrolling: touch; }
      .gl-deck:active { cursor: grabbing; }
      .gl-deck::-webkit-scrollbar { display: none; }
      .gl-deck-slide { flex: 0 0 100%; scroll-snap-align: center; padding: 2px; }
      .gl-gallery { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; -ms-overflow-style: none; }
      .gl-gallery::-webkit-scrollbar { display: none; }
      .gl-gallery-img { flex: 0 0 100%; width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; scroll-snap-align: center; }
      .gl-pulse { animation: glpulse 1.4s ease-in-out infinite; }
      @keyframes glpulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }
      .gl-spin { animation: glspin 0.8s linear infinite; }
      @keyframes glspin { to { transform: rotate(360deg) } }
      @media (hover:hover) { .gl-deck-arrow:hover { background: #fff; } }
      @media (min-width: 560px) { .gl-deck-slide { flex: 0 0 420px; padding-right: 16px; } }
      @media (prefers-reduced-motion: reduce) { *, .gl-pulse, .gl-spin { animation: none !important; transition: none !important; } }
    `}</style>
  );
}
