/* ============================================================================
   EVENTI — popup locandine + riga "Eventi" in Home
   ----------------------------------------------------------------------------
   Popup a foglio dal basso (come gli altri pannelli dell'app) con le
   locandine che scorrono di lato (swipe). Sotto ogni locandina: data, titolo,
   luogo e tre pulsanti minimal:
     📅 Calendario  -> Google Calendar oppure file .ics (iPhone / Outlook)
     📍 Itinerario  -> aggiunge l'evento all'itinerario dell'app
     ↗  Info        -> link dell'evento; se manca, la scheda del locale
   ============================================================================ */
import React, { useEffect, useRef, useState } from "react";
import { BRAND, track } from "../shared";
import { whenLabel, nextDateLabel, googleCalendarUrl, buildIcs, hhmm } from "./schedule";

export const EV_T = {
  it: {
    kicker: "Eventi", title: "In città", close: "Chiudi",
    calendar: "Calendario", itin: "Itinerario", inItin: "Aggiunto", info: "Info", share: "Condividi",
    shareText: (title, when, place, url) => `${title}\n${[when, place].filter(Boolean).join(" · ")}\n\nL'ho trovato su Glocal 👉 ${url}`,
    google: "Google Calendar", ics: "Apple · Outlook",
    stripTitle: "Eventi in città", stripSub: (n) => (n === 1 ? "1 evento nei prossimi giorni" : `${n} eventi nei prossimi giorni`),
    stripCta: "Vedi", tickerOpen: "Apri", of: "di",
  },
  en: {
    kicker: "Events", title: "In town", close: "Close",
    calendar: "Calendar", itin: "Itinerary", inItin: "Added", info: "Info", share: "Share",
    shareText: (title, when, place, url) => `${title}\n${[when, place].filter(Boolean).join(" · ")}\n\nFound it on Glocal 👉 ${url}`,
    google: "Google Calendar", ics: "Apple · Outlook",
    stripTitle: "Events in town", stripSub: (n) => (n === 1 ? "1 event in the coming days" : `${n} events in the coming days`),
    stripCta: "See", tickerOpen: "Open", of: "of",
  },
};

const cardName = (ev) => ev.title_it || ev.eventId;

/* ------------------------------ icone ------------------------------------ */
const Svg = ({ children, size = 20, color = "currentColor", fill = "none" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}>{children}</svg>
);
const CalIcon = (p) => <Svg {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="M12 13.2v4.6M9.7 15.5h4.6" /></Svg>;
const PinIcon = ({ filled, ...p }) => <Svg {...p}><path d="M12 21.5s-7-6.1-7-11.5a7 7 0 0 1 14 0c0 5.4-7 11.5-7 11.5Z" fill={filled ? p.color : "none"} /><circle cx="12" cy="10" r="2.6" fill={filled ? "#fff" : "none"} stroke={filled ? "none" : p.color} /></Svg>;
const WaIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}>
    <path d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1 0 12 2.5Z" fill="#25D366" />
    <path d="M9.1 7.6c-.2-.5-.4-.5-.6-.5h-.5c-.2 0-.5.1-.7.3-.3.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.9 4.5 4 2.2.9 2.7.7 3.2.7s1.5-.6 1.7-1.2c.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3l-1.7-.8c-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.3-.1-1.1-.4-2-1.3-.8-.7-1.3-1.5-1.4-1.8-.2-.3 0-.4.1-.5l.4-.5.3-.4v-.5l-.8-2Z" fill="#fff" />
  </svg>
);
const OutIcon = (p) => <Svg {...p}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></Svg>;

/* ------------------------------ calendario -------------------------------- */
function calendarTexts(ev, lang) {
  const title = ev[`title_${lang}`] || ev.title_it;
  const location = [ev.location, ev.address].filter(Boolean).join(", ");
  const details = [ev[`desc_${lang}`], ev.link_url].filter(Boolean).join("\n\n");
  return { title, location, details };
}

