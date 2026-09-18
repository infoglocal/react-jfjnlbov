import React, { useState, useEffect, useRef } from "react";
import Papa from "papaparse";

/* ============================================================================
   GLOCAL — web app (mobile-first)
   ----------------------------------------------------------------------------
   Si apre direttamente sulle sezioni per INTERESSE:
   Cibo · Bere · Natura · Musei, arte e cultura · Shopping.
   In cima, sotto la barra "Interessi", il banner "Benvenuto a Bologna" con le
   Due Torri. Poi il blocco "100% Made in Bo" e, in ogni sezione, in cima,
   il blocco "Bologna doc" (i classici col consiglio da local) — le righe
   con doc = "yes".
   Due tab: Home · Itinerario. Nessuna welcome screen, nessuna profilazione, no mappa.
   Dati dal Google Sheet (CSV) + prenotazioni via Formspree.

   Colonne foglio:
   id | interests | title_it | title_en | desc_it | desc_en | image | images |
   bookable | price | location | address | lat | lng | contact | doc | tip_it | tip_en |
   place_id | orari | bookings_week

   - interests: una o più tra food, drink, nature, museums, shopping (virgola).
                Determina in quale/quali sezioni appare la card.
   - doc:       "yes" -> la card entra nel blocco "Bologna doc" della/e sua/e
                sezione/i (un classico da vedere). Altro/vuoto -> card normale.
   - tip_it/tip_en: (facoltativo) il consiglio da local mostrato sulle card doc.
   - bookable:  "yes" -> pulsante Prenota. Altro/vuoto -> nascosto.
   - images:    URL extra separati da virgola (galleria nel dettaglio).
   - address:   indirizzo cliccabile (apre Google Maps).
   - place_id:  Google Place ID, usato dallo script Apps Script per popolare "orari".
   - orari:     orari settimanali sincronizzati da Google (una riga per giorno,
                separate da \n, es. "lunedì: 18:00–01:00"). Facoltativo: se
                vuoto, il blocco orari non viene mostrato.
   - bookings_week: (facoltativo, solo per righe con bookable = yes) numero
                inserito A MANO nel foglio da Giulio. Alimenta il banner
                "X persone hanno prenotato X questa settimana": vuoto o 0 =
                quel posto non entra in rotazione nel banner.
   ============================================================================ */

const BRAND = {
  green: "#38b04a", greenDark: "#2a8f39",
  red: "#e5383b",
  bg: "#FBF8F0", card: "#ffffff",
  border: "#e6e0d0", ink: "#1a1a1a", muted: "#7a7568",
};

// Le SEZIONI dell'app = interessi. L'ordine qui è l'ordine in Home.
const SECTIONS = [
  { id: "food",     it: "Cibo",                  en: "Food",             icon: "/icons/food.png" },
  { id: "drink",    it: "Bere",                  en: "Drinks",           icon: "/icons/drink.png" },
  { id: "nature",   it: "Natura",                en: "Nature",           icon: "/icons/nature.png" },
  { id: "museums",  it: "Musei, arte e cultura", en: "Museums & culture",icon: "/icons/museums.png" },
  { id: "shopping", it: "Shopping",              en: "Shopping",         icon: "/icons/shopping.png" },
];

// -------- CONTENUTI dal Google Sheet pubblicato come CSV --------------------
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTDteVaj56DqRzerlc3EP5YqmpeQYOydBBadXfBE0CozUnO3lcTRN6zrWSghznYtBd5aWYp8D2ALcbL/pub?gid=1251495453&single=true&output=csv";

const SPOTIFY_PLAYLIST_ID = "0PtXUavyTbZMVzvGrgHLKt";
const SPOTIFY_EMBED_URL = `https://open.spotify.com/embed/playlist/${SPOTIFY_PLAYLIST_ID}?utm_source=generator&theme=0`;
const SPOTIFY_LINK_URL = `https://open.spotify.com/playlist/${SPOTIFY_PLAYLIST_ID}?si=d13dfa5fe7ab4985`;

// -------- BADGE ROTANTE — Nettuno / tortellino / Due Torri, si alternano con un "flip" --
const ROTATOR_ITEMS = [
  { src: "/icons/badge-nettuno.png", alt: "Il Nettuno" },
  { src: "/icons/badge-tortellino.png", alt: "Un tortellino" },
  { src: "/icons/badge-duetorri.png", alt: "Le Due Torri" },
];

// -------- BANNER "BENVENUTO A BOLOGNA" — in cima alla Home, sotto la barra
// interessi. Usa la stessa immagine (ritagliata, sfondo trasparente) delle
// Due Torri; sostituisci il file in /icons/due-torri-welcome.png con quello
// fornito (già ritagliato: /mnt/user-data/outputs/due-torri-welcome.png).
const WELCOME_IMG = "/icons/due-torri-welcome.png";

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
    pickTitle: "Cosa ti interessa fare a Bologna?",
    pickSub: "Scegli uno o più temi. Ti mostriamo i posti migliori scelti per te, come fossimo il tuo amico del posto.",
    pickCta: "Vedi i risultati", pickHint: "Scegline almeno uno",
    editInterests: "Interessi",
    welcomeTitle: "Benvenuto a Bologna",
    welcomeSub: "Le esperienze scelte per te, come un amico del posto",
    docTitle: "Bologna doc", docSub: "I classici, col consiglio di un local",
    madeTitle: "100% Made in Bo", madeSub: "Esperienze autentiche, nate qui",
    pickOrGuide: "Oppure", guideCta: "Scarica la guida gratis",
    guideTitle: "La guida definitiva", guideSub: "Tre giorni a Bologna, già organizzati.",
    guideBack: "Torna alle card",
    guideGateTitle: "Sblocca la guida", guideGateSub: "Lasciaci la tua email, è gratis.",
    guideUnlock: "Sblocca",
    guideConsent: "Accetto di ricevere la guida via email, secondo la",
    installTitle: "Porta Glocal sul telefono!",
    installSub: "Come un'app vera, in 10 secondi ✨",
    installIosStep1: "Tocca qui sotto", installIosStep1Detail: "l'icona Condividi",
    installIosStep2: "Poi tocca", installIosStep2Detail: "\"Aggiungi alla schermata Home\"",
    installAndroidStep1: "Tocca i tre puntini", installAndroidStep1Detail: "in alto nel browser",
    installAndroidStep2: "Poi tocca", installAndroidStep2Detail: "\"Aggiungi alla schermata Home\"",
    installCta: "Installa ora, un tap!", installGotIt: "Fatto, ho capito", installLater: "Più tardi",
    soundtrackTitle: "La colonna sonora di Bologna",
    soundtrackSub: "La playlist scelta da chi ci vive, per il tuo viaggio",
    soundtrackOpen: "Apri in Spotify",
    betaBar: "🚧 Versione in anteprima",
    qfTitle: "Come ti stai trovando?", qfSub: "Bastano 10 secondi (facoltativo)",
    qfRatingLabel: "Come valuti l'esperienza finora?",
    qfImproveLabel: "Cosa miglioreresti?", qfImprovePlaceholder: "Scrivi qui (facoltativo)…",
    qfExtraLabel: "C'è qualcosa che ti aspettavi di trovare e non hai trovato?", qfExtraPlaceholder: "Scrivi qui (facoltativo)…",
    qfSkip: "Salta", qfSend: "Invia", qfSending: "Invio…",
    qfThanks: "Grazie mille!",
    cookieText: "Usiamo cookie tecnici e di statistica per capire come viene usata l'app e migliorarla.",
    cookieOk: "Ho capito", cookiePolicy: "Privacy",
    localTip: "Il consiglio del local", localTipsBtn: "Local tips",
    emptySection: "Presto nuovi contenuti in questa sezione.",
    book: "Prenota gratuitamente", addItinShort: "Itinerario", inItinShort: "Aggiunto",
    addItin: "Aggiungi all'itinerario", inItin: "Nell'itinerario",
    of: "di",
    tabHome: "Home", tabItin: "Itinerario",
    itinTitle: "Il tuo itinerario",
    itinReminderOne: "posto nel tuo itinerario", itinReminderMany: "posti nel tuo itinerario",
    itinReminderCta: "Vedi il percorso",
    itinEmpty: "Aggiungi luoghi ed esperienze dalla Home per costruire il tuo itinerario.",
    remove: "Rimuovi", clearAll: "Svuota", goHome: "Vai alla Home",
    openInMaps: "Apri in Google Maps", shareWa: "Condividi su WhatsApp",
    booking: "Prenota", name: "Nome e cognome", email: "Email",
    people: "Persone", date: "Data",
    bookingSubtitle: "Prenota in pochi click. Nessun pagamento, nessun impegno. Riceverai una conferma quando la tua prenotazione sarà effettiva.",
    send: "Invia richiesta", sending: "Invio…",
    thanks: "Richiesta inviata", thanksSub: "Non è ancora una conferma: il local ti risponde via email entro 24 ore.",
    whatsapp: "Scrivi su WhatsApp", close: "Chiudi", required: "Compila i campi obbligatori.",
    openNow: "Aperto ora", closedNow: "Chiuso ora", closesAt: "chiude alle", opensAt: "apre alle",
    hoursTitle: "Orari", hoursSynced: "Orari sincronizzati da Google", open24h: "Aperto 24 ore su 24",
    abandonedTitle: "Ancora indecis*? 👀",
    abandonedBody: "Non hai ancora prenotato nessuna esperienza. Dare un'occhiata è gratis e senza impegno.",
    abandonedCta: "Scopri le esperienze",
    abandonedClose: "Continua a guardare",
    socialProofWeek: "persone hanno prenotato questa settimana",
  },
  en: {
    loading: "Loading…",
    pickTitle: "What would you like to do in Bologna?",
    pickSub: "Pick one or more themes. We’ll show you the best places, hand-picked just for you, as if we were your local friend.",
    pickCta: "See results", pickHint: "Pick at least one",
    editInterests: "Interests",
    welcomeTitle: "Welcome to Bologna",
    welcomeSub: "Experiences picked for you, like a local friend would",
    docTitle: "Bologna doc", docSub: "The classics, with a local's tip",
    pickOrGuide: "Or", guideCta: "Get the free guide",
    guideTitle: "The definitive guide", guideSub: "Three days in Bologna, already planned.",
    guideBack: "Back to cards",
    guideGateTitle: "Unlock the guide", guideGateSub: "Leave your email, it's free.",
    guideUnlock: "Unlock",
    guideConsent: "I agree to receive the guide by email, per the",
    installTitle: "Get Glocal on your phone!",
    installSub: "Just like a real app, in 10 seconds ✨",
    installIosStep1: "Tap here below", installIosStep1Detail: "the Share icon",
    installIosStep2: "Then tap", installIosStep2Detail: "\"Add to Home Screen\"",
    installAndroidStep1: "Tap the three dots", installAndroidStep1Detail: "at the top of the browser",
    installAndroidStep2: "Then tap", installAndroidStep2Detail: "\"Add to Home Screen\"",
    installCta: "Install now, one tap!", installGotIt: "Done, got it", installLater: "Later",
    madeTitle: "100% Made in Bo", madeSub: "Authentic experiences, born here",
    soundtrackTitle: "Bologna's soundtrack",
    soundtrackSub: "The playlist picked by locals, for your trip",
    soundtrackOpen: "Open in Spotify",
    betaBar: "🚧 Preview version",
    qfTitle: "How's it going?", qfSub: "Takes 10 seconds (optional)",
    qfRatingLabel: "How do you rate the experience so far?",
    qfImproveLabel: "What would you improve?", qfImprovePlaceholder: "Write here (optional)…",
    qfExtraLabel: "Is there anything you expected to find but didn't?", qfExtraPlaceholder: "Write here (optional)…",
    qfSkip: "Skip", qfSend: "Send", qfSending: "Sending…",
    qfThanks: "Thanks so much!",
    cookieText: "We use technical and analytics cookies to understand how the app is used and improve it.",
    cookieOk: "Got it", cookiePolicy: "Privacy",
    localTip: "The local's tip", localTipsBtn: "Local tips",
    emptySection: "New content coming soon in this section.",
    book: "Book for free", addItinShort: "Itinerary", inItinShort: "Added",
    addItin: "Add to itinerary", inItin: "In itinerary",
    of: "of",
    tabHome: "Home", tabItin: "Itinerary",
    itinTitle: "Your itinerary",
    itinReminderOne: "place in your itinerary", itinReminderMany: "places in your itinerary",
    itinReminderCta: "View route",
    itinEmpty: "Add places and experiences from Home to build your itinerary.",
    remove: "Remove", clearAll: "Clear", goHome: "Go to Home",
    openInMaps: "Open in Google Maps", shareWa: "Share on WhatsApp",
    booking: "Book", name: "Full name", email: "Email",
    people: "People", date: "Date",
    bookingSubtitle: "Book in a few clicks. No payment, no commitment. You'll get a confirmation once your booking is finalized.",
    send: "Send request", sending: "Sending…",
    thanks: "Request sent", thanksSub: "Not a confirmation yet: the local will email you within 24 hours.",
    whatsapp: "Message on WhatsApp", close: "Close", required: "Please fill in the required fields.",
    openNow: "Open now", closedNow: "Closed now", closesAt: "closes at", opensAt: "opens at",
    hoursTitle: "Hours", hoursSynced: "Hours synced from Google", open24h: "Open 24 hours",
    abandonedTitle: "Still deciding? 👀",
    abandonedBody: "You haven't booked an experience yet. Taking a look is free, no commitment.",
    abandonedCta: "See experiences",
    abandonedClose: "Keep browsing",
    socialProofWeek: "people booked this week",
  },
};

