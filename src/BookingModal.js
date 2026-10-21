import React, { useMemo, useRef, useState } from "react";
import { BRAND, track } from "./shared";
import { getAttribution, trackBooking } from "./glocalTracking";

/* ============================================================================
   RICHIESTA DI PRENOTAZIONE
   Tutto passa da Glocal: l'utente sceglie persone, giorno e orario e lascia i
   suoi dati. La richiesta arriva a noi (Formspree) e siamo noi a contattare il
   locale; poi confermiamo all'utente via email.

   ORARI: seguono gli orari di apertura Google (colonna "orari"), vedi sotto.
   Non è la disponibilità reale dei tavoli: è una richiesta, confermata dopo.

   SCONTO: colonna "sconto" del Google Sheet, solo il numero (es. 10 = -10%).
   Vuota o 0 = nessuno sconto mostrato. Da compilare solo per i locali con
   cui lo sconto è stato concordato.

   In locale (npm start) la richiesta NON viene inviata a Formspree: si simula
   l'invio, così si può provare il flusso senza far partire email vere.
   ========================================================================== */

const FORMSPREE_ENDPOINT = "https://formspree.io/f/mnpaapzq";
const IS_DEV = process.env.NODE_ENV !== "production";
const MAX_PEOPLE = 12;
const DAYS_AHEAD = 30;

const COPY = {
  it: {
    kicker: "Richiesta di prenotazione",
    discount: "-{n}% prenotando con Glocal", discountSub: "Lo sconto è riservato a chi prenota con Glocal: ti verrà applicato direttamente in loco.", discountShort: "Sconto Glocal -{n}%",
    step1: "Quando", step2: "I tuoi dati",
    people: "Persone", peopleOne: "persona", peopleMany: "persone",
    bigGroup: "Più di 12 persone? Scrivici su WhatsApp e organizziamo noi.",
    day: "Giorno", time: "Orario",
    today: "Oggi", tomorrow: "Domani",
    pickDay: "Scegli un giorno per vedere gli orari",
    noSlots: "Nessun orario disponibile in questo giorno. Prova un altro giorno.",
    continue: "Continua", pickTime: "Scegli un orario",
    edit: "Modifica",
    name: "Nome e cognome", email: "Email", phone: "Telefono / WhatsApp", optional: "facoltativo",
    phoneHint: "Con prefisso se non hai un numero italiano (es. +44…).",
    notes: "Richieste particolari", notesPh: "Allergie, seggiolone, un'occasione speciale…",
    reassurance: "Nessun pagamento. È una richiesta di prenotazione: riceverai la conferma via email.",
    send: "Invia richiesta", sending: "Invio…",
    errRequired: "Compila nome, email e telefono.", errEmail: "Controlla l'indirizzo email.", errPhone: "Controlla il numero di telefono.", errSend: "Qualcosa è andato storto. Riprova tra un attimo.",
    doneTitle: "Richiesta inviata",
    doneBody: "Riceverai la conferma della prenotazione a {email}, di solito entro 24 ore.",
    doneNote: "Non è ancora una conferma: tieni d'occhio la tua email (anche lo spam).",
    close: "Chiudi", back: "Indietro",
    groups: { lunch: "Pranzo", dinner: "Cena", aperitivo: "Aperitivo", evening: "Sera", morning: "Mattina", afternoon: "Pomeriggio" },
    devNote: "Anteprima locale: la richiesta non è stata inviata davvero.",
  },
  en: {
    kicker: "Booking request",
    discount: "-{n}% when you book with Glocal", discountSub: "This discount is reserved for Glocal bookings and will be applied directly on site.", discountShort: "Glocal discount -{n}%",
    step1: "When", step2: "Your details",
    people: "Guests", peopleOne: "guest", peopleMany: "guests",
    bigGroup: "More than 12 people? Message us on WhatsApp and we'll arrange it.",
    day: "Day", time: "Time",
    today: "Today", tomorrow: "Tomorrow",
    pickDay: "Pick a day to see times",
    noSlots: "No times available on this day. Try another one.",
    continue: "Continue", pickTime: "Pick a time",
    edit: "Edit",
    name: "Full name", email: "Email", phone: "Phone / WhatsApp", optional: "optional",
    phoneHint: "Include your country code if it isn't an Italian number (e.g. +44…).",
    notes: "Special requests", notesPh: "Allergies, high chair, a special occasion…",
    reassurance: "No payment. This is a booking request: you'll receive the confirmation by email.",
    send: "Send request", sending: "Sending…",
    errRequired: "Please fill in name, email and phone.", errEmail: "Please check your email address.", errPhone: "Please check your phone number.", errSend: "Something went wrong. Please try again in a moment.",
    doneTitle: "Request sent",
    doneBody: "You'll receive your booking confirmation at {email}, usually within 24 hours.",
    doneNote: "Not a confirmation yet: keep an eye on your inbox (and spam).",
    close: "Close", back: "Back",
    groups: { lunch: "Lunch", dinner: "Dinner", aperitivo: "Aperitivo", evening: "Evening", morning: "Morning", afternoon: "Afternoon" },
    devNote: "Local preview: the request was not actually sent.",
  },
};

