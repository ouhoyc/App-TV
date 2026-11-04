import {
  prepare,
  sessionClient,
  ApiError,
  respondError,
} from "../lib/server.js";
import {
  testProviderAccount,
  providerDevice,
  providerPackages,
  providerPresence,
} from "../lib/provider.js";
import { providerOperation } from "../lib/providerOperations.js";

export default async function handler(req, res) {
  try {
    prepare(req, res);
    if (req.method !== "POST")
      throw new ApiError("Méthode non autorisée.", 405);
    const session = await sessionClient(req, res);
    if (req.body?.action === "presence") {
      if (
        session.profile.role !== "admin" &&
        req.body.ownerId !== session.profile.id
      )
        throw new ApiError("Clientèle refusée.", 403);
      return res.json(await providerPresence(req.body));
    }
    if (req.body?.action === "packages")
      return res.json({ packages: await providerPackages(req.body) });
    if (req.body?.action === "device")
      return res.json({ device: await providerDevice(req.body) });
    if (
      [
        "create",
        "renew",
        "status",
        "history",
        "receipt",
        "ack",
        "resolve",
      ].includes(req.body?.action)
    )
      return res.json(await providerOperation(req.body, session));
    const account = await testProviderAccount(req.body);
    if (
      req.body.acceptPartial !== true &&
      Object.values(account).some((v) => v === null)
    )
      throw new ApiError(
        "Le panel confirme la connexion. Fermez puis rouvrez SCDR TV pour afficher les informations disponibles.",
        409,
      );
    return res.json(account);
  } catch (error) {
    if (error.providerCode) {
      // Fixed code and allowlisted schema only. No key, URL, values or raw text.
      console.warn("scdr-provider-test", {
        code: error.providerCode,
        ...(error.providerShape ? { shape: error.providerShape } : {}),
      });
    }
    respondError(res, error);
  }
}
