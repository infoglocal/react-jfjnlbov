import React, { useState, useMemo, useEffect, useRef } from "react";
import Papa from "papaparse";

/* ============================================================================
   GLOCAL — web app (mobile-first)
   ----------------------------------------------------------------------------
   Struttura da app: tab bar in basso (Home / Itinerario / Mappa),
   card-deck sfogliabile in evidenza, caroselli tematici, badge sulle foto.
   Dati dal Google Sheet (CSV) + prenotazioni via Formspree.

   Colonne foglio:
   id | section | title_it | title_en | desc_it | desc_en | image |
   interests | audience | bookable | price | location | lat | lng | contact
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
  { id: "experience", it: "Esperienze",  en: "Experiences" },
  { id: "do",         it: "Cosa fare",   en: "What to do" },
  { id: "go",         it: "Dove andare", en: "Where to go" },
];

// -------- CONTENUTI dal Google Sheet pubblicato come CSV --------------------
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_9BMkobKhzPLZGd0iSUhD466arK8-90i2MMG2IkyHGPk4vCz_oTJtMzRxvD_FaYIThNorwVPiIskJ/pub?gid=870868949&single=true&output=csv";

/* ------------------------------- I18N ------------------------------------- */
const T = {
  it: {
    welcomeEyebrow: "Bologna",
    welcomeTitle: "Vivi la città\ncome un local",
    welcomeSub: "Scelti da chi ci vive. Due domande veloci e ti mostriamo cosa vale davvero il tuo tempo.",
    welcomeStart: "Inizia",
    stepGroup: "Come stai viaggiando?", stepGroupSub: "Scegli un'opzione per continuare.",
    stepInterests: "Cosa ti piace fare?", stepInterestsSub: "Scegline almeno uno.",
    back: "Indietro", continue: "Continua", seeResults: "Vedi i risultati",
    forYou: "Per te", customize: "Modifica preferenze",
    q1: "Come stai viaggiando?", q2: "Cosa ti piace fare?",
    clearFilters: "Azzera", apply: "Applica",
    loading: "Caricamento…",
    empty: "Nessun risultato con questi filtri.", emptyCta: "Azzera i filtri",
    book: "Prenota", addItin: "Aggiungi all'Itinerario", inItin: "Nell'itinerario",
    of: "di",
    tabHome: "Home", tabItin: "Itinerario", tabMap: "Mappa",
    itinTitle: "Il tuo itinerario", mapTitle: "La tua mappa",
    tripDates: "Date del viaggio", from: "Dal", to: "Al",
    planBtn: "✨ Suggerisci un itinerario", planning: "Sto pianificando…",
    planTitle: "Il tuo itinerario giorno per giorno", planRegen: "Rigenera",
    planMorning: "Mattina", planLunch: "Pranzo", planAfternoon: "Pomeriggio", planEvening: "Sera",
    openInMaps: "Apri in Google Maps", shareWa: "Condividi su WhatsApp",
    day: "Giorno",
    itinEmpty: "Aggiungi luoghi ed esperienze dalla Home per costruire il tuo itinerario.",
    mapEmpty: "Aggiungi luoghi con coordinate al tuo itinerario per vederli sulla mappa.",
    remove: "Rimuovi", clearAll: "Svuota", goHome: "Vai alla Home",
    booking: "Prenota", name: "Nome e cognome", email: "Email",
    people: "Persone", date: "Data", notes: "Note (facoltative)",
    send: "Invia richiesta", sending: "Invio…",
    thanks: "Richiesta inviata", thanksSub: "Non è ancora una conferma: il local ti risponde via email entro 24 ore.",
    whatsapp: "Scrivi su WhatsApp", close: "Chiudi", required: "Compila i campi obbligatori.",
  },
  en: {
    welcomeEyebrow: "Bologna",
    welcomeTitle: "Experience the city\nlike a local",
    welcomeSub: "Picked by people who live here. Two quick questions and we'll show you what's worth your time.",
    welcomeStart: "Start",
    stepGroup: "How are you travelling?", stepGroupSub: "Pick one to continue.",
    stepInterests: "What do you enjoy?", stepInterestsSub: "Pick at least one.",
    back: "Back", continue: "Continue", seeResults: "See results",
    forYou: "For you", customize: "Edit preferences",
    q1: "How are you travelling?", q2: "What do you enjoy?",
    clearFilters: "Clear", apply: "Apply",
    loading: "Loading…",
    empty: "Nothing matches these filters.", emptyCta: "Clear filters",
    book: "Book", addItin: "Add to itinerary", inItin: "In itinerary",
    of: "of",
    tabHome: "Home", tabItin: "Itinerary", tabMap: "Map",
    itinTitle: "Your itinerary", mapTitle: "Your map",
    tripDates: "Trip dates", from: "From", to: "To",
    planBtn: "✨ Suggest an itinerary", planning: "Planning…",
    planTitle: "Your day-by-day itinerary", planRegen: "Regenerate",
    planMorning: "Morning", planLunch: "Lunch", planAfternoon: "Afternoon", planEvening: "Evening",
    openInMaps: "Open in Google Maps", shareWa: "Share on WhatsApp",
    day: "Day",
    itinEmpty: "Add places and experiences from Home to build your itinerary.",
    mapEmpty: "Add places with coordinates to your itinerary to see them on the map.",
    remove: "Remove", clearAll: "Clear", goHome: "Go to Home",
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

/* --------------------------- LOGO ----------------------------------------- */
function Logo({ size = 24 }) {
  return (
    <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: size, letterSpacing: "-0.02em", lineHeight: 1 }}>
      <span style={{ color: BRAND.green }}>G</span><span style={{ color: BRAND.red }}>local</span>
    </span>
  );
}