/* --------------------------------- sconto --------------------------------- */
// "10", "10%", "-10" -> 10. Vuoto, 0 o valori strani -> 0 (nessuno sconto).
export function getDiscount(place) {
  const n = Math.abs(parseFloat(String(place?.sconto ?? "").replace(",", ".").replace(/[^0-9.\-]/g, "")));
  return Number.isFinite(n) && n > 0 && n < 100 ? Math.round(n) : 0;
}

/* -------------------------------- orari --------------------------------- */
// Gli slot seguono gli orari di apertura sincronizzati da Google (colonna
// "orari": una riga per giorno, es. "lunedì: 12:00–15:00, 19:00–23:00" o
// "martedì: Chiuso"). Fasce ogni 30 minuti, l'ultima almeno 1 ora prima della
// chiusura. Per i posti "cibo" si tengono solo gli slot nelle fasce pasto
// (pranzo 12–15, cena 19–23), se il locale è aperto in quelle ore.
// Se "orari" manca, o il giorno non si riesce a leggere, o è aperto 24 ore,
// si usano le fasce standard per tipo di posto.
const hasInterest = (p, id) => String(p.interests || "").split(",").map((s) => s.trim()).includes(id);
const IT_DAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const EN_DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const STEP = 30;
const LAST_SLOT_BEFORE_CLOSE = 60;
const MEAL_WINDOWS = [[12 * 60, 15 * 60], [19 * 60, 23 * 60]];

const toMin = (h, m) => Number(h) * 60 + Number(m);
const label = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function category(place) {
  if (hasInterest(place, "food")) return "food";
  if (hasInterest(place, "drink")) return "drink";
  return "other";
}

// fasce standard (posti senza orari Google)
function fallbackTimes(cat) {
  const r = (a, b) => { const out = []; for (let m = a; m <= b; m += STEP) out.push(m); return out; };
  if (cat === "food") return [...r(toMin(12, 0), toMin(14, 30)), ...r(toMin(19, 0), toMin(22, 0))];
  if (cat === "drink") return [...r(toMin(18, 0), toMin(23, 0))];
  return [...r(toMin(10, 0), toMin(12, 30)), ...r(toMin(15, 0), toMin(18, 0))];
}

