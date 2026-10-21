import React, { useState } from "react";
import { BRAND, track } from "./shared";

/* ============================================================================
   KIT DA LOCAL — contenuto a pagamento (PROTOTIPO)

   Cosa contiene:
   1. "Il dettaglio da local" su ogni tappa della guida 3 giorni
      -> colonne del foglio kit_nota_it / kit_nota_en (per ora; poi su Supabase,
         perché il foglio pubblicato è leggibile da chiunque).
   2. Prima di partire (testi qui sotto, PRIMA_DI_PARTIRE).
   3. I 10 piatti di Bologna (testi qui sotto, PIATTI).
   4. Servizi: ti prenotiamo noi la cena + un local su WhatsApp.

   Sblocco:
   - In locale (npm start) il pagamento è simulato: "Sblocca" sblocca subito.
   - Online: se KIT_PAYMENT_URL è vuoto il bottone mostra "In arrivo";
     quando c'è il link di pagamento (Stripe / merchant of record), al ritorno
     sull'app con ?kit=ok il kit si sblocca. Sblocco salvato nel browser
     (prototipo: va reso sicuro prima di vendere davvero).

   Testi: bozza in italiano da rivedere. Inglese da scrivere.
   ========================================================================== */

export const KIT_PRICE = "9,90 €";
export const KIT_PAYMENT_URL = ""; // link di pagamento, da inserire
const KIT_WA = "393200849247"; // stesso numero di "Chiedi ad un local"
const IS_DEV = process.env.NODE_ENV !== "production";

const PRIMA_DI_PARTIRE = [
  {
    icon: "✈️",
    title: "Dall'aeroporto e dalla stazione",
    body: "Dall'aeroporto c'è il Marconi Express, la navetta sopraelevata che in pochi minuti ti lascia alla Stazione Centrale: è la soluzione più comoda. Il taxi costa di più ma ti porta alla porta, utile se hai valigie grandi o arrivi tardi. Dalla stazione il centro è a 10-15 minuti a piedi lungo via Indipendenza.",
  },
  {
    icon: "🗓️",
    title: "Cosa è chiuso e quando",
    body: "Il lunedì molti musei sono chiusi: non metterli in programma quel giorno. Tante trattorie chiudono la domenica sera o il lunedì, e diverse botteghe il giovedì pomeriggio. Ad agosto molti locali chiudono per ferie. Nella scheda di ogni posto trovi gli orari aggiornati.",
  },
  {
    icon: "☔",
    title: "Se piove",
    body: "Bologna ha quasi 40 km di portici: con un po' di attenzione attraversi il centro senza bagnarti. È il momento giusto per musei, botteghe e un pranzo lungo. Ti indichiamo nella guida le tappe al coperto.",
  },
  {
    icon: "🍷",
    title: "Aperitivo, mercato e caffè: le regole",
    body: "L'aperitivo è tra le 18:30 e le 20:30: ordini da bere e arriva qualcosa da mangiare. Il caffè si prende al banco, in piedi, e costa meno che seduti al tavolo. Al mercato si guarda con gli occhi: è il banconista che serve, non si tocca la merce.",
  },
];

const PIATTI = [
  { name: "Tortellini in brodo", body: "Il piatto della festa: piccoli e ripieni di carne, serviti nel brodo. Se un posto li propone con la panna, cambia posto." },
  { name: "Tagliatelle al ragù", body: "Il vero ragù bolognese va con le tagliatelle all'uovo, non con gli spaghetti. Gli \"spaghetti alla bolognese\" qui non esistono." },
  { name: "Lasagne verdi", body: "Sfoglia verde agli spinaci, ragù e besciamella. Più asciutte e saporite di quelle che conosci." },
  { name: "Balanzoni", body: "Grandi tortelli verdi ripieni di ricotta e mortadella, con burro e salvia. Meno famosi, li ordinano i bolognesi." },
  { name: "Tigelle", body: "Piccoli dischi di pane da aprire e riempire con salumi, formaggi e pesto modenese (lardo, aglio e rosmarino)." },
  { name: "Crescentine fritte", body: "Pasta di pane fritta e gonfia, da mangiare calda con salumi e squacquerone. Fuori Bologna le chiamano gnocco fritto." },
  { name: "Mortadella", body: "Quella vera è IGP, tagliata sottilissima. Assaggiala da sola, a cubetti all'aperitivo o dentro i balanzoni." },
  { name: "Cotoletta alla bolognese", body: "Cotoletta di vitello passata nel brodo, coperta di prosciutto crudo e Parmigiano. Piatto da pranzo lungo." },
  { name: "Friggione", body: "Cipolle e pomodoro cotti lentamente per ore. Lo trovi come contorno o sul pane: piatto di casa, poco turistico." },
  { name: "Torta di riso", body: "Il dolce bolognese per eccellenza: riso, latte, mandorle e liquore. Spesso servita a cubetti." },
];

