// Client Supabase, usato SOLO dal portale /partner (login, caricamenti).
// flowType "implicit": il link di accesso funziona anche se lo apri su un
// dispositivo diverso da quello dove l'hai chiesto (es. chiesto dal PC,
// aperto dall'email sul telefono).
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY, eventsEnabled } from "./data";

export const supabase = eventsEnabled
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
    })
  : null;
