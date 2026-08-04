import React, { useState, useMemo, useEffect, useRef } from "react";
import Papa from "papaparse";

/* ============================================================================
   GLOCAL MVP — look editoriale
   ----------------------------------------------------------------------------
   Colonne del Google Sheet (invariate):
   id | section | title_it | title_en | desc_it | desc_en | image |
   interests | audience | bookable | price | location | lat | lng | contact

   - bookable "yes" -> pulsante Prenota acceso, riga per riga (interruttore dal foglio)
   - lat/lng -> mappa (Leaflet/OSM, nessuna API key)
   - contact -> WhatsApp del provider in conferma (opzionale, es. 393401234567)
   ============================================================================ */

const BRAND = {
  green: "#38b04a", greenDark: "#2a8f39",
  red: "#e5383b",
  bg: "#FBF8F0", card: "#ffffff",
  border: "#e6e0d0", ink: "#1a1a1a", muted: "#7a7568",
};

const INTERESTS = [
  { id: "nature",  it: "Natura",         en: "Nature",        emoji: "🌿" },
  { id: "museums", it: "Musei",          en: "Museums",       emoji: "🏛️" },
  { id: "culture", it: "Arte e cultura", en: "Art & culture", emoji: "🎭" },
  { id: "food",    it: "Cibo",           en: "Food",          emoji: "🍝" },
  { id: "drink",   it: "Bere",           en: "Drinks",        emoji: "🍷" },
  { id: "shopping",it: "Shopping",       en: "Shopping",      emoji: "🛍️" },
  { id: "music",   it: "Musica",         en: "Music",         emoji: "🎶" },
  { id: "history", it: "Storia",         en: "History",       emoji: "📜" },
];

const GROUPS = [
  { id: "solo",   it: "Da solo/a",  en: "Solo",        emoji: "🚶" },
  { id: "couple", it: "In coppia",  en: "As a couple", emoji: "💑" },
  { id: "friends",it: "Con amici",  en: "With friends",emoji: "👥" },
  { id: "family", it: "In famiglia",en: "With family", emoji: "👨‍👩‍👧" },
];

const SECTIONS = [
  { id: "go",         it: "Dove andare", en: "Where to go" },
  { id: "do",         it: "Cosa fare",   en: "What to do" },
  { id: "experience", it: "Esperienze",  en: "Experiences" },
];

// -------- CONTENUTI dal Google Sheet pubblicato come CSV --------------------
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_9BMkobKhzPLZGd0iSUhD466arK8-90i2MMG2IkyHGPk4vCz_oTJtMzRxvD_FaYIThNorwVPiIskJ/pub?gid=870868949&single=true&output=csv";

/* ------------------------------- I18N ------------------------------------- */
const T = {
  it: {
    eyebrow: "Bologna", tagline: "Vivi la città\ncome un local",
    intro: "Scelti da chi ci vive. Sfoglia liberamente, o personalizza in base a come viaggi.",
    customize: "Personalizza", customizeOpen: "Nascondi filtri",
    q1: "Come stai viaggiando?", q2: "Cosa ti piace fare?",
    clearFilters: "Azzera", featured: "In evidenza",
    empty: "Nessun risultato con questi filtri.", emptyCta: "Azzera i filtri",
    book: "Prenota", details: "Scopri",
    addItin: "Itinerario", addMap: "Mappa",
    tabItin: "Itinerario", tabMap: "Mappa",
    itinEmpty: "Aggiungi luoghi ed esperienze per costruire il tuo itinerario.",
    mapEmpty: "Aggiungi luoghi alla mappa per vederli qui.",
    remove: "Rimuovi", clearAll: "Svuota",
    booking: "Prenota", name: "Nome e cognome", email: "Email",
    people: "Numero di persone", date: "Data", notes: "Note (facoltative)",
    send: "Invia richiesta", sending: "Invio…",
    thanks: "Richiesta inviata", thanksSub: "Non è ancora una conferma: il local ti risponde via email entro 24 ore per confermare disponibilità e dettagli.",
    whatsapp: "Scrivi su WhatsApp", close: "Chiudi", required: "Compila i campi obbligatori.",
  },
  en: {
    eyebrow: "Bologna", tagline: "Experience the city\nlike a local",
    intro: "Picked by people who live here. Browse freely, or tailor it to how you travel.",
    customize: "Tailor", customizeOpen: "Hide filters",
    q1: "How are you travelling?", q2: "What do you enjoy?",
    clearFilters: "Clear", featured: "Featured",
    empty: "Nothing matches these filters.", emptyCta: "Clear filters",
    book: "Book", details: "Discover",
    addItin: "Itinerary", addMap: "Map",
    tabItin: "Itinerary", tabMap: "Map",
    itinEmpty: "Add places and experiences to build your itinerary.",
    mapEmpty: "Add places to the map to see them here.",
    remove: "Remove", clearAll: "Clear",
    booking: "Book", name: "Full name", email: "Email",
    people: "Number of people", date: "Date", notes: "Notes (optional)",
    send: "Send request", sending: "Sending…",
    thanks: "Request sent", thanksSub: "This isn't a confirmation yet: the local will email you within 24 hours to confirm availability and details.",
    whatsapp: "Message on WhatsApp", close: "Close", required: "Please fill in the required fields.",
  },
};

