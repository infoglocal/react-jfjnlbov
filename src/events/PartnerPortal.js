/* ============================================================================
   PORTALE PARTNER — g-local.it/partner
   ----------------------------------------------------------------------------
   Accesso con link via email (niente password), solo su invito.
   Due ruoli:
     partner -> un locale: carica e gestisce le PROPRIE locandine. Ogni evento
                nuovo o modificato va "in attesa" finché l'admin non lo approva.
     admin   -> Glocal: approva/rifiuta, carica eventi propri (pubblicati
                subito), gestisce i locali e collega gli account ai locali.
   Le regole di sicurezza vere stanno nel database (supabase/schema.sql):
   questa pagina non può "saltarle" nemmeno se qualcuno la manomette.
   ============================================================================ */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BRAND } from "../shared";
import { supabase } from "./supabaseClient";
import { eventsEnabled } from "./data";
import { nowInRome, nextOccurrence, whenLabel, hhmm } from "./schedule";

/* ------------------------------ testi ------------------------------------- */
const STATUS = {
  draft: { label: "Bozza", bg: "#efe9db", fg: "#6b6557" },
  pending: { label: "In attesa di approvazione", bg: "#fff1d6", fg: "#9a6400" },
  approved: { label: "Pubblicato", bg: "rgba(56,176,74,0.14)", fg: BRAND.greenDark },
  rejected: { label: "Non approvato", bg: "rgba(229,56,59,0.12)", fg: BRAND.red },
};
const WEEK = [ // ordine italiano, da lunedì; value = numero JS (0 = domenica)
  { v: 1, s: "L", l: "Lunedì" }, { v: 2, s: "M", l: "Martedì" }, { v: 3, s: "M", l: "Mercoledì" },
  { v: 4, s: "G", l: "Giovedì" }, { v: 5, s: "V", l: "Venerdì" }, { v: 6, s: "S", l: "Sabato" }, { v: 0, s: "D", l: "Domenica" },
];
const SCHEDULES = [
  { id: "single", label: "Una data" },
  { id: "range", label: "Dal … al" },
  { id: "recurring", label: "Ricorrente" },
];

/* ------------------------------ immagini ---------------------------------- */
// Ridimensiona la locandina (lato lungo max 1600px) e la converte in JPEG:
// da un PNG di 8 MB si passa a ~300-600 KB, e il popup si carica in fretta.
async function compressImage(file, maxSide = 1600, quality = 0.86) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); // PNG trasparenti -> fondo bianco
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  } finally { URL.revokeObjectURL(url); }
}

async function uploadPoster(file, userId) {
  const blob = await compressImage(file);
  if (!blob) throw new Error("Immagine non leggibile");
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from("posters").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw error;
  return supabase.storage.from("posters").getPublicUrl(path).data.publicUrl;
}

const errText = (e) => {
  const m = String(e?.message || e || "");
  if (/signups not allowed|not allowed for otp|user not found/i.test(m)) return "Questa email non è abilitata. Scrivici per ricevere l'accesso.";
  if (/rate limit|too many|security purposes/i.test(m)) return "Troppi tentativi ravvicinati: riprova tra qualche minuto.";
  if (/expired|invalid/i.test(m)) return "Il link è scaduto o è già stato usato. Chiedine uno nuovo.";
  if (/row-level security/i.test(m)) return "Operazione non consentita per questo account.";
  if (/payload too large|exceeded the maximum/i.test(m)) return "Immagine troppo pesante (max 5 MB).";
  return m || "Qualcosa è andato storto. Riprova.";
};

/* ============================================================================
   PAGINA
   ============================================================================ */
export default function PartnerPortal({ places = [] }) {
  const [session, setSession] = useState(undefined); // undefined = sto controllando
  const [urlError] = useState(() => {
    const p = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
    return p.get("error_description");
  });

  useEffect(() => {
    document.title = "Glocal · Partner";
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // ripulisce l'indirizzo dai token del link di accesso
  useEffect(() => {
    if (session && window.location.hash) window.history.replaceState(null, "", "/partner");
  }, [session]);

  return (
    <div className="gl-pp">
      <PortalStyles />
      <header className="gl-pp-head">
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: BRAND.ink }}>
          <img src="/glocal-logo.png" alt="Glocal" style={{ height: 24, width: "auto", display: "block" }} />
          <span className="gl-pp-tag">Partner</span>
        </a>
        {session && (
          <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span className="gl-pp-muted gl-pp-ellipsis" style={{ fontSize: 13 }}>{session.user.email}</span>
            <button className="gl-pp-link" onClick={() => supabase.auth.signOut()}>Esci</button>
          </span>
        )}
      </header>

      <main className="gl-pp-main">
        {!eventsEnabled ? (
          <Notice title="Portale non ancora attivo" text="Manca il collegamento al database (src/events/config.json)." />
        ) : session === undefined ? (
          <div className="gl-pp-muted" style={{ padding: 40, textAlign: "center" }}>Caricamento…</div>
        ) : !session ? (
          <Login initialError={urlError} />
        ) : (
          <Dashboard session={session} places={places} />
        )}
      </main>
    </div>
  );
}

