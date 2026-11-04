import { workspaceSnapshot } from "../lib/workspace.js";
import {
  prepare,
  sessionClient,
  check,
  ApiError,
  respondError,
} from "../lib/server.js";
export default async function handler(req, res) {
  try {
    prepare(req, res);
    const { db, profile } = await sessionClient(req, res);
    if (req.method === "GET") {
      return res.json(await workspaceSnapshot(db, profile));
    }
    const b = req.body || {};
    if (b.action === "setup-keys") {
      const { error } = await db.rpc("app_tv_setup_keys", {
        jwk: b.jwk,
        password_box: b.password_box,
        recovery_box: b.recovery_box,
        proof_hash: b.recovery_hash,
      });
      check(error);
      return res.json({ ok: true });
    }
    if (b.action === "save") {
      if (
        !Array.isArray(b.changes) ||
        b.changes.length > 100 ||
        JSON.stringify(b).length > 3500000
      )
        throw new ApiError(
          "Sauvegarde trop volumineuse. Contactez un administrateur.",
          413,
        );
      const { data, error } = await db.rpc(
        Array.isArray(b.reminders)
          ? "app_tv_save_with_reminders"
          : "app_tv_save_vaults",
        {
          changes: b.changes,
          ...(Array.isArray(b.reminders) ? { reminders: b.reminders } : {}),
        },
      );
      check(error);
      return res.json({ revisions: data });
    }
    throw new ApiError("Action inconnue.");
  } catch (error) {
    respondError(res, error);
  }
}
