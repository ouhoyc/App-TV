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
export default async function handler(req, res) {
  // Réveil discret pendant Face ID : aucune lecture de session ni de données.
  if (req.method === "HEAD") {
    res.setHeader("Cache-Control", "no-store");
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
    const { data, error } = await db.auth.signInWithPassword({
      email: b.email.trim().toLowerCase(),
      password: b.credential,
    });
    if (error || !data.session) {
      cookie(res, null);
      throw new ApiError("Adresse ou mot de passe incorrect.", 401);
    }
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
    return res.json({
      profile,
      ...(b.with_workspace === true
        ? { workspace: await workspaceSnapshot(db, profile) }
        : {}),
    });
  } catch (error) {
    respondError(res, error);
  }
}