/* ------------------------------ login ------------------------------------- */
function Login({ initialError }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState(initialError ? "error" : "idle");
  const [msg, setMsg] = useState(initialError ? errText(initialError) : "");

  const submit = async (e) => {
    e.preventDefault();
    if (!email.includes("@")) return;
    setState("sending"); setMsg("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/partner` },
    });
    if (error) { setState("error"); setMsg(errText(error)); } else setState("sent");
  };

  return (
    <div className="gl-pp-card" style={{ maxWidth: 420, margin: "40px auto 0", padding: 28 }}>
      {state === "sent" ? (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📬</div>
          <h1 className="gl-pp-h1" style={{ fontSize: 26 }}>Controlla la tua email</h1>
          <p className="gl-pp-muted" style={{ lineHeight: 1.55 }}>Ti abbiamo mandato un link per entrare a <b style={{ color: BRAND.ink }}>{email}</b>. Aprilo da questo o da un altro dispositivo: vale una volta sola.</p>
          <button className="gl-pp-link" onClick={() => setState("idle")}>Usa un'altra email</button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <h1 className="gl-pp-h1">Area locali</h1>
          <p className="gl-pp-muted" style={{ margin: "0 0 22px", lineHeight: 1.5 }}>Carica le locandine dei tuoi eventi: le vedranno le persone che usano Glocal in città.</p>
          <label className="gl-pp-label">Email del locale</label>
          <input className="gl-pp-input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@locale.it" />
          {msg && <p className="gl-pp-err">{msg}</p>}
          <button className="gl-pp-btn" type="submit" disabled={state === "sending"} style={{ width: "100%", marginTop: 14 }}>
            {state === "sending" ? "Invio…" : "Mandami il link di accesso"}
          </button>
          <p className="gl-pp-muted" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.45 }}>Niente password: ricevi un link via email. L'accesso è su invito.</p>
        </form>
      )}
    </div>
  );
}

function Notice({ title, text }) {
  return (
    <div className="gl-pp-card" style={{ maxWidth: 480, margin: "40px auto 0", padding: 28, textAlign: "center" }}>
      <h1 className="gl-pp-h1" style={{ fontSize: 24 }}>{title}</h1>
      <p className="gl-pp-muted" style={{ lineHeight: 1.55, margin: 0 }}>{text}</p>
    </div>
  );
}