/* --------------------------- PERSISTENZA ---------------------------------- */
const store = window.localStorage;
const load = (k, fb) => { try { const v = store.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
const save = (k, v) => { try { store.setItem(k, JSON.stringify(v)); } catch {} };

const hasInterest = (p, id) => String(p.interests || "").split(",").map((s) => s.trim()).includes(id);
const isDoc = (p) => String(p.doc || "").trim().toLowerCase() === "yes";
const isMadeInBo = (p) => String(p.madeinbo || "").trim().toLowerCase() === "yes";

/* --------------------------- ORARI (Google sync) --------------------------- */
const IT_DAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

function parseOrariRows(orari) {
  if (!orari) return [];
  return String(orari).split("\n").map((r) => r.trim()).filter(Boolean);
}

function parseTimeRange(line) {
  const m = line.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const toMin = (h, mm) => Number(h) * 60 + Number(mm);
  let start = toMin(m[1], m[2]);
  let end = toMin(m[3], m[4]);
  if (end <= start) end += 24 * 60; // fascia che attraversa la mezzanotte
  return { start, end };
}

function minToLabel(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Calcola aperto/chiuso ora leggendo la riga del giorno (e, se serve, quella
// di ieri per le fasce che sconfinano dopo mezzanotte). Best-effort: se il
// formato non combacia, torna null e si mostra solo l'elenco settimanale.
function getOpenStatus(orari) {
  const rows = parseOrariRows(orari);
  if (rows.length === 0) return null;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayName = IT_DAYS[now.getDay()];
  const yesterdayName = IT_DAYS[(now.getDay() + 6) % 7];

  const todayLine = rows.find((r) => r.toLowerCase().startsWith(todayName));
  const yesterdayLine = rows.find((r) => r.toLowerCase().startsWith(yesterdayName));

  // Caso "aperto 24 ore su 24": nessun range da calcolare, è sempre aperto.
  if (todayLine && todayLine.toLowerCase().includes("24 ore")) {
    return { open: true, allDay: true };
  }

  if (yesterdayLine) {
    const yRange = parseTimeRange(yesterdayLine);
    if (yRange && yRange.end > 24 * 60 && nowMin < yRange.end - 24 * 60) {
      return { open: true, closesAt: minToLabel(yRange.end - 24 * 60) };
    }
  }

  if (!todayLine) return null;
  const range = parseTimeRange(todayLine);
  if (!range) return { open: false }; // es. "chiuso"

  if (nowMin >= range.start && nowMin < range.end) return { open: true, closesAt: minToLabel(range.end % (24 * 60)) };
  if (nowMin < range.start) return { open: false, opensAt: minToLabel(range.start) };
  return { open: false };
}

/* --------------------------- LOGO ----------------------------------------- */
function Logo({ height = 26 }) {
  return <img src="/glocal-logo.png" alt="Glocal" style={{ height, width: "auto", display: "block" }} />;
}

/* --------------------------- BADGE ROTANTE --------------------------------- */
// Vaga per tutta la schermata di selezione interessi (posizione fixed, percorso
// ampio in loop) mentre cicla Nettuno / tortellino / Due Torri: ogni ~2.6s
// l'immagine cambia soggetto con una dissolvenza automatica (nessun effetto di
// rotazione/flip). Nessun badge/cerchio intorno: solo l'immagine già scontornata,
// con una leggera ombra per dare senso di "volo".
function RotatingBadge({ height = 108 }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const period = 2600; // deve combaciare con la durata dell'animazione glFlip
    const loop = setInterval(() => setIdx((i) => (i + 1) % ROTATOR_ITEMS.length), period);
    return () => clearInterval(loop);
  }, []);
  const item = ROTATOR_ITEMS[idx];
  return (
    <div className="gl-rotator-wrap" style={{ height }} aria-hidden="true">
      <div className="gl-rotator-float" style={{ height: "100%" }}>
        <img key={idx} src={item.src} alt="" className="gl-rotator-img" style={{ height: "100%", width: "auto", display: "block", filter: "drop-shadow(0 10px 16px rgba(20,16,10,0.28))" }} />
      </div>
    </div>
  );
}

/* --------------------------- BANNER BENVENUTO ------------------------------ */
// Card fissa in cima alla Home (dopo la scelta interessi), sopra "100% Made in
// Bo": Due Torri + titolo "Benvenuto a Bologna" (IT/EN) + sottotitolo. Serve a
// 1) rendere inequivocabile dove ci troviamo, 2) dare un punto d'appoggio
// visivo prima del carosello di card, invece di aprire subito su un'esperienza.
function WelcomeBanner({ t }) {
  return (
    <section
      style={{
        marginTop: 22,
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <img
        src={WELCOME_IMG}
        alt=""
        aria-hidden="true"
        style={{ height: 78, width: "auto", flexShrink: 0, display: "block" }}
      />
      <div style={{ minWidth: 0 }}>
        <h1
          style={{
            fontFamily: "'Fraunces', serif",
            fontWeight: 600,
            fontSize: "clamp(28px, 7.5vw, 36px)",
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          {t.welcomeTitle}
        </h1>
        {t.welcomeSub && (
          <p style={{ fontSize: 13.5, color: BRAND.muted, margin: "5px 0 0", lineHeight: 1.4 }}>{t.welcomeSub}</p>
        )}
      </div>
    </section>
  );
}

/* --------------------------- ABANDONED CART -------------------------------- */
const INACTIVITY_MS = 45000;
const AWAY_MS = 20000;

function shouldShowAbandonedToday() {
  return load("gl_abandoned_seen_date", null) !== new Date().toDateString();
}
function markAbandonedSeenToday() { save("gl_abandoned_seen_date", new Date().toDateString()); }

// Trigger semplice: inattività 45s, oppure mouse che scappa verso l'alto
// (exit-intent desktop), oppure torna sulla tab dopo essere stato via 20s+
// (su mobile corrisponde a mettere l'app in background e tornare). Al
// massimo una volta al giorno, e solo se l'utente non ha ancora prenotato.
function useAbandonedCartTrigger({ enabled, onTrigger }) {
  const firedRef = useRef(false);
  const hiddenAtRef = useRef(null);

  useEffect(() => {
    if (!enabled || firedRef.current || !shouldShowAbandonedToday()) return;
    let idleTimer = null;
    const fire = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      markAbandonedSeenToday();
      onTrigger();
    };
    const resetIdle = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = setTimeout(fire, INACTIVITY_MS); };
    const onMouseLeave = (e) => { if (e.clientY <= 0) fire(); };
    const onVisibility = () => {
      if (document.hidden) hiddenAtRef.current = Date.now();
      else if (hiddenAtRef.current && Date.now() - hiddenAtRef.current > AWAY_MS) fire();
    };

    resetIdle();
    const events = ["scroll", "touchstart", "click", "keydown"];
    events.forEach((ev) => window.addEventListener(ev, resetIdle, { passive: true }));
    window.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      events.forEach((ev) => window.removeEventListener(ev, resetIdle));
      window.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, onTrigger]);
}

function AbandonedCartModal({ t, onClose, onCta }) {
  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...sheet, maxWidth: 440, padding: 26, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>👀</div>
        <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 24, margin: "0 0 10px" }}>{t.abandonedTitle}</h3>
        <p style={{ fontSize: 15.5, lineHeight: 1.55, color: "#4a463d", margin: "0 0 22px" }}>{t.abandonedBody}</p>
        <button onClick={onCta} style={{ width: "100%", background: BRAND.green, color: "#fff", border: "none", borderRadius: 14, padding: 15, fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>{t.abandonedCta}</button>
        <button onClick={onClose} style={{ width: "100%", background: "transparent", color: BRAND.muted, border: "none", padding: 8, fontSize: 14.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{t.abandonedClose}</button>
      </div>
    </div>
  );
}

/* --------------------------- SOCIAL PROOF TOAST ---------------------------- */
// Legge la colonna "bookings_week" del foglio: Giulio la compila a mano sulle
// righe bookable = yes. Il banner ruota solo tra le righe con un numero > 0;
// vuoto/0 = quel posto non entra in rotazione.
const SOCIAL_PROOF_SHOW_MS = 6000;
const SOCIAL_PROOF_GAP_MS = 14000;

function SocialProofToast({ places, lang, t, onOpen }) {
  const candidates = places.filter(
    (p) => String(p.bookable).trim().toLowerCase() === "yes" && Number(p.bookings_week) > 0
  );
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(() => load("gl_social_proof_dismissed", false));

  useEffect(() => {
    if (dismissed || candidates.length === 0) return;
    let showTimer, hideTimer;
    const cycle = () => {
      setVisible(true);
      showTimer = setTimeout(() => {
        setVisible(false);
        hideTimer = setTimeout(() => { setI((n) => (n + 1) % candidates.length); cycle(); }, SOCIAL_PROOF_GAP_MS);
      }, SOCIAL_PROOF_SHOW_MS);
    };
    const start = setTimeout(cycle, 3000);
    return () => { clearTimeout(start); clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, [dismissed, candidates.length]);

  if (dismissed || candidates.length === 0 || !visible) return null;
  const p = candidates[i % candidates.length];
  const name = p[`title_${lang}`];

  return (
    <div
      onClick={() => { track("open_social_proof", { card: p.title_it || p.id }); onOpen?.(p); }}
      style={{ position: "fixed", left: 14, right: 14, bottom: 138, zIndex: 46, maxWidth: 340, marginInline: "auto", display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: 16, padding: "11px 13px", boxShadow: "0 8px 26px rgba(0,0,0,0.18)", animation: "glFadeUp .35s ease", cursor: "pointer" }}>
      {p.image && <img src={p.image} alt="" style={{ width: 38, height: 38, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.3 }}>🔥 {Number(p.bookings_week)} {t.socialProofWeek}</div>
        <div translate="no" className="notranslate" style={{ fontSize: 12, color: BRAND.muted, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); setDismissed(true); save("gl_social_proof_dismissed", true); }} aria-label={t.close} style={{ background: "none", border: "none", color: "#bbb", fontSize: 16, cursor: "pointer", flexShrink: 0, lineHeight: 1 }}>×</button>
    </div>
  );
}

/* ------------------------------- APP -------------------------------------- */
export default function App() {
  const [lang, setLang] = useState(() => load("gl_lang", "it"));
  const [tab, setTab] = useState("home");
  const [chosen, setChosen] = useState([]);          // interessi scelti (rivisti ogni apertura)
  const [picking, setPicking] = useState(true);      // true = schermata scelta interessi
  const [booking, setBooking] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tipPlace, setTipPlace] = useState(null);
  const [itinerary, setItinerary] = useState(() => load("gl_itin", []));
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showQuickFeedback, setShowQuickFeedback] = useState(false);
  const [cookieOk, setCookieOk] = useState(() => load("gl_cookie_ok", false));
  const [hasBooked, setHasBooked] = useState(() => load("gl_has_booked", false));
  const [showGuide, setShowGuide] = useState(false);
  const [installEvent, setInstallEvent] = useState(null);
  const [showInstallHint, setShowInstallHint] = useState(false);

  useEffect(() => {
    const onBip = (e) => { e.preventDefault(); setInstallEvent(e); };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    if (isStandalone || load("gl_install_hint_seen", false)) return;
    const timer = setTimeout(() => setShowInstallHint(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  const dismissInstallHint = () => { save("gl_install_hint_seen", true); setShowInstallHint(false); };
  const [showAbandoned, setShowAbandoned] = useState(false);
  const t = T[lang];

  useEffect(() => save("gl_lang", lang), [lang]);
  useEffect(() => save("gl_itin", itinerary), [itinerary]);

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

  // Popup "carrello abbandonato": al massimo una volta al giorno, solo se
  // l'utente non ha ancora prenotato e non c'è già un altro pannello aperto.
  useAbandonedCartTrigger({
    enabled: !picking && !hasBooked && !detail && !booking && !showQuickFeedback && !showAbandoned,
    onTrigger: () => setShowAbandoned(true),
  });

  // Popup "quick feedback": compare da solo dopo un po' di utilizzo, al
  // massimo una volta al giorno, mai più una volta che è già stato
  // inviato/saltato una volta in quella giornata, e mai in sovrapposizione
  // con un altro pannello aperto.
  useEffect(() => {
    if (picking || showQuickFeedback) return;
    if (load("gl_qf_seen_date", null) === new Date().toDateString()) return;
    const timer = setTimeout(() => {
      if (!detail && !booking && !showAbandoned) setShowQuickFeedback(true);
    }, 30000);
    return () => clearTimeout(timer);
  }, [picking]);
  const markQuickFeedbackSeen = () => save("gl_qf_seen_date", new Date().toDateString());

  const toggleIn = (list, setList, id) => setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const byId = (id) => places.find((p) => p.id === id);
  const toggleChosen = (id) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const markBooked = () => { save("gl_has_booked", true); setHasBooked(true); };

  // schermata iniziale: scelta interessi (obbligatoria, rivista a ogni apertura)
  if (showGuide) {
    return (
      <div style={{ minHeight: "100vh", background: BRAND.bg, color: BRAND.ink, fontFamily: "'Archivo', system-ui, sans-serif" }}>
        <FontLink />
        <GuideTab t={t} lang={lang} places={places} onBook={setBooking} onClose={() => setShowGuide(false)} />
        {booking && <BookingModal place={booking} lang={lang} t={t} onClose={() => setBooking(null)} onBooked={markBooked} />}
      </div>
    );
  }

  if (picking) {
    return (
      <div style={{ minHeight: "100vh", background: BRAND.bg, color: BRAND.ink, fontFamily: "'Archivo', system-ui, sans-serif" }}>
        <FontLink />
        <header style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${BRAND.border}` }}>
          <span />
          <div style={{ justifySelf: "center" }}><Logo /></div>
          <div style={{ justifySelf: "end" }}><LangToggle lang={lang} setLang={setLang} /></div>
        </header>
        <InterestPicker t={t} lang={lang} chosen={chosen} onToggle={toggleChosen} onDone={() => { track("select_interests", { interests: chosen.join(",") }); setTab("home"); setPicking(false); }} onOpenGuide={() => setShowGuide(true)} />
        <RotatingBadge />
        {showInstallHint && <InstallHint t={t} lang={lang} installEvent={installEvent} onClose={dismissInstallHint} />}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: BRAND.bg, color: BRAND.ink, fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <FontLink />
      <header style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "14px 18px", position: "sticky", top: 0, background: "rgba(251,248,240,0.92)", backdropFilter: "blur(10px)", zIndex: 30, borderBottom: `1px solid ${BRAND.border}` }}>
        <span style={{ justifySelf: "start" }}>{loading && <Spinner />}</span>
        <div style={{ justifySelf: "center" }}>
          <button onClick={() => { track("open_interest_picker_from_logo"); setPicking(true); }} aria-label={t.editInterests} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "block" }}>
            <Logo />
          </button>
        </div>
        <div style={{ justifySelf: "end" }}><LangToggle lang={lang} setLang={setLang} /></div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "0 0 96px" }}>
        {tab === "home" && (
          <HomeTab t={t} lang={lang} loading={loading} places={places} chosen={chosen}
            onEditInterests={() => setPicking(true)}
            onBook={setBooking} onDetail={setDetail} onTip={setTipPlace}
            itinerary={itinerary} onToggleItin={(id) => toggleIn(itinerary, setItinerary, id)}
            onOpenItin={() => setTab("itin")} />
        )}
        {tab === "itin" && (
          <ItineraryTab t={t} lang={lang} items={itinerary.map(byId).filter(Boolean)}
            onRemove={(id) => toggleIn(itinerary, setItinerary, id)} onClear={() => setItinerary([])} onGoHome={() => setTab("home")}
            onOpenDetail={setDetail} />
        )}
      </main>

      {/* banner "X persone hanno prenotato X questa settimana", in rotazione */}
      {tab === "home" && !detail && !booking && !showQuickFeedback && (
        <SocialProofToast places={places} lang={lang} t={t} onOpen={setDetail} />
      )}

      <TabBar t={t} tab={tab} setTab={setTab} itinCount={itinerary.length} />

      {detail && <DetailModal place={detail} lang={lang} t={t} onClose={() => setDetail(null)} onBook={(p) => { setDetail(null); setBooking(p); }} onTip={(p) => setTipPlace(p)} onToggleItin={(id) => toggleIn(itinerary, setItinerary, id)} inItin={detail ? itinerary.includes(detail.id) : false} />}
      {booking && <BookingModal place={booking} lang={lang} t={t} onClose={() => setBooking(null)} onBooked={markBooked} />}
      {tipPlace && <LocalTipSheet place={tipPlace} tip={tipPlace[`tip_${lang}`]} lang={lang} t={t} onClose={() => setTipPlace(null)} />}
      {showQuickFeedback && (
        <QuickFeedbackModal t={t} lang={lang}
          onClose={() => setShowQuickFeedback(false)}
          onSubmitted={markQuickFeedbackSeen} />
      )}
      {showAbandoned && (
        <AbandonedCartModal t={t} onClose={() => setShowAbandoned(false)}
          onCta={() => { setShowAbandoned(false); setTab("home"); }} />
      )}
      {!cookieOk && <CookieBanner t={t} onOk={() => { setCookieOk(true); save("gl_cookie_ok", true); }} />}
    </div>
  );
}

/* --------------------------- INSTALL HINT ---------------------------------- */
function InstallHint({ t, lang, installEvent, onClose }) {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

  const install = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    onClose();
  };

  const steps = isIOS
    ? [
        { icon: "📤", label: t.installIosStep1, detail: t.installIosStep1Detail },
        { icon: "➕", label: t.installIosStep2, detail: t.installIosStep2Detail },
      ]
    : [
        { icon: "⋮", label: t.installAndroidStep1, detail: t.installAndroidStep1Detail },
        { icon: "➕", label: t.installAndroidStep2, detail: t.installAndroidStep2Detail },
      ];

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...sheet, maxWidth: 440, padding: 26, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>📲</div>
        <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 23, margin: "0 0 4px" }}>{t.installTitle}</h3>
        <p style={{ fontSize: 14.5, color: BRAND.muted, margin: "0 0 22px" }}>{t.installSub}</p>

        {!installEvent && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 22 }}>
            {steps.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, background: "rgba(56,176,74,0.08)", border: `1.5px solid ${BRAND.border}`, borderRadius: 16, padding: "12px 16px", textAlign: "left" }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: BRAND.green, color: "#fff", fontSize: 15, fontWeight: 800, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
                <div style={{ fontSize: 26, flexShrink: 0 }}>{s.icon}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{s.label}</div>
                  <div style={{ fontSize: 13, color: BRAND.muted }}>{s.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {installEvent ? (
          <button onClick={install} style={{ width: "100%", background: BRAND.green, color: "#fff", border: "none", borderRadius: 14, padding: 14, fontSize: 15.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>
            {t.installCta}
          </button>
        ) : null}
        <button onClick={onClose} style={{ width: "100%", background: "transparent", color: BRAND.muted, border: "none", padding: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          {installEvent ? t.installLater : t.installGotIt}
        </button>
      </div>
    </div>
  );
}

/* --------------------------- INTEREST PICKER ------------------------------ */
function InterestPicker({ t, lang, chosen, onToggle, onDone, onOpenGuide }) {
  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "0 22px", minHeight: "calc(100vh - 60px)", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", paddingTop: 44, paddingBottom: 28 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(30px, 7vw, 42px)", letterSpacing: "-0.02em", margin: "0 0 10px", lineHeight: 1.08 }}>{t.pickTitle}</h1>
        <p style={{ color: BRAND.muted, margin: "0 0 30px", fontSize: 16, lineHeight: 1.5 }}>{t.pickSub}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, alignContent: "start" }}>
          {SECTIONS.map((o, i) => {
            const active = chosen.includes(o.id);
            return (
              <button key={o.id} onClick={() => onToggle(o.id)} className="gl-pick-card" style={{ animationDelay: `${i * 60}ms`, position: "relative", display: "flex", alignItems: "center", gap: 11, padding: "18px 18px", borderRadius: 16, cursor: "pointer", background: active ? BRAND.green : BRAND.card, color: active ? "#fff" : BRAND.ink, border: `1.5px solid ${active ? BRAND.green : BRAND.border}`, fontSize: 15.5, fontWeight: 500, fontFamily: "inherit", textAlign: "left", boxShadow: active ? "0 10px 24px rgba(196,120,60,0.28)" : "none", transition: "background .15s, box-shadow .15s" }}>
                <span style={{ width: 26, height: 26, flexShrink: 0, display: "inline-flex" }}><img src={o.icon} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /></span><span>{o[lang]}</span>
                {active && <span className="gl-check-pop" style={{ position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: "50%", background: "#fff", color: BRAND.green, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, boxShadow: "0 2px 6px rgba(0,0,0,0.18)" }}>✓</span>}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0 0" }}>
          <div style={{ flex: 1, height: 1, background: BRAND.border }} />
          <span style={{ fontSize: 12.5, color: BRAND.muted, fontWeight: 600 }}>{t.pickOrGuide}</span>
          <div style={{ flex: 1, height: 1, background: BRAND.border }} />
        </div>
        <button onClick={onOpenGuide} style={{ width: "100%", background: "transparent", color: BRAND.ink, border: `1.5px solid ${BRAND.border}`, borderRadius: 16, padding: 15, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: 14 }}>
          {t.guideCta}
        </button>
      </div>

      <div style={{ position: "sticky", bottom: 0, background: BRAND.bg, paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0))", paddingTop: 12 }}>
        <button onClick={onDone} disabled={chosen.length === 0} style={{ width: "100%", background: chosen.length ? BRAND.green : "#d9d3c4", color: "#fff", border: "none", borderRadius: 16, padding: 17, fontSize: 17, fontWeight: 700, cursor: chosen.length ? "pointer" : "default", fontFamily: "inherit", transition: "background .15s" }}>
          {chosen.length ? t.pickCta : t.pickHint}
        </button>
      </div>
    </main>
  );
}

/* --------------------------- GUIDA 3 GIORNI -------------------------------- */
const GUIDE_DAYS = [1, 2, 3];

function GuideTab({ t, lang, places, onBook, onClose }) {
  const [day, setDay] = useState(1);
  const [openId, setOpenId] = useState(null);
  const [unlocked, setUnlocked] = useState(() => load("gl_guide_unlocked", false));
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(false);

  const byGuideDay = (n) =>
    places
      .filter((p) => String(p.guida_giorno) === String(n))
      .sort((a, b) => Number(a.guida_ordine || 0) - Number(b.guida_ordine || 0));

  const stops = byGuideDay(day);

  const submitEmail = async (e) => {
    e.preventDefault();
    if (!email.includes("@") || !consent) { setErr(true); return; }
    setErr(false); setSending(true);
    try {
      const res = await fetch("/.netlify/functions/subscribe-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, lang }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("subscribe-guide failed", res.status, body);
        setErr(true);
        return;
      }
      save("gl_guide_unlocked", true);
      setUnlocked(true);
      track("unlock_guide", { email_domain: email.split("@")[1] || "" });
    } catch (err) {
      console.error("subscribe-guide network error", err);
      setErr(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "18px 18px 60px" }}>
      <button onClick={onClose} style={{ background: "none", border: "none", color: BRAND.muted, fontSize: 13.5, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 18 }}>
        &larr; {t.guideBack}
      </button>

      <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(30px, 7vw, 42px)", letterSpacing: "-0.02em", margin: "0 0 6px", lineHeight: 1.05 }}>
        {t.guideTitle}
      </h1>
      <p style={{ color: BRAND.muted, margin: "0 0 24px", fontSize: 15 }}>{t.guideSub}</p>

      <div style={{ display: "flex", gap: 20, borderBottom: `1px solid ${BRAND.border}`, marginBottom: 4 }}>
        {GUIDE_DAYS.map((n) => (
          <button key={n} onClick={() => { setDay(n); setOpenId(null); }} style={{ background: "none", border: "none", padding: "10px 0", fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer", borderBottom: `3px solid ${day === n ? BRAND.green : "transparent"}`, color: day === n ? BRAND.ink : BRAND.muted }}>
            {lang === "en" ? `Day 0${n}` : `Giorno 0${n}`}
          </button>
        ))}
      </div>

      <div style={{ position: "relative" }}>
        <div style={{ filter: unlocked ? "none" : "blur(7px)", pointerEvents: unlocked ? "auto" : "none", userSelect: unlocked ? "auto" : "none" }}>
          {stops.map((stop) => {
            const name = lang === "en" ? stop.title_en || stop.title_it : stop.title_it;
            const note = lang === "en" ? stop.guida_nota_en || stop.guida_nota_it : stop.guida_nota_it;
            const desc = lang === "en" ? stop.desc_en || stop.desc_it : stop.desc_it;
            const address = String(stop.address || "").trim();
            const mapsUrl = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
            const open = openId === stop.id;
            return (
              <div key={stop.id} style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                <button onClick={() => setOpenId(open ? null : stop.id)} style={{ width: "100%", display: "flex", gap: 14, padding: "18px 0", background: "none", border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
                  {stop.guida_ora && (
                    <div style={{ width: 46, flexShrink: 0, fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 15, color: BRAND.green, paddingTop: 2 }}>
                      {stop.guida_ora}
                    </div>
                  )}
                  <div style={{ width: 64, height: 64, flexShrink: 0, borderRadius: 12, background: `${BRAND.border}`, backgroundImage: stop.image ? `url(${stop.image})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 17, color: BRAND.ink }}>{name}</div>
                      <span style={{ flexShrink: 0, color: BRAND.muted, fontSize: 13, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", paddingTop: 3 }}>&#9662;</span>
                    </div>
                    {note && <p style={{ margin: "4px 0 0", fontSize: 13, color: BRAND.muted, lineHeight: 1.4 }}>{note}</p>}
                  </div>
                </button>

                {open && (
                  <div style={{ padding: "0 0 20px 60px" }}>
                    {desc && <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.55, color: "#4a463d" }}>{desc}</p>}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {mapsUrl && (
                        <a href={mapsUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: BRAND.ink, border: `1.5px solid ${BRAND.border}`, borderRadius: 999, padding: "8px 14px", textDecoration: "none" }}>
                          📍 {t.openInMaps}
                        </a>
                      )}
                      {String(stop.bookable).toLowerCase() === "yes" && (
                        <button onClick={() => onBook(stop)} style={{ background: BRAND.green, color: "#fff", border: "none", borderRadius: 999, padding: "8px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          {t.book}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!unlocked && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <form onSubmit={submitEmail} style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 18, padding: 24, maxWidth: 340, width: "100%", boxShadow: "0 12px 30px rgba(40,30,15,0.18)", textAlign: "center" }}>
              <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 20, marginBottom: 6 }}>{t.guideGateTitle}</div>
              <p style={{ fontSize: 13, color: BRAND.muted, margin: "0 0 16px" }}>{t.guideGateSub}</p>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.email}
                style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${err ? BRAND.red : BRAND.border}`, fontSize: 14.5, fontFamily: "inherit", marginBottom: 10 }} />
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, textAlign: "left", fontSize: 12, color: BRAND.muted, lineHeight: 1.4, marginBottom: 12, cursor: "pointer" }}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
                <span>
                  {t.guideConsent}{" "}
                  <a href="https://www.iubenda.com/privacy-policy/67582598" target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: BRAND.ink, textDecoration: "underline" }}>{t.cookiePolicy}</a>
                </span>
              </label>
              <button type="submit" disabled={sending || !consent} style={{ width: "100%", background: consent ? BRAND.green : "#d9d3c4", color: "#fff", border: "none", borderRadius: 12, padding: 13, fontSize: 14.5, fontWeight: 700, cursor: consent ? "pointer" : "default", fontFamily: "inherit" }}>
                {sending ? t.sending : t.guideUnlock}
              </button>
              {err && <div style={{ color: BRAND.red, fontSize: 12, marginTop: 8 }}>{t.required}</div>}
            </form>
          </div>
        )}
      </div>
    </main>
  );
}

/* ------------------------------ HOME TAB ---------------------------------- */
function HomeTab({ t, lang, loading, places, chosen, onEditInterests, onBook, onDetail, onTip, itinerary, onToggleItin, onOpenItin }) {
  if (loading) return <div style={{ padding: "22px 18px" }}><DeckSkeleton /></div>;
  const visibleSections = SECTIONS.filter((s) => chosen.length === 0 || chosen.includes(s.id));
  const docs = places.filter(isDoc); // TUTTI i classici, sempre, a prescindere dagli interessi
  const made = places.filter(isMadeInBo); // esperienze fisse Made in Bo, sempre, in cima

  return (
    <div style={{ padding: "8px 18px 0" }}>
      {/* BENVENUTO A BOLOGNA — banner fisso, sempre in cima */}
      <WelcomeBanner t={t} />

      {/* barra: modifica interessi — subito dopo il benvenuto, a ridosso dei contenuti che filtra */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginTop: 18 }}>
        <button onClick={onEditInterests} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "transparent", color: BRAND.ink, border: `1.5px solid ${BRAND.border}`, borderRadius: 999, padding: "8px 15px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          <span>⚙︎</span>{t.editInterests}
          {chosen.length > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: BRAND.green, color: "#fff", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{chosen.length}</span>}
        </button>
      </div>

      {itinerary.length > 0 && (
        <button onClick={onOpenItin} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", marginTop: 14, background: "rgba(56,176,74,0.10)", border: `1.5px solid ${BRAND.green}`, borderRadius: 14, padding: "12px 16px", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: BRAND.greenDark }}>
            🗺️ {itinerary.length} {itinerary.length === 1 ? t.itinReminderOne : t.itinReminderMany}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: BRAND.greenDark, whiteSpace: "nowrap" }}>{t.itinReminderCta} ›</span>
        </button>
      )}


      {/* 100% MADE IN BO — sezione fissa, SEMPRE IN CIMA (dopo il benvenuto), a prescindere dagli interessi scelti */}
      {made.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ width: 24, height: 24, flexShrink: 0, display: "inline-flex" }}><img src="/icons/stamp.png" alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /></span>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(24px, 5vw, 30px)", margin: 0, letterSpacing: "-0.02em" }}>{t.madeTitle}</h2>
          </div>
          <p style={{ fontSize: 13.5, color: BRAND.muted, margin: "4px 0 12px" }}>{t.madeSub}</p>
          <Deck items={made} lang={lang} t={t} onBook={onBook} onDetail={onDetail} onTip={onTip}
            itinerary={itinerary} onToggleItin={onToggleItin} />
        </section>
      )}

      {/* SEZIONI per interesse scelto — solo contenuti NON doc */}
      {visibleSections.map((sec) => {
        const normal = places.filter((p) => hasInterest(p, sec.id) && !isDoc(p));
        if (normal.length === 0) return null;
        return (
          <section key={sec.id} style={{ marginTop: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ width: 24, height: 24, flexShrink: 0, display: "inline-flex" }}><img src={sec.icon} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /></span>
              <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(24px, 5vw, 30px)", margin: 0, letterSpacing: "-0.02em" }}>{sec[lang]}</h2>
            </div>
            <Deck items={normal} lang={lang} t={t} onBook={onBook} onDetail={onDetail} onTip={onTip}
              itinerary={itinerary} onToggleItin={onToggleItin} />
          </section>
        );
      })}

      {/* BOLOGNA DOC — sezione fissa, sempre visibile, uguale per tutti */}
      {docs.length > 0 && (
        <section style={{ marginTop: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ width: 24, height: 24, flexShrink: 0, display: "inline-flex" }}><img src="/icons/star.png" alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /></span>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(24px, 5vw, 30px)", margin: 0, letterSpacing: "-0.02em" }}>{t.docTitle}</h2>
          </div>
          <p style={{ fontSize: 13.5, color: BRAND.muted, margin: "4px 0 12px" }}>{t.docSub}</p>
          <Deck items={docs} lang={lang} t={t} onBook={onBook} onDetail={onDetail} onTip={onTip}
            itinerary={itinerary} onToggleItin={onToggleItin} isDocDeck />
        </section>
      )}

      {/* LA COLONNA SONORA DI BOLOGNA — sezione fissa, sempre visibile, in fondo */}
      <section style={{ marginTop: 36 }}>
        <SoundtrackCard t={t} />
      </section>

      {/* INSTAGRAM — link minimale, in fondo alla pagina */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 28 }}>
        <a href="https://www.instagram.com/g.localapp/" target="_blank" rel="noreferrer" aria-label="Instagram"
          onClick={() => track("open_instagram")}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: "50%", border: `1.5px solid ${BRAND.border}`, color: BRAND.muted, transition: "all .15s" }}>
          <InstagramIcon />
        </a>
      </div>

      <div style={{ height: 20 }} />
    </div>
  );
}

/* --------------------------- INSTAGRAM ICON -------------------------------- */
function InstagramIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* --------------------------- SOUNDTRACK CARD ------------------------------- */
function SoundtrackCard({ t }) {
  return (
    <div style={{ background: BRAND.card, borderRadius: 22, overflow: "hidden", border: `1px solid ${BRAND.border}`, boxShadow: "0 6px 22px rgba(40,30,15,0.08)" }}>
      <div style={{ padding: "18px 18px 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 22 }}>🎧</span>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(22px, 5vw, 26px)", margin: 0, letterSpacing: "-0.02em" }}>{t.soundtrackTitle}</h2>
        </div>
        <p style={{ fontSize: 13.5, color: BRAND.muted, margin: "4px 0 14px" }}>{t.soundtrackSub}</p>
      </div>
      <iframe
        title="La colonna sonora di Bologna — Spotify"
        style={{ display: "block", border: "none" }}
        src={SPOTIFY_EMBED_URL}
        width="100%"
        height="152"
        frameBorder="0"
        allowFullScreen=""
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
      />
      <a href={SPOTIFY_LINK_URL} target="_blank" rel="noreferrer"
        onClick={() => track("open_spotify_playlist")}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 12px", fontSize: 14, fontWeight: 700, color: BRAND.greenDark, textDecoration: "none" }}>
        {t.soundtrackOpen} ↗
      </a>
    </div>
  );
}

/* -------------------------------- DECK ------------------------------------ */
function Deck({ items, lang, t, onBook, onDetail, onTip, itinerary, onToggleItin, isDocDeck }) {
  const ref = useRef(null);
  const [idx, setIdx] = useState(0);
  const drag = useRef({ down: false, x: 0, s: 0, moved: false });
  const scrollTimer = useRef(null);
  const loopItems = items.length > 1 ? [...items, items[0]] : items;
  const onScroll = () => {
    const el = ref.current; if (!el) return;
    const raw = Math.round(el.scrollLeft / el.clientWidth);
    setIdx(Math.min(raw, items.length - 1));
    // debounce: aspetta che lo scroll/swipe si sia fermato prima di controllare
    // se siamo atterrati sulla card clonata (= la prima, di nuovo) e nel caso
    // saltare istantaneamente all'inizio vero, senza che si veda il salto.
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      if (items.length > 1 && raw >= items.length) {
        el.scrollLeft = 0;
        setIdx(0);
      }
    }, 120);
  };
  const go = (dir) => {
    const el = ref.current; if (!el) return;
    const n = items.length;
    let next = idx + dir;
    if (next < 0) next = n - 1;        // dalla prima -> ultima
    else if (next >= n) next = 0;      // dall'ultima -> prima
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };
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
        {loopItems.map((p, i) => (
          <div key={i < items.length ? p.id : `${p.id}-loop`} className="gl-deck-slide">
            <DeckCard place={p} lang={lang} t={t} onBook={onBook} onDetail={onDetail} onTip={onTip}
              inItin={itinerary.includes(p.id)} onToggleItin={() => onToggleItin(p.id)} />
          </div>
        ))}
      </div>
      {items.length > 1 && <DeckArrow dir="left" onClick={() => go(-1)} />}
      {items.length > 1 && <DeckArrow dir="right" onClick={() => go(1)} />}
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
function DeckCard({ place, lang, t, onBook, onDetail, onTip, inItin, onToggleItin }) {
  const title = place[`title_${lang}`];
  const desc = place[`desc_${lang}`];
  const tip = place[`tip_${lang}`];
  const bookable = String(place.bookable).trim().toLowerCase() === "yes";

  return (
    <article className="gl-card" style={{ background: BRAND.card, borderRadius: 22, overflow: "hidden", border: `1px solid ${BRAND.border}`, boxShadow: "0 6px 22px rgba(40,30,15,0.08)", height: "100%", display: "flex", flexDirection: "column" }}>
      <div onClick={() => { track("view_card", { card: place.title_it || place.id, section: place.interests }); onDetail(place); }} style={{ position: "relative", aspectRatio: "4/3", background: "#eee", overflow: "hidden", cursor: "pointer" }}>
        <img src={place.image} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(20,16,10,0.72), rgba(20,16,10,0) 42%)" }} />
        {place.location && <span style={{ position: "absolute", top: 14, left: 14, background: "rgba(255,255,255,0.92)", color: BRAND.ink, fontSize: 12.5, fontWeight: 700, padding: "6px 12px", borderRadius: 999 }}>{place.location}</span>}
        <div style={{ position: "absolute", left: 18, bottom: 14, right: 18 }}>
          <h3 translate="no" className="notranslate" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(24px, 6.5vw, 32px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: "#fff", margin: 0 }}>{title}</h3>
        </div>
      </div>

      <div style={{ padding: 18, display: "flex", flexDirection: "column", flex: 1 }}>
        <p onClick={() => { track("view_card", { card: place.title_it || place.id, section: place.interests }); onDetail(place); }} style={{ fontSize: 15, lineHeight: 1.5, color: "#4a463d", margin: "0 0 14px", flex: 1, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", cursor: "pointer" }}>{desc}</p>

        {place.price && <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.red, fontFamily: "'Fraunces', serif", marginBottom: 12 }}>{place.price}</div>}

        {tip && (
          <button onClick={() => { track("open_local_tip", { card: place.title_it || place.id }); onTip(place); }} style={{ display: "inline-flex", alignItems: "center", gap: 7, alignSelf: "flex-start", background: "rgba(56,176,74,0.10)", color: BRAND.greenDark, border: `1.5px solid ${BRAND.green}`, borderRadius: 999, padding: "8px 14px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 12 }}>
            <span style={{ fontSize: 15 }}>💬</span>{t.localTipsBtn}
          </button>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { if (!inItin) track("add_to_itinerary", { card: place.title_it || place.id }); onToggleItin(); }} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, background: inItin ? BRAND.greenDark : "transparent", color: inItin ? "#fff" : BRAND.red, border: `1.5px solid ${inItin ? BRAND.greenDark : BRAND.red}`, borderRadius: 14, padding: "13px 12px", fontSize: 14.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ fontSize: 16 }}>{inItin ? "✓" : "＋"}</span>{inItin ? t.inItinShort : t.addItinShort}
          </button>
          {bookable && (
            <button onClick={() => { track("start_booking", { card: place.title_it || place.id }); onBook(place); }} style={{ flex: 1, background: BRAND.green, color: "#fff", border: "none", borderRadius: 14, padding: "13px 12px", fontSize: 14.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{t.book}</button>
          )}
        </div>
      </div>

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

/* --------------------------- OPENING HOURS --------------------------------- */
function OpeningHours({ orari, t }) {
  const [open, setOpen] = useState(false);
  const rows = parseOrariRows(orari);
  if (rows.length === 0) return null;
  const status = getOpenStatus(orari);

  const label = !status
    ? t.hoursTitle
    : status.open
    ? (status.allDay ? t.open24h : `${t.openNow} · ${t.closesAt} ${status.closesAt}`)
    : status.opensAt
    ? `${t.closedNow} · ${t.opensAt} ${status.opensAt}`
    : t.closedNow;

  return (
    <div style={{ border: `1.5px solid ${BRAND.border}`, borderRadius: 14, padding: "13px 15px", marginBottom: 24 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        <span style={{ fontSize: 14.5, fontWeight: 600, color: status?.open ? BRAND.greenDark : BRAND.ink }}>🕒 {label}</span>
        <span style={{ fontSize: 13, color: BRAND.muted, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▾</span>
      </button>
      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BRAND.border}` }}>
          {rows.map((r, i) => <div key={i} style={{ fontSize: 13, color: "#4a463d", padding: "2px 0" }}>{r}</div>)}
          <p style={{ fontSize: 11, color: BRAND.muted, margin: "8px 0 0" }}>{t.hoursSynced}</p>
        </div>
      )}
    </div>
  );
}

/* --------------------------- DETAIL MODAL --------------------------------- */
function DetailModal({ place, lang, t, onClose, onBook, onTip, onToggleItin, inItin }) {
  const title = place[`title_${lang}`];
  const desc = place[`desc_${lang}`];
  const tip = place[`tip_${lang}`];
  const bookable = String(place.bookable).trim().toLowerCase() === "yes";
  const extra = String(place.images || "").split(",").map((s) => s.trim()).filter(Boolean);
  const gallery = [place.image, ...extra].filter(Boolean);
  const address = String(place.address || "").trim();
  const mapsUrl = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...sheet, maxWidth: 540, padding: 0, maxHeight: "88vh", overflowY: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ flexShrink: 0, display: "flex", justifyContent: "flex-end", padding: "22px 14px 10px", background: BRAND.bg }}>
          <button onClick={onClose} aria-label={t.close} style={xBtn}>×</button>
        </div>
        <div style={{ flexShrink: 0, position: "relative" }}>
          <DetailGallery images={gallery} alt={title} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(20,16,10,0.55), transparent 50%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", left: 20, bottom: 16, right: 20, pointerEvents: "none" }}>
            {place.location && <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#fff", opacity: 0.9, marginBottom: 6 }}>📍 {place.location}</span>}
            <h2 translate="no" className="notranslate" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(26px, 6vw, 34px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: "#fff", margin: 0 }}>{title}</h2>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, padding: 22, overflowY: "auto" }}>
          {place.price && <p style={{ fontSize: 22, fontWeight: 600, margin: "0 0 16px", color: BRAND.red, fontFamily: "'Fraunces', serif" }}>{place.price}</p>}
          <p style={{ fontSize: 16.5, lineHeight: 1.65, color: "#4a463d", margin: "0 0 20px", whiteSpace: "pre-line" }}>{desc}</p>

          {tip && (
            <button onClick={() => { track("open_local_tip", { card: place.title_it || place.id, from: "detail" }); onTip(place); }} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(56,176,74,0.10)", color: BRAND.greenDark, border: `1.5px solid ${BRAND.green}`, borderRadius: 999, padding: "10px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 20 }}>
              <span style={{ fontSize: 16 }}>💬</span>{t.localTipsBtn}
            </button>
          )}

          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: BRAND.ink, background: BRAND.card, border: `1.5px solid ${BRAND.border}`, borderRadius: 14, padding: "13px 15px", marginBottom: 24 }}>
              <span style={{ fontSize: 18 }}>📍</span>
              <span style={{ flex: 1, fontSize: 14.5, fontWeight: 500, lineHeight: 1.35 }}>{address}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: BRAND.green }}>{lang === "it" ? "Apri" : "Open"} →</span>
            </a>
          )}

          <OpeningHours orari={place.orari} t={t} />

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {bookable && <button onClick={() => { track("start_booking", { card: place.title_it || place.id, from: "detail" }); onBook(place); }} style={{ width: "100%", background: BRAND.green, color: "#fff", border: "none", borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{t.book}</button>}
            <button onClick={() => { if (!inItin) track("add_to_itinerary", { card: place.title_it || place.id, from: "detail" }); onToggleItin(place.id); }} style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: inItin ? "rgba(56,176,74,0.12)" : "transparent", color: inItin ? BRAND.greenDark : BRAND.red, border: `1.5px solid ${inItin ? BRAND.green : BRAND.red}`, borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ fontSize: 16 }}>{inItin ? "✓" : "＋"}</span>{inItin ? t.inItin : t.addItin}
            </button>
          </div>


        </div>
      </div>
    </div>
  );
}