// "closed" | "unknown" | [{start, end}] (minuti, end può superare 24:00)
function rangesForDay(orari, date) {
  const rows = String(orari || "").split("\n").map((r) => r.trim()).filter(Boolean);
  if (!rows.length) return "unknown";
  const names = [IT_DAYS[date.getDay()], EN_DAYS[date.getDay()]];
  const line = rows.find((r) => { const low = r.toLowerCase().replace(/^[^a-zà-ù]+/, ""); return names.some((n) => low.startsWith(n)); });
  if (!line) return "unknown";
  const low = line.toLowerCase();
  if (low.includes("24 ore") || low.includes("24 hours")) return "unknown";
  const ranges = [];
  const re = /(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/g;
  let m;
  while ((m = re.exec(line))) {
    const start = toMin(m[1], m[2]);
    let end = toMin(m[3], m[4]);
    if (end <= start) end += 24 * 60; // fascia oltre la mezzanotte
    ranges.push({ start, end });
  }
  if (ranges.length) return ranges;
  return low.includes("chius") || low.includes("closed") ? "closed" : "unknown";
}

function timesFromRanges(ranges, cat) {
  const all = [];
  ranges.forEach(({ start, end }) => {
    for (let t = Math.ceil(start / STEP) * STEP; t <= end - LAST_SLOT_BEFORE_CLOSE; t += STEP) all.push(t);
  });
  const uniq = [...new Set(all)].sort((a, b) => a - b);
  if (cat !== "food") return uniq;
  const meals = uniq.filter((t) => MEAL_WINDOWS.some(([a, b]) => t >= a && t <= b - LAST_SLOT_BEFORE_CLOSE + STEP));
  return meals.length ? meals : uniq; // aperto solo fuori dagli orari pasto: mostra comunque gli orari veri
}

function groupOf(t, cat) {
  const h = (t % (24 * 60)) / 60;
  const late = t >= 24 * 60;
  if (cat === "food") return h < 17 && !late ? "lunch" : "dinner";
  if (cat === "drink") return late || h >= 21 ? "evening" : h >= 17 ? "aperitivo" : h < 12 ? "morning" : "afternoon";
  return late || h >= 19 ? "evening" : h < 13 ? "morning" : "afternoon";
}

function slotsFor(place, date) {
  const cat = category(place);
  const ranges = rangesForDay(place.orari, date);
  if (ranges === "closed") return [];
  const times = ranges === "unknown" ? fallbackTimes(cat) : timesFromRanges(ranges, cat);

  const now = new Date();
  const isToday = toIso(date) === toIso(now);
  const minMinutes = now.getHours() * 60 + now.getMinutes() + 90; // oggi: almeno 1h30 di preavviso
  const usable = isToday ? times.filter((t) => t >= minMinutes) : times;

  const order = ["morning", "lunch", "afternoon", "aperitivo", "dinner", "evening"];
  const byGroup = {};
  usable.forEach((t) => { const g = groupOf(t, cat); (byGroup[g] = byGroup[g] || []).push({ time: label(t) }); });
  return order.filter((g) => byGroup[g]).map((g) => ({ group: g, slots: byGroup[g] }));
}

/* ------------------------------ date helpers ------------------------------ */
function toIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmt(d, lang, opts) { return d.toLocaleDateString(lang === "it" ? "it-IT" : "en-GB", opts); }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function longDate(d, lang) { return cap(fmt(d, lang, { weekday: "long", day: "numeric", month: "long" })); }
function shortDate(d, lang) { return cap(fmt(d, lang, { weekday: "short", day: "numeric", month: "short" })).replace(/\./g, ""); }

/* ================================ MODAL =================================== */
export default function BookingModal({ place, lang, onClose, onBack, onBooked }) {
  const c = COPY[lang] || COPY.it;
  const title = place[`title_${lang}`] || place.title_it;
  const card = place.title_it || place.id;

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const days = useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i)), [today]);

  const [step, setStep] = useState(1);
  const [people, setPeople] = useState(2);
  const [day, setDay] = useState(null);
  const [time, setTime] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [status, setStatus] = useState("idle"); // idle | sending | done
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  const groups = useMemo(() => (day ? slotsFor(place, day) : []), [place, day]);
  // un giorno si può scegliere se ha almeno un orario (oggi: solo se non è troppo tardi)
  const dayHasSlots = (d) => slotsFor(place, d).length > 0;
  const discount = getDiscount(place);

  const peopleLabel = `${people} ${people === 1 ? c.peopleOne : c.peopleMany}`;
  const recap = day && time ? `${shortDate(day, lang)} · ${time} · ${peopleLabel}` : null;

  const goStep = (n) => { setStep(n); setError(""); scrollRef.current?.scrollTo({ top: 0 }); };

  const pickDay = (d) => {
    setDay(d); setTime(null);
    track("booking_pick_day", { card, day: toIso(d) });
  };
  const pickTime = (tm) => { setTime(tm); track("booking_pick_time", { card, time: tm }); };

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) { setError(c.errRequired); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError(c.errEmail); return; }
    const digits = form.phone.replace(/[^0-9]/g, "");
    if (!/^[+0-9\s().-]+$/.test(form.phone.trim()) || digits.length < 8 || digits.length > 15) { setError(c.errPhone); return; }
    setError("");
    setStatus("sending");
    const attrib = getAttribution();
    const payload = {
      esperienza: title,
      nome: form.name.trim(),
      email: form.email.trim(),
      telefono: form.phone.trim(),
      persone: people,
      data: toIso(day),
      data_leggibile: longDate(day, "it"),
      orario: time,
      note: form.notes.trim(),
      sconto: discount ? `-${discount}%` : "nessuno",
      lingua: lang,
      fonte: attrib.utm_source || "(diretto)",
      campagna: attrib.utm_campaign || "",
      annuncio: attrib.utm_content || "",
      ref: attrib.ref || "",
      _replyto: form.email.trim(),
      _subject: `Richiesta prenotazione Glocal: ${title} — ${shortDate(day, "it")} ${time}, ${people} pers.${discount ? ` (sconto -${discount}%)` : ""}`,
    };
    try {
      let ok = true;
      if (IS_DEV) {
        // eslint-disable-next-line no-console
        console.info("[Glocal] Richiesta di prenotazione (simulata in locale):", payload);
        await new Promise((r) => setTimeout(r, 700));
      } else {
        const res = await fetch(FORMSPREE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
        });
        ok = res.ok;
      }
      if (!ok) throw new Error("send failed");
      setStatus("done");
      onBooked?.();
      trackBooking(card, { event: "booking_submitted", method: "request", from: "booking_modal" });
      track("booking_submitted", { card, people, day: toIso(day), time });
      scrollRef.current?.scrollTo({ top: 0 });
    } catch {
      setStatus("idle");
      setError(c.errSend);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  /* ------------------------------- render -------------------------------- */
  return (
    <div onClick={onClose} className="gl-overlay" style={S.overlay}>
      <div onClick={(e) => e.stopPropagation()} className="gl-sheet" style={S.sheet} role="dialog" aria-modal="true" aria-label={c.kicker}>

        {/* HEADER */}
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
              const n = i + 1, active = step === n, doneStep = step > n;
              return (
                <div key={n} style={{ flex: 1 }}>
                  <div style={{ height: 4, borderRadius: 4, background: active || doneStep ? BRAND.green : BRAND.border, transition: "background .2s" }} />
                  <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6, color: active ? BRAND.ink : BRAND.muted }}>{n}. {label}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* BODY */}
        <div ref={scrollRef} style={S.body}>
          {status === "done" ? (
            <Done c={c} discount={discount} title={title} email={form.email.trim()} day={day} time={time} peopleLabel={peopleLabel} lang={lang} onClose={onClose} />
          ) : step === 1 ? (
            <>
              {discount > 0 && (
                <div style={S.discount}>
                  <span style={S.discountBadge}>-{discount}%</span>
                  <div>
                    <div style={{ fontSize: 14.5, fontWeight: 700 }}>{c.discount.replace("{n}", discount)}</div>
                    <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 2, lineHeight: 1.4 }}>{c.discountSub}</div>
                  </div>
                </div>
              )}
              {/* PERSONE */}
              <section style={S.section}>
                <h4 style={S.label}>{c.people}</h4>
                <div style={S.peopleRow}>
                  <button onClick={() => setPeople((p) => Math.max(1, p - 1))} disabled={people <= 1} aria-label="−" style={{ ...S.stepBtn, opacity: people <= 1 ? 0.35 : 1 }}>−</button>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <span style={{ fontFamily: "'Fraunces', serif", fontSize: 30, fontWeight: 600 }}>{people}</span>
                    <span style={{ fontSize: 14, color: BRAND.muted, marginLeft: 8 }}>{people === 1 ? c.peopleOne : c.peopleMany}</span>
                  </div>
                  <button onClick={() => setPeople((p) => Math.min(MAX_PEOPLE, p + 1))} disabled={people >= MAX_PEOPLE} aria-label="+" style={{ ...S.stepBtn, opacity: people >= MAX_PEOPLE ? 0.35 : 1 }}>+</button>
                </div>
                {people >= MAX_PEOPLE && <p style={S.hint}>{c.bigGroup}</p>}
              </section>

              {/* GIORNO */}
              <section style={S.section}>
                <h4 style={S.label}>{c.day}{day && <span style={S.labelValue}> · {longDate(day, lang)}</span>}</h4>
                <div style={S.dayStrip} className="gl-noscrollbar">
                  {days.map((d, i) => {
                    const selected = day && toIso(d) === toIso(day);
                    const available = dayHasSlots(d);
                    const top = i === 0 ? c.today : i === 1 ? c.tomorrow : cap(fmt(d, lang, { weekday: "short" }).replace(".", ""));
                    return (
                      <button key={toIso(d)} onClick={() => available && pickDay(d)} disabled={!available}
                        style={{
                          ...S.dayChip,
                          background: selected ? BRAND.ink : BRAND.card,
                          color: selected ? "#fff" : BRAND.ink,
                          borderColor: selected ? BRAND.ink : BRAND.border,
                          opacity: available ? 1 : 0.4,
                          cursor: available ? "pointer" : "default",
                        }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", opacity: selected ? 0.85 : 0.65 }}>{top}</span>
                        <span style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, lineHeight: 1.1, margin: "2px 0" }}>{d.getDate()}</span>
                        <span style={{ fontSize: 11.5, fontWeight: 600, opacity: selected ? 0.85 : 0.65 }}>{fmt(d, lang, { month: "short" }).replace(".", "")}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* ORARIO */}
              <section style={{ ...S.section, marginBottom: 8 }}>
                <h4 style={S.label}>{c.time}</h4>
                {!day ? (
                  <div style={S.empty}>{c.pickDay}</div>
                ) : groups.length === 0 ? (
                  <div style={S.empty}>{c.noSlots}</div>
                ) : groups.map((g) => (
                  <div key={g.group} style={{ marginBottom: 16 }}>
                    <div style={S.groupLabel}>{c.groups[g.group]}</div>
                    <div style={S.slotGrid}>
                      {g.slots.map((s) => {
                        const selected = time === s.time;
                        return (
                          <button key={s.time} onClick={() => pickTime(s.time)}
                            style={{
                              ...S.slot,
                              background: selected ? BRAND.green : BRAND.card,
                              color: selected ? "#fff" : BRAND.ink,
                              borderColor: selected ? BRAND.green : BRAND.border,
                            }}>
                            {s.time}
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
              {/* RIEPILOGO */}
              <div style={S.summary}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700 }}>{longDate(day, lang)}</div>
                  <div style={{ fontSize: 14, color: BRAND.muted, marginTop: 3 }}>{c.time} {time} · {peopleLabel}</div>
                  {discount > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.greenDark, marginTop: 5 }}>{c.discountShort.replace("{n}", discount)}</div>}
                </div>
                <button onClick={() => goStep(1)} style={S.linkBtn}>{c.edit}</button>
              </div>

              <Field label={c.name}><input style={S.inp} value={form.name} onChange={set("name")} autoComplete="name" /></Field>
              <Field label={c.email}><input style={S.inp} type="email" inputMode="email" value={form.email} onChange={set("email")} autoComplete="email" /></Field>
              <Field label={c.phone} hint={c.phoneHint}>
                <input style={S.inp} type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" />
              </Field>
              <Field label={<>{c.notes} <span style={{ fontWeight: 500, color: BRAND.muted }}>({c.optional})</span></>}>
                <textarea style={{ ...S.inp, minHeight: 74, resize: "vertical" }} value={form.notes} onChange={set("notes")} placeholder={c.notesPh} />
              </Field>

              <div style={S.reassure}>
                <span style={{ fontSize: 16 }}>✓</span>
                <span>{c.reassurance}</span>
              </div>
            </>
          )}
        </div>

        {/* FOOTER */}
        {status !== "done" && (
          <div style={S.footer}>
            {error && <p style={{ color: BRAND.red, fontSize: 13.5, fontWeight: 600, margin: "0 0 10px" }}>{error}</p>}
            {step === 1 ? (
              <>
                {recap && <div style={S.recap}>{recap}</div>}
                <button onClick={() => { track("booking_step_details", { card }); goStep(2); }} disabled={!time}
                  style={{ ...S.cta, background: time ? BRAND.red : "#d9d3c4", cursor: time ? "pointer" : "default" }}>
                  {time ? c.continue : c.pickTime}
                </button>
              </>
            ) : (
              <button onClick={submit} disabled={status === "sending"} style={{ ...S.cta, background: BRAND.red, opacity: status === "sending" ? 0.7 : 1 }}>
                {status === "sending" ? c.sending : c.send}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Done({ c, discount, title, email, day, time, peopleLabel, lang, onClose }) {
  return (
    <div style={{ textAlign: "center", padding: "18px 4px 8px" }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(56,176,74,0.14)", color: BRAND.green, fontSize: 34, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>✓</div>
      <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 27, margin: "0 0 18px" }}>{c.doneTitle}</h3>
      <div style={{ ...S.summary, textAlign: "left", marginBottom: 18 }}>
        <div>
          <div translate="no" className="notranslate" style={{ fontSize: 15.5, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 14, color: BRAND.muted, marginTop: 3 }}>{longDate(day, lang)} · {time} · {peopleLabel}</div>
          {discount > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.greenDark, marginTop: 5 }}>{c.discountShort.replace("{n}", discount)}</div>}
        </div>
      </div>
      <p style={{ color: "#4a463d", margin: "0 auto 10px", fontSize: 15, lineHeight: 1.55, maxWidth: 400 }}>
        {c.doneBody.replace("{title}", title).replace("{email}", email)}
      </p>
      <p style={{ color: BRAND.muted, margin: "0 auto 22px", fontSize: 13.5, lineHeight: 1.5, maxWidth: 400 }}>{c.doneNote}</p>
      {IS_DEV && <p style={{ fontSize: 12, color: "#a06a00", background: "#fff6dc", borderRadius: 10, padding: "8px 10px", margin: "0 auto 18px", maxWidth: 400 }}>{c.devNote}</p>}
      <button onClick={onClose} style={{ ...S.cta, background: BRAND.ink, maxWidth: 400 }}>{c.close}</button>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6, color: "#3a3630" }}>{label}</span>
      {children}
      {hint && <span style={{ display: "block", fontSize: 12.5, color: BRAND.muted, marginTop: 6 }}>{hint}</span>}
    </label>
  );
}

/* --------------------------------- stili ---------------------------------- */
const S = {
  overlay: { position: "fixed", inset: 0, background: "rgba(26,20,12,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 90 },
  sheet: { background: BRAND.bg, width: "100%", maxWidth: 540, borderRadius: "22px 22px 0 0", maxHeight: "92vh", height: "92vh", boxShadow: "0 -10px 50px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column", overflow: "hidden" },
  header: { display: "flex", alignItems: "center", gap: 8, padding: "14px 14px 10px" },
  iconBtn: { width: 40, height: 40, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(26,20,12,0.07)", border: "none", borderRadius: "50%", fontSize: 22, cursor: "pointer", color: BRAND.ink, lineHeight: 1, fontFamily: "inherit" },
  kicker: { fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.14em", color: BRAND.green, fontWeight: 700 },
  headerTitle: { fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 19, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  stepper: { display: "flex", gap: 10, padding: "4px 20px 14px", borderBottom: `1px solid ${BRAND.border}` },
  body: { flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "20px 20px 12px" },
  section: { marginBottom: 26 },
  label: { fontSize: 12.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: BRAND.muted, margin: "0 0 12px" },
  labelValue: { textTransform: "none", letterSpacing: 0, color: BRAND.ink, fontSize: 13.5 },
  hint: { fontSize: 13, color: BRAND.muted, margin: "10px 0 0" },
  peopleRow: { display: "flex", alignItems: "center", background: BRAND.card, border: `1.5px solid ${BRAND.border}`, borderRadius: 16, padding: 8 },
  stepBtn: { width: 46, height: 46, borderRadius: 12, border: `1.5px solid ${BRAND.border}`, background: BRAND.bg, fontSize: 24, fontWeight: 600, cursor: "pointer", color: BRAND.ink, fontFamily: "inherit", lineHeight: 1 },
  dayStrip: { display: "flex", gap: 8, overflowX: "auto", margin: "0 -20px", padding: "2px 20px 6px", scrollSnapType: "x proximity", scrollbarWidth: "none" },
  dayChip: { flex: "0 0 auto", width: 64, display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0", borderRadius: 14, border: "1.5px solid", fontFamily: "inherit", scrollSnapAlign: "start", transition: "background .15s, color .15s" },
  empty: { background: BRAND.card, border: `1.5px dashed ${BRAND.border}`, borderRadius: 14, padding: "18px 16px", fontSize: 14, color: BRAND.muted, textAlign: "center" },
  groupLabel: { fontSize: 13.5, fontWeight: 700, margin: "0 0 8px" },
  slotGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(76px, 1fr))", gap: 8 },
  slot: { position: "relative", padding: "12px 0", borderRadius: 12, border: "1.5px solid", fontSize: 15, fontWeight: 700, fontFamily: "inherit", transition: "background .15s, color .15s" },
  discount: { display: "flex", alignItems: "center", gap: 12, background: "rgba(56,176,74,0.10)", border: `1.5px solid ${BRAND.green}`, color: BRAND.greenDark, borderRadius: 16, padding: "12px 14px", marginBottom: 22 },
  discountBadge: { flexShrink: 0, background: BRAND.green, color: "#fff", fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 18, borderRadius: 12, padding: "8px 10px" },
  summary: { display: "flex", alignItems: "center", gap: 12, background: BRAND.card, border: `1.5px solid ${BRAND.border}`, borderRadius: 16, padding: "14px 16px", marginBottom: 22 },
  linkBtn: { background: "none", border: "none", color: BRAND.green, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 6 },
  inp: { width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: `1.5px solid ${BRAND.border}`, background: BRAND.card, fontSize: 16, fontFamily: "inherit", color: BRAND.ink, outline: "none" },
  reassure: { display: "flex", gap: 10, alignItems: "flex-start", background: "rgba(56,176,74,0.08)", borderRadius: 14, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.5, color: BRAND.greenDark, fontWeight: 600 },
  footer: { padding: "12px 20px calc(14px + env(safe-area-inset-bottom, 0px))", borderTop: `1px solid ${BRAND.border}`, background: BRAND.bg },
  recap: { fontSize: 13.5, fontWeight: 700, color: BRAND.ink, textAlign: "center", marginBottom: 10 },
  cta: { width: "100%", color: "#fff", border: "none", borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
