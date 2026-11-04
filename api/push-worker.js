import { client, ApiError, respondError } from "../lib/server.js";
import { pushConfig, sendNativePush } from "../lib/push.js";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (
      req.method !== "POST" ||
      !req.headers["content-type"]?.startsWith("application/json")
    )
      throw new ApiError("Méthode refusée.", 405);
    const ticket = req.body?.ticket;
    if (typeof ticket !== "string" || !/^[0-9a-f]{64}$/.test(ticket))
      throw new ApiError("Accès refusé.", 403);
    pushConfig();
    const db = client();
    const { data, error } = await db.rpc("app_tv_claim_push_dispatch", {
      ticket,
    });
    if (error) throw new ApiError("Accès refusé ou demande expirée.", 403);
    const jobs = Array.isArray(data?.jobs) ? data.jobs : [],
      results = [];
    for (let offset = 0; offset < jobs.length; offset += 5) {
      results.push(
        ...(await Promise.all(
          jobs.slice(offset, offset + 5).map(async (job) => ({
            id: job.id,
            status: await sendNativePush(job.subscription, {
              title: "SCDR TV",
              body:
                job.kind === "trial24"
                  ? "Un test de 24 h est terminé. Pensez à relancer le client."
                  : "Un abonnement annuel arrive à échéance. Pensez à le renouveler.",
              tag: job.id,
              url: "/?client=" + encodeURIComponent(job.clientId),
            }),
          })),
        )),
      );
    }
    const finished = await db.rpc("app_tv_finish_push_dispatch", {
      ticket,
      results,
    });
    if (finished.error)
      throw new ApiError("Enregistrement du résultat différé.", 503);
    return res.json({ processed: results.length });
  } catch (e) {
    respondError(res, e);
  }
}