/* ------------------------------ dashboard --------------------------------- */
function Dashboard({ session, places }) {
  const uid = session.user.id;
  const [profile, setProfile] = useState(undefined);
  const [venues, setVenues] = useState([]);
  const [events, setEvents] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loadErr, setLoadErr] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | evento
  const [tab, setTab] = useState("pending");
  const [toast, setToast] = useState("");
  const [loaded, setLoaded] = useState(false);
  const tabChosen = useRef(false);

  const isAdmin = profile?.role === "admin";

  const reload = useCallback(async () => {
    setLoadErr("");
    const { data: prof, error: pe } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (pe) { setLoadErr(errText(pe)); setProfile(null); return; }
    setProfile(prof || null);
    if (!prof) return;
    const admin = prof.role === "admin";
    const evQ = supabase.from("events").select("*, venue:venues(name)").order("start_date", { ascending: false });
    const [ev, ve, pr] = await Promise.all([
      admin ? evQ : prof.venue_id ? evQ.eq("venue_id", prof.venue_id) : Promise.resolve({ data: [] }),
      supabase.from("venues").select("*").order("name"),
      admin ? supabase.from("profiles").select("*").order("email") : Promise.resolve({ data: [] }),
    ]);
    const err = ev.error || ve.error || pr.error;
    if (err) setLoadErr(errText(err));
    setEvents(ev.data || []); setVenues(ve.data || []); setProfiles(pr.data || []);
    setLoaded(true);
  }, [uid]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3200); return () => clearTimeout(t); }, [toast]);

  const pendingCount = events.filter((e) => e.status === "pending").length;
  // admin: si apre su "Da approvare" se c'è qualcosa da approvare, altrimenti su "Tutti gli eventi"
  useEffect(() => {
    if (!loaded || tabChosen.current) return;
    tabChosen.current = true;
    if (isAdmin && pendingCount === 0) setTab("events");
  }, [loaded, isAdmin, pendingCount]);

  if (profile === undefined) return <div className="gl-pp-muted" style={{ padding: 40, textAlign: "center" }}>Caricamento…</div>;
  if (!profile) return <Notice title="Account in attivazione" text={loadErr || "Il tuo accesso funziona, ma l'account non è ancora pronto. Riprova tra poco o scrivici."} />;
  if (!isAdmin && !profile.venue_id) return <Notice title="Account in attivazione" text="Il tuo accesso funziona! Stiamo collegando l'account al tuo locale: appena è pronto trovi qui la tua area." />;

  const myVenue = venues.find((v) => v.id === profile.venue_id);

  if (editing) {
    return (
      <EventForm
        initial={editing === "new" ? null : editing} isAdmin={isAdmin} venues={venues} myVenue={myVenue} uid={uid}
        onCancel={() => setEditing(null)}
        onSaved={(msg) => { setEditing(null); setToast(msg); reload(); }}
      />
    );
  }

  const list = isAdmin ? (tab === "pending" ? events.filter((e) => e.status === "pending") : events) : events;

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div className="gl-pp-kicker">{isAdmin ? "Admin Glocal" : "Il tuo locale"}</div>
          <h1 className="gl-pp-h1" style={{ margin: 0 }}>{isAdmin ? "Eventi in città" : myVenue?.name || "I tuoi eventi"}</h1>
        </div>
        <button className="gl-pp-btn" onClick={() => setEditing("new")}>+ Nuovo evento</button>
      </div>

      {loadErr && <p className="gl-pp-err">{loadErr}</p>}

      {isAdmin && (
        <div className="gl-pp-tabs">
          <button className={tab === "pending" ? "on" : ""} onClick={() => setTab("pending")}>Da approvare{pendingCount > 0 && <span className="gl-pp-count">{pendingCount}</span>}</button>
          <button className={tab === "events" ? "on" : ""} onClick={() => setTab("events")}>Tutti gli eventi</button>
          <button className={tab === "venues" ? "on" : ""} onClick={() => setTab("venues")}>Locali e account</button>
        </div>
      )}

      {isAdmin && tab === "venues" ? (
        <VenuesAdmin venues={venues} profiles={profiles} places={places} onChanged={(m) => { if (m) setToast(m); reload(); }} />
      ) : (
        <EventList events={list} isAdmin={isAdmin} emptyText={
          isAdmin && tab === "pending" ? "Nessun evento da approvare. 🎉" : "Ancora nessun evento. Carica la prima locandina!"
        } onEdit={setEditing} onChanged={(m) => { if (m) setToast(m); reload(); }} />
      )}

      {!isAdmin && (
        <p className="gl-pp-muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 26 }}>
          Ogni locandina viene controllata da Glocal prima di comparire nell'app, di solito entro 24 ore. Se modifichi un evento già pubblicato, torna in revisione.
        </p>
      )}

      {toast && <div className="gl-pp-toast">{toast}</div>}
    </>
  );
}

