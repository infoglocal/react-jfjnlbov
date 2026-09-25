// netlify/functions/ics.js
//
// "Aggiungi al calendario" per iPhone / Apple Calendar / Outlook.
// L'app apre /.netlify/functions/ics?id=<id evento>&d=<AAAA-MM-GG>&lang=it
// e questa funzione risponde con un file .ics: l'iPhone mostra subito
// "Aggiungi al calendario", gli altri telefoni lo aprono col calendario.
//
// Legge l'evento dal database con la chiave pubblica: vede solo eventi
// approvati, quindi nessuno può generare un .ics "a nome di Glocal" con testi
// inventati. Riusa la stessa logica di date dell'app (src/events/schedule.js).

import { buildIcs, nextOccurrence, authHeaders } from "../../src/events/schedule.js";
import config from "../../src/events/config.json";

const URL_ = (process.env.REACT_APP_SUPABASE_URL || config.supabaseUrl || "").replace(/\/$/, "");
const KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || config.supabaseAnonKey || "";
const UUID_RE = /^[0-9a-f-]{36}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const handler = async (event) => {
  const { id, d, lang } = event.queryStringParameters || {};
  if (!id || !UUID_RE.test(id)) return { statusCode: 400, body: "Bad id" };
  if (!URL_ || !KEY) return { statusCode: 500, body: "Server not configured" };

  const select = encodeURIComponent("*,venue:venues(name,address)");
  const res = await fetch(`${URL_}/rest/v1/events?select=${select}&id=eq.${id}&status=eq.approved`, {
    headers: authHeaders(KEY),
  });
  const rows = res.ok ? await res.json() : [];
  const ev = rows[0];
  if (!ev) return { statusCode: 404, body: "Not found" };

  const en = lang === "en";
  const occDate = d && DATE_RE.test(d) ? d : nextOccurrence(ev)?.date || ev.start_date;
  const place = ev.place_name || ev.venue?.name || "";
  const address = ev.address || ev.venue?.address || "";
  const ics = buildIcs(ev, occDate, {
    title: (en && ev.title_en) || ev.title_it,
    location: [place, address].filter(Boolean).join(", "),
    details: [(en && ev.desc_en) || ev.desc_it, ev.link_url].filter(Boolean).join("\n\n"),
    url: ev.link_url || undefined,
  });

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="glocal-evento.ics"`,
      "Cache-Control": "public, max-age=300",
    },
    body: ics,
  };
};