/* --------------------------- ONBOARDING ----------------------------------- */
function WelcomeStep({ t, onStart }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center", padding: "40px 0" }}>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: BRAND.green, marginBottom: 18 }}>{t.welcomeEyebrow}</span>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(38px, 11vw, 60px)", lineHeight: 1.0, letterSpacing: "-0.03em", margin: "0 0 20px", whiteSpace: "pre-line" }}>{t.welcomeTitle}</h1>
      <p style={{ fontSize: 17, lineHeight: 1.55, color: "#4a463d", margin: "0 auto 36px", maxWidth: 400 }}>{t.welcomeSub}</p>
      <div>
        <button onClick={onStart} style={{ background: BRAND.green, color: "#fff", border: "none", borderRadius: 16, padding: "17px 48px", fontSize: 17, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{t.welcomeStart}</button>
      </div>
    </div>
  );
}

function OnboardStep({ title, subtitle, options, lang, selected, onPick, canNext, onNext, onBack, nextLabel, backLabel }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", paddingTop: 40, paddingBottom: 28 }}>
      <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(28px, 6vw, 38px)", letterSpacing: "-0.02em", margin: "0 0 8px", lineHeight: 1.1 }}>{title}</h2>
      <p style={{ color: BRAND.muted, margin: "0 0 28px", fontSize: 16 }}>{subtitle}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, flex: 1, alignContent: "start" }}>
        {options.map((o) => {
          const active = selected.includes(o.id);
          return (
            <button key={o.id} onClick={() => onPick(o.id)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "17px 18px", borderRadius: 16, cursor: "pointer", background: active ? BRAND.green : BRAND.card, color: active ? "#fff" : BRAND.ink, border: `1.5px solid ${active ? BRAND.green : BRAND.border}`, fontSize: 16, fontWeight: 500, fontFamily: "inherit", textAlign: "left", transition: "all .15s" }}>
              <span style={{ fontSize: 24 }}>{o.emoji}</span><span>{o[lang]}</span>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
        <button onClick={onBack} style={{ background: "transparent", color: BRAND.ink, border: `1.5px solid ${BRAND.border}`, borderRadius: 16, padding: "15px 24px", fontSize: 15.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{backLabel}</button>
        <button onClick={onNext} disabled={!canNext} style={{ flex: 1, background: canNext ? BRAND.green : "#d9d3c4", color: "#fff", border: "none", borderRadius: 16, padding: "15px", fontSize: 16, fontWeight: 700, cursor: canNext ? "pointer" : "default", fontFamily: "inherit", transition: "background .15s" }}>{nextLabel}</button>
      </div>
    </div>
  );
}

/* ------------------------------- APP -------------------------------------- */
export default function App() {
  const [lang, setLang] = useState(() => load("gl_lang", "it"));
  const [tab, setTab] = useState("home");             // home | itin | map
  const [step, setStep] = useState("welcome");        // welcome | group | interests | app
  const [group, setGroup] = useState(null);
  const [interests, setInterests] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
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

  const toggleInterest = (id) => setInterests((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleIn = (list, setList, id) => setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const clearFilters = () => { setGroup(null); setInterests([]); };
  const PLACES = places;

  const filtered = useMemo(() => PLACES.filter((p) => {
    const aud = String(p.audience || "").split(",").map((s) => s.trim()).filter(Boolean);
    const audienceOk = aud.length === 0 || !group || aud.includes(group);
    const pInt = String(p.interests || "").split(",").map((s) => s.trim()).filter(Boolean);
    const interestOk = interests.length === 0 || pInt.some((i) => interests.includes(i));
    return audienceOk && interestOk;
  }), [PLACES, group, interests]);

  const byId = (id) => PLACES.find((p) => p.id === id);
  const bySection = (secId) => filtered.filter((p) => p.section === secId);

  // ---- ONBOARDING: benvenuto -> gruppo -> interessi -> app ----
  if (step !== "app") {
    return (
      <div style={{ minHeight: "100vh", background: BRAND.bg, color: BRAND.ink, fontFamily: "'Archivo', system-ui, sans-serif" }}>
        <FontLink />
        <header style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "14px 18px", position: "sticky", top: 0, background: "rgba(251,248,240,0.92)", backdropFilter: "blur(10px)", zIndex: 30, borderBottom: `1px solid ${BRAND.border}` }}>
          <span />
          <div style={{ justifySelf: "center" }}><Logo /></div>
          <div style={{ justifySelf: "end" }}><LangToggle lang={lang} setLang={setLang} /></div>
        </header>
        <main style={{ maxWidth: 560, margin: "0 auto", padding: "0 22px", minHeight: "calc(100vh - 60px)", display: "flex", flexDirection: "column" }}>
          {step === "welcome" && <WelcomeStep t={t} onStart={() => setStep("group")} />}
          {step === "group" && (
            <OnboardStep
              title={t.stepGroup} subtitle={t.stepGroupSub} options={GROUPS} lang={lang}
              selected={group ? [group] : []} onPick={(id) => setGroup(group === id ? null : id)}
              canNext={!!group} onNext={() => setStep("interests")} onBack={() => setStep("welcome")}
              nextLabel={t.continue} backLabel={t.back}
            />
          )}
          {step === "interests" && (
            <OnboardStep
              title={t.stepInterests} subtitle={t.stepInterestsSub} options={INTERESTS} lang={lang}
              selected={interests} onPick={toggleInterest}
              canNext={interests.length > 0} onNext={() => { setTab("home"); setStep("app"); }} onBack={() => setStep("group")}
              nextLabel={t.seeResults} backLabel={t.back}
            />
          )}
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: BRAND.bg, color: BRAND.ink, fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <FontLink />

      {/* HEADER compatto */}
      <header style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "14px 18px", position: "sticky", top: 0, background: "rgba(251,248,240,0.92)", backdropFilter: "blur(10px)", zIndex: 30, borderBottom: `1px solid ${BRAND.border}` }}>
        <span style={{ justifySelf: "start" }}>
          {loading && <span style={{ fontSize: 12.5, color: BRAND.muted, display: "inline-flex", alignItems: "center", gap: 6 }}><Spinner /></span>}
        </span>
        <div style={{ justifySelf: "center" }}><Logo /></div>
        <div style={{ justifySelf: "end" }}><LangToggle lang={lang} setLang={setLang} /></div>
      </header>

      {/* CONTENUTO per tab */}
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "0 0 96px" }}>
        {tab === "home" && (
          <HomeTab
            t={t} lang={lang} loading={loading} sections={SECTIONS} bySection={bySection}
            total={filtered.length}
            showFilters={showFilters} setShowFilters={setShowFilters}
            group={group} setGroup={setGroup} interests={interests} toggleInterest={toggleInterest}
            clearFilters={clearFilters} activeCount={(group ? 1 : 0) + interests.length}
            onBook={setBooking} onDetail={setDetail}
            itinerary={itinerary}
            onToggleItin={(id) => toggleIn(itinerary, setItinerary, id)}
          />
        )}
        {tab === "itin" && (
          <ItineraryTab t={t} lang={lang} items={itinerary.map(byId).filter(Boolean)}
            onRemove={(id) => toggleIn(itinerary, setItinerary, id)} onClear={() => setItinerary([])} onGoHome={() => setTab("home")}
            dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
        )}
        {tab === "map" && (
          <MapTab t={t} lang={lang} items={itinerary.map(byId).filter(Boolean)}
            onGoHome={() => setTab("home")} />
        )}
      </main>

      {/* TAB BAR in basso */}
      <TabBar t={t} tab={tab} setTab={setTab} itinCount={itinerary.length} mapCount={itinerary.map(byId).filter((p) => p && p.lat && p.lng).length} />

      {detail && <DetailModal place={detail} lang={lang} t={t} onClose={() => setDetail(null)} onBook={(p) => { setDetail(null); setBooking(p); }} onToggleItin={(id) => toggleIn(itinerary, setItinerary, id)} inItin={detail ? itinerary.includes(detail.id) : false} />}
      {booking && <BookingModal place={booking} lang={lang} t={t} onClose={() => setBooking(null)} />}
    </div>
  );
}

