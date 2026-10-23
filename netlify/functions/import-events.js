// netlify/functions/import-events.js
//
// Parte da sola ogni mattina alle 6:30 circa (ora di Bologna) e importa i nuovi
// eventi di BolognaToday come "Da approvare". Tutta la logica e i filtri sono in
// netlify/lib/import-events.js.
//
// Per lanciarla subito: Netlify -> Functions -> import-events -> "Run now".

import { runImport } from "../lib/import-events.js";

export default async () => {
  const report = await runImport();
  console.log(JSON.stringify({
    found: report.found, alreadySeen: report.alreadySeen, checked: report.checked,
    imported: report.imported.length, skipped: report.skipped.length,
    leftForNextRun: report.leftForNextRun, errors: report.errors, ms: report.ms,
  }));
  return new Response("ok");
};

// cron in UTC: 4:31 UTC = 6:31 in Italia con l'ora legale, 5:31 con quella solare
export const config = { schedule: "31 4 * * *" };