/* --------------------------- PERSISTENZA ---------------------------------- */
const memStore = (() => { let m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } }; })();
const store = window.localStorage; // dati persistono al ricarico
const load = (k, fb) => { try { const v = store.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
const save = (k, v) => { try { store.setItem(k, JSON.stringify(v)); } catch {} };

/* --------------------------- LOGO ----------------------------------------- */
function Logo({ size = 26 }) {
  return (
    <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: size, letterSpacing: "-0.02em", lineHeight: 1 }}>
      <span style={{ color: BRAND.green }}>G</span><span style={{ color: BRAND.red }}>local</span>
    </span>
  );
}

/* ------------------------------- APP -------------------------------------- */
export default function App() {
  const [lang, setLang] = useState(() => load("gl_lang", "it"));
  const [group, setGroup] = useState(() => load("gl_group", null));
  const [interests, setInterests] = useState(() => load("gl_interests", []));
  const [showFilters, setShowFilters] = useState(false);
  const [booking, setBooking] = useState(null);
  const [detail, setDetail] = useState(null);
  const [itinerary, setItinerary] = useState(() => load("gl_itin", []));
  const [mapList, setMapList] = useState(() => load("gl_map", []));
  const [tray, setTray] = useState(null);
  const t = T[lang];

  // Carica i contenuti dal Google Sheet (CSV). Aggiungi una riga al foglio ->
  // aspetta ~1 min -> ricarica -> la card compare nella sezione giusta.
  const [PLACES, setPlaces] = useState([]);
  useEffect(() => {
    Papa.parse(CSV_URL, {
      download: true,
      header: true,
      complete: (res) => {
        const rows = (res.data || [])
          .filter((r) => r && r.id)
          .map((r) => ({ ...r, lat: Number(r.lat) || null, lng: Number(r.lng) || null }));
        setPlaces(rows);
      },
      error: (err) => console.error("Errore lettura foglio:", err),
    });
  }, []);

  useEffect(() => save("gl_lang", lang), [lang]);
  useEffect(() => save("gl_group", group), [group]);
  useEffect(() => save("gl_interests", interests), [interests]);
  useEffect(() => save("gl_itin", itinerary), [itinerary]);
  useEffect(() => save("gl_map", mapList), [mapList]);

  const toggleInterest = (id) => setInterests((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleIn = (list, setList, id) => setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const clearFilters = () => { setGroup(null); setInterests([]); };
  const activeCount = (group ? 1 : 0) + interests.length;

  const filtered = useMemo(() => PLACES.filter((p) => {
    const aud = String(p.audience || "").split(",").map((s) => s.trim()).filter(Boolean);
    const audienceOk = aud.length === 0 || !group || aud.includes(group);
    const pInt = String(p.interests || "").split(",").map((s) => s.trim()).filter(Boolean);
    const interestOk = interests.length === 0 || pInt.some((i) => interests.includes(i));
    return audienceOk && interestOk;
  }), [group, interests]);

  // hero = prima esperienza prenotabile disponibile tra i risultati
  const hero = useMemo(() => filtered.find((p) => p.section === "experience" && String(p.bookable).toLowerCase() === "yes"), [filtered]);
  const bySection = (secId) => filtered.filter((p) => p.section === secId && p.id !== (hero && hero.id));
  const byId = (id) => PLACES.find((p) => p.id === id);
  const showTray = itinerary.length > 0 || mapList.length > 0;

  return (
    <div style={{ minHeight: "100vh", background: BRAND.bg, color: BRAND.ink, fontFamily: "'Archivo', system-ui, sans-serif", paddingBottom: showTray ? 76 : 0 }}>
      <FontLink />

      {/* HEADER */}
      <header className="gl-header" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "18px 22px", position: "sticky", top: 0, background: "rgba(251,248,240,0.9)", backdropFilter: "blur(8px)", zIndex: 20, borderBottom: `1px solid ${BRAND.border}` }}>
        <span />
        <div style={{ justifySelf: "center" }}><Logo /></div>
        <div style={{ justifySelf: "end" }}><LangToggle lang={lang} setLang={setLang} /></div>
      </header>

      <main className="gl-main" style={{ maxWidth: 1040, margin: "0 auto", padding: "0 22px 48px" }}>
        {/* HERO EDITORIALE */}
        <section className="gl-hero-sec" style={{ padding: "56px 0 12px", position: "relative", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: BRAND.green, marginBottom: 20 }}>
            {t.eyebrow}
          </span>
          <h1 className="gl-hero-title" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(44px, 9vw, 92px)", lineHeight: 0.98, letterSpacing: "-0.035em", margin: "0 0 22px", whiteSpace: "pre-line" }}>
            {t.tagline}
          </h1>
          <p className="gl-hero-intro" style={{ fontSize: "clamp(16px, 2.2vw, 19px)", lineHeight: 1.55, color: "#4a463d", margin: "0 0 26px", maxWidth: 500 }}>{t.intro}</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
            <button onClick={() => setShowFilters((s) => !s)} style={{ display: "inline-flex", alignItems: "center", gap: 9, background: showFilters ? BRAND.ink : "transparent", color: showFilters ? "#fff" : BRAND.ink, border: `1.5px solid ${showFilters ? BRAND.ink : BRAND.ink}`, borderRadius: 999, padding: "12px 22px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ fontSize: 15 }}>⚙︎</span>{showFilters ? t.customizeOpen : t.customize}
              {activeCount > 0 && <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: BRAND.green, color: "#fff", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{activeCount}</span>}
            </button>
            {activeCount > 0 && <button onClick={clearFilters} style={{ background: "none", border: "none", color: BRAND.red, fontSize: 14.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{t.clearFilters}</button>}
          </div>
        </section>

        {showFilters && (
          <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 20, padding: 24, marginTop: 12, boxShadow: "0 1px 0 rgba(0,0,0,0.02)" }}>
            <FilterBlock title={t.q1} options={GROUPS} lang={lang} selected={group ? [group] : []} onPick={(id) => setGroup(group === id ? null : id)} />
            <div style={{ height: 1, background: BRAND.border, margin: "20px 0" }} />
            <FilterBlock title={t.q2} options={INTERESTS} lang={lang} selected={interests} onPick={toggleInterest} />
          </div>
        )}

        {filtered.length === 0 ? (
          <div style={{ marginTop: 40, padding: 36, background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 20, textAlign: "center", color: BRAND.muted }}>
            <p style={{ margin: "0 0 16px", fontSize: 16 }}>{t.empty}</p>
            <SecondaryBtn onClick={clearFilters}>{t.emptyCta}</SecondaryBtn>
          </div>
        ) : (
          <>
            {/* HERO CARD in evidenza */}
            {hero && (
              <div style={{ marginTop: 40 }}>
                <SectionHead label={t.featured} accent />
                <HeroCard place={hero} lang={lang} t={t} onBook={setBooking} onDetail={setDetail}
                  inItin={itinerary.includes(hero.id)} inMap={mapList.includes(hero.id)}
                  onToggleItin={() => toggleIn(itinerary, setItinerary, hero.id)} onToggleMap={() => toggleIn(mapList, setMapList, hero.id)} />
              </div>
            )}

            {SECTIONS.map((sec) => {
              const items = bySection(sec.id);
              if (items.length === 0) return null;
              return (
                <div key={sec.id} style={{ marginTop: 52 }}>
                  <SectionHead label={sec[lang]} count={items.length} />
                  <Carousel>
                    {items.map((p) => (
                      <div key={p.id} className="gl-slide">
                        <Card place={p} lang={lang} t={t} onBook={setBooking} onDetail={setDetail}
                          inItin={itinerary.includes(p.id)} inMap={mapList.includes(p.id)}
                          onToggleItin={() => toggleIn(itinerary, setItinerary, p.id)} onToggleMap={() => toggleIn(mapList, setMapList, p.id)} />
                      </div>
                    ))}
                  </Carousel>
                </div>
              );
            })}
          </>
        )}
      </main>

      {showTray && <BottomTray t={t} itinCount={itinerary.length} mapCount={mapList.length} onOpen={setTray} />}
      {tray === "itin" && <ItineraryPanel title={t.tabItin} t={t} lang={lang} items={itinerary.map(byId).filter(Boolean)} emptyMsg={t.itinEmpty} onRemove={(id) => toggleIn(itinerary, setItinerary, id)} onClear={() => setItinerary([])} onClose={() => setTray(null)} />}
      {tray === "map" && <MapPanel title={t.tabMap} t={t} lang={lang} items={mapList.map(byId).filter(Boolean)} emptyMsg={t.mapEmpty} onRemove={(id) => toggleIn(mapList, setMapList, id)} onClear={() => setMapList([])} onClose={() => setTray(null)} />}
      {detail && <DetailModal place={detail} lang={lang} t={t} onClose={() => setDetail(null)} onBook={(p) => { setDetail(null); setBooking(p); }} />}
      {booking && <BookingModal place={booking} lang={lang} t={t} onClose={() => setBooking(null)} />}
    </div>
  );
}

/* --------------------------- SECTION HEAD --------------------------------- */
function SectionHead({ label, count, accent }) {
  const color = accent ? BRAND.red : BRAND.green;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <span style={{ width: "clamp(24px, 8vw, 64px)", height: 2, background: color, opacity: accent ? 0.9 : 0.85, borderRadius: 2 }} />
      <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(22px, 3.4vw, 30px)", letterSpacing: "-0.02em", margin: 0, color: accent ? BRAND.red : BRAND.ink, textAlign: "center", whiteSpace: "nowrap" }}>{label}</h3>
      <span style={{ width: "clamp(24px, 8vw, 64px)", height: 2, background: color, opacity: accent ? 0.9 : 0.85, borderRadius: 2, position: "relative" }}>
        {count != null && <span style={{ position: "absolute", left: "calc(100% + 10px)", top: "50%", transform: "translateY(-50%)", fontSize: 13, color: BRAND.muted, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{String(count).padStart(2, "0")}</span>}
      </span>
    </div>
  );
}

/* ------------------------------ CAROUSEL ---------------------------------- */
function Carousel({ children }) {
  const ref = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const drag = useRef({ down: false, startX: 0, startScroll: 0, moved: false });

  const update = () => {
    const el = ref.current; if (!el) return;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  };
  useEffect(() => { update(); const el = ref.current; if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { el.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [children]);

  const scrollBy = (dir) => { const el = ref.current; if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 360), behavior: "smooth" });
  };

  // drag-to-scroll (desktop) — su touch lo scroll nativo fa già tutto
  const onDown = (e) => { const el = ref.current; if (!el) return;
    drag.current = { down: true, startX: e.pageX, startScroll: el.scrollLeft, moved: false };
  };
  const onMove = (e) => { const el = ref.current; if (!el || !drag.current.down) return;
    const dx = e.pageX - drag.current.startX;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    el.scrollLeft = drag.current.startScroll - dx;
  };
  const endDrag = () => { drag.current.down = false; };
  // impedisce il click sulla card se stavo trascinando
  const onClickCapture = (e) => { if (drag.current.moved) { e.stopPropagation(); e.preventDefault(); drag.current.moved = false; } };

  return (
    <div style={{ position: "relative", marginTop: 22 }}>
      <div
        ref={ref} className="gl-carousel"
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={endDrag} onClickCapture={onClickCapture}
      >
        {children}
      </div>
      <CarouselArrow dir="left"  onClick={() => scrollBy(-1)} hidden={atStart} />
      <CarouselArrow dir="right" onClick={() => scrollBy(1)}  hidden={atEnd} />
    </div>
  );
}

function CarouselArrow({ dir, onClick, hidden }) {
  return (
    <button
      onClick={onClick} aria-label={dir === "left" ? "Scorri indietro" : "Scorri avanti"}
      className="gl-arrow"
      style={{
        position: "absolute", top: "38%", [dir === "left" ? "left" : "right"]: -6, transform: "translateY(-50%)",
        width: 40, height: 40, borderRadius: "50%", border: `1px solid ${BRAND.border}`, background: "rgba(251,248,240,0.96)",
        color: BRAND.ink, fontSize: 18, cursor: "pointer", display: hidden ? "none" : "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 14px rgba(40,30,15,0.14)", zIndex: 5, backdropFilter: "blur(4px)",
      }}
    >
      {dir === "left" ? "‹" : "›"}
    </button>
  );
}

/* --------------------------- FILTER BLOCK --------------------------------- */
function FilterBlock({ title, options, lang, selected, onPick }) {
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", margin: "0 0 14px", color: BRAND.muted }}>{title}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
        {options.map((o) => {
          const active = selected.includes(o.id);
          return (
            <button key={o.id} onClick={() => onPick(o.id)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 999, cursor: "pointer", background: active ? BRAND.green : BRAND.card, color: active ? "#fff" : BRAND.ink, border: `1.5px solid ${active ? BRAND.green : BRAND.border}`, fontSize: 14, fontWeight: 500, fontFamily: "inherit", transition: "all .15s" }}>
              <span style={{ fontSize: 16 }}>{o.emoji}</span>{o[lang]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------ HERO CARD --------------------------------- */
function HeroCard({ place, lang, t, onBook, onDetail, inItin, inMap, onToggleItin, onToggleMap }) {
  const title = place[`title_${lang}`];
  const desc = place[`desc_${lang}`];
  const hasCoords = place.lat && place.lng;
  return (
    <article className="gl-hero" style={{ marginTop: 20, borderRadius: 24, overflow: "hidden", position: "relative", minHeight: 420, display: "flex", alignItems: "flex-end", cursor: "pointer", border: `1px solid ${BRAND.border}` }} onClick={() => onDetail(place)}>
      <img src={place.image} alt={title} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(20,16,10,0.88) 0%, rgba(20,16,10,0.35) 45%, rgba(20,16,10,0.05) 100%)" }} />
      <div style={{ position: "relative", padding: "clamp(24px, 4vw, 40px)", color: "#fff", width: "100%" }}>
        {place.location && <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#fff", opacity: 0.85 }}>{place.location}</span>}
        <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(28px, 5vw, 46px)", lineHeight: 1.02, letterSpacing: "-0.02em", margin: "10px 0 12px", maxWidth: 640 }}>{title}</h2>
        <p style={{ fontSize: "clamp(15px, 2vw, 17px)", lineHeight: 1.5, margin: "0 0 22px", maxWidth: 540, opacity: 0.92 }}>{desc}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onBook(place)} style={{ background: BRAND.red, color: "#fff", border: "none", borderRadius: 12, padding: "13px 26px", fontSize: 15.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {t.book}{place.price ? ` · ${place.price}` : ""}
          </button>
          <GlassChip active={inItin} onClick={onToggleItin} icon={inItin ? "✓" : "＋"} label={t.addItin} />
          {hasCoords && <GlassChip active={inMap} onClick={onToggleMap} icon={inMap ? "✓" : "＋"} label={t.addMap} />}
        </div>
      </div>
    </article>
  );
}

function GlassChip({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "11px 16px", borderRadius: 999, cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit", background: active ? "rgba(56,176,74,0.92)" : "rgba(255,255,255,0.16)", color: "#fff", border: `1.5px solid ${active ? "transparent" : "rgba(255,255,255,0.35)"}`, backdropFilter: "blur(6px)" }}>
      <span style={{ fontSize: 15, lineHeight: 1 }}>{icon}</span>{label}
    </button>
  );
}

/* ------------------------------- CARD ------------------------------------- */
function Card({ place, lang, t, onBook, onDetail, inItin, inMap, onToggleItin, onToggleMap }) {
  const title = place[`title_${lang}`];
  const desc = place[`desc_${lang}`];
  const bookable = String(place.bookable).trim().toLowerCase() === "yes";
  const hasCoords = place.lat && place.lng;
  return (
    <article className="gl-card" style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 18, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%", transition: "transform .18s ease, box-shadow .18s ease" }}>
      <button onClick={() => onDetail(place)} style={{ padding: 0, border: "none", background: "none", cursor: "pointer", display: "block", position: "relative" }}>
        <div style={{ aspectRatio: "3/2", background: "#eee", overflow: "hidden" }}>
          <img src={place.image} alt={title} className="gl-card-img" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", transition: "transform .4s ease" }} loading="lazy" />
        </div>
        <span style={{ position: "absolute", left: 12, top: 12, background: "rgba(251,248,240,0.94)", color: BRAND.ink, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "5px 10px", borderRadius: 999 }}>{place.location}</span>
      </button>
      <div style={{ padding: 18, display: "flex", flexDirection: "column", flex: 1 }}>
        <button onClick={() => onDetail(place)} style={{ textAlign: "left", padding: 0, border: "none", background: "none", cursor: "pointer" }}>
          <h4 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 20, margin: "0 0 8px", lineHeight: 1.15, letterSpacing: "-0.01em", color: BRAND.ink }}>{title}</h4>
        </button>
        <p style={{ fontSize: 14.5, lineHeight: 1.5, color: "#5c574c", margin: "0 0 16px", flex: 1, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{desc}</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <ChipBtn active={inItin} onClick={onToggleItin} icon={inItin ? "✓" : "＋"} label={t.addItin} />
          {hasCoords && <ChipBtn active={inMap} onClick={onToggleMap} icon={inMap ? "✓" : "＋"} label={t.addMap} />}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderTop: `1px solid ${BRAND.border}`, paddingTop: 14 }}>
          {place.price ? <span style={{ fontSize: 15, fontWeight: 700, color: BRAND.red, fontFamily: "'Fraunces', serif" }}>{place.price}</span> : <span style={{ fontSize: 13.5, color: BRAND.muted, fontWeight: 600 }}>{t.details} →</span>}
          {bookable && <button onClick={() => onBook(place)} style={{ background: BRAND.red, color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 14.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{t.book}</button>}
        </div>
      </div>
    </article>
  );
}

function ChipBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: active ? "rgba(56,176,74,0.12)" : BRAND.card, color: active ? BRAND.greenDark : "#5c574c", border: `1.5px solid ${active ? BRAND.green : BRAND.border}` }}>
      <span style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>{label}
    </button>
  );
}

/* --------------------------- DETAIL MODAL --------------------------------- */
function DetailModal({ place, lang, t, onClose, onBook }) {
  const title = place[`title_${lang}`];
  const desc = place[`desc_${lang}`];
  const bookable = String(place.bookable).trim().toLowerCase() === "yes";
  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...sheet, maxWidth: 540, padding: 0 }}>
        <div style={{ position: "relative" }}>
          <img src={place.image} alt={title} style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover", display: "block", borderRadius: "22px 22px 0 0" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(20,16,10,0.5), transparent 55%)", borderRadius: "22px 22px 0 0" }} />
          <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", fontSize: 21, cursor: "pointer", lineHeight: 1, backdropFilter: "blur(4px)" }}>×</button>
          {place.location && <span style={{ position: "absolute", left: 20, bottom: 16, color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>{place.location}</span>}
        </div>
        <div style={{ padding: 26 }}>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 29, margin: "0 0 14px", lineHeight: 1.1, letterSpacing: "-0.02em" }}>{title}</h3>
          <p style={{ fontSize: 16.5, lineHeight: 1.6, color: "#4a463d", margin: "0 0 22px" }}>{desc}</p>
          {place.price && <p style={{ fontSize: 20, fontWeight: 600, margin: "0 0 22px", color: BRAND.red, fontFamily: "'Fraunces', serif" }}>{place.price}</p>}
          {bookable && <button onClick={() => onBook(place)} style={{ width: "100%", background: BRAND.red, color: "#fff", border: "none", borderRadius: 12, padding: 16, fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{t.book}</button>}
        </div>
      </div>
    </div>
  );
}

/* --------------------------- BOTTOM TRAY ---------------------------------- */
function BottomTray({ t, itinCount, mapCount, onOpen }) {
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30, background: BRAND.ink, display: "flex", boxShadow: "0 -4px 30px rgba(0,0,0,0.22)" }}>
      <TrayButton label={t.tabItin} icon="🗒️" count={itinCount} onClick={() => onOpen("itin")} />
      <span style={{ width: 1, background: "rgba(255,255,255,0.14)" }} />
      <TrayButton label={t.tabMap} icon="📍" count={mapCount} onClick={() => onOpen("map")} />
    </div>
  );
}
function TrayButton({ label, icon, count, onClick }) {
  return (
    <button onClick={onClick} style={{ flex: 1, background: "none", border: "none", color: "#fff", cursor: "pointer", padding: "15px 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontFamily: "inherit", fontSize: 15, fontWeight: 600 }}>
      <span style={{ fontSize: 18 }}>{icon}</span><span>{label}</span>
      <span style={{ minWidth: 22, height: 22, borderRadius: 11, padding: "0 6px", background: count > 0 ? BRAND.green : "rgba(255,255,255,0.2)", color: "#fff", fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums" }}>{count}</span>
    </button>
  );
}

/* --------------------------- PANEL SHELL ---------------------------------- */
function PanelShell({ title, onClose, onClear, showClear, t, children }) {
  return (
    <div onClick={onClose} style={{ ...overlay, zIndex: 40 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...sheet, maxWidth: 560, padding: 0, maxHeight: "82vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 24px 16px", borderBottom: `1px solid ${BRAND.border}` }}>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 23, margin: 0, letterSpacing: "-0.01em" }}>{title}</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {showClear && <button onClick={onClear} style={{ background: "none", border: "none", color: BRAND.red, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{t.clearAll}</button>}
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 25, cursor: "pointer", color: "#999", lineHeight: 1 }}>×</button>
          </div>
        </div>
        <div style={{ overflowY: "auto", padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

/* --------------------- ITINERARY PANEL (per zona) ------------------------- */
function ItineraryPanel({ title, t, lang, items, emptyMsg, onRemove, onClear, onClose }) {
  const groups = useMemo(() => {
    const m = {}; items.forEach((p) => { const z = p.location || "—"; (m[z] = m[z] || []).push(p); });
    return Object.entries(m);
  }, [items]);
  return (
    <PanelShell title={title} t={t} onClose={onClose} onClear={onClear} showClear={items.length > 0}>
      {items.length === 0 ? (
        <p style={{ color: BRAND.muted, textAlign: "center", padding: "36px 12px", fontSize: 15 }}>{emptyMsg}</p>
      ) : (
        groups.map(([zone, list]) => (
          <div key={zone} style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
              <span style={{ fontSize: 15 }}>📍</span>
              <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 18 }}>{zone}</span>
              <span style={{ flex: 1, height: 2, background: BRAND.green, opacity: 0.8, borderRadius: 2 }} />
              <span style={{ fontSize: 12.5, color: BRAND.muted, fontVariantNumeric: "tabular-nums" }}>{String(list.length).padStart(2, "0")}</span>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {list.map((p) => (
                <li key={p.id} style={{ display: "flex", gap: 12, alignItems: "center", background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 10 }}>
                  <img src={p.image} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.25 }}>{p[`title_${lang}`]}</div>
                    {p.price && <div style={{ fontSize: 13, color: BRAND.red, marginTop: 2, fontWeight: 600 }}>{p.price}</div>}
                  </div>
                  <button onClick={() => onRemove(p.id)} aria-label={t.remove} style={{ background: "none", border: "none", color: "#bbb", fontSize: 21, cursor: "pointer", flexShrink: 0 }}>×</button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </PanelShell>
  );
}

/* ------------------------------ MAP PANEL --------------------------------- */
function MapPanel({ title, t, lang, items, emptyMsg, onRemove, onClear, onClose }) {
  const mapRef = useRef(null); const mapObj = useRef(null);
  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    const ensureLeaflet = () => new Promise((resolve) => {
      if (window.L) return resolve(window.L);
      const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
      const s = document.createElement("script"); s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; s.onload = () => resolve(window.L); document.body.appendChild(s);
    });
    ensureLeaflet().then((L) => {
      if (cancelled || !mapRef.current) return;
      if (!mapObj.current) mapObj.current = L.map(mapRef.current, { scrollWheelZoom: false });
      const map = mapObj.current;
      map.eachLayer((layer) => { if (!layer._url) map.removeLayer(layer); });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
      const pts = items.filter((p) => p.lat && p.lng);
      const markers = pts.map((p) => L.marker([p.lat, p.lng]).addTo(map).bindPopup(`<b>${p[`title_${lang}`]}</b>`));
      if (markers.length) { const grp = L.featureGroup(markers); map.fitBounds(grp.getBounds().pad(0.3)); }
      setTimeout(() => map.invalidateSize(), 100);
    });
    return () => { cancelled = true; };
  }, [items, lang]);
  useEffect(() => () => { if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; } }, []);
  return (
    <PanelShell title={title} t={t} onClose={onClose} onClear={onClear} showClear={items.length > 0}>
      {items.length === 0 ? (
        <p style={{ color: BRAND.muted, textAlign: "center", padding: "36px 12px", fontSize: 15 }}>{emptyMsg}</p>
      ) : (
        <>
          <div ref={mapRef} style={{ width: "100%", height: 300, borderRadius: 16, overflow: "hidden", border: `1px solid ${BRAND.border}`, marginBottom: 16, zIndex: 1 }} />
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map((p) => (
              <li key={p.id} style={{ display: "flex", gap: 12, alignItems: "center", background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 10 }}>
                <span style={{ fontSize: 18 }}>📍</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{p[`title_${lang}`]}</div>
                  {p.location && <div style={{ fontSize: 12.5, color: BRAND.muted }}>{p.location}</div>}
                </div>
                <button onClick={() => onRemove(p.id)} aria-label={t.remove} style={{ background: "none", border: "none", color: "#bbb", fontSize: 21, cursor: "pointer" }}>×</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </PanelShell>
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
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          esperienza: title,
          nome: form.name,
          email: form.email,
          persone: form.people,
          data: form.date,
          note: form.notes,
          _subject: `Nuova prenotazione Glocal: ${title}`,
        }),
      });
      if (res.ok) setStatus("done");
      else setStatus("error");
    } catch { setStatus("error"); }
  };
  const waText = encodeURIComponent(lang === "it"
    ? `Ciao! Ho inviato una richiesta di prenotazione tramite Glocal per "${title}" per il ${form.date || "—"}, ${form.people} persone. A nome di ${form.name || "—"}.`
    : `Hi! I sent a booking request via Glocal for "${title}" on ${form.date || "—"}, ${form.people} people. Under the name ${form.name || "—"}.`);
  return (
    <div onClick={onClose} style={{ ...overlay, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...sheet, maxWidth: 520, padding: 26 }}>
        {status === "done" ? (
          <div style={{ textAlign: "center", padding: "30px 8px" }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(56,176,74,0.14)", color: BRAND.green, fontSize: 32, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>✓</div>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, margin: "0 0 10px", letterSpacing: "-0.01em" }}>{t.thanks}</h3>
            <p style={{ color: "#5a554a", margin: "0 auto 24px", fontSize: 15, lineHeight: 1.55, maxWidth: 380 }}>{t.thanksSub}</p>
            {contact && <a href={`https://wa.me/${contact}?text=${waText}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#25D366", color: "#fff", textDecoration: "none", borderRadius: 12, padding: "13px 22px", fontSize: 15, fontWeight: 600, marginBottom: 12 }}><span>💬</span>{t.whatsapp}</a>}
            <div><button onClick={onClose} style={{ background: "none", border: "none", color: BRAND.muted, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginTop: 4 }}>{t.close}</button></div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.14em", color: BRAND.green, fontWeight: 700 }}>{t.booking}</span>
              <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 23, cursor: "pointer", color: "#999", lineHeight: 1 }}>×</button>
            </div>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 23, margin: "0 0 20px", letterSpacing: "-0.01em" }}>{title}</h3>
            <Field label={t.name}><input style={inp} value={form.name} onChange={set("name")} /></Field>
            <Field label={t.email}><input style={inp} type="email" value={form.email} onChange={set("email")} /></Field>
            <div style={{ display: "flex", gap: 12 }}>
              <Field label={t.people} flex><input style={inp} type="number" min="1" value={form.people} onChange={set("people")} /></Field>
              <Field label={t.date} flex><input style={inp} type="date" value={form.date} onChange={set("date")} /></Field>
            </div>
            <Field label={t.notes}><textarea style={{ ...inp, minHeight: 72, resize: "vertical" }} value={form.notes} onChange={set("notes")} /></Field>
            {status === "error" && <p style={{ color: BRAND.red, fontSize: 14, margin: "4px 0 12px" }}>{t.required}</p>}
            <button onClick={submit} disabled={status === "sending"} style={{ width: "100%", background: BRAND.red, color: "#fff", border: "none", borderRadius: 12, padding: 15, fontSize: 16, fontWeight: 600, cursor: status === "sending" ? "default" : "pointer", fontFamily: "inherit", marginTop: 8, opacity: status === "sending" ? 0.7 : 1 }}>
              {status === "sending" ? t.sending : t.send}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- SMALL BITS --------------------------------- */
const overlay = { position: "fixed", inset: 0, background: "rgba(26,20,12,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 };
const sheet = { background: BRAND.bg, width: "100%", borderRadius: "22px 22px 0 0", overflowY: "auto", maxHeight: "92vh", boxShadow: "0 -10px 50px rgba(0,0,0,0.25)" };
const inp = { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${BRAND.border}`, background: BRAND.card, fontSize: 15, fontFamily: "inherit", color: BRAND.ink, outline: "none" };
function Field({ label, children, flex }) {
  return (
    <label style={{ display: "block", marginBottom: 14, flex: flex ? 1 : undefined }}>
      <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, marginBottom: 6, color: "#3a3630", letterSpacing: "0.02em" }}>{label}</span>{children}
    </label>
  );
}
function LangToggle({ lang, setLang }) {
  return (
    <div style={{ display: "flex", border: `1.5px solid ${BRAND.border}`, borderRadius: 10, overflow: "hidden" }}>
      {["it", "en"].map((l) => (
        <button key={l} onClick={() => setLang(l)} style={{ padding: "7px 14px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", background: lang === l ? BRAND.ink : "transparent", color: lang === l ? "#fff" : "#999", textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</button>
      ))}
    </div>
  );
}
function SecondaryBtn({ children, onClick }) {
  return <button onClick={onClick} style={{ background: "transparent", color: BRAND.ink, border: `1.5px solid ${BRAND.ink}`, borderRadius: 12, padding: "12px 22px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{children}</button>;
}
function FontLink() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Archivo:wght@400;500;600;700&display=swap');
      * { -webkit-tap-highlight-color: transparent; }
      button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid ${BRAND.green}; outline-offset: 2px; }
      input:focus, textarea:focus { border-color: ${BRAND.green} !important; }
      .leaflet-container { font: inherit; }
      .gl-carousel {
        display: flex; gap: 20px; overflow-x: auto; scroll-snap-type: x mandatory;
        padding: 6px 2px 14px; margin: 0 -2px;
        scrollbar-width: none; -ms-overflow-style: none; cursor: grab;
        -webkit-overflow-scrolling: touch;
      }
      .gl-carousel:active { cursor: grabbing; }
      .gl-carousel::-webkit-scrollbar { display: none; }
      .gl-slide {
        flex: 0 0 auto; width: min(78vw, 288px); scroll-snap-align: start;
      }
      .gl-slide > * { height: 100%; }
      @media (hover:hover) {
        .gl-card:hover { transform: translateY(-4px); box-shadow: 0 14px 34px rgba(40,30,15,0.12); }
        .gl-card:hover .gl-card-img { transform: scale(1.05); }
        .gl-hero:hover { box-shadow: 0 18px 50px rgba(40,30,15,0.22); }
        .gl-arrow:hover { background: #fff; box-shadow: 0 6px 18px rgba(40,30,15,0.2); }
      }
      @media (max-width: 640px) {
        .gl-header { padding: 12px 16px !important; }
        .gl-main { padding: 0 16px 40px !important; }
        .gl-hero-sec { padding: 22px 0 6px !important; }
        .gl-hero-title { font-size: 34px !important; line-height: 1.02 !important; margin: 0 0 12px !important; }
        .gl-hero-intro { font-size: 15px !important; margin: 0 0 16px !important; }
        .gl-slide { width: 82vw !important; }
      }
      @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
    `}</style>
  );
}
