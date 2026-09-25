/* ============================================================================
   EVENTI — lettura dal database (Supabase)
   ----------------------------------------------------------------------------
   L'app pubblica legge gli eventi con una semplice chiamata REST, senza
   caricare la libreria Supabase (che serve solo al portale /partner e viene
   scaricata solo lì): così l'app per i turisti resta leggera.
   Il database restituisce ai turisti SOLO gli eventi approvati (regole RLS).
   ============================================================================ */
import { useEffect, useMemo, useState } from "react";
import config from "./config.json";
import { authHeaders } from "./schedule";

export const SUPABASE_URL = (process.env.REACT_APP_SUPABASE_URL || config.supabaseUrl || "").replace(/\/$/, "");
export const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || config.supabaseAnonKey || "";
export const eventsEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const EVENT_PREFIX = "ev:"; // id degli eventi nell'itinerario: "ev:<uuid>"

const SELECT = "*,venue:venues(name,address,lat,lng,card_id)";

export async function fetchApprovedEvents() {
  if (!eventsEnabled) return [];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/events?select=${encodeURIComponent(SELECT)}&status=eq.approved`, {
    headers: authHeaders(SUPABASE_KEY),
  });
  if (!res.ok) throw new Error(`events ${res.status}`);
  return res.json();
}

// Trasforma un evento del database in un oggetto con la stessa "forma" delle
// card del Google Sheet (title_it, image, location, address, lat, lng…), così
// l'itinerario, il percorso su Google Maps e la condivisione WhatsApp lo
// gestiscono esattamente come un posto.
// Se il locale è collegato a una card dello Sheet (venues.card_id), l'evento
// ne eredita nome, indirizzo e coordinate quando non li ha già.
export function normalizeEvent(e, places = []) {
  const v = e.venue || {};
  const card = v.card_id ? places.find((p) => String(p.id) === String(v.card_id)) : null;
  const num = (x) => (x === null || x === undefined || x === "" ? null : Number(x) || null);
  return {
    ...e,
    id: `${EVENT_PREFIX}${e.id}`,
    eventId: e.id,
    isEvent: true,
    card: card || null,
    title_en: e.title_en || e.title_it,
    desc_en: e.desc_en || e.desc_it,
    image: e.poster_url,
    location: e.place_name || v.name || card?.title_it || "",
    address: e.address || v.address || card?.address || "",
    lat: num(e.lat) ?? num(v.lat) ?? card?.lat ?? null,
    lng: num(e.lng) ?? num(v.lng) ?? card?.lng ?? null,
    price: "",
  };
}

// Hook: eventi approvati, già normalizzati. [] se Supabase non è configurato
// o se il caricamento fallisce (l'app funziona come prima, senza eventi).
export function useEvents(places) {
  const [raw, setRaw] = useState([]);
  useEffect(() => {
    let alive = true;
    fetchApprovedEvents().then((rows) => { if (alive) setRaw(rows || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return useMemo(() => raw.map((e) => normalizeEvent(e, places)), [raw, places]);
}
