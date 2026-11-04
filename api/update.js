// This route bypasses every historical SCDR TV service worker (/api/* was
// always excluded). It repairs a stale app shell without touching user storage.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.method !== "GET") return res.status(405).end();
  return res.status(200).send(`<!doctype html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mettre à jour SCDR TV</title><link rel="stylesheet" href="/app-update.css">
<script src="/app-update.js" defer></script></head><body><main>
<h1>Préparons Face ID.</h1><p id="status" role="status">Mise à jour d’SCDR TV en cours… Vos données sont conservées.</p>
<p>Vous pourrez ensuite vous connecter et activer Face ID sur cet appareil.</p>
<button id="retry" type="button" hidden>Réessayer la mise à jour</button>
</main></body></html>`);
}
