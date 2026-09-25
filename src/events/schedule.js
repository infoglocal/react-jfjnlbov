/* ============================================================================
   EVENTI — date, ricorrenze, calendario
   ----------------------------------------------------------------------------
   Tutte le date degli eventi sono "ora di Bologna" (Europe/Rome), salvate come
   testo: data "AAAA-MM-GG", orario "HH:MM" (o "HH:MM:SS", come arriva da
   Supabase). Le calcoliamo sempre in Europe/Rome, qualunque sia il fuso del
   telefono del turista.

   Tipi di programmazione (colonna schedule_type):
     single    -> un giorno (start_date)
     range     -> dal start_date al end_date (es. mostra)
     recurring -> ogni settimana nei giorni "weekdays" (0 = domenica … 6 = sabato),
                  da start_date, fino a end_date (vuoto = senza fine)

   Questo file non importa niente: lo usa sia l'app sia la funzione Netlify
   che genera il file .ics (netlify/functions/ics.js).
   ============================================================================ */

export const TZ = "Europe/Rome";
export const WINDOW_DAYS = 14; // il popup mostra gli eventi dei prossimi 14 giorni
export const MAX_EVENTS = 8;   // … al massimo 8

/* --------------------------- date come testo ------------------------------ */
const pad = (n) => String(n).padStart(2, "0");