/* ------------------------------ lista eventi ------------------------------ */
function EventList({ events, isAdmin, emptyText, onEdit, onChanged }) {
  const [confirmDel, setConfirmDel] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const now = nowInRome();

  const act = async (ev, patch, msg) => {
    setBusy(ev.id);
    const { error } = await supabase.from("events").update(patch).eq("id", ev.id);
    setBusy(null);
    if (error) return onChanged(errText(error));
    setRejecting(null); setNote("");
    onChanged(msg);
  };
  const remove = async (ev) => {
    setBusy(ev.id);
    const { error } = await supabase.from("events").delete().eq("id", ev.id);
    setBusy(null); setConfirmDel(null);
    onChanged(error ? errText(error) : "Evento eliminato");
  };

  if (!events.length) return <div className="gl-pp-card gl-pp-muted" style={{ padding: "34px 20px", textAlign: "center" }}>{emptyText}</div>;

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      {events.map((ev) => {
        const st = STATUS[ev.status] || STATUS.draft;
        const ended = !nextOccurrence(ev, now);
        return (
          <li key={ev.id} className="gl-pp-card" style={{ padding: 12, opacity: busy === ev.id ? 0.55 : 1 }}>
            <div style={{ display: "flex", gap: 13 }}>
              <img src={ev.poster_url} alt="" style={{ width: 64, height: 80, objectFit: "cover", borderRadius: 10, flexShrink: 0, background: "#eee" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 5 }}>
                  <span className="gl-pp-badge" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                  {ended && <span className="gl-pp-badge" style={{ background: "#eee", color: "#777" }}>Concluso</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 15.5, lineHeight: 1.25 }}>{ev.title_it}</div>
                <div className="gl-pp-muted" style={{ fontSize: 13, marginTop: 2 }}>{whenLabel(ev, "it", now)}</div>
                {isAdmin && <div className="gl-pp-muted" style={{ fontSize: 12.5, marginTop: 1 }}>📍 {ev.venue?.name || ev.place_name || "—"}</div>}
                {ev.status === "rejected" && ev.review_note && <div className="gl-pp-err" style={{ margin: "6px 0 0", fontSize: 13 }}>Nota: {ev.review_note}</div>}
              </div>
            </div>

            {rejecting === ev.id ? (
              <div style={{ marginTop: 12 }}>
                <input className="gl-pp-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo (lo vede il locale, facoltativo)" />
                <div className="gl-pp-actions">
                  <button className="gl-pp-btn danger" onClick={() => act(ev, { status: "rejected", review_note: note || null }, "Evento rifiutato")}>Conferma rifiuto</button>
                  <button className="gl-pp-btn ghost" onClick={() => { setRejecting(null); setNote(""); }}>Annulla</button>
                </div>
              </div>
            ) : confirmDel === ev.id ? (
              <div className="gl-pp-actions">
                <span style={{ fontSize: 13.5, fontWeight: 600, alignSelf: "center" }}>Eliminare l'evento?</span>
                <button className="gl-pp-btn danger" onClick={() => remove(ev)}>Sì, elimina</button>
                <button className="gl-pp-btn ghost" onClick={() => setConfirmDel(null)}>No</button>
              </div>
            ) : (
              <div className="gl-pp-actions">
                {isAdmin && ev.status === "pending" && <button className="gl-pp-btn" onClick={() => act(ev, { status: "approved", review_note: null }, "Evento pubblicato ✓")}>Approva</button>}
                {isAdmin && ev.status === "pending" && <button className="gl-pp-btn ghost" onClick={() => setRejecting(ev.id)}>Rifiuta</button>}
                {isAdmin && ev.status === "approved" && <button className="gl-pp-btn ghost" onClick={() => act(ev, { status: "draft" }, "Evento ritirato dall'app")}>Ritira</button>}
                {!isAdmin && ev.status === "draft" && <button className="gl-pp-btn" onClick={() => act(ev, { status: "pending" }, "Inviato per approvazione")}>Invia</button>}
                <button className="gl-pp-btn ghost" onClick={() => onEdit(ev)}>Modifica</button>
                <button className="gl-pp-btn ghost" onClick={() => setConfirmDel(ev.id)}>Elimina</button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------ form evento ------------------------------- */
function EventForm({ initial, isAdmin, venues, myVenue, uid, onCancel, onSaved }) {
  const today = nowInRome().date;
  const [f, setF] = useState(() => ({
    poster_url: initial?.poster_url || "",
    title_it: initial?.title_it || "", title_en: initial?.title_en || "",
    desc_it: initial?.desc_it || "", desc_en: initial?.desc_en || "",
    link_url: initial?.link_url || "",
    schedule_type: initial?.schedule_type || "single",
    start_date: initial?.start_date || today, end_date: initial?.end_date || "",
    start_time: hhmm(initial?.start_time), end_time: hhmm(initial?.end_time),
    weekdays: initial?.weekdays || [],
    venue_id: initial ? initial.venue_id || "" : isAdmin ? "" : myVenue?.id || "",
    place_name: initial?.place_name || "", address: initial?.address || "",
  }));
  const [upState, setUpState] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [showEn, setShowEn] = useState(Boolean(initial?.title_en || initial?.desc_en));

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggleDay = (d) => setF((x) => ({ ...x, weekdays: x.weekdays.includes(d) ? x.weekdays.filter((y) => y !== d) : [...x.weekdays, d] }));

  const onFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErr("Carica un'immagine (JPG, PNG o WEBP). Per i PDF, esporta prima la locandina come immagine."); return; }
    setErr(""); setUpState("Carico la locandina…");
    try { const url = await uploadPoster(file, uid); setF((x) => ({ ...x, poster_url: url })); setUpState(""); }
    catch (ex) { setUpState(""); setErr(errText(ex)); }
  };

  // anteprima di come apparirà la data nel popup
  const preview = useMemo(() => {
    try {
      if (!f.start_date) return "";
      if (f.schedule_type === "recurring" && !f.weekdays.length) return "";
      return whenLabel({ ...f, end_date: f.end_date || null }, "it");
    } catch { return ""; }
  }, [f]);

  const validate = () => {
    if (!f.poster_url) return "Manca la locandina.";
    if (!f.title_it.trim()) return "Manca il titolo.";
    if (!f.start_date) return f.schedule_type === "recurring" ? "Indica da quando parte." : "Manca la data.";
    if (f.schedule_type === "range" && !f.end_date) return "Manca la data di fine.";
    if (f.end_date && f.end_date < f.start_date) return "La data di fine è prima di quella di inizio.";
    if (f.schedule_type === "recurring" && !f.weekdays.length) return "Scegli almeno un giorno della settimana.";
    if (f.end_time && !f.start_time) return "Hai messo l'orario di fine ma non quello di inizio.";
    if (f.link_url && !/^https?:\/\//i.test(f.link_url.trim())) return "Il link deve iniziare con https://";
    if (isAdmin && !f.venue_id && !f.place_name.trim()) return "Scegli il locale o scrivi il nome del luogo.";
    return "";
  };

  const save = async (status) => {
    const v = validate(); if (v) { setErr(v); return; }
    setErr(""); setSaving(true);
    const clean = (s) => (String(s || "").trim() ? String(s).trim() : null);
    const row = {
      poster_url: f.poster_url.trim(),
      title_it: f.title_it.trim(), title_en: clean(f.title_en),
      desc_it: clean(f.desc_it), desc_en: clean(f.desc_en),
      link_url: clean(f.link_url),
      schedule_type: f.schedule_type,
      start_date: f.start_date,
      end_date: f.schedule_type === "single" ? null : f.end_date || null,
      start_time: f.start_time || null, end_time: f.end_time || null,
      weekdays: f.schedule_type === "recurring" ? [...f.weekdays].sort() : null,
      venue_id: f.venue_id || null,
      place_name: f.venue_id ? null : clean(f.place_name),
      address: f.venue_id ? null : clean(f.address),
      status,
    };
    const q = initial ? supabase.from("events").update(row).eq("id", initial.id) : supabase.from("events").insert(row);
    const { error } = await q;
    setSaving(false);
    if (error) { setErr(errText(error)); return; }
    onSaved(status === "approved" ? "Evento pubblicato ✓" : status === "pending" ? "Inviato: lo controlliamo e lo pubblichiamo" : "Bozza salvata");
  };

  return (
    <div>
      <button className="gl-pp-link" onClick={onCancel} style={{ marginBottom: 14 }}>← Torna agli eventi</button>
      <h1 className="gl-pp-h1">{initial ? "Modifica evento" : "Nuovo evento"}</h1>

      <div className="gl-pp-form">
        {/* LOCANDINA */}
        <section className="gl-pp-card gl-pp-sec">
          <div className="gl-pp-sec-title">Locandina</div>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div className="gl-pp-poster">
              {f.poster_url ? <img src={f.poster_url} alt="Locandina" /> : <span>4:5 o A4<br />verticale</span>}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label className="gl-pp-btn" style={{ display: "inline-block", cursor: "pointer" }}>
                {f.poster_url ? "Cambia immagine" : "Carica immagine"}
                <input type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
              </label>
              {upState && <p className="gl-pp-muted" style={{ fontSize: 13 }}>{upState}</p>}
              <p className="gl-pp-muted" style={{ fontSize: 12.5, lineHeight: 1.45, margin: "10px 0 0" }}>JPG o PNG, anche dal telefono. La riduciamo noi per farla caricare veloce.</p>
              {isAdmin && (
                <>
                  <label className="gl-pp-label" style={{ marginTop: 14 }}>…oppure link diretto all'immagine</label>
                  <input className="gl-pp-input" value={f.poster_url} onChange={set("poster_url")} placeholder="https://…/locandina.jpg" />
                </>
              )}
            </div>
          </div>
        </section>

        {/* TESTI */}
        <section className="gl-pp-card gl-pp-sec">
          <div className="gl-pp-sec-title">Evento</div>
          <label className="gl-pp-label">Titolo *</label>
          <input className="gl-pp-input" value={f.title_it} onChange={set("title_it")} placeholder="Es. Jazz al bancone" maxLength={90} />
          <label className="gl-pp-label">Descrizione breve</label>
          <textarea className="gl-pp-input" rows={3} value={f.desc_it} onChange={set("desc_it")} placeholder="Facoltativa: finisce nel promemoria del calendario" maxLength={400} />
          <label className="gl-pp-label">Link per saperne di più</label>
          <input className="gl-pp-input" value={f.link_url} onChange={set("link_url")} placeholder="Biglietti, post Instagram, sito… (facoltativo)" inputMode="url" />
          {!showEn ? (
            <button className="gl-pp-link" style={{ marginTop: 12 }} onClick={() => setShowEn(true)}>+ Aggiungi testi in inglese</button>
          ) : (
            <>
              <label className="gl-pp-label">Titolo in inglese</label>
              <input className="gl-pp-input" value={f.title_en} onChange={set("title_en")} placeholder="Se vuoto, usiamo quello italiano" maxLength={90} />
              <label className="gl-pp-label">Descrizione in inglese</label>
              <textarea className="gl-pp-input" rows={3} value={f.desc_en} onChange={set("desc_en")} maxLength={400} />
            </>
          )}
        </section>

        {/* QUANDO */}
        <section className="gl-pp-card gl-pp-sec">
          <div className="gl-pp-sec-title">Quando</div>
          <div className="gl-pp-seg">
            {SCHEDULES.map((s) => (
              <button key={s.id} className={f.schedule_type === s.id ? "on" : ""} onClick={() => setF((x) => ({ ...x, schedule_type: s.id }))}>{s.label}</button>
            ))}
          </div>

          {f.schedule_type === "recurring" && (
            <>
              <label className="gl-pp-label">Ogni settimana, di…</label>
              <div style={{ display: "flex", gap: 6 }}>
                {WEEK.map((d) => (
                  <button key={d.v} title={d.l} aria-label={d.l} className={`gl-pp-day${f.weekdays.includes(d.v) ? " on" : ""}`} onClick={() => toggleDay(d.v)}>{d.s}</button>
                ))}
              </div>
            </>
          )}

          <div className="gl-pp-row">
            <div>
              <label className="gl-pp-label">{f.schedule_type === "single" ? "Data *" : f.schedule_type === "range" ? "Dal *" : "A partire da *"}</label>
              <input className="gl-pp-input" type="date" value={f.start_date} onChange={set("start_date")} />
            </div>
            {f.schedule_type !== "single" && (
              <div>
                <label className="gl-pp-label">{f.schedule_type === "range" ? "Al *" : "Fino al (facoltativo)"}</label>
                <input className="gl-pp-input" type="date" value={f.end_date} min={f.start_date} onChange={set("end_date")} />
              </div>
            )}
          </div>
          <div className="gl-pp-row">
            <div>
              <label className="gl-pp-label">Dalle ore</label>
              <input className="gl-pp-input" type="time" value={f.start_time} onChange={set("start_time")} />
            </div>
            <div>
              <label className="gl-pp-label">Alle ore</label>
              <input className="gl-pp-input" type="time" value={f.end_time} onChange={set("end_time")} />
            </div>
          </div>
          {preview && <p className="gl-pp-preview">Nell'app apparirà così: <b>{preview}</b></p>}
        </section>

        {/* DOVE (solo admin: il partner pubblica sempre per il suo locale) */}
        {isAdmin ? (
          <section className="gl-pp-card gl-pp-sec">
            <div className="gl-pp-sec-title">Dove</div>
            <label className="gl-pp-label">Locale</label>
            <select className="gl-pp-input" value={f.venue_id} onChange={set("venue_id")}>
              <option value="">Altro luogo (scrivilo sotto)</option>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            {!f.venue_id && (
              <>
                <label className="gl-pp-label">Nome del luogo *</label>
                <input className="gl-pp-input" value={f.place_name} onChange={set("place_name")} placeholder="Es. Piazza Santo Stefano" />
                <label className="gl-pp-label">Indirizzo</label>
                <input className="gl-pp-input" value={f.address} onChange={set("address")} placeholder="Serve per il pin itinerario e Google Maps" />
              </>
            )}
          </section>
        ) : (
          <p className="gl-pp-muted" style={{ fontSize: 13.5, margin: "4px 2px" }}>📍 {myVenue?.name}</p>
        )}

        {err && <p className="gl-pp-err">{err}</p>}
        <div className="gl-pp-actions" style={{ marginTop: 4 }}>
          {isAdmin
            ? <button className="gl-pp-btn" disabled={saving || !!upState} onClick={() => save("approved")}>{saving ? "Salvo…" : "Pubblica"}</button>
            : <button className="gl-pp-btn" disabled={saving || !!upState} onClick={() => save("pending")}>{saving ? "Invio…" : "Invia per approvazione"}</button>}
          <button className="gl-pp-btn ghost" disabled={saving || !!upState} onClick={() => save("draft")}>Salva bozza</button>
          <button className="gl-pp-btn ghost" onClick={onCancel}>Annulla</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ locali e account (admin) ------------------ */
function VenuesAdmin({ venues, profiles, places, onChanged }) {
  const blank = { card_id: "", name: "", address: "", lat: "", lng: "" };
  const [v, setV] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);

  const cards = useMemo(() => [...places].sort((a, b) => String(a.title_it).localeCompare(String(b.title_it))), [places]);
  const pickCard = (e) => {
    const c = places.find((p) => String(p.id) === e.target.value);
    setV(c ? { card_id: String(c.id), name: c.title_it || "", address: c.address || "", lat: c.lat ?? "", lng: c.lng ?? "" } : blank);
  };

  const addVenue = async (e) => {
    e.preventDefault();
    if (!v.name.trim()) { setErr("Manca il nome del locale."); return; }
    setErr(""); setSaving(true);
    const { error } = await supabase.from("venues").insert({
      name: v.name.trim(), card_id: v.card_id || null, address: v.address.trim() || null,
      lat: v.lat === "" ? null : Number(v.lat), lng: v.lng === "" ? null : Number(v.lng),
    });
    setSaving(false);
    if (error) { setErr(errText(error)); return; }
    setV(blank); onChanged("Locale aggiunto");
  };
  const delVenue = async (id) => {
    const { error } = await supabase.from("venues").delete().eq("id", id);
    setConfirmDel(null); onChanged(error ? errText(error) : "Locale eliminato");
  };
  const linkProfile = async (p, venue_id) => {
    const { error } = await supabase.from("profiles").update({ venue_id: venue_id || null }).eq("id", p.id);
    onChanged(error ? errText(error) : venue_id ? "Account collegato al locale" : "Account scollegato");
  };

  return (
    <div className="gl-pp-form">
      <section className="gl-pp-card gl-pp-sec">
        <div className="gl-pp-sec-title">Account dei locali</div>
        <p className="gl-pp-muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 0 }}>
          Per dare l'accesso a un locale: su Supabase vai in <b>Authentication → Users → Invite user</b> e inserisci la sua email. Appena accetta l'invito compare qui sotto: collegalo al suo locale.
        </p>
        {profiles.length === 0 ? <p className="gl-pp-muted">Nessun account.</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {profiles.map((p) => (
              <div key={p.id} className="gl-pp-line">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="gl-pp-ellipsis" style={{ display: "block", fontWeight: 600, fontSize: 14 }}>{p.email}</span>
                  <span className="gl-pp-muted" style={{ fontSize: 12 }}>{p.role === "admin" ? "Admin" : p.venue_id ? "Partner" : "Partner · da collegare"}</span>
                </span>
                {p.role !== "admin" && (
                  <select className="gl-pp-input" style={{ width: "auto", maxWidth: 200, margin: 0 }} value={p.venue_id || ""} onChange={(e) => linkProfile(p, e.target.value)}>
                    <option value="">— nessun locale —</option>
                    {venues.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="gl-pp-card gl-pp-sec">
        <div className="gl-pp-sec-title">Locali</div>
        {venues.length === 0 ? <p className="gl-pp-muted">Nessun locale.</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {venues.map((x) => (
              <div key={x.id} className="gl-pp-line">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600, fontSize: 14 }}>{x.name}</span>
                  <span className="gl-pp-muted gl-pp-ellipsis" style={{ display: "block", fontSize: 12 }}>{x.address || "senza indirizzo"}{x.card_id ? " · card collegata" : ""}</span>
                </span>
                {confirmDel === x.id ? (
                  <>
                    <button className="gl-pp-btn danger small" onClick={() => delVenue(x.id)}>Elimina</button>
                    <button className="gl-pp-btn ghost small" onClick={() => setConfirmDel(null)}>No</button>
                  </>
                ) : <button className="gl-pp-btn ghost small" onClick={() => setConfirmDel(x.id)}>Elimina</button>}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={addVenue} style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${BRAND.border}` }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>Aggiungi un locale</div>
          <label className="gl-pp-label">Dalle card dell'app (facoltativo)</label>
          <select className="gl-pp-input" value={v.card_id} onChange={pickCard}>
            <option value="">— locale senza card —</option>
            {cards.map((c) => <option key={c.id} value={c.id}>{c.title_it}</option>)}
          </select>
          <label className="gl-pp-label">Nome *</label>
          <input className="gl-pp-input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          <label className="gl-pp-label">Indirizzo</label>
          <input className="gl-pp-input" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} placeholder="Via…, Bologna" />
          {err && <p className="gl-pp-err">{err}</p>}
          <button className="gl-pp-btn" type="submit" disabled={saving} style={{ marginTop: 14 }}>{saving ? "Salvo…" : "Aggiungi locale"}</button>
        </form>
      </section>
    </div>
  );
}

/* ------------------------------ stili ------------------------------------- */
function PortalStyles() {
  return (
    <style>{`
      .gl-pp { min-height: 100vh; background: ${BRAND.bg}; color: ${BRAND.ink}; font-family: 'Archivo', system-ui, sans-serif; }
      .gl-pp-head { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; background: rgba(251,248,240,0.94); backdrop-filter: blur(10px); border-bottom: 1px solid ${BRAND.border}; }
      .gl-pp-tag { font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #fff; background: ${BRAND.ink}; padding: 4px 8px; border-radius: 6px; }
      .gl-pp-main { max-width: 720px; margin: 0 auto; padding: 22px 16px 80px; }
      .gl-pp-h1 { font-family: 'Fraunces', serif; font-weight: 600; font-size: clamp(26px, 6vw, 32px); letter-spacing: -0.02em; line-height: 1.1; margin: 0 0 10px; }
      .gl-pp-kicker { font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: ${BRAND.green}; margin-bottom: 4px; }
      .gl-pp-muted { color: ${BRAND.muted}; }
      .gl-pp-ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .gl-pp-card { background: ${BRAND.card}; border: 1px solid ${BRAND.border}; border-radius: 16px; }
      .gl-pp-form { display: flex; flex-direction: column; gap: 14px; }
      .gl-pp-sec { padding: 18px; }
      .gl-pp-sec-title { font-size: 12.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: ${BRAND.muted}; margin-bottom: 12px; }
      .gl-pp-label { display: block; font-size: 12.5px; font-weight: 700; color: #3a3630; margin: 14px 0 6px; }
      .gl-pp-sec .gl-pp-label:first-of-type { margin-top: 0; }
      .gl-pp-input { width: 100%; box-sizing: border-box; padding: 12px 13px; border-radius: 12px; border: 1.5px solid ${BRAND.border}; background: #fff; font: 15px 'Archivo', system-ui, sans-serif; color: ${BRAND.ink}; outline: none; }
      .gl-pp-input:focus { border-color: ${BRAND.green}; }
      textarea.gl-pp-input { resize: vertical; }
      .gl-pp-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .gl-pp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: ${BRAND.green}; color: #fff; border: 1.5px solid ${BRAND.green}; border-radius: 12px; padding: 11px 18px; font: 700 14.5px 'Archivo', system-ui, sans-serif; cursor: pointer; text-decoration: none; }
      .gl-pp-btn:disabled { opacity: .55; cursor: default; }
      .gl-pp-btn.ghost { background: transparent; color: ${BRAND.ink}; border-color: ${BRAND.border}; }
      .gl-pp-btn.danger { background: ${BRAND.red}; border-color: ${BRAND.red}; }
      .gl-pp-btn.small { padding: 7px 12px; font-size: 13px; }
      .gl-pp-link { background: none; border: none; padding: 0; color: ${BRAND.greenDark}; font: 700 14px 'Archivo', system-ui, sans-serif; cursor: pointer; }
      .gl-pp-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
      .gl-pp-badge { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: .03em; padding: 3px 8px; border-radius: 999px; }
      .gl-pp-err { color: ${BRAND.red}; font-size: 14px; font-weight: 600; margin: 10px 0 0; }
      .gl-pp-tabs { display: flex; gap: 18px; border-bottom: 1px solid ${BRAND.border}; margin-bottom: 16px; overflow-x: auto; }
      .gl-pp-tabs button { background: none; border: none; border-bottom: 3px solid transparent; padding: 10px 0; font: 700 13px 'Archivo', system-ui, sans-serif; letter-spacing: .03em; text-transform: uppercase; color: ${BRAND.muted}; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
      .gl-pp-tabs button.on { color: ${BRAND.ink}; border-bottom-color: ${BRAND.green}; }
      .gl-pp-count { min-width: 18px; height: 18px; border-radius: 9px; background: ${BRAND.red}; color: #fff; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; padding: 0 5px; }
      .gl-pp-seg { display: flex; background: #f1ecdf; border-radius: 12px; padding: 4px; gap: 4px; margin-bottom: 4px; }
      .gl-pp-seg button { flex: 1; border: none; background: transparent; border-radius: 9px; padding: 10px 6px; font: 700 13.5px 'Archivo', system-ui, sans-serif; color: ${BRAND.muted}; cursor: pointer; }
      .gl-pp-seg button.on { background: #fff; color: ${BRAND.ink}; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
      .gl-pp-day { flex: 1; aspect-ratio: 1; max-width: 46px; border-radius: 50%; border: 1.5px solid ${BRAND.border}; background: #fff; font: 700 14px 'Archivo', system-ui, sans-serif; color: ${BRAND.ink}; cursor: pointer; }
      .gl-pp-day.on { background: ${BRAND.green}; border-color: ${BRAND.green}; color: #fff; }
      .gl-pp-preview { margin: 16px 0 0; padding: 11px 13px; border-radius: 12px; background: rgba(56,176,74,0.08); font-size: 13.5px; color: #3c3826; }
      .gl-pp-preview b { color: ${BRAND.red}; }
      .gl-pp-poster { width: 140px; aspect-ratio: 4 / 5; border-radius: 12px; overflow: hidden; background: #f1ecdf; border: 1.5px dashed ${BRAND.border}; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 12px; color: ${BRAND.muted}; flex-shrink: 0; }
      .gl-pp-poster img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .gl-pp-line { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid ${BRAND.border}; border-radius: 12px; }
      .gl-pp-toast { position: fixed; left: 50%; bottom: calc(22px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); background: ${BRAND.ink}; color: #fff; padding: 12px 18px; border-radius: 12px; font-size: 14px; font-weight: 600; box-shadow: 0 10px 30px rgba(0,0,0,0.25); z-index: 50; max-width: calc(100% - 32px); }
      @media (max-width: 420px) { .gl-pp-row { grid-template-columns: 1fr; gap: 0; } }
    `}</style>
  );
}
