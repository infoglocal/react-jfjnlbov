// netlify/functions/subscribe-guide.js
//
// Riceve { email, lang } dal form della guida (GuideTab in App.js) e aggiunge
// il contatto alla lista Brevo. La API key resta qui, lato server: non finisce
// mai nel bundle pubblico della PWA.
//
// Da impostare su Netlify (Site settings -> Environment variables):
//   BREVO_API_KEY   la tua API key Brevo (Settings -> SMTP & API -> API Keys)
//   BREVO_LIST_ID    l'id numerico della lista Brevo dove salvare il contatto

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let email, lang;
  try {
    ({ email, lang } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  if (!email || !email.includes("@")) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid email" }) };
  }

  const apiKey = process.env.BREVO_API_KEY;
  const listId = Number(process.env.BREVO_LIST_ID);

  if (!apiKey || !listId) {
    console.error("Missing BREVO_API_KEY or BREVO_LIST_ID env vars");
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        email,
        listIds: [listId],
        updateEnabled: true, // se l'email esiste gia', la aggiunge alla lista invece di fallire
        attributes: { LANG: (lang || "it").toUpperCase(), SOURCE: "guida_bologna" },
      }),
    });

    // Brevo risponde 400 "duplicate_parameter" se il contatto esiste gia' su
    // quella lista: non e' un errore per noi, l'utente va comunque sbloccato.
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (body.code !== "duplicate_parameter") {
        console.error("Brevo error", res.status, body);
        return { statusCode: 502, body: JSON.stringify({ error: "Brevo error" }) };
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("subscribe-guide failed", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Unexpected error" }) };
  }
};
