// netlify/lib/import-events.js
//
// Importatore eventi da BolognaToday -> Supabase (tabella events, status "pending").
// Usato da:
//   netlify/functions/import-events.js      -> parte da solo ogni mattina
//   netlify/functions/import-events-now.js  -> lo lanci tu da un link (anche in prova)
//
// Come funziona:
//   1. legge le pagine elenco di BolognaToday e raccoglie i link agli eventi
//   2. salta quelli già visti (tabella import_seen)
//   3. apre ogni pagina nuova e legge i dati strutturati (schema.org Event:
//      titolo, date, luogo, immagine, descrizione), con ripiego sui meta og:
//   4. applica i filtri qui sotto (FILTRI) e inserisce gli eventi buoni come
//      "Da approvare". Non pubblica mai nulla da solo.
//
// Variabili d'ambiente su Netlify (Site settings -> Environment variables):
//   SUPABASE_SERVICE_ROLE_KEY  OBBLIGATORIA. Supabase -> Project Settings -> API
//                              -> service_role (segreta: non metterla mai nel codice)
//   IMPORT_SECRET              una parola d'ordine a tua scelta, serve solo per
//                              lanciare l'import a mano da import-events-now

import config from "../../src/events/config.json";

// ============================== FILTRI =======================================
// Modificali liberamente: sono confronti senza maiuscole/minuscole.
export const SETTINGS = {
  // pagine da cui raccogliere i link agli eventi
  listUrls: [
    "https://www.bolognatoday.it/eventi/",
    "https://www.bolognatoday.it/eventi/oggi/",
    "https://www.bolognatoday.it/eventi/weekend/",
    "https://www.bolognatoday.it/rss/eventi/",
  ],
  // importa solo eventi che iniziano entro questi giorni (o già in corso)
  daysAhead: 30,
  // categorie da scartare (come le scrive BolognaToday, anche solo una parte)
  excludeCategories: ["sport", "fiere", "corsi", "convegni", "politica"],
  // parole che, se presenti in titolo o luogo, fanno scartare l'evento
  excludeKeywords: [
    "unipol arena", "stadio", "dall'ara", "bolognafiere", "fiera di bologna",
    "virtus", "bologna fc", "fortitudo", "webinar", "online",
  ],
  // comuni ammessi (vuoto = tutti). Se la fonte non indica il comune, l'evento passa.
  onlyCities: ["bologna"],
  // limiti per stare nei 30 secondi delle funzioni Netlify
  maxPagesPerRun: 50,
  concurrency: 5,
  deadlineMs: 22000,
  descMaxChars: 320,
};
// =============================================================================

const SOURCE = "bolognatoday";
const HOST = "https://www.bolognatoday.it";
const TZ = "Europe/Rome";
const UA = "Mozilla/5.0 (compatible; GlocalEvents/1.0; +https://g-local.it)";

