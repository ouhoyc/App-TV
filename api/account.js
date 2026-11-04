import { workspaceSnapshot } from "../lib/workspace.js";
import {
  prepare,
  client,
  cookie,
  sessionClient,
  edge,
  ApiError,
  respondError,
  validCredential,
} from "../lib/server.js";
// Réveil : ouvre aussi les connexions vers Supabase (authentification et base)
// pendant Face ID, sans session ni lecture de données.
export async function warmSupabase() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return;
  const signal = AbortSignal.timeout(2500);
  await Promise.allSettled([
    fetch(url + "/auth/v1/health", { headers: { apikey: key }, signal }),
    fetch(url + "/rest/v1/", {
      method: "HEAD",
      headers: { apikey: key },
      signal,
    }),
    // Vraie requête vide : la base se réveille ; sans session, le rôle anonyme
    // n’a aucun droit sur cette table (permission refusée, aucune ligne).
    fetch(url + "/rest/v1/app_tv_profiles?select=id&limit=0", {
      headers: { apikey: key },
      signal,
    }),
  ]);
}
export default async function handler(req, res) {
  // Réveil discret pendant Face ID : aucune lecture de session ni de données.
  if (req.method === "HEAD") {
    res.setHeader("Cache-Control", "no-store");
    await warmSupabase();
    return res.status(204).end();
  }
  try {
    prepare(req, res);
    if (req.method === "GET") {
      const { profile } = await sessionClient(req, res);
      return res.json({ profile });
    }
    const b = req.body || {};
    if (b.action === "logout") {
      try {
        const { db } = await sessionClient(req, res);
        await db.auth.signOut({ scope: "local" });
      } catch {}
      cookie(res, null);
      return res.json({ ok: true });
    }
    if (["invite", "set-active"].includes(b.action)) {
      const { profile, session } = await sessionClient(req, res);
      if (profile.role !== "admin")
        throw new ApiError("Accès administrateur requis.", 403);
      return res.json(await edge(b, session.access_token));
    }
    if (b.action === "recover-start") return res.json(await edge(b));
    if (!["login", "register", "recover-finish"].includes(b.action))
      throw new ApiError("Action inconnue.");
    if (
      typeof b.email !== "string" ||
      b.email.length > 254 ||
      !validCredential(b.credential)
    )
      throw new ApiError("Adresse ou mot de passe incorrect.");
    if (b.action === "register" || b.action === "recover-finish") await edge(b);
    const db = client();
    const t0 = Date.now();
    const { data, error } = await db.auth.signInWithPassword({
      email: b.email.trim().toLowerCase(),
      password: b.credential,
    });
    if (error || !data.session) {
      cookie(res, null);
      throw new ApiError("Adresse ou mot de passe incorrect.", 401);
    }
    const t1 = Date.now();
    const { data: profile } = await db
      .from("app_tv_profiles")
      .select("*")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile?.active) {
      await db.auth.signOut();
      cookie(res, null);
      throw new ApiError(
        "Ce compte n’est pas actif. Contactez un administrateur.",
        403,
      );
    }
    cookie(res, data.session);
    const t2 = Date.now();
    const workspace =
      b.with_workspace === true
        ? await workspaceSnapshot(db, profile)
        : undefined;
    // Durées seulement (aucune donnée) pour le diagnostic d’ouverture.
    res.setHeader(
      "Server-Timing",
      `auth;dur=${t1 - t0}, profil;dur=${t2 - t1}, donnees;dur=${Date.now() - t2}`,
    );
    return res.json({
      profile,
      ...(workspace ? { workspace } : {}),
    });
  } catch (error) {
    respondError(res, error);
  }
}
