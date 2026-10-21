import React, { useEffect, useMemo, useRef, useState } from "react";
import { BRAND, track } from "./shared";
import { getAttribution, trackBooking } from "./glocalTracking";
import { S, Field } from "./BookingModal";
import { SUPABASE_URL, SUPABASE_KEY, eventsEnabled } from "./events/data";
import { authHeaders } from "./events/schedule";

/* ============================================================================
   PRENOTAZIONE A DATE (tour ed esperienze con date fisse, es. Giacomo)

   Si attiva sulla card del Google Sheet con booking = sessioni.
   Le date le inserisce il partner dal portale /partner (supabase/sessions.sql).
   Il turista sceglie persone e data tra quelle con posti liberi, lascia i dati
   e la prenotazione è CONFERMATA SUBITO; paga sul posto.

   In locale (npm start):
   - se il database non ha ancora le date (sessions.sql non eseguito, o nessuna
     data inserita) si mostrano DATE DI ESEMPIO, per vedere il flusso;
   - la prenotazione è simulata: nessun posto viene scalato, nessuna email.
   ========================================================================== */

const IS_DEV = process.env.NODE_ENV !== "production";
const FORMSPREE_ENDPOINT = "https://formspree.io/f/mnpaapzq";
const TZ = "Europe/Rome";
const MAX_PEOPLE = 20;

const COPY = {
  it: {
    kicker: "Prenotazione", step1: "Data", step2: "I tuoi dati",
    people: "Persone", one: "persona", many: "persone",
    dates: "Scegli una data", loading: "Carico le date…",
    none: "Al momento non ci sono date in programma. Scrivici su WhatsApp e ti diciamo quando sarà la prossima.",
    seatsLeft: (n) => (n === 1 ? "1 posto" : `${n} posti`), full: "Completo", notEnough: "Posti insufficienti",
    perPerson: "a persona", total: "Totale", payOnSite: "si paga sul posto",
    duration: (m) => (m % 60 === 0 ? `${m / 60} h` : m > 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`),
    continue: "Continua", pick: "Scegli una data", edit: "Modifica",
    name: "Nome e cognome", email: "Email", phone: "Telefono / WhatsApp", notes: "Note", optional: "facoltativo",
    phoneHint: "Con prefisso se non hai un numero italiano (es. +44…).",
    notesPh: "Esigenze particolari, bambini, accessibilità…",
    reassure: "Nessun pagamento ora: paghi direttamente sul posto.",
    book: "Conferma prenotazione", sending: "Prenoto…",
    errRequired: "Compila nome, email e telefono.", errEmail: "Controlla l'indirizzo email.", errPhone: "Controlla il numero di telefono.",
    errSeats: "Nel frattempo i posti per questa data sono finiti. Scegline un'altra.", errSend: "Qualcosa è andato storto. Riprova tra un attimo.",
    doneTitle: "Prenotazione confermata", doneSent: "Ti abbiamo mandato la conferma a {email}. Se non la vedi, controlla anche lo spam.", doneLater: "Riceverai la conferma a {email}.",
    meet: "Punto di ritrovo", pay: "Da pagare sul posto",
    close: "Chiudi", back: "Indietro",
    devNote: "Anteprima locale: date di esempio e prenotazione simulata.",
  },
  en: {
    kicker: "Booking", step1: "Date", step2: "Your details",
    people: "Guests", one: "guest", many: "guests",
    dates: "Pick a date", loading: "Loading dates…",
    none: "No dates scheduled right now. Message us on WhatsApp and we'll tell you when the next one is.",
    seatsLeft: (n) => (n === 1 ? "1 spot" : `${n} spots`), full: "Sold out", notEnough: "Not enough spots",
    perPerson: "per person", total: "Total", payOnSite: "pay on site",
    duration: (m) => (m % 60 === 0 ? `${m / 60} h` : m > 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`),
    continue: "Continue", pick: "Pick a date", edit: "Edit",
    name: "Full name", email: "Email", phone: "Phone / WhatsApp", notes: "Notes", optional: "optional",
    phoneHint: "Include your country code if it isn't an Italian number (e.g. +44…).",
    notesPh: "Special needs, children, accessibility…",
    reassure: "No payment now: you pay on site.",
    book: "Confirm booking", sending: "Booking…",
    errRequired: "Please fill in name, email and phone.", errEmail: "Please check your email address.", errPhone: "Please check your phone number.",
    errSeats: "Spots for this date just ran out. Please pick another one.", errSend: "Something went wrong. Please try again in a moment.",
    doneTitle: "Booking confirmed", doneSent: "We've sent the confirmation to {email}. If you can't find it, check your spam folder.", doneLater: "You'll receive the confirmation at {email}.",
    meet: "Meeting point", pay: "To pay on site",
    close: "Close", back: "Back",
    devNote: "Local preview: sample dates and simulated booking.",
  },
};