/* ------------------------------ HOME TAB ---------------------------------- */
function HomeTab({ t, lang, loading, sections, bySection, total, showFilters, setShowFilters, group, setGroup, interests, toggleInterest, clearFilters, activeCount, onBook, onDetail, itinerary, onToggleItin }) {
  return (
    <div style={{ padding: "18px 18px 0" }}>
      {/* barra "Per te" + preferenze */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: BRAND.red, color: "#fff", padding: "9px 16px", borderRadius: 999, fontSize: 15, fontWeight: 700 }}>
          <span>✦</span>{t.forYou}
        </div>
        <button onClick={() => setShowFilters(true)} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "transparent", color: BRAND.ink, border: `1.5px solid ${BRAND.border}`, borderRadius: 999, padding: "9px 15px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          <span>⚙︎</span>{t.customize}
          {activeCount > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: BRAND.green, color: "#fff", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{activeCount}</span>}
        </button>
      </div>

      {loading && <DeckSkeleton />}

      {!loading && total === 0 && (
        <div style={{ marginTop: 20, padding: 32, background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 20, textAlign: "center", color: BRAND.muted }}>
          <p style={{ margin: "0 0 16px", fontSize: 15 }}>{t.empty}</p>
          <button onClick={clearFilters} style={pillBtn}>{t.emptyCta}</button>
        </div>
      )}

      {!loading && sections.map((sec) => {
        const items = bySection(sec.id);
        if (items.length === 0) return null;
        return (
          <Deck
            key={sec.id} title={sec[lang]} items={items} lang={lang} t={t} onBook={onBook} onDetail={onDetail}
            itinerary={itinerary} onToggleItin={onToggleItin}
          />
        );
      })}

      {showFilters && (
        <FilterSheet
          t={t} lang={lang} group={group} setGroup={setGroup}
          interests={interests} toggleInterest={toggleInterest}
          clearFilters={clearFilters} onClose={() => setShowFilters(false)}
        />
      )}
    </div>
  );
}

