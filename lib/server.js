import { createClient } from "@supabase/supabase-js";
const COOKIE = "app_tv_session";
export class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function client() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY)
    throw new ApiError(
      "La connexion aux comptes n’est pas encore configurée.",
      503,
    );
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
export function prepare(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Cookie");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!["GET", "POST"].includes(req.method))
    throw new ApiError("Méthode non autorisée.", 405);
  if (req.method === "POST") {
    const protocol = process.env.VERCEL ? "https" : "http";
    const origin = `${protocol}://${req.headers.host}`;
    if (req.headers.origin !== origin)
      throw new ApiError("Origine de la requête refusée.", 403);
    if (!req.headers["content-type"]?.startsWith("application/json"))
      throw new ApiError("Format de requête invalide.", 415);
  }
}
export function cookie(res, session) {
  const value = session
    ? Buffer.from(
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }),
      ).toString("base64url")
    : "";
  if (value.length > 3800) throw new ApiError("Session trop volumineuse.", 500);
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${session ? 2592000 : 0}${process.env.VERCEL ? "; Secure" : ""}`,
  );
}
export async function sessionClient(req, res) {
  const raw = req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  if (!raw || raw.length > 3800)
    throw new ApiError("Reconnectez-vous à votre compte.", 401);
  let tokens;
  try {
    tokens = JSON.parse(Buffer.from(raw, "base64url").toString());
  } catch {
    throw new ApiError("Session invalide.", 401);
  }
  const db = client();
  const { data, error } = await db.auth.setSession(tokens);
  if (error || !data.session) {
    cookie(res, null);
    throw new ApiError("Votre session a expiré. Reconnectez-vous.", 401);
  }
  // Pinned auth-js _setSession verifies unexpired tokens via _getUser,
  // and expired tokens via the Auth refresh endpoint. Reuse that server-
  // verified user instead of issuing an identical second /auth/v1/user call.
  const verified = { user: data.user };
  if (!verified.user) {
    cookie(res, null);
    throw new ApiError("Connexion requise.", 401);
  }
  cookie(res, data.session);
  const { data: profile, error: profileError } = await db
    .from("app_tv_profiles")
    .select("*")
    .eq("id", verified.user.id)
    .maybeSingle();
  if (profileError) throw new ApiError("Lecture du compte impossible.", 503);
  if (!profile?.active) {
    cookie(res, null);
    throw new ApiError(
      "Ce compte n’est pas actif. Contactez un administrateur.",
      403,
    );
  }
  return { db, user: verified.user, profile, session: data.session };
}
export function check(error) {
  if (error)
    throw new ApiError(
      error.code === "40001" || error.code === "23505"
        ? "Les données ont changé. Rechargez avant de réessayer."
        : "Enregistrement refusé. Les données n’ont pas été modifiées.",
      error.code === "40001" || error.code === "23505" ? 409 : 400,
    );
}
export async function edge(b, jwt) {
  const db = client();
  const { data, error } = await db.functions.invoke("app-tv-account", {
    body: b,
    ...(jwt ? { headers: { Authorization: "Bearer " + jwt } } : {}),
  });
  if (error) {
    let message = "L’opération n’a pas pu être terminée.";
    let status = 400;
    try {
      const body = await error.context.json();
      message = body.error || message;
      status = error.context.status || 400;
    } catch {}
    throw new ApiError(message, status);
  }
  return data;
}
export function respondError(res, error) {
  res.status(error.status || 500).json({
    error: error.status
      ? error.message
      : "Service momentanément indisponible. Réessayez.",
  });
}
export function validCredential(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