/* --------------------------------- dati ----------------------------------- */
async function fetchSessions(cardId) {
  if (!eventsEnabled) throw new Error("no_db");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sessions_for_card`, {
    method: "POST",
    headers: { ...authHeaders(SUPABASE_KEY), "Content-Type": "application/json" },
    body: JSON.stringify({ p_card_id: String(cardId) }),
  });
  if (!res.ok) throw new Error(`sessions ${res.status}`);
  return res.json();
}

async function bookSession(payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/book_session`, {
    method: "POST",
    headers: { ...authHeaders(SUPABASE_KEY), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.ok) return res.json();
  const body = await res.json().catch(() => ({}));
  const err = new Error(String(body.message || res.status));
  err.code = /not_enough_seats|session_unavailable/.test(String(body.message)) ? "seats" : "send";
  throw err;
}

// date di esempio per vedere il flusso in locale
function sampleSessions() {
  const out = [];
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const plan = [[2, 10, 8, 3], [3, 17, 8, 0], [5, 10, 8, 6], [6, 10, 8, 8], [9, 17, 8, 2], [12, 10, 8, 8]];
  plan.forEach(([d, h, cap, left], i) => {
    const s = new Date(base); s.setDate(s.getDate() + d); s.setHours(h, 0, 0, 0);
    out.push({ id: `sample-${i}`, starts_at: s.toISOString(), duration_min: 150, capacity: cap, price_eur: 25, language: i % 2 ? "EN" : "IT/EN", note: null, seats_left: left });
  });
  return out;
}

const fmt = (iso, lang, opts) => new Date(iso).toLocaleString(lang === "it" ? "it-IT" : "en-GB", { timeZone: TZ, ...opts });
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const dayKey = (iso) => fmt(iso, "it", { year: "numeric", month: "2-digit", day: "2-digit" });
const dayLabel = (iso, lang) => cap(fmt(iso, lang, { weekday: "long", day: "numeric", month: "long" }));
const timeLabel = (iso, lang) => fmt(iso, lang, { hour: "2-digit", minute: "2-digit" });
const euro = (n, lang) => (n === null || n === undefined || n === "" ? "" : Number(n).toLocaleString(lang === "it" ? "it-IT" : "en-GB", { style: "currency", currency: "EUR", minimumFractionDigits: Number(n) % 1 ? 2 : 0 }));

/* ================================ MODAL =================================== */
export default function SessionBooking({ place, lang, onClose, onBack, onBooked }) {
  const c = COPY[lang] || COPY.it;
  const title = place[`title_${lang}`] || place.title_it;
  const card = place.title_it || place.id;
  const scrollRef = useRef(null);

  const [sessions, setSessions] = useState(null); // null = carico
  const [sample, setSample] = useState(false);
  const [people, setPeople] = useState(2);
  const [sel, setSel] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [mailSent, setMailSent] = useState(false);

  const load = () => {
    fetchSessions(place.id)
      .then((rows) => {
        if (IS_DEV && (!rows || rows.length === 0)) { setSample(true); setSessions(sampleSessions()); }
        else setSessions(rows || []);
      })
      .catch(() => {
        if (IS_DEV) { setSample(true); setSessions(sampleSessions()); }
        else setSessions([]);
      });
  };
  useEffect(load, [place.id]); // eslint-disable-line

  const groups = useMemo(() => {
    const g = [];
    (sessions || []).forEach((s) => {
      const k = dayKey(s.starts_at);
      const last = g[g.length - 1];
      if (last && last.key === k) last.items.push(s); else g.push({ key: k, label: dayLabel(s.starts_at, lang), items: [s] });
    });
    return g;
  }, [sessions, lang]);

  const price = sel?.price_eur ?? (sessions || []).find((s) => s.price_eur != null)?.price_eur ?? null;
  const total = price != null ? Number(price) * people : null;
  const peopleLabel = `${people} ${people === 1 ? c.one : c.many}`;
  const maxSeats = Math.min(MAX_PEOPLE, Math.max(1, ...((sessions || []).map((s) => s.seats_left))));

  const goStep = (n) => { setStep(n); setError(""); scrollRef.current?.scrollTo({ top: 0 }); };
  const setPeopleSafe = (n) => {
    const v = Math.max(1, Math.min(maxSeats, n));
    setPeople(v);
    if (sel && sel.seats_left < v) setSel(null);
  };

  const submit = async () => {
    const f = { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), notes: form.notes.trim() };
    if (!f.name || !f.email || !f.phone) { setError(c.errRequired); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) { setError(c.errEmail); return; }
    const digits = f.phone.replace(/[^0-9]/g, "");
    if (!/^[+0-9\s().-]+$/.test(f.phone) || digits.length < 8 || digits.length > 15) { setError(c.errPhone); return; }
    setError(""); setStatus("sending");
    const attrib = getAttribution();
    try {
      if (IS_DEV || sample) {
        // eslint-disable-next-line no-console
        console.info("[Glocal] Prenotazione a date (simulata in locale):", { session: sel, people, ...f });
        await new Promise((r) => setTimeout(r, 700));
      } else {
        const bookingId = await bookSession({
          p_session_id: sel.id, p_people: people, p_name: f.name, p_email: f.email, p_phone: f.phone,
          p_notes: f.notes || null, p_lang: lang, p_source: attrib.utm_source || attrib.ref || null,
        });
        // email di conferma al turista (netlify/functions/booking-confirmation.js)
        const sent = await fetch("/.netlify/functions/booking-confirmation", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking_id: bookingId }),
        }).then((r) => r.ok).catch(() => false);
        setMailSent(sent);
        // avviso a Glocal (stessa casella delle richieste ristoranti)
        fetch(FORMSPREE_ENDPOINT, {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            tipo: "PRENOTAZIONE CONFERMATA (date)", esperienza: title, data: dayLabel(sel.starts_at, "it"), orario: timeLabel(sel.starts_at, "it"),
            persone: people, totale_sul_posto: total != null ? euro(total, "it") : "", nome: f.name, email: f.email, telefono: f.phone, note: f.notes,
            lingua: lang, fonte: attrib.utm_source || "(diretto)", ref: attrib.ref || "", _replyto: f.email,
            email_conferma_turista: sent ? "inviata" : "NON INVIATA: mandala a mano",
            _subject: `Prenotazione confermata Glocal: ${title} — ${dayLabel(sel.starts_at, "it")} ${timeLabel(sel.starts_at, "it")}, ${people} pers.`,
          }),
        }).catch(() => {});
      }
      setStatus("done");
      onBooked?.();
      trackBooking(card, { event: "booking_submitted", method: "sessions", from: "session_booking" });
      track("booking_submitted", { card, people, day: dayKey(sel.starts_at), time: timeLabel(sel.starts_at, "it"), kind: "sessions" });
      scrollRef.current?.scrollTo({ top: 0 });
    } catch (e) {
      setStatus("idle");
      if (e.code === "seats") { setError(c.errSeats); setSel(null); goStep(1); setSessions(null); load(); }
      else setError(c.errSend);
    }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const address = String(place.address || "").trim();

  return (
    <div onClick={onClose} className="gl-overlay" style={S.overlay}>
      <div onClick={(e) => e.stopPropagation()} className="gl-sheet" style={S.sheet} role="dialog" aria-modal="true" aria-label={c.kicker}>
        <div style={S.header}>
          {status === "done" ? <span style={{ width: 40 }} /> : (
            <button onClick={() => (step === 2 ? goStep(1) : (onBack || onClose)())} aria-label={c.back} style={S.iconBtn}>←</button>
          )}
          <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
            <div style={S.kicker}>{c.kicker}</div>
            <div translate="no" className="notranslate" style={S.headerTitle}>{title}</div>
          </div>
          <button onClick={onClose} aria-label={c.close} style={S.iconBtn}>×</button>
        </div>

        {status !== "done" && (
          <div style={S.stepper}>
            {[c.step1, c.step2].map((label, i) => {
              const n = i + 1, on = step >= n;
              return (
                <div key={n} style={{ flex: 1 }}>
                  <div style={{ height: 4, borderRadius: 4, background: on ? BRAND.green : BRAND.border }} />
                  <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6, color: step === n ? BRAND.ink : BRAND.muted }}>{n}. {label}</div>
                </div>
              );
            })}
          </div>
        )}

        <div ref={scrollRef} style={S.body}>
          {status === "done" ? (
            <div style={{ textAlign: "center", padding: "18px 4px 8px" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(56,176,74,0.14)", color: BRAND.green, fontSize: 34, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>✓</div>
              <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 27, margin: "0 0 10px" }}>{c.doneTitle}</h3>
              <p style={{ color: "#4a463d", margin: "0 auto 18px", fontSize: 15, lineHeight: 1.55, maxWidth: 400 }}>{(mailSent ? c.doneSent : c.doneLater).replace("{email}", form.email.trim())}</p>
              <div style={{ ...S.summary, flexDirection: "column", alignItems: "stretch", textAlign: "left", gap: 10 }}>
                <div>
                  <div translate="no" className="notranslate" style={{ fontSize: 15.5, fontWeight: 700 }}>{title}</div>
                  <div style={{ fontSize: 14, color: BRAND.muted, marginTop: 3 }}>{dayLabel(sel.starts_at, lang)} · {timeLabel(sel.starts_at, lang)} · {peopleLabel}</div>
                </div>
                {address && <Row label={c.meet} value={address} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} />}
                {total != null && <Row label={c.pay} value={euro(total, lang)} />}
              </div>
              {(IS_DEV || sample) && <p style={{ fontSize: 12, color: "#a06a00", background: "#fff6dc", borderRadius: 10, padding: "8px 10px", margin: "0 auto 18px", maxWidth: 400 }}>{c.devNote}</p>}
              <button onClick={onClose} style={{ ...S.cta, background: BRAND.ink, maxWidth: 400 }}>{c.close}</button>
            </div>
          ) : step === 1 ? (
            <>
              {sample && <p style={{ fontSize: 12, color: "#a06a00", background: "#fff6dc", borderRadius: 10, padding: "8px 10px", margin: "0 0 18px" }}>{c.devNote}</p>}
              <section style={S.section}>
                <h4 style={S.label}>{c.people}</h4>
                <div style={S.peopleRow}>
                  <button onClick={() => setPeopleSafe(people - 1)} disabled={people <= 1} aria-label="−" style={{ ...S.stepBtn, opacity: people <= 1 ? 0.35 : 1 }}>−</button>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <span style={{ fontFamily: "'Fraunces', serif", fontSize: 30, fontWeight: 600 }}>{people}</span>
                    <span style={{ fontSize: 14, color: BRAND.muted, marginLeft: 8 }}>{people === 1 ? c.one : c.many}</span>
                  </div>
                  <button onClick={() => setPeopleSafe(people + 1)} disabled={people >= maxSeats} aria-label="+" style={{ ...S.stepBtn, opacity: people >= maxSeats ? 0.35 : 1 }}>+</button>
                </div>
              </section>

              <section style={{ ...S.section, marginBottom: 8 }}>
                <h4 style={S.label}>{c.dates}</h4>
                {sessions === null ? (
                  <div style={S.empty}>{c.loading}</div>
                ) : sessions.length === 0 ? (
                  <div style={S.empty}>{c.none}</div>
                ) : groups.map((g) => (
                  <div key={g.key} style={{ marginBottom: 16 }}>
                    <div style={S.groupLabel}>{g.label}</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {g.items.map((s) => {
                        const full = s.seats_left <= 0;
                        const short = !full && s.seats_left < people;
                        const disabled = full || short;
                        const on = sel?.id === s.id;
                        return (
                          <button key={s.id} disabled={disabled} onClick={() => { setSel(s); track("booking_pick_session", { card, session: s.starts_at }); }}
                            style={{
                              display: "flex", alignItems: "center", gap: 12, textAlign: "left", width: "100%", padding: "13px 14px", borderRadius: 14,
                              border: `1.5px solid ${on ? BRAND.green : BRAND.border}`, background: on ? "rgba(56,176,74,0.10)" : disabled ? "transparent" : BRAND.card,
                              opacity: disabled ? 0.5 : 1, cursor: disabled ? "default" : "pointer", fontFamily: "inherit", color: BRAND.ink,
                            }}>
                            <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 20, width: 58, flexShrink: 0 }}>{timeLabel(s.starts_at, lang)}</span>
                            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: BRAND.muted, lineHeight: 1.35 }}>
                              {c.duration(s.duration_min)}{s.language ? ` · ${s.language}` : ""}{s.note ? ` · ${s.note}` : ""}
                            </span>
                            <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: full ? BRAND.red : s.seats_left <= 3 ? "#b06f00" : BRAND.greenDark }}>
                              {full ? c.full : short ? c.notEnough : c.seatsLeft(s.seats_left)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>
            </>
          ) : (
            <>
              <div style={S.summary}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700 }}>{dayLabel(sel.starts_at, lang)}</div>
                  <div style={{ fontSize: 14, color: BRAND.muted, marginTop: 3 }}>{timeLabel(sel.starts_at, lang)} · {peopleLabel}{total != null ? ` · ${euro(total, lang)}` : ""}</div>
                </div>
                <button onClick={() => goStep(1)} style={S.linkBtn}>{c.edit}</button>
              </div>
              <Field label={c.name}><input style={S.inp} value={form.name} onChange={set("name")} autoComplete="name" /></Field>
              <Field label={c.email}><input style={S.inp} type="email" inputMode="email" value={form.email} onChange={set("email")} autoComplete="email" /></Field>
              <Field label={c.phone} hint={c.phoneHint}><input style={S.inp} type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" /></Field>
              <Field label={<>{c.notes} <span style={{ fontWeight: 500, color: BRAND.muted }}>({c.optional})</span></>}>
                <textarea style={{ ...S.inp, minHeight: 70, resize: "vertical" }} value={form.notes} onChange={set("notes")} placeholder={c.notesPh} />
              </Field>
              <div style={S.reassure}><span style={{ fontSize: 16 }}>✓</span><span>{c.reassure}</span></div>
            </>
          )}
        </div>

        {status !== "done" && (
          <div style={S.footer}>
            {error && <p style={{ color: BRAND.red, fontSize: 13.5, fontWeight: 600, margin: "0 0 10px" }}>{error}</p>}
            {total != null && step === 1 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, fontSize: 14 }}>
                <span style={{ color: BRAND.muted }}>{euro(price, lang)} {c.perPerson} × {people}</span>
                <span><b style={{ fontSize: 17 }}>{euro(total, lang)}</b> <span style={{ color: BRAND.muted, fontSize: 12.5 }}>· {c.payOnSite}</span></span>
              </div>
            )}
            {step === 1 ? (
              <button onClick={() => { track("booking_step_details", { card, kind: "sessions" }); goStep(2); }} disabled={!sel}
                style={{ ...S.cta, background: sel ? BRAND.red : "#d9d3c4", cursor: sel ? "pointer" : "default" }}>
                {sel ? c.continue : c.pick}
              </button>
            ) : (
              <button onClick={submit} disabled={status === "sending"} style={{ ...S.cta, background: BRAND.red, opacity: status === "sending" ? 0.7 : 1 }}>
                {status === "sending" ? c.sending : c.book}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, href }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, borderTop: `1px solid ${BRAND.border}`, paddingTop: 10 }}>
      <span style={{ color: BRAND.muted }}>{label}</span>
      {href ? <a href={href} target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: BRAND.ink, textAlign: "right" }}>{value}</a> : <b style={{ textAlign: "right" }}>{value}</b>}
    </div>
  );
}