/* -------------------------------- DECK ------------------------------------ */
/* Un "deck" = titolo sezione + contatore "1 di N" + card grande sfogliabile. */
function Deck({ title, items, lang, t, onBook, onDetail, itinerary, onToggleItin }) {
  const ref = useRef(null);
  const [idx, setIdx] = useState(0);
  const drag = useRef({ down: false, x: 0, s: 0, moved: false });

  const onScroll = () => {
    const el = ref.current; if (!el) return;
    const w = el.clientWidth;
    setIdx(Math.round(el.scrollLeft / w));
  };
  const go = (dir) => {
    const el = ref.current; if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  };
  const onDown = (e) => { const el = ref.current; if (!el) return; drag.current = { down: true, x: e.pageX, s: el.scrollLeft, moved: false }; };
  const onMove = (e) => { const el = ref.current; if (!el || !drag.current.down) return; const dx = e.pageX - drag.current.x; if (Math.abs(dx) > 4) drag.current.moved = true; el.scrollLeft = drag.current.s - dx; };
  const end = () => { drag.current.down = false; };
  const onClickCapture = (e) => { if (drag.current.moved) { e.stopPropagation(); e.preventDefault(); drag.current.moved = false; } };

  return (
    <section style={{ marginBottom: 30 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 22, margin: 0, letterSpacing: "-0.01em" }}>{title}</h3>
        <span style={{ fontSize: 13, color: BRAND.muted, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{idx + 1} {t.of} {items.length}</span>
      </div>

      <div style={{ position: "relative" }}>
        <div ref={ref} className="gl-deck" onScroll={onScroll} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={end} onMouseLeave={end} onClickCapture={onClickCapture}>
          {items.map((p) => (
            <div key={p.id} className="gl-deck-slide">
              <DeckCard place={p} lang={lang} t={t} onBook={onBook} onDetail={onDetail}
                inItin={itinerary.includes(p.id)}
                onToggleItin={() => onToggleItin(p.id)} />
            </div>
          ))}
        </div>
        {idx > 0 && <DeckArrow dir="left" onClick={() => go(-1)} />}
        {idx < items.length - 1 && <DeckArrow dir="right" onClick={() => go(1)} />}
      </div>

      {/* dots */}
      {items.length > 1 && items.length <= 12 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 12 }}>
          {items.map((_, i) => (
            <span key={i} style={{ width: i === idx ? 20 : 7, height: 7, borderRadius: 999, background: i === idx ? BRAND.red : BRAND.border, transition: "all .2s" }} />
          ))}
        </div>
      )}
    </section>
  );
}

function DeckArrow({ dir, onClick }) {
  return (
    <button onClick={onClick} aria-label={dir === "left" ? "Precedente" : "Successivo"} className="gl-deck-arrow"
      style={{ position: "absolute", top: "42%", [dir === "left" ? "left" : "right"]: 8, transform: "translateY(-50%)", width: 42, height: 42, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.92)", color: BRAND.ink, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.18)", zIndex: 4, backdropFilter: "blur(4px)" }}>
      {dir === "left" ? "‹" : "›"}
    </button>
  );
}