function partsInRome(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

// "AAAA-MM-GG" e "HH:MM" di adesso, a Bologna
export function nowInRome(now = new Date()) {
  const p = partsInRome(now);
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}

const toUtcMs = (dateStr) => { const [y, m, d] = dateStr.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fromUtcMs = (ms) => { const x = new Date(ms); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };
export const addDays = (dateStr, n) => fromUtcMs(toUtcMs(dateStr) + n * 86400000);
export const weekdayOf = (dateStr) => new Date(toUtcMs(dateStr)).getUTCDay();
export const hhmm = (t) => (t ? String(t).slice(0, 5) : "");

// Istante UTC (Date) di una data+ora "di Bologna". Gestisce ora legale/solare.
export function romeToDate(dateStr, timeStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, mi] = (hhmm(timeStr) || "00:00").split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const p = partsInRome(new Date(guess));
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - guess; // +1h o +2h
  return new Date(guess - offset);
}

/* --------------------------- prossima data -------------------------------- */
// L'evento è già finito, per oggi? (solo se ha un orario)
function endedToday(ev, now) {
  const end = hhmm(ev.end_time) || hhmm(ev.start_time);
  if (!end) return false;
  // una fascia che finisce dopo mezzanotte (es. 22:00–02:00) non è finita la sera stessa
  if (hhmm(ev.end_time) && hhmm(ev.start_time) && hhmm(ev.end_time) <= hhmm(ev.start_time)) return false;
  // senza orario di fine, l'evento resta visibile fino a 3 ore dopo l'inizio
  if (!hhmm(ev.end_time)) {
    const [h, mi] = hhmm(ev.start_time).split(":").map(Number);
    const limit = Math.min(23 * 60 + 59, h * 60 + mi + 180);
    return now.time > `${pad(Math.floor(limit / 60))}:${pad(limit % 60)}`;
  }
  return now.time > end;
}

// Prossima "occorrenza" dell'evento da oggi in poi, oppure null se è finito.
//   { date: "AAAA-MM-GG", ongoing: true }  per le mostre dal/al già iniziate
export function nextOccurrence(ev, now = nowInRome()) {
  const today = now.date;
  const start = ev.start_date;
  if (!start) return null;

  if (ev.schedule_type === "range") {
    const end = ev.end_date || start;
    if (end < today) return null;
    if (end === today && endedToday(ev, now)) return null;
    return start <= today ? { date: today, ongoing: true } : { date: start, ongoing: false };
  }

  if (ev.schedule_type === "recurring") {
    const days = (ev.weekdays || []).map(Number);
    if (!days.length) return null;
    let d = start > today ? start : today;
    for (let i = 0; i < 7 * 9; i++, d = addDays(d, 1)) { // fino a ~2 mesi avanti
      if (ev.end_date && d > ev.end_date) return null;
      if (!days.includes(weekdayOf(d))) continue;
      if (d === today && endedToday(ev, now)) continue;
      return { date: d, ongoing: false };
    }
    return null;
  }

  // single
  if (start < today) return null;
  if (start === today && endedToday(ev, now)) return null;
  return { date: start, ongoing: false };
}

// Eventi da mostrare nel popup: solo quelli con una data nei prossimi
// WINDOW_DAYS giorni, in ordine di data e ora, al massimo MAX_EVENTS.
export function upcomingEvents(events, now = nowInRome(), windowDays = WINDOW_DAYS, max = MAX_EVENTS) {
  const limit = addDays(now.date, windowDays);
  return events
    .map((ev) => ({ ev, occ: nextOccurrence(ev, now) }))
    .filter(({ occ }) => occ && occ.date <= limit)
    .sort((a, b) =>
      a.occ.date.localeCompare(b.occ.date) ||
      (hhmm(a.ev.start_time) || "99").localeCompare(hhmm(b.ev.start_time) || "99"))
    .slice(0, max)
    .map(({ ev, occ }) => ({ ...ev, occ }));
}

/* --------------------------- etichette ------------------------------------ */
const LOCALE = { it: "it-IT", en: "en-GB" };
const WORDS = {
  it: { today: "Oggi", tomorrow: "Domani", every: "Ogni", until: "Fino al", from: "Dal", to: "al", and: "e" },
  en: { today: "Today", tomorrow: "Tomorrow", every: "Every", until: "Until", from: "From", to: "to", and: "and" },
};

const fmt = (dateStr, lang, opts) =>
  new Intl.DateTimeFormat(LOCALE[lang] || "it-IT", { timeZone: "UTC", ...opts }).format(new Date(toUtcMs(dateStr)));
const dayLabel = (dateStr, lang, now) => {
  const w = WORDS[lang] || WORDS.it;
  if (dateStr === now.date) return w.today;
  if (dateStr === addDays(now.date, 1)) return w.tomorrow;
  return fmt(dateStr, lang, { weekday: "short", day: "numeric", month: "short" });
};
const timeLabel = (ev) => {
  const s = hhmm(ev.start_time), e = hhmm(ev.end_time);
  return s && e ? `${s}–${e}` : s;
};
const weekdayName = (n, lang) => fmt(addDays("2026-01-04", n), lang, { weekday: "long" }); // 4 gen 2026 = domenica

// Riga data per il popup, es. "Gio 2 ott · 21:00", "Fino al 20 ott", "Ogni giovedì · 19:00–22:00"
export function whenLabel(ev, lang = "it", now = nowInRome()) {
  const w = WORDS[lang] || WORDS.it;
  const occ = ev.occ || nextOccurrence(ev, now);
  const time = timeLabel(ev);
  const withTime = (s) => (time ? `${s} · ${time}` : s);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  if (ev.schedule_type === "range") {
    const end = ev.end_date || ev.start_date;
    const endTxt = fmt(end, lang, { day: "numeric", month: "short" });
    if (!occ || occ.ongoing) return withTime(`${w.until} ${endTxt}`);
    return withTime(`${w.from} ${fmt(ev.start_date, lang, { day: "numeric", month: "short" })} ${w.to} ${endTxt}`);
  }
  if (ev.schedule_type === "recurring") {
    const days = [...(ev.weekdays || [])].map(Number).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // da lunedì
    const names = days.map((d) => weekdayName(d, lang));
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} ${w.and} ${names[names.length - 1]}` : names[0];
    return withTime(`${w.every} ${list}`);
  }
  return withTime(cap(dayLabel(ev.start_date, lang, now)));
}

// Etichetta breve della prossima data (per gli eventi ricorrenti: "Prossimo: gio 2 ott")
export function nextDateLabel(ev, lang = "it", now = nowInRome()) {
  const occ = ev.occ || nextOccurrence(ev, now);
  if (!occ) return "";
  const s = dayLabel(occ.date, lang, now);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* --------------------------- calendario ----------------------------------- */
// Inizio e fine (Date) dell'occorrenza da aggiungere al calendario.
// Senza orario -> evento "tutto il giorno". Senza fine -> durata 2 ore.
// Le mostre (range) diventano un unico evento "tutto il giorno" dal/al.
export function calendarSpan(ev, occDate) {
  if (ev.schedule_type === "range" && !hhmm(ev.start_time)) {
    return { allDay: true, startDate: ev.start_date, endDate: addDays(ev.end_date || ev.start_date, 1) };
  }
  const date = occDate || ev.start_date;
  if (!hhmm(ev.start_time)) return { allDay: true, startDate: date, endDate: addDays(date, 1) };
  const start = romeToDate(date, ev.start_time);
  let end;
  if (hhmm(ev.end_time)) {
    const endDate = hhmm(ev.end_time) <= hhmm(ev.start_time) ? addDays(date, 1) : date; // dopo mezzanotte
    end = romeToDate(endDate, ev.end_time);
  } else {
    end = new Date(start.getTime() + 2 * 3600000);
  }
  return { allDay: false, start, end };
}

const icsStamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // 20261002T190000Z
const icsDate = (s) => s.replace(/-/g, "");
const icsEscape = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);

// Link "aggiungi a Google Calendar" (apre Google Calendar già compilato)
export function googleCalendarUrl(ev, occDate, { title, location, details } = {}) {
  const span = calendarSpan(ev, occDate);
  const dates = span.allDay
    ? `${icsDate(span.startDate)}/${icsDate(span.endDate)}`
    : `${icsStamp(span.start)}/${icsStamp(span.end)}`;
  const p = new URLSearchParams({ action: "TEMPLATE", text: title || ev.title_it, dates, ctz: TZ });
  if (location) p.set("location", location);
  if (details) p.set("details", details);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

// Testo di un file .ics (Apple Calendar, Outlook, qualsiasi calendario)
export function buildIcs(ev, occDate, { title, location, details, url, uid } = {}) {
  const span = calendarSpan(ev, occDate);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Glocal//Eventi//IT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid || `${ev.id || "evento"}-${occDate || ev.start_date}`}@g-local.it`,
    `DTSTAMP:${icsStamp(new Date())}`,
    ...(span.allDay
      ? [`DTSTART;VALUE=DATE:${icsDate(span.startDate)}`, `DTEND;VALUE=DATE:${icsDate(span.endDate)}`]
      : [`DTSTART:${icsStamp(span.start)}`, `DTEND:${icsStamp(span.end)}`]),
    `SUMMARY:${icsEscape(title || ev.title_it)}`,
    ...(location ? [`LOCATION:${icsEscape(location)}`] : []),
    ...(details ? [`DESCRIPTION:${icsEscape(details)}`] : []),
    ...(url ? [`URL:${url}`] : []),
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

/* --------------------------- chiavi Supabase ------------------------------ */
// Chiave "anon" classica (inizia con eyJ…): va anche come Bearer.
// Chiave nuova "publishable" (sb_publishable_…): solo nell'header apikey.
export function authHeaders(key) {
  return String(key).startsWith("eyJ") ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}