// In produzione (Netlify) il .ics lo genera la funzione /.netlify/functions/ics,
// che l'iPhone apre direttamente con "Aggiungi al calendario". In anteprima
// locale (npm start) le funzioni Netlify non girano: lo generiamo nel browser.
function openIcs(ev, lang) {
  if (process.env.NODE_ENV === "production") {
    window.location.href = `/.netlify/functions/ics?id=${ev.eventId}&d=${ev.occ?.date || ev.start_date}&lang=${lang}`;
    return;
  }
  const texts = calendarTexts(ev, lang);
  const blob = new Blob([buildIcs(ev, ev.occ?.date, { ...texts, url: ev.link_url || undefined, uid: ev.eventId })], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "glocal-evento.ics";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ------------------------------ condividi --------------------------------- */
// Apre WhatsApp con titolo, data, luogo e un link che riapre l'app
// direttamente su questo evento (?event=<id>).
function shareOnWhatsApp(ev, lang) {
  const t = EV_T[lang] || EV_T.it;
  const title = ev[`title_${lang}`] || ev.title_it;
  const url = `${window.location.origin}/?event=${ev.eventId}`;
  const text = t.shareText(title, whenLabel(ev, lang), ev.location, url);
  track("share_event", { card: cardName(ev), method: "whatsapp" });
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

/* ------------------------------ popup ------------------------------------- */
export function EventsPopup({ events, focusId, lang, itinerary, onToggleItin, onOpenCard, onClose }) {
  const t = EV_T[lang] || EV_T.it;
  const rowRef = useRef(null);
  const [idx, setIdx] = useState(0);
  const [calFor, setCalFor] = useState(null); // id evento con il menu calendario aperto
  const [openDesc, setOpenDesc] = useState(null); // id evento con la descrizione espansa
  const seen = useRef(new Set());

  // all'apertura: se arriviamo da un evento preciso (es. dall'itinerario) partiamo da quello
  useEffect(() => {
    const i = Math.max(0, events.findIndex((e) => e.id === focusId));
    const el = rowRef.current?.children[i];
    if (el && i > 0) rowRef.current.scrollLeft = el.offsetLeft - (rowRef.current.clientWidth - el.clientWidth) / 2;
    setIdx(i);
  }, []);

  // traccia su GA4 ogni locandina vista (una volta per apertura)
  useEffect(() => {
    const ev = events[idx];
    if (ev && !seen.current.has(ev.id)) { seen.current.add(ev.id); track("view_event", { card: cardName(ev) }); }
  }, [idx, events]);

  // chiusura con Esc
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onScroll = () => {
    const row = rowRef.current; if (!row) return;
    const center = row.scrollLeft + row.clientWidth / 2;
    let best = 0, dist = Infinity;
    Array.from(row.children).forEach((c, i) => { const d = Math.abs(c.offsetLeft + c.clientWidth / 2 - center); if (d < dist) { dist = d; best = i; } });
    if (best !== idx) { setIdx(best); setCalFor(null); }
  };
  const goTo = (i) => { const c = rowRef.current?.children[i]; if (c) c.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); };

  return (
    <div className="gl-ev-overlay" onClick={onClose}>
      <EventsStyles />
      <div className="gl-ev-sheet" onClick={(e) => { e.stopPropagation(); setCalFor(null); }} role="dialog" aria-modal="true" aria-label={t.title}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "18px 18px 12px" }}>
          <div>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.14em", color: BRAND.green, fontWeight: 700 }}>{t.kicker}</div>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 25, margin: "2px 0 0", letterSpacing: "-0.02em", lineHeight: 1.1 }}>{t.title}</h3>
          </div>
          <button onClick={onClose} aria-label={t.close} className="gl-ev-x">×</button>
        </div>

        <div style={{ position: "relative" }}>
        {events.length > 1 && idx > 0 && <button className="gl-ev-arrow left" aria-label="←" onClick={(e) => { e.stopPropagation(); goTo(idx - 1); }}>‹</button>}
        {events.length > 1 && idx < events.length - 1 && <button className="gl-ev-arrow right" aria-label="→" onClick={(e) => { e.stopPropagation(); goTo(idx + 1); }}>›</button>}
        <div ref={rowRef} onScroll={onScroll} className="gl-ev-row">
          {events.map((ev) => {
            const inItin = itinerary.includes(ev.id);
            const title = ev[`title_${lang}`] || ev.title_it;
            const hasPlace = Boolean(ev.address || (ev.lat && ev.lng));
            const canInfo = Boolean(ev.link_url || ev.card);
            return (
              <article key={ev.id} className="gl-ev-slide">
                <div className="gl-ev-poster">
                  <img src={ev.poster_url} alt="" aria-hidden="true" className="gl-ev-poster-bg" />
                  <img src={ev.poster_url} alt={title} className="gl-ev-poster-img" loading="lazy" />
                </div>

                <div style={{ padding: "12px 2px 0" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: BRAND.red, letterSpacing: "0.02em" }}>
                    {ev.schedule_type === "recurring"
                      ? <>{[nextDateLabel(ev, lang), hhmm(ev.start_time) && [hhmm(ev.start_time), hhmm(ev.end_time)].filter(Boolean).join("–")].filter(Boolean).join(" · ")}
                          <span style={{ color: BRAND.muted, fontWeight: 600 }}> · {whenLabel({ ...ev, start_time: null, end_time: null }, lang).toLowerCase()}</span></>
                      : whenLabel(ev, lang)}
                  </div>
                  <div translate="no" className="notranslate gl-ev-title">{title}</div>
                  {(ev.location || ev.address) && (() => {
                    // luogo cliccabile: apre Google Maps sull'indirizzo (o sul nome / coordinate se manca)
                    const q = ev.address ? (ev.location && !ev.address.toLowerCase().includes(ev.location.toLowerCase()) ? `${ev.location}, ${ev.address}` : ev.address) : ev.lat && ev.lng ? `${ev.lat},${ev.lng}` : ev.location;
                    return (
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`} target="_blank" rel="noreferrer"
                        onClick={(e) => { e.stopPropagation(); track("open_event_map", { card: cardName(ev) }); }}
                        className="gl-ev-place">
                        📍 <span>{ev.location || ev.address}</span> <span aria-hidden="true" style={{ color: BRAND.green, fontWeight: 700 }}>↗</span>
                      </a>
                    );
                  })()}
                  {(ev[`desc_${lang}`] || ev.desc_it) && (
                    <p className={`gl-ev-desc${openDesc === ev.id ? " open" : ""}`} onClick={(e) => { e.stopPropagation(); setOpenDesc(openDesc === ev.id ? null : ev.id); }}>
                      {ev[`desc_${lang}`] || ev.desc_it}
                    </p>
                  )}
                </div>

                <div className="gl-ev-actions">
                  <button className="gl-ev-btn" onClick={(e) => { e.stopPropagation(); setCalFor(calFor === ev.id ? null : ev.id); }} aria-expanded={calFor === ev.id}>
                    <CalIcon size={21} color={BRAND.ink} /><span className="gl-ev-sr">{t.calendar}</span>
                  </button>
                  {hasPlace && (
                    <button className={`gl-ev-btn${inItin ? " is-on" : ""}`} onClick={(e) => {
                      e.stopPropagation();
                      if (!inItin) track("add_to_itinerary", { card: cardName(ev), from: "events" });
                      onToggleItin(ev.id);
                    }}>
                      <PinIcon size={21} filled={inItin} color={inItin ? BRAND.greenDark : BRAND.ink} /><span className="gl-ev-sr">{inItin ? t.inItin : t.itin}</span>
                    </button>
                  )}
                  {canInfo && (ev.link_url ? (
                    <a className="gl-ev-btn" href={ev.link_url} target="_blank" rel="noreferrer" onClick={(e) => { e.stopPropagation(); track("event_learn_more", { card: cardName(ev), target: "link" }); }}>
                      <OutIcon size={20} color={BRAND.ink} /><span className="gl-ev-sr">{t.info}</span>
                    </a>
                  ) : (
                    <button className="gl-ev-btn" onClick={(e) => { e.stopPropagation(); track("event_learn_more", { card: cardName(ev), target: "card" }); onOpenCard(ev.card); }}>
                      <OutIcon size={20} color={BRAND.ink} /><span className="gl-ev-sr">{t.info}</span>
                    </button>
                  ))}
                  <button className="gl-ev-btn" onClick={(e) => { e.stopPropagation(); shareOnWhatsApp(ev, lang); }}>
                    <WaIcon size={23} /><span className="gl-ev-sr">{t.share}</span>
                  </button>

                  {calFor === ev.id && (
                    <div className="gl-ev-menu" onClick={(e) => e.stopPropagation()}>
                      <a href={googleCalendarUrl(ev, ev.occ?.date, calendarTexts(ev, lang))} target="_blank" rel="noreferrer"
                        onClick={() => { track("add_event_calendar", { card: cardName(ev), method: "google" }); setCalFor(null); }}>{t.google}</a>
                      <button onClick={() => { track("add_event_calendar", { card: cardName(ev), method: "ics" }); setCalFor(null); openIcs(ev, lang); }}>{t.ics}</button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        </div>

        {events.length > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 6, padding: "14px 0 4px" }}>
            {events.map((ev, i) => (
              <button key={ev.id} onClick={() => goTo(i)} aria-label={`${i + 1}`} style={{ width: i === idx ? 18 : 6, height: 6, padding: 0, border: "none", borderRadius: 999, background: i === idx ? BRAND.ink : BRAND.border, cursor: "pointer", transition: "all .2s" }} />
            ))}
          </div>
        )}
        <div style={{ height: "calc(58px + env(safe-area-inset-bottom, 0px))" }} />
      </div>
    </div>
  );
}

/* ------------------------------ card compatta (apertura automatica) ------ */
// Versione "non invasiva": una card bassa, fissata sopra la barra delle schede,
// che NON oscura l'app. Scorre da sola tra gli eventi (ogni 4,5 s, si ferma
// appena l'utente la tocca) e si può anche sfogliare con lo swipe.
// Tap su locandina/titolo -> popup grande con la locandina intera.
const TICK_MS = 4500;

export function EventsTicker({ events, lang, itinerary, onToggleItin, onOpen, onClose }) {
  const t = EV_T[lang] || EV_T.it;
  const rowRef = useRef(null);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [calFor, setCalFor] = useState(null);

  useEffect(() => {
    if (paused || events.length < 2) return;
    const timer = setInterval(() => {
      const row = rowRef.current; if (!row) return;
      const next = (Math.round(row.scrollLeft / row.clientWidth) + 1) % events.length;
      row.scrollTo({ left: next * row.clientWidth, behavior: "smooth" });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [paused, events.length]);

  const onScroll = () => {
    const row = rowRef.current; if (!row) return;
    const i = Math.round(row.scrollLeft / row.clientWidth);
    if (i !== idx) { setIdx(i); setCalFor(null); }
  };
  const stop = () => setPaused(true);

  return (
    <div className="gl-ev-ticker" onTouchStart={stop} onMouseEnter={stop} onWheel={stop} role="region" aria-label={t.stripTitle}>
      <EventsStyles />
      <div ref={rowRef} className="gl-ev-ticker-row" onScroll={onScroll}>
        {events.map((ev) => {
          const inItin = itinerary.includes(ev.id);
          const title = ev[`title_${lang}`] || ev.title_it;
          const hasPlace = Boolean(ev.address || (ev.lat && ev.lng));
          const when = ev.schedule_type === "recurring"
            ? [nextDateLabel(ev, lang), hhmm(ev.start_time)].filter(Boolean).join(" · ")
            : whenLabel(ev, lang);
          return (
            <div key={ev.id} className="gl-ev-ticker-slide">
              <button className="gl-ev-ticker-main" onClick={() => { stop(); onOpen(ev.id); }} aria-label={`${t.tickerOpen}: ${title}`}>
                <img src={ev.poster_url} alt="" className="gl-ev-ticker-img" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: BRAND.red, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{when}</span>
                  <span translate="no" className="notranslate" style={{ display: "block", fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 16, lineHeight: 1.15, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
                  {ev.location && <span style={{ display: "block", fontSize: 12, color: BRAND.muted, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.location}</span>}
                </span>
              </button>
              <span style={{ display: "flex", gap: 6, flexShrink: 0, position: "relative" }}>
                <button className="gl-ev-ticker-icon" aria-label={t.calendar} onClick={() => { stop(); setCalFor(calFor === ev.id ? null : ev.id); }}>
                  <CalIcon size={17} color={BRAND.ink} />
                </button>
                {hasPlace && (
                  <button className={`gl-ev-ticker-icon${inItin ? " is-on" : ""}`} aria-label={inItin ? t.inItin : t.itin} onClick={() => {
                    stop();
                    if (!inItin) track("add_to_itinerary", { card: cardName(ev), from: "events_ticker" });
                    onToggleItin(ev.id);
                  }}>
                    <PinIcon size={17} filled={inItin} color={inItin ? BRAND.greenDark : BRAND.ink} />
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {calFor && (() => {
        const ev = events.find((e) => e.id === calFor);
        if (!ev) return null;
        return (
          <span className="gl-ev-menu" style={{ left: "auto", right: 10 }}>
            <a href={googleCalendarUrl(ev, ev.occ?.date, calendarTexts(ev, lang))} target="_blank" rel="noreferrer"
              onClick={() => { track("add_event_calendar", { card: cardName(ev), method: "google", from: "ticker" }); setCalFor(null); }}>{t.google}</a>
            <button onClick={() => { track("add_event_calendar", { card: cardName(ev), method: "ics", from: "ticker" }); setCalFor(null); openIcs(ev, lang); }}>{t.ics}</button>
          </span>
        );
      })()}
      {events.length > 1 && <span className="gl-ev-ticker-count">{idx + 1}/{events.length}</span>}
      <button className="gl-ev-ticker-x" aria-label={t.close} onClick={() => { track("close_events_ticker", { at: idx + 1 }); onClose(); }}>×</button>
    </div>
  );
}

/* ------------------------------ riga Home --------------------------------- */
// Striscia scura in Home: miniature delle prime locandine + numero di eventi.
// Riapre il popup quando l'utente l'ha chiuso.
export function EventsStrip({ events, lang, onOpen }) {
  const t = EV_T[lang] || EV_T.it;
  const thumbs = events.slice(0, 3);
  return (
    <button onClick={onOpen} className="gl-ev-strip">
      <EventsStyles />
      <span style={{ display: "flex", flexShrink: 0, paddingLeft: 6 }}>
        {thumbs.map((ev, i) => (
          <img key={ev.id} src={ev.poster_url} alt="" style={{ width: 38, height: 48, objectFit: "cover", borderRadius: 7, marginLeft: -8, border: "2px solid #1a1a1a", transform: `rotate(${(i - 1) * 5}deg)`, background: "#333" }} />
        ))}
      </span>
      <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <span style={{ display: "block", fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 18, lineHeight: 1.15 }}>{t.stripTitle}</span>
        <span style={{ display: "block", fontSize: 12.5, opacity: 0.75, marginTop: 2 }}>{t.stripSub(events.length)}</span>
      </span>
      <span style={{ flexShrink: 0, background: "#fff", color: BRAND.ink, borderRadius: 999, padding: "8px 14px", fontSize: 13.5, fontWeight: 700 }}>{t.stripCta} →</span>
    </button>
  );
}

/* ------------------------------ stili ------------------------------------- */
function EventsStyles() {
  return (
    <style>{`
      .gl-ev-overlay { position: fixed; inset: 0; background: rgba(26,20,12,0.55); display: flex; align-items: flex-end; justify-content: center; z-index: 92; animation: glEvFade .2s ease; }
      .gl-ev-sheet { background: ${BRAND.bg}; width: 100%; max-width: 520px; border-radius: 22px 22px 0 0; max-height: 90vh; max-height: 90dvh; overflow-y: auto; overscroll-behavior: contain; box-shadow: 0 -10px 50px rgba(0,0,0,0.25); animation: glEvUp .28s cubic-bezier(.2,.8,.2,1); }
      @keyframes glEvFade { from { opacity: 0 } to { opacity: 1 } }
      @keyframes glEvUp { from { transform: translateY(40px); opacity: .6 } to { transform: none; opacity: 1 } }
      .gl-ev-x { width: 40px; height: 40px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: rgba(26,20,12,0.08); border: none; border-radius: 50%; font-size: 24px; cursor: pointer; color: ${BRAND.ink}; line-height: 1; }
      .gl-ev-sheet { --w: max(220px, min(76vw, 330px, calc((88vh - 370px) * 0.8))); }
      @supports (height: 100dvh) { .gl-ev-sheet { --w: max(220px, min(76vw, 330px, calc((90dvh - 370px) * 0.8))); } }
      .gl-ev-row { display: flex; gap: 14px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 0 calc((100% - var(--w)) / 2); scrollbar-width: none; -webkit-overflow-scrolling: touch; }
      .gl-ev-row::-webkit-scrollbar { display: none; }
      .gl-ev-slide { flex: 0 0 var(--w); width: var(--w); scroll-snap-align: center; scroll-snap-stop: always; }
      .gl-ev-poster { position: relative; aspect-ratio: 4 / 5; border-radius: 18px; overflow: hidden; background: #1a1a1a; box-shadow: 0 10px 28px rgba(40,30,15,0.22); }
      .gl-ev-poster-bg { position: absolute; inset: -20px; width: calc(100% + 40px); height: calc(100% + 40px); object-fit: cover; filter: blur(22px) brightness(.55); }
      .gl-ev-poster-img { position: relative; width: 100%; height: 100%; object-fit: contain; display: block; }
      .gl-ev-title { font-family: 'Fraunces', serif; font-weight: 600; font-size: 19px; line-height: 1.2; margin-top: 3px; letter-spacing: -0.01em; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .gl-ev-place { display: block; font-size: 12.5px; color: ${BRAND.muted}; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none; }
      .gl-ev-place span:first-of-type { text-decoration: underline; text-decoration-color: ${BRAND.border}; text-underline-offset: 3px; }
      .gl-ev-desc { margin: 7px 0 0; font-size: 13.5px; line-height: 1.45; color: #4a463d; white-space: pre-line; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; cursor: pointer; }
      .gl-ev-desc.open { -webkit-line-clamp: unset; display: block; }
      .gl-ev-actions { display: flex; justify-content: center; gap: 14px; margin-top: 12px; position: relative; }
      .gl-ev-btn { flex: 0 0 50px; width: 50px; height: 50px; padding: 0; display: inline-flex; align-items: center; justify-content: center; background: ${BRAND.card}; border: 1.5px solid ${BRAND.border}; border-radius: 50%; color: ${BRAND.ink}; cursor: pointer; text-decoration: none; transition: background .15s, border-color .15s; }
      .gl-ev-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
      .gl-ev-btn:active { transform: scale(.97); }
      .gl-ev-btn.is-on { background: rgba(56,176,74,0.12); border-color: ${BRAND.green}; color: ${BRAND.greenDark}; }
      .gl-ev-menu { position: absolute; left: 0; bottom: calc(100% + 8px); z-index: 2; background: ${BRAND.card}; border: 1px solid ${BRAND.border}; border-radius: 14px; box-shadow: 0 12px 30px rgba(40,30,15,0.2); overflow: hidden; min-width: 190px; animation: glEvFade .15s ease; }
      .gl-ev-menu a, .gl-ev-menu button { display: block; width: 100%; text-align: left; padding: 13px 16px; background: none; border: none; font: 600 14px 'Archivo', system-ui, sans-serif; color: ${BRAND.ink}; text-decoration: none; cursor: pointer; }
      .gl-ev-menu a + button { border-top: 1px solid ${BRAND.border}; }
      .gl-ev-arrow { display: none; position: absolute; top: calc(var(--w, 330px) * 0.625); transform: translateY(-50%); z-index: 3; width: 42px; height: 42px; border-radius: 50%; border: none; background: rgba(255,255,255,0.95); box-shadow: 0 4px 14px rgba(0,0,0,0.25); font-size: 26px; line-height: 1; color: ${BRAND.ink}; cursor: pointer; }
      .gl-ev-arrow.left { left: 12px; } .gl-ev-arrow.right { right: 12px; }
      @media (hover: hover) and (pointer: fine) { .gl-ev-arrow { display: flex; align-items: center; justify-content: center; } }
      .gl-ev-ticker { position: fixed; left: 12px; right: 12px; bottom: calc(72px + env(safe-area-inset-bottom, 0px)); z-index: 36; max-width: 520px; margin: 0 auto; background: ${BRAND.card}; border: 1px solid ${BRAND.border}; border-radius: 18px; box-shadow: 0 12px 34px rgba(40,30,15,0.22); animation: glEvUp .35s cubic-bezier(.2,.8,.2,1); }
      .gl-ev-ticker-row { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; border-radius: 18px; }
      .gl-ev-ticker-row::-webkit-scrollbar { display: none; }
      .gl-ev-ticker-slide { flex: 0 0 100%; scroll-snap-align: start; display: flex; align-items: center; gap: 8px; padding: 9px 12px 9px 9px; box-sizing: border-box; }
      .gl-ev-ticker-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 11px; background: none; border: none; padding: 0; text-align: left; cursor: pointer; font-family: inherit; color: ${BRAND.ink}; }
      .gl-ev-ticker-img { width: 50px; height: 62px; object-fit: cover; border-radius: 10px; flex-shrink: 0; background: #eee; }
      .gl-ev-ticker-icon { width: 38px; height: 38px; border-radius: 50%; border: 1.5px solid ${BRAND.border}; background: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
      .gl-ev-ticker-icon.is-on { background: rgba(56,176,74,0.12); border-color: ${BRAND.green}; }
      .gl-ev-ticker-x { position: absolute; top: -9px; right: -6px; width: 24px; height: 24px; border-radius: 50%; border: none; background: ${BRAND.ink}; color: #fff; font-size: 16px; line-height: 1; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.25); }
      .gl-ev-ticker-count { position: absolute; top: -9px; left: 14px; background: ${BRAND.green}; color: #fff; font: 700 10.5px 'Archivo', system-ui, sans-serif; letter-spacing: .04em; padding: 3px 8px; border-radius: 999px; }
      .gl-ev-ticker .gl-ev-menu { bottom: calc(100% + 10px); }
      .gl-ev-strip { display: flex; align-items: center; gap: 14px; width: 100%; margin-top: 22px; background: #1a1a1a; color: #fff; border: none; border-radius: 20px; padding: 14px 14px 14px 16px; cursor: pointer; font-family: inherit; }
      @media (prefers-reduced-motion: reduce) { .gl-ev-overlay, .gl-ev-sheet, .gl-ev-menu, .gl-ev-ticker { animation: none; } }
    `}</style>
  );
}