/* ----------------------------- DECK CARD ---------------------------------- */
function DeckCard({ place, lang, t, onBook, onDetail, inItin, onToggleItin }) {
  const title = place[`title_${lang}`];
  const desc = place[`desc_${lang}`];
  const bookable = String(place.bookable).trim().toLowerCase() === "yes";
  const hasCoords = place.lat && place.lng;
  const tags = String(place.interests || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 2)
    .map((id) => (INTERESTS.find((x) => x.id === id) || { [lang]: id })[lang]);

  return (
    <article style={{ background: BRAND.card, borderRadius: 22, overflow: "hidden", border: `1px solid ${BRAND.border}`, boxShadow: "0 6px 22px rgba(40,30,15,0.08)", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* immagine con badge — cliccabile per aprire il dettaglio */}
      <div onClick={() => onDetail(place)} style={{ position: "relative", aspectRatio: "4/3", background: "#eee", overflow: "hidden", cursor: "pointer" }}>
        <img src={place.image} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(20,16,10,0.72), rgba(20,16,10,0) 42%)" }} />
        <div style={{ position: "absolute", top: 14, left: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tags.map((tg, i) => (
            <span key={i} style={{ background: "rgba(255,255,255,0.92)", color: BRAND.ink, fontSize: 12.5, fontWeight: 700, padding: "6px 12px", borderRadius: 999, backdropFilter: "blur(4px)" }}>{tg}</span>
          ))}
        </div>
        <div style={{ position: "absolute", left: 18, bottom: 14, right: 18 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(26px, 7vw, 34px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: "#fff", margin: 0 }}>{title}</h2>
        </div>
      </div>

      {/* corpo */}
      <div style={{ padding: 18, display: "flex", flexDirection: "column", flex: 1 }}>
        <p onClick={() => onDetail(place)} style={{ fontSize: 15, lineHeight: 1.5, color: "#4a463d", margin: "0 0 14px", flex: 1, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", cursor: "pointer" }}>{desc}</p>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          {place.location && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND.muted }}>📍 {place.location}</span>}
          {place.price && <span style={{ fontSize: 15, fontWeight: 700, color: BRAND.red, fontFamily: "'Fraunces', serif" }}>{place.price}</span>}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onToggleItin} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: inItin ? BRAND.greenDark : BRAND.red, color: "#fff", border: "none", borderRadius: 14, padding: "14px 16px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ fontSize: 17 }}>{inItin ? "✓" : "＋"}</span>{inItin ? t.inItin : t.addItin}
          </button>
          {bookable && (
            <button onClick={() => onBook(place)} aria-label={t.book} style={{ width: 52, flexShrink: 0, background: "transparent", color: BRAND.red, border: `1.5px solid ${BRAND.border}`, borderRadius: 14, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>📅</button>
          )}

        </div>
      </div>
    </article>
  );
}

/* --------------------------- FILTER SHEET --------------------------------- */
function FilterSheet({ t, lang, group, setGroup, interests, toggleInterest, clearFilters, onClose }) {
  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...sheet, maxWidth: 560, padding: 0, maxHeight: "84vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 22px 14px", borderBottom: `1px solid ${BRAND.border}` }}>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 21, margin: 0 }}>{t.customize}</h3>
          <button onClick={onClose} style={xBtn}>×</button>
        </div>
        <div style={{ overflowY: "auto", padding: 22 }}>
          <p style={sheetLabel}>{t.q1}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginBottom: 22 }}>
            {GROUPS.map((o) => {
              const active = group === o.id;
              return <Chip key={o.id} active={active} onClick={() => setGroup(active ? null : o.id)} emoji={o.emoji} label={o[lang]} />;
            })}
          </div>
          <p style={sheetLabel}>{t.q2}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
            {INTERESTS.map((o) => (
              <Chip key={o.id} active={interests.includes(o.id)} onClick={() => toggleInterest(o.id)} emoji={o.emoji} label={o[lang]} />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, padding: 18, borderTop: `1px solid ${BRAND.border}` }}>
          <button onClick={clearFilters} style={{ ...pillBtn, flex: "0 0 auto" }}>{t.clearFilters}</button>
          <button onClick={onClose} style={{ flex: 1, background: BRAND.green, color: "#fff", border: "none", borderRadius: 14, padding: 15, fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{t.apply}</button>
        </div>
      </div>
    </div>
  );
}

function Chip({ active, onClick, emoji, label }) {
  return (
    <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 15px", borderRadius: 999, cursor: "pointer", background: active ? BRAND.green : BRAND.card, color: active ? "#fff" : BRAND.ink, border: `1.5px solid ${active ? BRAND.green : BRAND.border}`, fontSize: 14.5, fontWeight: 500, fontFamily: "inherit" }}>
      <span style={{ fontSize: 16 }}>{emoji}</span>{label}
    </button>
  );
}

/* --------------------- PLANNER (suggerimento a regole) -------------------- */
// "Finto AI": ordina i posti dell'itinerario in una giornata sensata, senza
// chiamare nessun server. Regole: ristoranti -> pranzo/cena, bar -> sera,
// musei/cultura/attività -> mattina/pomeriggio. Distribuisce sui giorni.
function buildPlan(items, nDays, t) {
  const isFood = (p) => /food/.test(String(p.interests || ""));
  const isDrink = (p) => /drink/.test(String(p.interests || ""));
  const days = Math.max(1, nDays || 1);

  // suddivido i posti in secchi per momento della giornata
  const evening = items.filter((p) => isDrink(p) && !isFood(p));
  const meals = items.filter((p) => isFood(p));
  const daytime = items.filter((p) => !isFood(p) && !(isDrink(p) && !isFood(p)));

  // distribuisco a round-robin sui giorni
  const perDay = Array.from({ length: days }, () => ({ morning: [], lunch: [], afternoon: [], evening: [] }));
  daytime.forEach((p, i) => {
    const d = i % days;
    (i % 2 === 0 ? perDay[d].morning : perDay[d].afternoon).push(p);
  });
  meals.forEach((p, i) => {
    const d = i % days;
    (i % 2 === 0 ? perDay[d].lunch : perDay[d].evening).push(p);
  });
  evening.forEach((p, i) => { perDay[i % days].evening.push(p); });

  return perDay;
}

// URL per aprire l'itinerario in Google Maps con le tappe (solo posti con coordinate)
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

  const runPlan = () => {
    setPlanning(true);
    setPlan(null);
    // piccola attesa per dare il senso di "sta pensando"
    setTimeout(() => { setPlan(buildPlan(items, nDays, t)); setPlanning(false); }, 700);
  };

  const shareWhatsApp = () => {
    const lines = [`${t.itinTitle} — Bologna`, ""];
    groups.forEach(([zone, list]) => {
      lines.push(`📍 ${zone}`);
      list.forEach((p) => lines.push(`• ${p[`title_${lang}`]}${p.price ? ` (${p.price})` : ""}`));
      lines.push("");
    });
    const text = encodeURIComponent(lines.join("\n"));
    window.open(`https://wa.me/?text=${text}`, "_blank");
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
          {/* date del viaggio */}
          <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <p style={{ ...sheetLabel, marginBottom: 10 }}>{t.tripDates}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <label style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: 12, color: BRAND.muted, marginBottom: 4 }}>{t.from}</span>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inp} />
              </label>
              <label style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: 12, color: BRAND.muted, marginBottom: 4 }}>{t.to}</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inp} />
              </label>
            </div>
          </div>

          {/* pulsante pianifica */}
          <button onClick={runPlan} disabled={planning} style={{ width: "100%", background: BRAND.ink, color: "#fff", border: "none", borderRadius: 16, padding: 16, fontSize: 16, fontWeight: 700, cursor: planning ? "default" : "pointer", fontFamily: "inherit", marginBottom: 16, opacity: planning ? 0.7 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {planning ? <><Spinner />{t.planning}</> : t.planBtn}
          </button>

          {/* risultato del planner */}
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

          {/* azioni: maps + whatsapp */}
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

          {/* lista per zona */}
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

/* ------------------------------ MAP TAB ----------------------------------- */
function MapTab({ t, lang, items, onGoHome }) {
  const mapRef = useRef(null); const mapObj = useRef(null); const markersRef = useRef([]);
  const [mapError, setMapError] = useState(false);

  const ensureLeaflet = () => new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);
    if (!document.getElementById("leaflet-css")) {
      const css = document.createElement("link");
      css.id = "leaflet-css"; css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
    }
    let s = document.getElementById("leaflet-js");
    if (s) { s.addEventListener("load", () => resolve(window.L)); return; }
    s = document.createElement("script");
    s.id = "leaflet-js";
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = () => resolve(window.L);
    s.onerror = () => reject(new Error("leaflet failed"));
    document.body.appendChild(s);
  });

  useEffect(() => {
    if (items.filter((p) => p.lat && p.lng).length === 0) return;
    let cancelled = false;
    const init = () => {
      ensureLeaflet().then((L) => {
        if (cancelled || !mapRef.current) return;
        if (!mapObj.current) {
          mapObj.current = L.map(mapRef.current, { scrollWheelZoom: false, zoomControl: true });
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(mapObj.current);
        }
        const map = mapObj.current;
        markersRef.current.forEach((m) => map.removeLayer(m));
        markersRef.current = [];
        const pts = items.filter((p) => p.lat && p.lng);
        pts.forEach((p) => {
          const mk = L.marker([p.lat, p.lng]).addTo(map).bindPopup(`<b>${p[`title_${lang}`]}</b>`);
          markersRef.current.push(mk);
        });
        if (markersRef.current.length) {
          const grp = L.featureGroup(markersRef.current);
          map.fitBounds(grp.getBounds().pad(0.35), { maxZoom: 15 });
        }
        // invalidateSize ripetuto: risolve il caso "mappa grigia" quando il
        // container non aveva dimensioni al primo render
        setTimeout(() => map.invalidateSize(), 60);
        setTimeout(() => map.invalidateSize(), 300);
        setTimeout(() => map.invalidateSize(), 800);
      }).catch(() => setMapError(true));
    };
    // ritardo minimo per essere sicuri che il div abbia altezza
    const raf = requestAnimationFrame(init);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [items, lang]);

  useEffect(() => () => { if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; markersRef.current = []; } }, []);

  const withCoords = items.filter((p) => p.lat && p.lng);
  return (
    <div style={{ padding: "20px 18px 0" }}>
      <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 26, margin: "0 0 18px", letterSpacing: "-0.01em" }}>{t.mapTitle}</h2>
      {withCoords.length === 0 ? (
        <EmptyState msg={t.mapEmpty} cta={t.goHome} onCta={onGoHome} icon="📍" />
      ) : (
        <>
          {mapError && <p style={{ color: BRAND.muted, fontSize: 14, marginBottom: 12 }}>Mappa non disponibile al momento. I luoghi sono elencati qui sotto.</p>}
          <div ref={mapRef} style={{ width: "100%", height: 340, borderRadius: 18, overflow: "hidden", border: `1px solid ${BRAND.border}`, marginBottom: 14, zIndex: 1, background: "#eef0ea" }} />
          {(() => {
            const mapsUrl = googleMapsDirUrl(withCoords);
            const shareWa = () => {
              const text = encodeURIComponent(`${t.mapTitle} — Bologna\n\n` + withCoords.map((p) => `📍 ${p[`title_${lang}`]}`).join("\n"));
              window.open(`https://wa.me/?text=${text}`, "_blank");
            };
            return (
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: BRAND.card, color: BRAND.ink, textDecoration: "none", border: `1.5px solid ${BRAND.border}`, borderRadius: 14, padding: "13px 12px", fontSize: 14, fontWeight: 700 }}>
                    <span>🗺️</span>{t.openInMaps}
                  </a>
                )}
                <button onClick={shareWa} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#25D366", color: "#fff", border: "none", borderRadius: 14, padding: "13px 12px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  <span>💬</span>{t.shareWa}
                </button>
              </div>
            );
          })()}
          <ul style={listReset}>
            {withCoords.map((p) => (
              <li key={p.id} style={rowCard}>
                <img src={p.image} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15.5 }}>{p[`title_${lang}`]}</div>
                  {p.location && <div style={{ fontSize: 13, color: BRAND.muted }}>{p.location}</div>}
                </div>
              </li>
            ))}
          </ul>
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
  const c = active ? "#e5383b" : "#7a7568";
  const sw = 1.9;
  if (name === "home") return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/><path d="M9.5 21v-6h5v6"/></svg>
  );
  if (name === "itin") return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/></svg>
  );
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="m9 4-6 2.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z"/><path d="M9 4v13"/><path d="M15 6.5v13"/></svg>
  );
}