/* ------------------------------ banner nella guida ------------------------ */
export function KitBanner({ unlocked, onOpen }) {
  return (
    <button onClick={() => { track("open_kit", { from: "guide_banner", unlocked }); onOpen(); }} style={{
      width: "100%", textAlign: "left", display: "flex", gap: 14, alignItems: "center", background: BRAND.ink, color: "#fff",
      border: "none", borderRadius: 18, padding: "16px 18px", margin: "18px 0 6px", cursor: "pointer", fontFamily: "inherit",
    }}>
      <span style={{ fontSize: 28 }}>{unlocked ? "🔓" : "🔑"}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.7 }}>
          {unlocked ? "Il tuo kit" : `Kit da local · ${KIT_PRICE}`}
        </span>
        <span style={{ display: "block", fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 18, marginTop: 3, lineHeight: 1.2 }}>
          {unlocked ? "Apri il kit da local" : "Fai questi 3 giorni come un bolognese"}
        </span>
        {!unlocked && <span style={{ display: "block", fontSize: 13, opacity: 0.75, marginTop: 4 }}>Cosa ordinare in ogni tappa, cosa è chiuso, i 10 piatti, e un local su WhatsApp.</span>}
      </span>
      <span style={{ fontSize: 18, opacity: 0.8 }}>→</span>
    </button>
  );
}

