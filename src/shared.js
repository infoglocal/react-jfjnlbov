/* ============================================================================
   Cose condivise tra l'app (App.js) e la parte eventi (src/events/).
   ============================================================================ */

export const BRAND = {
  green: "#38b04a", greenDark: "#2a8f39",
  red: "#e5383b",
  bg: "#FBF8F0", card: "#ffffff",
  border: "#e6e0d0", ink: "#1a1a1a", muted: "#7a7568",
};

// invia un evento a Google Analytics 4 (no-op se GA non è pronto)
export function track(event, params) {
  try { if (window.gtag) window.gtag("event", event, params || {}); } catch {}
}
