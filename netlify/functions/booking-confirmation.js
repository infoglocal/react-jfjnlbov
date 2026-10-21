// netlify/functions/booking-confirmation.js
//
// Email di conferma al turista dopo una prenotazione a date (tour, esperienze).
// L'app la chiama subito dopo aver prenotato, con { booking_id }.
//
// Sicurezza: i dati NON arrivano dal browser. La funzione li legge dal database
// con claim_booking_confirmation (supabase/sessions.sql), che li restituisce una
// sola volta e solo nei 30 minuti dopo la prenotazione. Così nessuno può usare
// questa funzione per mandare email a chi vuole o a ripetizione.
//
// Da impostare su Netlify (Site settings -> Environment variables):
//   BREVO_API_KEY         già presente (la usa anche la guida)
//   BOOKING_SENDER_EMAIL  mittente VERIFICATO su Brevo (Senders & IP -> Senders)
//   BOOKING_SENDER_NAME   facoltativo, default "Glocal"
//   BOOKING_BCC           facoltativo: indirizzo che riceve una copia di ogni conferma
//   BOOKING_REPLY_TO      facoltativo: dove arrivano le risposte dei turisti (es. la Gmail)

import { authHeaders } from "../../src/events/schedule.js";
import config from "../../src/events/config.json";

const SB_URL = (process.env.REACT_APP_SUPABASE_URL || config.supabaseUrl || "").replace(/\/$/, "");
const SB_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || config.supabaseAnonKey || "";
const UUID_RE = /^[0-9a-f-]{36}$/i;
const TZ = "Europe/Rome";
const WA = "393200849247"; // stesso numero di "Chiedi ad un local"