/* --------------------------- GOOGLE MAPS ROUTE ------------------------------ */
function googleMapsDirUrl(items) {
  // Usa l'indirizzo testuale (stessa fonte affidabile della card singola) e
  // ricade su lat/lng solo se un posto non ha l'address compilato.
  const stop = (p) => {
    const addr = String(p.address || "").trim();
    if (addr) return encodeURIComponent(addr);
    if (p.lat && p.lng) return `${p.lat},${p.lng}`;
    return null;
  };
  const pts = items.map((p) => ({ p, s: stop(p) })).filter((x) => x.s);
  if (pts.length === 0) return null;
  if (pts.length === 1) return `https://www.google.com/maps/search/?api=1&query=${pts[0].s}`;
  const origin = pts[0].s;
  const destination = pts[pts.length - 1].s;
  const waypoints = pts.slice(1, -1).map((x) => x.s).join("|");
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=walking`;
  if (waypoints) url += `&waypoints=${waypoints}`;
  return url;
}

/* --------------------------- ITINERARY TAB -------------------------------- */
function ItineraryTab({ t, lang, items, onRemove, onClear, onGoHome, onOpenDetail }) {
  const shareWhatsApp = () => {
    const lines = [`${t.itinTitle} — Bologna`, ""];
    items.forEach((p) => lines.push(`• ${p[`title_${lang}`]}${p.price ? ` (${p.price})` : ""}`));
    lines.push("");
    lines.push("📲 Scopri altre esperienze a Bologna: https://app.g-local.it");
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  };

  const mapsUrl = googleMapsDirUrl(items);

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
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: BRAND.card, color: BRAND.ink, textDecoration: "none", border: `1.5px solid ${BRAND.border}`, borderRadius: 14, padding: "13px 12px", fontSize: 14, fontWeight: 700 }}>
                <span>🗺️</span>{t.openInMaps}
              </a>
            )}
            <button onClick={shareWhatsApp} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#25D366", color: "#fff", border: "none", borderRadius: 14, padding: "13px 12px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              <span>💬</span>{t.shareWa}
            </button>
          </div>

          <ul style={listReset}>
            {items.map((p) => (
              <li key={p.id} style={{ ...rowCard, cursor: "pointer" }} onClick={() => { track("view_card", { card: p.title_it || p.id, from: "itinerary" }); onOpenDetail(p); }}>
                <img src={p.image} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div translate="no" className="notranslate" style={{ fontWeight: 600, fontSize: 15.5, lineHeight: 1.25 }}>{p[`title_${lang}`]}</div>
                  {p.location && <div style={{ fontSize: 12.5, color: BRAND.muted, marginTop: 1 }}>📍 {p.location}</div>}
                  {p.price && <div style={{ fontSize: 13.5, color: BRAND.red, marginTop: 2, fontWeight: 600 }}>{p.price}</div>}
                </div>
                <button onClick={(e) => { e.stopPropagation(); onRemove(p.id); }} aria-label={t.remove} style={rowX}>×</button>
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
function BookingModal({ place, lang, t, onClose, onBooked }) {
  const [form, setForm] = useState({ name: "", email: "", people: "2", date: "" });
  const [status, setStatus] = useState("idle");
  const title = place[`title_${lang}`];
  const contact = String(place.contact || "").replace(/[^0-9]/g, "");
  const weekCount = Number(place.bookings_week) || 0;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const FORMSPREE_ENDPOINT = "https://formspree.io/f/mnpaapzq";
  const submit = async () => {
    if (!form.name || !form.email || !form.date) { setStatus("error"); return; }
    setStatus("sending");
    try {
      const res = await fetch(FORMSPREE_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ esperienza: title, nome: form.name, email: form.email, persone: form.people, data: form.date, _subject: `Nuova prenotazione Glocal: ${title}` }) });
      if (res.ok) { setStatus("done"); onBooked?.(); } else setStatus("error");
    } catch { setStatus("error"); }
  };
  const waText = encodeURIComponent(lang === "it"
    ? `Ciao! Ho inviato una richiesta di prenotazione tramite Glocal per "${title}" per il ${form.date || "—"}, ${form.people} persone. A nome di ${form.name || "—"}.`
    : `Hi! I sent a booking request via Glocal for "${title}" on ${form.date || "—"}, ${form.people} people. Under the name ${form.name || "—"}.`);

  return (
    <div onClick={onClose} style={overlay}>
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
            <h3 translate="no" className="notranslate" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 23, margin: "0 0 6px" }}>{title}</h3>
            <p style={{ fontSize: 13.5, lineHeight: 1.5, color: BRAND.muted, margin: "0 0 14px" }}>{t.bookingSubtitle}</p>
            {weekCount > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(56,176,74,0.10)", border: `1px solid ${BRAND.green}`, borderRadius: 12, padding: "9px 13px", marginBottom: 18, fontSize: 13, fontWeight: 700, color: BRAND.greenDark }}>
                <span style={{ fontSize: 15 }}>🔥</span>
                <span>{weekCount} {t.socialProofWeek} <span translate="no" className="notranslate">{title}</span></span>
              </div>
            )}
            <Field label={t.name}><input style={inp} value={form.name} onChange={set("name")} /></Field>
            <Field label={t.email}><input style={inp} type="email" value={form.email} onChange={set("email")} /></Field>
            <div style={{ display: "flex", gap: 12 }}>
              <Field label={t.people} flex><input style={inp} type="number" min="1" value={form.people} onChange={set("people")} /></Field>
              <Field label={t.date} flex><input style={inp} type="date" value={form.date} onChange={set("date")} /></Field>
            </div>
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
const overlay = { position: "fixed", inset: 0, background: "rgba(26,20,12,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 90 };
const sheet = { background: BRAND.bg, width: "100%", borderRadius: "22px 22px 0 0", overflowY: "auto", maxHeight: "92vh", boxShadow: "0 -10px 50px rgba(0,0,0,0.25)" };
const inp = { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${BRAND.border}`, background: BRAND.card, fontSize: 15, fontFamily: "inherit", color: BRAND.ink, outline: "none" };
const xBtn = { width: 34, height: 34, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(26,20,12,0.08)", border: "none", borderRadius: "50%", fontSize: 20, cursor: "pointer", color: BRAND.ink, lineHeight: 1 };
const sheetLabel = { fontSize: 12.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: BRAND.muted, margin: "0 0 12px" };
const listReset = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 };
const rowCard = { display: "flex", gap: 13, alignItems: "center", background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 11 };
const rowX = { background: "none", border: "none", color: "#bbb", fontSize: 22, cursor: "pointer", flexShrink: 0, lineHeight: 1 };