const SB_URL = (process.env.REACT_APP_SUPABASE_URL || config.supabaseUrl || "").replace(/\/$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// ----------------------------------------------------------------------------
// HTTP
// ----------------------------------------------------------------------------
async function getText(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "it-IT,it;q=0.9" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function sb(path, init = {}) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

// ----------------------------------------------------------------------------
// Parsing
// ----------------------------------------------------------------------------
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", egrave: "è", eacute: "é", agrave: "à", igrave: "ì", ograve: "ò", ugrave: "ù", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", hellip: "…", ndash: "–", mdash: "—" };
export function decode(s = "") {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}
export const stripTags = (s = "") => decode(String(s).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function truncate(s, max) {
  if (!s || s.length <= max) return s || "";
  const cut = s.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${cut.slice(0, at > max * 0.6 ? at : max).replace(/[\s,;:.–-]+$/, "")}…`;
}

// Link alle pagine evento, da HTML o RSS
export function extractEventLinks(text) {
  const out = new Set();
  const re = /(?:https?:\/\/(?:www\.)?bolognatoday\.it)?(\/eventi\/[a-z0-9\-/_]+\.html)/gi;
  let m;
  while ((m = re.exec(text))) out.add(`${HOST}${m[1]}`);
  return [...out];
}

function meta(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag ? decode(tag.match(/content=["']([^"']*)["']/i)?.[1] || "") : "";
}

function jsonLdBlocks(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1].trim());
      const stack = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const n = stack.shift();
        if (!n || typeof n !== "object") continue;
        out.push(n);
        if (Array.isArray(n["@graph"])) stack.push(...n["@graph"]);
      }
    } catch { /* JSON non valido: ignora */ }
  }
  return out;
}

const typesOf = (n) => (Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]]).filter(Boolean).map(String);
const isEventNode = (n) => typesOf(n).some((t) => /event$|festival$/i.test(t));

function imageOf(x) {
  if (!x) return "";
  if (typeof x === "string") return x;
  if (Array.isArray(x)) return imageOf(x[0]);
  return x.url || x.contentUrl || "";
}

// "2026-10-24T21:00:00+02:00" -> { date: "2026-10-24", time: "21:00" } in ora di Bologna
export function toRome(iso) {
  if (!iso) return null;
  const s = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { date: s, time: null };
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((x) => [x.type, x.value])
  );
  const time = `${p.hour}:${p.minute}`;
  // mezzanotte esatta di solito vuol dire "orario non indicato"
  return { date: `${p.year}-${p.month}-${p.day}`, time: time === "00:00" ? null : time };
}

function categoryFromUrl(url) {
  // https://www.bolognatoday.it/eventi/concerti/nome-evento.html -> "concerti"
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  return parts.length >= 3 ? parts[1].replace(/-/g, " ") : "";
}

function breadcrumbCategory(nodes) {
  const bc = nodes.find((n) => typesOf(n).includes("BreadcrumbList"));
  const items = (bc?.itemListElement || []).map((i) => i?.name || i?.item?.name).filter(Boolean);
  // es. ["Home", "Eventi", "Concerti", "Titolo"] -> "Concerti"
  const i = items.findIndex((x) => /^eventi$/i.test(x));
  return i >= 0 && items[i + 1] && i + 2 < items.length ? items[i + 1] : "";
}

// Dati di una pagina evento -> riga per la tabella events (o null + motivo)
export function parseEventPage(html, url) {
  const nodes = jsonLdBlocks(html);
  const ev = nodes.find(isEventNode) || {};
  const loc = Array.isArray(ev.location) ? ev.location[0] : ev.location || {};
  const addr = typeof loc.address === "string" ? { streetAddress: loc.address } : loc.address || {};

  const title = stripTags(ev.name || meta(html, "og:title") || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  const desc = stripTags(ev.description || meta(html, "og:description") || meta(html, "description"));
  const image = imageOf(ev.image) || meta(html, "og:image");

  let start = toRome(ev.startDate);
  let end = toRome(ev.endDate);
  if (!start) {
    // ripiego: tag <time datetime="..."> nella pagina
    const times = [...html.matchAll(/<time[^>]+datetime=["']([^"']+)["']/gi)].map((m) => toRome(m[1])).filter(Boolean);
    if (times.length) { start = times[0]; end = times[times.length - 1]; }
  }

  const city = stripTags(addr.addressLocality || "");
  const street = stripTags(addr.streetAddress || "");
  const geo = loc.geo || {};
  const offerUrl = (Array.isArray(ev.offers) ? ev.offers[0] : ev.offers)?.url || "";

  return {
    title, desc, image, start, end, city,
    category: breadcrumbCategory(nodes) || categoryFromUrl(url),
    place_name: stripTags(loc.name || ""),
    address: [street, city && !street.toLowerCase().includes(city.toLowerCase()) ? city : ""].filter(Boolean).join(", "),
    lat: Number(geo.latitude) || null,
    lng: Number(geo.longitude) || null,
    link: /^https?:\/\//i.test(offerUrl) && !/bolognatoday\.it/i.test(offerUrl) ? offerUrl : url,
  };
}

// Applica i filtri. Ritorna { row } da inserire, oppure { skip: "motivo", permanent }
export function decide(p, url, today, S = SETTINGS) {
  const lc = (s) => (s || "").toLowerCase();
  if (!p.title) return { skip: "senza titolo", permanent: true };
  if (!p.start?.date) return { skip: "senza data", permanent: true };
  if (!p.image) return { skip: "senza immagine", permanent: true };

  const cat = lc(p.category);
  const badCat = S.excludeCategories.find((c) => cat.includes(lc(c)));
  if (badCat) return { skip: `categoria: ${p.category}`, permanent: true };
  const hay = `${lc(p.title)} ${lc(p.place_name)}`;
  const badKw = S.excludeKeywords.find((k) => hay.includes(lc(k)));
  if (badKw) return { skip: `parola esclusa: ${badKw}`, permanent: true };
  if (S.onlyCities.length && p.city && !S.onlyCities.some((c) => lc(p.city).includes(lc(c)))) {
    return { skip: `fuori città: ${p.city}`, permanent: true };
  }

  const lastDay = p.end?.date && p.end.date >= p.start.date ? p.end.date : p.start.date;
  if (lastDay < today) return { skip: "già concluso", permanent: true };
  const limit = addDaysIso(today, S.daysAhead);
  // troppo avanti: NON lo segniamo come visto, così lo riprende più avanti
  if (p.start.date > limit) return { skip: "troppo in là (lo riprendo più avanti)", permanent: false };

  const multiDay = p.end?.date && p.end.date > p.start.date;
  return {
    row: {
      source: SOURCE,
      source_url: url,
      category: p.category || null,
      status: "pending",
      title_it: truncate(p.title, 140),
      desc_it: truncate(p.desc, S.descMaxChars) || null,
      poster_url: p.image,
      link_url: p.link,
      place_name: p.place_name || null,
      address: p.address || null,
      lat: p.lat, lng: p.lng,
      schedule_type: multiDay ? "range" : "single",
      start_date: p.start.date,
      end_date: multiDay ? p.end.date : null,
      start_time: multiDay ? null : p.start.time,
      end_time: !multiDay && p.end?.time && p.start.time && p.end.time > p.start.time ? p.end.time : null,
      weekdays: null,
    },
  };
}

function addDaysIso(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function todayRome() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

// ----------------------------------------------------------------------------
// Esecuzione
// ----------------------------------------------------------------------------
export async function runImport({ dryRun = false } = {}) {
  const t0 = Date.now();
  const S = SETTINGS;
  const report = { dryRun, found: 0, alreadySeen: 0, checked: 0, imported: [], skipped: [], errors: [] };
  if (!SB_URL || (!SB_KEY && !dryRun)) {
    report.errors.push("Manca SUPABASE_SERVICE_ROLE_KEY nelle variabili d'ambiente di Netlify.");
    return report;
  }

  // 1. link
  const links = new Set();
  for (const u of S.listUrls) {
    try { extractEventLinks(await getText(u)).forEach((l) => links.add(l)); }
    catch (e) { report.errors.push(`Elenco ${u}: ${e.message}`); }
  }
  report.found = links.size;

  // 2. già visti
  let todo = [...links];
  if (SB_KEY && todo.length) {
    const seen = new Set();
    for (let i = 0; i < todo.length; i += 40) {
      const chunk = todo.slice(i, i + 40);
      const inList = chunk.map((u) => `"${u.replace(/"/g, '\\"')}"`).join(",");
      const res = await sb(`import_seen?select=source_url&source_url=in.(${encodeURIComponent(inList)})`);
      if (!res.ok) { report.errors.push(`import_seen ${res.status}: ${await res.text()}`); break; }
      (await res.json()).forEach((r) => seen.add(r.source_url));
    }
    report.alreadySeen = seen.size;
    todo = todo.filter((u) => !seen.has(u));
  }
  todo = todo.slice(0, S.maxPagesPerRun);

  // 3-4. pagine evento
  const today = todayRome();
  const seenRows = [];
  const queue = [...todo];
  const worker = async () => {
    while (queue.length && Date.now() - t0 < S.deadlineMs) {
      const url = queue.shift();
      report.checked++;
      let parsed;
      try { parsed = parseEventPage(await getText(url), url); }
      catch (e) { report.errors.push(`${url}: ${e.message}`); continue; }

      const d = decide(parsed, url, today, S);
      if (d.skip) {
        report.skipped.push({ url, title: parsed.title, reason: d.skip });
        if (d.permanent) seenRows.push({ source_url: url, source: SOURCE, outcome: `skipped:${d.skip}`.slice(0, 200) });
        continue;
      }
      if (dryRun) { report.imported.push({ url, title: d.row.title_it, when: `${d.row.start_date}${d.row.end_date ? ` → ${d.row.end_date}` : ""}${d.row.start_time ? ` ${d.row.start_time}` : ""}`, place: d.row.place_name, category: d.row.category, image: d.row.poster_url }); continue; }

      const res = await sb("events", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(d.row) });
      if (res.ok || res.status === 409) {
        report.imported.push({ url, title: d.row.title_it, when: d.row.start_date });
        seenRows.push({ source_url: url, source: SOURCE, outcome: "imported" });
      } else {
        report.errors.push(`Inserimento ${url}: ${res.status} ${await res.text()}`);
      }
    }
  };
  await Promise.all(Array.from({ length: S.concurrency }, worker));
  report.leftForNextRun = queue.length;

  if (!dryRun && seenRows.length) {
    const res = await sb("import_seen", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(seenRows),
    });
    if (!res.ok) report.errors.push(`import_seen ${res.status}: ${await res.text()}`);
  }

  report.ms = Date.now() - t0;
  return report;
}
