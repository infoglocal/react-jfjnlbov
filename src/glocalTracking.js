// glocalTracking.js  (metti questo file accanto ad App.js, in src/)
// Salva da dove arriva l'utente (UTM / ref del QR) e registra su Google Sheet,
// via Apps Script, i clic su "Prenota" e le prenotazioni inviate.

const ENDPOINT = "https://script.google.com/macros/s/AKfycbwZxQTc8TAI-rMxQvJnqD79g8p5gFGkBTBs-Y3F4qsIQMCH87ncnncnWwrOucNA7dNy/exec";
const KEY = "glocal_attrib";
const SID_KEY = "glocal_sid";
const MAX_AGE_DAYS = 7; // dopo 7 giorni l'attribuzione scade
const FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "ref"];

// Legge UTM/ref dall'URL e li salva (ultimo tocco: un nuovo link con UTM sovrascrive il precedente)
export function captureAttribution() {
  try {
    const params = new URLSearchParams(window.location.search);
    const found = {};
    FIELDS.forEach((f) => {
      const v = params.get(f);
      if (v) found[f] = v.slice(0, 100);
    });
    if (Object.keys(found).length > 0) {
      localStorage.setItem(KEY, JSON.stringify({ ...found, landing_at: new Date().toISOString() }));
    }
  } catch (e) {
    /* storage non disponibile: si prosegue senza attribuzione */
  }
}

export function getAttribution() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (data.landing_at) {
      const ageDays = (Date.now() - new Date(data.landing_at).getTime()) / 86400000;
      if (ageDays > MAX_AGE_DAYS) {
        localStorage.removeItem(KEY);
        return {};
      }
    }
    return data;
  } catch (e) {
    return {};
  }
}

function sessionId() {
  try {
    let sid = sessionStorage.getItem(SID_KEY);
    if (!sid) {
      sid = Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch (e) {
    return "nosession";
  }
}

// Manda una riga al foglio. event di default: "start_booking"
export function trackBooking(card, extra = {}) {
  if (!ENDPOINT || ENDPOINT.startsWith("INCOLLA")) return; // non ancora configurato
  const a = getAttribution();
  const payload = {
    event: "start_booking",
    card: String(card || ""),
    method: "",
    from: "",
    utm_source: a.utm_source || "(diretto)",
    utm_medium: a.utm_medium || "",
    utm_campaign: a.utm_campaign || "",
    utm_content: a.utm_content || "",
    ref: a.ref || "",
    lang: document.documentElement.lang || navigator.language || "",
    sid: sessionId(),
    ...extra,
  };
  const body = JSON.stringify(payload);
  try {
    // text/plain evita il preflight CORS verso Apps Script
    if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }))) return;
    fetch(ENDPOINT, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body });
  } catch (e) {
    /* il tracciamento non deve mai bloccare la prenotazione */
  }
}