function TabBar({ t, tab, setTab, itinCount, mapCount }) {
  const tabs = [
    { id: "home", label: t.tabHome },
    { id: "itin", label: t.tabItin, count: itinCount },
    { id: "map",  label: t.tabMap,  count: mapCount },
  ];
  return (
    <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40, background: "rgba(251,248,240,0.96)", backdropFilter: "blur(12px)", borderTop: `1px solid ${BRAND.border}`, display: "flex", paddingBottom: "env(safe-area-inset-bottom, 0)" }}>
      {tabs.map((tb) => {
        const active = tab === tb.id;
        return (
          <button key={tb.id} onClick={() => setTab(tb.id)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "9px 8px 11px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, fontFamily: "inherit", color: active ? BRAND.red : BRAND.muted, position: "relative" }}>
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
  const hasCoords = place.lat && place.lng;
  const tags = String(place.interests || "").split(",").map((s) => s.trim()).filter(Boolean)
    .map((id) => (INTERESTS.find((x) => x.id === id) || { [lang]: id, emoji: "" }));
  // galleria: colonna "images" (URL separati da virgola) + fallback all'immagine principale
  const extra = String(place.images || "").split(",").map((s) => s.trim()).filter(Boolean);
  const gallery = [place.image, ...extra].filter(Boolean);
  // indirizzo cliccabile -> apre Google Maps
  const address = String(place.address || "").trim();
  const mapsUrl = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;

  return (
    <div onClick={onClose} style={{ ...overlay, zIndex: 55 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...sheet, maxWidth: 540, padding: 0, maxHeight: "94vh" }}>
        {/* galleria immagini sfogliabile */}
        <div style={{ position: "relative" }}>
          <DetailGallery images={gallery} alt={title} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(20,16,10,0.55), transparent 50%)", borderRadius: "22px 22px 0 0", pointerEvents: "none" }} />
          <button onClick={onClose} aria-label={t.close} style={{ position: "absolute", top: 14, right: 14, width: 38, height: 38, borderRadius: "50%", background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1, backdropFilter: "blur(4px)", zIndex: 3 }}>×</button>
          <div style={{ position: "absolute", left: 20, bottom: 16, right: 20, pointerEvents: "none" }}>
            {place.location && <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#fff", opacity: 0.9, marginBottom: 6 }}>📍 {place.location}</span>}
            <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(26px, 6vw, 34px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: "#fff", margin: 0 }}>{title}</h2>
          </div>
        </div>

        {/* corpo scrollabile */}
        <div style={{ padding: 22, overflowY: "auto" }}>
          {/* tag */}
          {tags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {tags.map((tg, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(56,176,74,0.1)", color: BRAND.greenDark, fontSize: 13, fontWeight: 600, padding: "6px 12px", borderRadius: 999 }}>
                  <span>{tg.emoji}</span>{tg[lang]}
                </span>
              ))}
            </div>
          )}

          {place.price && <p style={{ fontSize: 22, fontWeight: 600, margin: "0 0 16px", color: BRAND.red, fontFamily: "'Fraunces', serif" }}>{place.price}</p>}

          <p style={{ fontSize: 16.5, lineHeight: 1.65, color: "#4a463d", margin: "0 0 20px", whiteSpace: "pre-line" }}>{desc}</p>

          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: BRAND.ink, background: BRAND.card, border: `1.5px solid ${BRAND.border}`, borderRadius: 14, padding: "13px 15px", marginBottom: 24 }}>
              <span style={{ fontSize: 18 }}>📍</span>
              <span style={{ flex: 1, fontSize: 14.5, fontWeight: 500, lineHeight: 1.35 }}>{address}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: BRAND.green }}>{lang === "it" ? "Apri" : "Open"} →</span>
            </a>
          )}

          {/* azioni */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {bookable && (
              <button onClick={() => onBook(place)} style={{ width: "100%", background: BRAND.red, color: "#fff", border: "none", borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{t.book}</button>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => onToggleItin(place.id)} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: inItin ? "rgba(56,176,74,0.12)" : "transparent", color: inItin ? BRAND.greenDark : BRAND.ink, border: `1.5px solid ${inItin ? BRAND.green : BRAND.border}`, borderRadius: 14, padding: "13px 14px", fontSize: 14.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ fontSize: 16 }}>{inItin ? "✓" : "＋"}</span>{inItin ? t.inItin : t.addItin}
              </button>

            </div>
          </div>
        </div>
      </div>
    </div>
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
        body: JSON.stringify({ esperienza: title, nome: form.name, email: form.email, persone: form.people, data: form.date, note: form.notes, _subject: `Nuova prenotazione Glocal: ${title}` }),
      });
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
      <div style={{ height: 24, width: 140, background: "#efe9db", borderRadius: 8, marginBottom: 14 }} className="gl-pulse" />
      <div style={{ aspectRatio: "4/3", background: "#efe9db", borderRadius: 22, marginBottom: 14 }} className="gl-pulse" />
      <div style={{ height: 48, background: "#efe9db", borderRadius: 14 }} className="gl-pulse" />
    </div>
  );
}
function Spinner() {
  return <span style={{ width: 13, height: 13, border: `2px solid ${BRAND.border}`, borderTopColor: BRAND.red, borderRadius: "50%", display: "inline-block" }} className="gl-spin" />;
}

