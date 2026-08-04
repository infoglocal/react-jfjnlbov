// Service worker minimo per Glocal PWA.
// Serve solo a rendere l'app "installabile" (icona a schermo pieno).
// NON mette in cache i contenuti del Google Sheet, così i dati restano sempre freschi.
const CACHE = "glocal-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

// Strategia network-first: prova sempre la rete (dati aggiornati),
// usa la cache solo come fallback se offline.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
