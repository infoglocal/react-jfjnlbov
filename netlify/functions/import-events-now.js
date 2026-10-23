// netlify/functions/import-events-now.js
//
// Lancia l'import a mano da un link, utile per provarlo:
//
//   PROVA (non scrive niente, ti mostra cosa importerebbe):
//   https://app.g-local.it/.netlify/functions/import-events-now?key=IMPORT_SECRET&dry=1
//
//   IMPORT VERO (gli eventi finiscono in "Da approvare" nel portale /partner):
//   https://app.g-local.it/.netlify/functions/import-events-now?key=IMPORT_SECRET
//
// IMPORT_SECRET è la parola d'ordine che imposti nelle variabili d'ambiente Netlify.

import { runImport } from "../lib/import-events.js";

export const handler = async (event) => {
  const { key, dry } = event.queryStringParameters || {};
  const secret = process.env.IMPORT_SECRET || "";
  if (!secret || key !== secret) return { statusCode: 403, body: "Forbidden" };

  const report = await runImport({ dryRun: dry === "1" });
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(report, null, 2),
  };
};