const T = {
  it: {
    subject: (t, d) => `Prenotazione confermata: ${t}, ${d}`,
    hello: (n) => `Ciao ${n},`,
    intro: "la tua prenotazione è confermata. Ecco i dettagli:",
    when: "Quando", people: "Persone", meet: "Punto di ritrovo", pay: "Da pagare sul posto", lang: "Lingua", notes: "Le tue note",
    maps: "Apri in Google Maps", duration: "durata",
    help: "Hai bisogno di cambiare qualcosa o hai una domanda? Scrivici su WhatsApp:",
    wa: "Scrivici su WhatsApp", bye: "A presto a Bologna!", sign: "Glocal",
    cal: "In allegato trovi l'evento da aggiungere al calendario.",
    one: "persona", many: "persone",
  },
  en: {
    subject: (t, d) => `Booking confirmed: ${t}, ${d}`,
    hello: (n) => `Hi ${n},`,
    intro: "your booking is confirmed. Here are the details:",
    when: "When", people: "Guests", meet: "Meeting point", pay: "To pay on site", lang: "Language", notes: "Your notes",
    maps: "Open in Google Maps", duration: "duration",
    help: "Need to change something or have a question? Message us on WhatsApp:",
    wa: "Message us on WhatsApp", bye: "See you in Bologna!", sign: "Glocal",
    cal: "The calendar event is attached.",
    one: "guest", many: "guests",
  },
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (iso, lang, opts) => new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "it-IT", { timeZone: TZ, ...opts });
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const dur = (m) => (m % 60 === 0 ? `${m / 60} h` : m > 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
const euro = (n, lang) => Number(n).toLocaleString(lang === "en" ? "en-GB" : "it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: Number(n) % 1 ? 2 : 0 });

function icsFile(b) {
  const start = new Date(b.starts_at);
  const end = new Date(start.getTime() + (b.duration_min || 120) * 60000);
  const z = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const line = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Glocal//Prenotazioni//IT", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${z(start)}-${Math.random().toString(36).slice(2)}@g-local.it`, `DTSTAMP:${z(new Date())}`,
    `DTSTART:${z(start)}`, `DTEND:${z(end)}`, `SUMMARY:${line(b.tour)}`, `LOCATION:${line(b.address)}`,
    `DESCRIPTION:${line(`${b.people} pers. · Glocal`)}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

function html(b, t, lang) {
  const when = `${cap(fmt(b.starts_at, lang, { weekday: "long", day: "numeric", month: "long" }))}, ${fmt(b.starts_at, lang, { hour: "2-digit", minute: "2-digit" })}`;
  const maps = b.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}` : null;
  const row = (k, v) => `<tr><td style="padding:10px 0;color:#7a7568;font-size:14px;vertical-align:top;width:42%">${esc(k)}</td><td style="padding:10px 0;font-size:15px;font-weight:700;color:#1a1a1a">${v}</td></tr>`;
  const rows = [
    row(t.when, `${esc(when)}<br><span style="font-weight:400;color:#7a7568;font-size:13px">${esc(t.duration)} ${esc(dur(b.duration_min))}</span>`),
    row(t.people, `${b.people} ${esc(b.people === 1 ? t.one : t.many)}`),
    b.address ? row(t.meet, `${esc(b.address)}${maps ? `<br><a href="${maps}" style="color:#2a8f39;font-size:13px">${esc(t.maps)}</a>` : ""}`) : "",
    b.price_eur != null ? row(t.pay, esc(euro(Number(b.price_eur) * b.people, lang))) : "",
    b.language ? row(t.lang, esc(b.language)) : "",
    b.notes ? row(t.notes, `<span style="font-weight:400">${esc(b.notes)}</span>`) : "",
  ].join("");
  return `<!doctype html><html><body style="margin:0;background:#FBF8F0;font-family:Helvetica,Arial,sans-serif;color:#1a1a1a">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
  <div style="font-size:22px;font-weight:800;color:#e5383b;letter-spacing:-0.02em;margin-bottom:22px">glocal</div>
  <div style="background:#fff;border:1px solid #e6e0d0;border-radius:18px;padding:24px">
    <div style="font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#38b04a">✓ ${esc(lang === "en" ? "Confirmed" : "Confermata")}</div>
    <h1 style="font-family:Georgia,serif;font-size:26px;line-height:1.15;margin:8px 0 16px">${esc(b.tour)}</h1>
    <p style="font-size:15px;line-height:1.55;margin:0 0 6px">${esc(t.hello(b.name.split(" ")[0]))}</p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 12px">${esc(t.intro)}</p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e6e0d0">${rows}</table>
    <p style="font-size:13px;color:#7a7568;margin:14px 0 0">${esc(t.cal)}</p>
  </div>
  <p style="font-size:14px;line-height:1.55;margin:22px 0 10px">${esc(t.help)}</p>
  <a href="https://wa.me/${WA}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 16px;border-radius:12px">${esc(t.wa)}</a>
  <p style="font-size:14px;margin:24px 0 0">${esc(t.bye)}<br><b>${esc(t.sign)}</b></p>
</div></body></html>`;
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  let id;
  try { ({ booking_id: id } = JSON.parse(event.body || "{}")); } catch { return { statusCode: 400, body: "Invalid JSON" }; }
  if (!id || !UUID_RE.test(id)) return { statusCode: 400, body: "Bad id" };

  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BOOKING_SENDER_EMAIL;
  if (!apiKey || !sender || !SB_URL || !SB_KEY) {
    console.error("booking-confirmation: missing env (BREVO_API_KEY / BOOKING_SENDER_EMAIL / Supabase)");
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };
  }

  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/claim_booking_confirmation`, {
      method: "POST",
      headers: { ...authHeaders(SB_KEY), "Content-Type": "application/json" },
      body: JSON.stringify({ p_booking_id: id }),
    });
    const b = res.ok ? await res.json() : null;
    if (!b) return { statusCode: 404, body: JSON.stringify({ error: "Not found or already sent" }) };

    const lang = b.lang === "en" ? "en" : "it";
    const t = T[lang];
    const shortWhen = `${fmt(b.starts_at, lang, { day: "numeric", month: "short" })} ${fmt(b.starts_at, lang, { hour: "2-digit", minute: "2-digit" })}`;
    const mail = {
      sender: { email: sender, name: process.env.BOOKING_SENDER_NAME || "Glocal" },
      to: [{ email: b.email, name: b.name }],
      subject: t.subject(b.tour, shortWhen),
      htmlContent: html(b, t, lang),
      attachment: [{ name: "glocal.ics", content: Buffer.from(icsFile(b)).toString("base64") }],
      tags: ["booking-confirmation"],
    };
    if (process.env.BOOKING_BCC) mail.bcc = [{ email: process.env.BOOKING_BCC }];
    if (process.env.BOOKING_REPLY_TO) mail.replyTo = { email: process.env.BOOKING_REPLY_TO, name: "Glocal" };

    const send = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "api-key": apiKey },
      body: JSON.stringify(mail),
    });
    if (!send.ok) {
      console.error("Brevo send error", send.status, await send.text().catch(() => ""));
      return { statusCode: 502, body: JSON.stringify({ error: "Email not sent" }) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("booking-confirmation failed", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Unexpected error" }) };
  }
};