/* ------------------------- "il dettaglio da local" per tappa -------------- */
export function KitStopNote({ stop, lang, unlocked, onLocked }) {
  const note = (lang === "en" ? stop.kit_nota_en || stop.kit_nota_it : stop.kit_nota_it) || "";
  if (unlocked) {
    if (!note) return null;
    return (
      <div style={{ ...box, background: "rgba(56,176,74,0.08)", borderColor: BRAND.green, marginBottom: 16 }}>
        <div style={boxLabel(BRAND.greenDark)}>🔑 Il dettaglio da local</div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#3c3826", whiteSpace: "pre-line" }}>{note}</p>
      </div>
    );
  }
  // bloccato: anteprima sfocata (testo vero se c'è, altrimenti un riempitivo)
  const teaser = note || "Cosa ordinare qui, a che ora arrivare per evitare la fila e cosa lasciar perdere.";
  return (
    <button onClick={() => { track("kit_locked_click", { card: stop.title_it || stop.id }); onLocked(); }}
      style={{ ...box, width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit", marginBottom: 16, position: "relative", overflow: "hidden" }}>
      <div style={boxLabel(BRAND.muted)}>🔒 Il dettaglio da local</div>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#3c3826", filter: "blur(4.5px)", userSelect: "none" }} aria-hidden="true">{teaser}</p>
      <span style={{ position: "absolute", right: 12, bottom: 10, fontSize: 12.5, fontWeight: 700, color: BRAND.ink, background: BRAND.card, borderRadius: 999, padding: "5px 10px", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>Sblocca</span>
    </button>
  );
}

/* --------------------------------- paywall -------------------------------- */
export function KitPaywall({ onClose, onUnlocked }) {
  const [sending, setSending] = useState(false);
  const buy = () => {
    track("kit_checkout", {});
    if (IS_DEV) {
      setSending(true);
      setTimeout(() => { setSending(false); onUnlocked(); }, 700);
      return;
    }
    if (KIT_PAYMENT_URL) window.location.href = KIT_PAYMENT_URL;
  };
  const available = IS_DEV || !!KIT_PAYMENT_URL;
  const items = [
    ["📍", "Il dettaglio da local su ogni tappa", "Cosa ordinare, quando arrivare, cosa evitare."],
    ["🧳", "Prima di partire", "Spostamenti, cosa è chiuso e quando, piano B pioggia."],
    ["🍝", "I 10 piatti di Bologna", "Cosa sono, come si ordinano, dove mangiarli."],
    ["💬", "Un local su WhatsApp", "Per tutto il soggiorno. E la cena te la prenotiamo noi."],
  ];
  return (
    <div onClick={onClose} className="gl-overlay" style={overlay}>
      <div onClick={(e) => e.stopPropagation()} className="gl-sheet" style={sheet}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} aria-label="Chiudi" style={xBtn}>×</button>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: BRAND.green }}>Kit da local</div>
        <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 27, lineHeight: 1.1, margin: "6px 0 8px" }}>Bologna, come la vive chi ci abita.</h3>
        <p style={{ fontSize: 14.5, color: BRAND.muted, margin: "0 0 20px", lineHeight: 1.5 }}>La guida ti dice dove andare. Il kit ti dice come farlo senza sbagliare.</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          {items.map(([ic, title, sub]) => (
            <li key={title} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ fontSize: 20, width: 28, textAlign: "center" }}>{ic}</span>
              <span>
                <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>{title}</span>
                <span style={{ display: "block", fontSize: 13.5, color: BRAND.muted, marginTop: 2 }}>{sub}</span>
              </span>
            </li>
          ))}
        </ul>
        <button onClick={buy} disabled={!available || sending} style={{ ...cta, background: available ? BRAND.red : "#d9d3c4", cursor: available ? "pointer" : "default", opacity: sending ? 0.7 : 1 }}>
          {!available ? "In arrivo" : sending ? "Un attimo…" : `Sblocca a ${KIT_PRICE}`}
        </button>
        <p style={{ fontSize: 12, color: BRAND.muted, textAlign: "center", margin: "10px 0 0" }}>Pagamento unico. Resta sbloccato su questo telefono.</p>
        {IS_DEV && <p style={{ fontSize: 12, color: "#a06a00", background: "#fff6dc", borderRadius: 10, padding: "8px 10px", margin: "12px 0 0", textAlign: "center" }}>Anteprima locale: lo sblocco è simulato, nessun pagamento.</p>}
      </div>
    </div>
  );
}