/* ----------------------------- SMALL BITS --------------------------------- */
const overlay = { position: "fixed", inset: 0, background: "rgba(26,20,12,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 };
const sheet = { background: BRAND.bg, width: "100%", borderRadius: "22px 22px 0 0", overflowY: "auto", maxHeight: "92vh", boxShadow: "0 -10px 50px rgba(0,0,0,0.25)" };
const inp = { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${BRAND.border}`, background: BRAND.card, fontSize: 15, fontFamily: "inherit", color: BRAND.ink, outline: "none" };
const pillBtn = { background: "transparent", color: BRAND.ink, border: `1.5px solid ${BRAND.ink}`, borderRadius: 14, padding: "12px 20px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const xBtn = { background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#999", lineHeight: 1 };
const sheetLabel = { fontSize: 12.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: BRAND.muted, margin: "0 0 12px" };
const listReset = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 };
const rowCard = { display: "flex", gap: 13, alignItems: "center", background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 11 };
const rowX = { background: "none", border: "none", color: "#bbb", fontSize: 22, cursor: "pointer", flexShrink: 0, lineHeight: 1 };

function Field({ label, children, flex }) {
  return (
    <label style={{ display: "block", marginBottom: 14, flex: flex ? 1 : undefined }}>
      <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, marginBottom: 6, color: "#3a3630" }}>{label}</span>{children}
    </label>
  );
}
function LangToggle({ lang, setLang }) {
  return (
    <div style={{ display: "flex", border: `1.5px solid ${BRAND.border}`, borderRadius: 999, overflow: "hidden" }}>
      {["it", "en"].map((l) => (
        <button key={l} onClick={() => setLang(l)} style={{ padding: "6px 13px", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", background: lang === l ? BRAND.ink : "transparent", color: lang === l ? "#fff" : "#999", textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</button>
      ))}
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
      .leaflet-container { font: inherit; }
      .gl-deck {
        display: flex; overflow-x: auto; scroll-snap-type: x mandatory;
        scrollbar-width: none; -ms-overflow-style: none; cursor: grab;
        -webkit-overflow-scrolling: touch; gap: 0;
      }
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
      @media (hover:hover) {
        .gl-deck-arrow:hover { background: #fff; }
      }
      @media (min-width: 560px) {
        .gl-deck-slide { flex: 0 0 420px; padding-right: 16px; }
      }
      @media (prefers-reduced-motion: reduce) { *, .gl-pulse, .gl-spin { animation: none !important; transition: none !important; } }
    `}</style>
  );
}