function Field({ label, children, flex }) {
  return (<label style={{ display: "block", marginBottom: 14, flex: flex ? 1 : undefined }}><span style={{ display: "block", fontSize: 12.5, fontWeight: 700, marginBottom: 6, color: "#3a3630" }}>{label}</span>{children}</label>);
}
function LangToggle({ lang, setLang }) {
  const FLAG = { it: "🇮🇹", en: "🇬🇧" };
  return (
    <div style={{ display: "flex", border: `1.5px solid ${BRAND.border}`, borderRadius: 999, overflow: "hidden" }}>
      {["it", "en"].map((l) => (<button key={l} onClick={() => setLang(l)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", background: lang === l ? BRAND.ink : "transparent", color: lang === l ? "#fff" : "#999", textTransform: "uppercase", letterSpacing: "0.05em" }}><span style={{ fontSize: 14 }}>{FLAG[l]}</span>{l}</button>))}
    </div>
  );
}
/* --------------------------- BETA / FEEDBACK / COOKIE --------------------- */
/* --------------------------- QUICK FEEDBACK -------------------------------- */

function StarRating({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} stelle`}
          style={{ background: "none", border: "none", padding: 2, cursor: "pointer", fontSize: 30, lineHeight: 1, color: n <= value ? BRAND.red : BRAND.border, transition: "color .15s" }}>
          {n <= value ? "★" : "☆"}
        </button>
      ))}
    </div>
  );
}

function QuickFeedbackModal({ t, lang, onClose, onSubmitted }) {
  const [rating, setRating] = useState(0);
  const [improve, setImprove] = useState("");
  const [extra, setExtra] = useState("");
  const [status, setStatus] = useState("idle");
  const FORMSPREE_ENDPOINT = "https://formspree.io/f/maewzgoa";
  const submit = async () => {
    setStatus("sending");
    try {
      const res = await fetch(FORMSPREE_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ tipo: "QUICK_FEEDBACK", valutazione: rating || "—", miglioreresti: improve, altro: extra, lingua: lang, _subject: "Nuovo quick feedback Glocal" }) });
      if (res.ok) { setStatus("done"); onSubmitted?.(); } else setStatus("error");
    } catch { setStatus("error"); }
  };
  const skip = () => { onSubmitted?.(); onClose(); };

  return (
    <div onClick={skip} style={{ ...overlay, alignItems: "center", zIndex: 95 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: BRAND.bg, borderRadius: 22, maxWidth: 420, width: "calc(100% - 44px)", padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        {status === "done" ? (
          <div style={{ textAlign: "center", padding: "12px 4px" }}>
            <div style={{ width: 54, height: 54, borderRadius: "50%", background: "rgba(56,176,74,0.14)", color: BRAND.green, fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>✓</div>
            <p style={{ fontSize: 16, color: "#3a3630", margin: "0 0 20px" }}>{t.qfThanks}</p>
            <button onClick={onClose} style={{ background: BRAND.ink, color: "#fff", border: "none", borderRadius: 12, padding: "12px 28px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{t.close}</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2 }}>
              <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 21, margin: 0 }}>{t.qfTitle}</h3>
              <button onClick={skip} style={xBtn}>×</button>
            </div>
            <p style={{ fontSize: 13, color: BRAND.muted, margin: "0 0 16px" }}>{t.qfSub}</p>

            <Field label={t.qfRatingLabel}><StarRating value={rating} onChange={setRating} /></Field>
            <Field label={t.qfImproveLabel}><input style={inp} value={improve} onChange={(e) => setImprove(e.target.value)} placeholder={t.qfImprovePlaceholder} /></Field>
            <Field label={t.qfExtraLabel}><input style={inp} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={t.qfExtraPlaceholder} /></Field>

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button onClick={skip} style={{ flex: 1, background: "transparent", color: BRAND.muted, border: `1.5px solid ${BRAND.border}`, borderRadius: 14, padding: 14, fontSize: 14.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{t.qfSkip}</button>
              <button onClick={submit} disabled={status === "sending"} style={{ flex: 1, background: BRAND.green, color: "#fff", border: "none", borderRadius: 14, padding: 14, fontSize: 14.5, fontWeight: 700, cursor: status === "sending" ? "default" : "pointer", fontFamily: "inherit", opacity: status === "sending" ? 0.7 : 1 }}>
                {status === "sending" ? t.qfSending : t.qfSend}
              </button>
            </div>
            {status === "error" && <p style={{ color: BRAND.red, fontSize: 13.5, margin: "10px 0 0", textAlign: "center" }}>{t.required}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function CookieBanner({ t, onOk }) {
  return (
    <div style={{ position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 80, background: BRAND.ink, color: "#fff", borderRadius: 16, padding: "16px 18px", boxShadow: "0 10px 40px rgba(0,0,0,0.35)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, maxWidth: 620, margin: "0 auto" }}>
      <span style={{ flex: 1, minWidth: 200, fontSize: 13.5, lineHeight: 1.5 }}>
        {t.cookieText}{" "}
        <a href="https://www.iubenda.com/privacy-policy/67582598" target="_blank" rel="noreferrer" style={{ color: "#9fe0ab", textDecoration: "underline" }}>{t.cookiePolicy}</a>{" · "}<a href="https://www.iubenda.com/privacy-policy/67582598/cookie-policy" target="_blank" rel="noreferrer" style={{ color: "#9fe0ab", textDecoration: "underline" }}>Cookie</a>
      </span>
      <button onClick={onOk} style={{ background: BRAND.green, color: "#fff", border: "none", borderRadius: 12, padding: "11px 22px", fontSize: 14.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{t.cookieOk}</button>
    </div>
  );
}

/* --------------------------- LOCAL TIP SHEET ------------------------------ */
// struttura IDENTICA al BookingModal: stesso overlay, stesso sheet, stessa impaginazione
function LocalTipSheet({ place, tip, lang, t, onClose }) {
  const title = place[`title_${lang}`];
  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...sheet, maxWidth: 520, padding: 24, minHeight: "55vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.14em", color: BRAND.green, fontWeight: 700 }}>{t.localTip}</span>
          <button onClick={onClose} style={xBtn}>×</button>
        </div>
        <h3 translate="no" className="notranslate" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 23, margin: "0 0 20px" }}>{title}</h3>
        <p style={{ fontSize: 16.5, lineHeight: 1.65, color: "#3a3630", margin: 0, whiteSpace: "pre-line" }}>{tip}</p>
      </div>
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
      .gl-deck-slide { flex: 0 0 100%; scroll-snap-align: center; padding: 2px; box-sizing: border-box; }
      .gl-gallery { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; -ms-overflow-style: none; }
      .gl-gallery::-webkit-scrollbar { display: none; }
      .gl-gallery-img { flex: 0 0 100%; width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; scroll-snap-align: center; }
      .gl-card { transition: transform .15s ease, box-shadow .15s ease; }
      .gl-card:active { transform: scale(0.975) translateY(1px); box-shadow: 0 2px 10px rgba(40,30,15,0.10) !important; }
      .gl-pick-card { opacity: 0; animation: glFadeUp .5s ease forwards; }
      @keyframes glFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
      .gl-check-pop { animation: glCheckPop .35s cubic-bezier(.34,1.56,.64,1); }
      @keyframes glCheckPop { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      .gl-rotator-img { animation: glFade 2.6s ease-in-out; }
      @keyframes glFade { 0% { opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; } }
      .gl-rotator-wrap { position: fixed; z-index: 6; pointer-events: none; animation: glRoam 15s ease-in-out infinite; }
      @keyframes glRoam {
        0%   { top: 16%; left: 8%; }
        20%  { top: 9%;  left: 66%; }
        40%  { top: 58%; left: 80%; }
        60%  { top: 74%; left: 18%; }
        80%  { top: 40%; left: 50%; }
        100% { top: 16%; left: 8%; }
      }
      .gl-rotator-float { animation: glOrbit 6.5s ease-in-out infinite; }
      @keyframes glOrbit { 0% { transform: rotate(0deg); } 25% { transform: rotate(5deg); } 50% { transform: rotate(-4deg); } 75% { transform: rotate(4deg); } 100% { transform: rotate(0deg); } }
      .gl-pulse { animation: glpulse 1.4s ease-in-out infinite; }
      @keyframes glpulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }
      .gl-spin { animation: glspin 0.8s linear infinite; }
      @keyframes glspin { to { transform: rotate(360deg) } }
      @media (hover:hover) { .gl-deck-arrow:hover { background: #fff; } }
      @media (prefers-reduced-motion: reduce) { *, .gl-pulse, .gl-spin, .gl-card, .gl-pick-card, .gl-check-pop, .gl-rotator-img, .gl-rotator-float, .gl-rotator-wrap { animation: none !important; transition: none !important; opacity: 1 !important; transform: none !important; } }
    `}</style>
  );
}