/* ------------------------------- pagina kit ------------------------------- */
export function KitPage({ unlocked, onClose, onLocked }) {
  const [open, setOpen] = useState(0);
  const waHref = (text) => `https://wa.me/${KIT_WA}?text=${encodeURIComponent(text)}`;
  const Locked = ({ children }) => (
    <div style={{ position: "relative" }}>
      <div style={{ filter: "blur(5px)", pointerEvents: "none", userSelect: "none" }} aria-hidden="true">{children}</div>
      <button onClick={onLocked} style={{ position: "absolute", inset: 0, background: "transparent", border: "none", cursor: "pointer" }} aria-label="Sblocca il kit" />
    </div>
  );

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "18px 18px 120px" }}>
      <button onClick={onClose} style={{ background: "none", border: "none", color: BRAND.muted, fontSize: 13.5, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 18, fontFamily: "inherit" }}>
        &larr; Torna alla guida
      </button>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: BRAND.green }}>{unlocked ? "Il tuo kit" : `Kit da local · ${KIT_PRICE}`}</div>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "clamp(30px, 7vw, 40px)", letterSpacing: "-0.02em", margin: "6px 0 8px", lineHeight: 1.05 }}>Bologna, come la vive chi ci abita.</h1>
      <p style={{ color: BRAND.muted, margin: "0 0 28px", fontSize: 15 }}>Cosa sapere prima di partire, cosa mangiare, e un local a portata di messaggio.</p>

      {/* SERVIZI */}
      <h2 style={h2}>Un local per te</h2>
      <div style={{ display: "grid", gap: 10, marginBottom: 32 }}>
        {[
          ["🍽️", "Ti prenotiamo noi la cena", "Dicci giorno, ora e quanti siete: pensiamo noi a trovare il tavolo giusto.", "Ciao Glocal! Ho il kit da local, vorrei prenotare una cena: "],
          ["💬", "Scrivi a un local", "Un dubbio, un cambio di programma, un consiglio dell'ultimo minuto: rispondiamo noi, persone vere.", "Ciao Glocal! Ho il kit da local e ho una domanda: "],
        ].map(([ic, title, sub, text]) => (
          <div key={title} style={{ ...card, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontSize: 22 }}>{ic}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700 }}>{title}</div>
              <div style={{ fontSize: 13.5, color: BRAND.muted, margin: "3px 0 10px", lineHeight: 1.45 }}>{sub}</div>
              {unlocked ? (
                <a href={waHref(text)} target="_blank" rel="noreferrer" onClick={() => track("kit_service", { service: title })}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#25D366", color: "#fff", textDecoration: "none", borderRadius: 12, padding: "9px 14px", fontSize: 14, fontWeight: 700 }}>
                  💬 Scrivici su WhatsApp
                </a>
              ) : (
                <button onClick={onLocked} style={{ ...lockedBtn }}>🔒 Incluso nel kit</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* PRIMA DI PARTIRE */}
      <h2 style={h2}>Prima di partire</h2>
      <div style={{ display: "grid", gap: 10, marginBottom: 32 }}>
        {PRIMA_DI_PARTIRE.map((s, i) => {
          const isOpen = open === i;
          const content = <p style={{ margin: "10px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "#4a463d" }}>{s.body}</p>;
          return (
            <div key={s.title} style={card}>
              <button onClick={() => setOpen(isOpen ? -1 : i)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: BRAND.ink }}>
                <span style={{ fontSize: 20 }}>{s.icon}</span>
                <span style={{ flex: 1, fontSize: 15.5, fontWeight: 700 }}>{s.title}</span>
                <span style={{ color: BRAND.muted, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}>⌄</span>
              </button>
              {isOpen && (unlocked || i === 0 ? content : <Locked>{content}</Locked>)}
            </div>
          );
        })}
      </div>

      {/* PIATTI */}
      <h2 style={h2}>I 10 piatti di Bologna</h2>
      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
        {PIATTI.map((p, i) => {
          const row = (
            <div style={{ ...card, display: "flex", gap: 14 }}>
              <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 22, color: BRAND.red, width: 28, flexShrink: 0 }}>{i + 1}</span>
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 14, color: "#4a463d", marginTop: 3, lineHeight: 1.5 }}>{p.body}</div>
              </div>
            </div>
          );
          return <li key={p.name}>{unlocked || i < 2 ? row : <Locked>{row}</Locked>}</li>;
        })}
      </ol>

      {!unlocked && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "12px 18px calc(14px + env(safe-area-inset-bottom, 0px))", background: BRAND.bg, borderTop: `1px solid ${BRAND.border}`, zIndex: 50 }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <button onClick={onLocked} style={{ ...cta, background: BRAND.red }}>Sblocca il kit · {KIT_PRICE}</button>
          </div>
        </div>
      )}
    </main>
  );
}

/* ---------------------------------- stili --------------------------------- */
const box = { background: BRAND.card, border: `1.5px dashed ${BRAND.border}`, borderRadius: 14, padding: "12px 14px" };
const boxLabel = (color) => ({ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color, marginBottom: 6 });
const overlay = { position: "fixed", inset: 0, background: "rgba(26,20,12,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 110 };
const sheet = { background: BRAND.bg, width: "100%", maxWidth: 480, borderRadius: "22px 22px 0 0", maxHeight: "92vh", overflowY: "auto", padding: "14px 22px calc(22px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 -10px 50px rgba(0,0,0,0.25)" };
const xBtn = { width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(26,20,12,0.07)", border: "none", borderRadius: "50%", fontSize: 22, cursor: "pointer", color: BRAND.ink, lineHeight: 1 };
const cta = { width: "100%", color: "#fff", border: "none", borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const card = { background: BRAND.card, border: `1.5px solid ${BRAND.border}`, borderRadius: 16, padding: "14px 16px" };
const h2 = { fontSize: 12.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: BRAND.muted, margin: "0 0 12px" };
const lockedBtn = { background: "none", border: `1.5px solid ${BRAND.border}`, borderRadius: 12, padding: "8px 12px", fontSize: 13.5, fontWeight: 700, color: BRAND.muted, cursor: "pointer", fontFamily: "inherit" };
