import {
  prepare,
  sessionClient,
  ApiError,
  respondError,
  check,
} from "../lib/server.js";
import {
  pushConfig,
  validPushSubscription,
  sendNativePush,
} from "../lib/push.js";
export default async function handler(req, res) {
  try {
    prepare(req, res);
    const { db, profile } = await sessionClient(req, res);
    if (req.method === "GET") {
      let publicKey = "";
      try {
        publicKey = pushConfig().publicKey;
      } catch {}
      return res.json({ publicKey, configured: !!publicKey });
    }
    const b = req.body || {};
    if (b.action === "subscribe") {
      pushConfig();
      const subscription = validPushSubscription(b.subscription);
      const { data, error } = await db
        .from("app_tv_push_subscriptions")
        .upsert(
          {
            user_id: profile.id,
            endpoint: subscription.endpoint,
            subscription,
            active: true,
          },
          { onConflict: "user_id,endpoint" },
        )
        .select("id")
        .single();
      check(error);
      return res.json({ id: data.id });
    }
    if (b.action === "unsubscribe") {
      const { error } = await db
        .from("app_tv_push_subscriptions")
        .update({ active: false })
        .eq("user_id", profile.id)
        .eq("endpoint", String(b.endpoint || ""));
      check(error);
      return res.json({ ok: true });
    }
    if (b.action === "sync") {
      if (!Array.isArray(b.schedules) || b.schedules.length > 100)
        throw new ApiError("Liste de rappels invalide.");
      for (const schedule of b.schedules) {
        const { error } = await db.rpc("app_tv_sync_reminders", {
          owner: schedule.owner_id,
          items: schedule.items,
        });
        check(error);
      }
      return res.json({ ok: true });
    }
    if (b.action === "test") {
      const { data, error } = await db
        .from("app_tv_push_subscriptions")
        .update({ last_test_at: new Date().toISOString() })
        .eq("user_id", profile.id)
        .eq("id", b.id)
        .eq("active", true)
        .or(
          "last_test_at.is.null,last_test_at.lt." +
            new Date(Date.now() - 30000).toISOString(),
        )
        .select("subscription")
        .maybeSingle();
      check(error);
      if (!data)
        throw new ApiError(
          "Activez les notifications ou attendez 30 secondes avant un nouveau test.",
          429,
        );
      const status = await sendNativePush(data.subscription, {
        title: "SCDR TV",
        body: "Les notifications de SCDR TV fonctionnent sur cet appareil.",
        tag: "scdr-test-" + Date.now(),
        url: "/",
      });
      if (![200, 201, 202].includes(status))
        throw new ApiError(
          status === 410
            ? "L’autorisation a expiré. Désactivez puis réactivez les notifications."
            : "Le service de notifications n’a pas accepté le test. Réessayez dans un instant.",
          502,
        );
      return res.json({ sent: true });
    }
    throw new ApiError("Action inconnue.");
  } catch (e) {
    respondError(res, e);
  }
}
