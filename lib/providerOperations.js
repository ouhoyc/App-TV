import { createHash, webcrypto } from "node:crypto";
import { ApiError } from "./server.js";
import {
  mutationParameters,
  providerDevice,
  providerPackages,
  executeProviderMutation,
  providerIdentity,
} from "./provider.js";

const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fields =
  "id,actor_id,owner_id,client_id,action,state,context_box,result_box,error_code,created_at,updated_at";
function dbError(error) {
  if (error)
    throw new ApiError(
      "L’opération ne peut pas être sécurisée. Consultez les opérations à reprendre avant de réessayer.",
      409,
    );
}
function view(row) {
  return Object.fromEntries(
    fields.split(",").map((key) => [key, row[key] ?? null]),
  );
}

export async function encryptProviderReceipt(value, operationId, keys) {
  const raw = webcrypto.getRandomValues(new Uint8Array(32));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const key = await webcrypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
  ]);
  const ciphertext = await webcrypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode("scdr-provider:" + operationId),
    },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  const recipients = {};
  await Promise.all(
    keys.map(async (item) => {
      const rsa = await webcrypto.subtle.importKey(
        "jwk",
        item.public_jwk,
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["encrypt"],
      );
      recipients[item.user_id] = Buffer.from(
        await webcrypto.subtle.encrypt("RSA-OAEP", rsa, raw),
      ).toString("base64");
    }),
  );
  return {
    version: 1,
    iv: Buffer.from(iv).toString("base64"),
    ciphertext: Buffer.from(ciphertext).toString("base64"),
    recipients,
  };
}
export async function providerOperation(
  body,
  { db, profile },
  fetcher = fetch,
) {
  if (body.action === "history") {
    let query = db
      .from("app_tv_provider_operations")
      .select(fields)
      .in("state", ["pending", "uncertain", "succeeded", "failed"])
      .order("created_at", { ascending: false })
      .limit(50);
    if (profile.role !== "admin") query = query.eq("owner_id", profile.id);
    const { data, error } = await query;
    dbError(error);
    return { operations: data };
  }
  if (["receipt", "ack", "resolve"].includes(body.action)) {
    if (!uuid(body.operationId))
      throw new ApiError("Identifiant d’opération invalide.");
    const { data: row, error } = await db
      .from("app_tv_provider_operations")
      .select(fields)
      .eq("id", body.operationId)
      .maybeSingle();
    dbError(error);
    if (!row) throw new ApiError("Opération inaccessible.", 404);
    if (body.action === "receipt") return { operation: row };
    if (body.confirmed !== true)
      throw new ApiError(
        "Confirmez la vérification ou l’enregistrement de la fiche.",
      );
    const state = body.action === "ack" ? "applied" : "resolved";
    if (
      body.action === "ack" &&
      !["succeeded", "pending", "applied"].includes(row.state)
    )
      throw new ApiError("Vérifiez d’abord le résultat dans votre panel.", 409);
    const update = await db
      .from("app_tv_provider_operations")
      .update({ state, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    dbError(update.error);
    return { ok: true };
  }
  const parameters = mutationParameters(body);
  if (
    body.confirmed !== true ||
    !uuid(body.operationId) ||
    !uuid(body.ownerId) ||
    !uuid(body.clientId)
  )
    throw new ApiError(
      "Une confirmation et des identifiants valides sont nécessaires.",
    );
  if (profile.role !== "admin" && body.ownerId !== profile.id)
    throw new ApiError("Accès à cette clientèle refusé.", 403);
  const { data: owner, error: ownerError } = await db
    .from("app_tv_profiles")
    .select("id,active")
    .eq("id", body.ownerId)
    .maybeSingle();
  dbError(ownerError);
  if (!owner?.active)
    throw new ApiError("Le compte propriétaire doit être actif.", 409);
  const requestHash = hash(
    JSON.stringify({
      owner: body.ownerId,
      client: body.clientId,
      parameters,
      subscription: body.subscriptionId || null,
    }),
  );
  const identity = body.action === "create" ? null : providerIdentity(body);
  const resourceHash = hash(
    JSON.stringify({
      key: parameters.api_key,
      type: body.type,
      resource:
        body.action === "create"
          ? body.clientId
          : identity.username || identity.mac,
    }),
  );
  const previous = await db
    .from("app_tv_provider_operations")
    .select("*")
    .eq("id", body.operationId)
    .maybeSingle();
  dbError(previous.error);
  if (previous.data) {
    if (
      previous.data.request_hash !== requestHash ||
      previous.data.owner_id !== body.ownerId
    )
      throw new ApiError(
        "Cette opération appartient à une autre demande.",
        409,
      );
    return { operation: view(previous.data) };
  }
  const { data: profiles, error: profilesError } = await db
    .from("app_tv_profiles")
    .select("id,role,active");
  dbError(profilesError);
  const { data: publicKeys, error: keysError } = await db
    .from("app_tv_public_keys")
    .select("user_id,public_jwk");
  dbError(keysError);
  const allowed =
    profile.role === "admin"
      ? new Set(
          profiles
            .filter((p) => p.active && p.role === "admin")
            .map((p) => p.id)
            .concat(body.ownerId),
        )
      : new Set(publicKeys.map((k) => k.user_id));
  const keys = publicKeys.filter((k) => allowed.has(k.user_id));
  if (!keys.some((k) => k.user_id === body.ownerId) || keys.length < 2)
    throw new ApiError(
      "Les clés du propriétaire et des associés doivent être activées.",
      409,
    );
  // Check encryption before any remote side effect.
  await encryptProviderReceipt({ ready: true }, body.operationId, keys);
  let before = null;
  if (body.action === "create") {
    const packs = await providerPackages(body, fetcher);
    if (!packs.some((p) => p.id === String(body.pack)))
      throw new ApiError("Ce bouquet n’est plus disponible sur ce panel.");
  } else {
    before = await providerDevice(body, fetcher);
    if (body.action === "status") {
      if (!before.userId)
        throw new ApiError(
          "Le panel ne fournit pas l’identifiant nécessaire pour changer le statut. Aucune action distante n’a été lancée.",
        );
      parameters.id = before.userId;
    }
  }
  const { data: claim, error: claimError } = await db.rpc(
    "app_tv_claim_provider_operation",
    {
      entry: {
        id: body.operationId,
        owner_id: body.ownerId,
        client_id: body.clientId,
        action: body.action,
        request_hash: requestHash,
        resource_hash: resourceHash,
        context_box: body.contextBox,
      },
    },
  );
  dbError(claimError);
  if (!claim?.claimed) return { operation: view(claim.operation) };
  let result;
  try {
    result = await executeProviderMutation(body, parameters, before, fetcher);
  } catch (error) {
    const definite = [
      "UPSTREAM_KEY_DENIED",
      "UPSTREAM_API_DISABLED",
      "UPSTREAM_IP_DENIED",
      "UPSTREAM_REJECTED",
      "UPSTREAM_HTTP_DENIED",
    ].includes(error.providerCode);
    const state = definite ? "failed" : "uncertain";
    const updated = await db
      .from("app_tv_provider_operations")
      .update({
        state,
        error_code: definite ? "PROVIDER_REFUSED" : "OUTCOME_UNKNOWN",
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.operationId);
    return {
      operation: {
        ...view(claim.operation),
        state: updated.error ? "pending" : state,
        error_code: definite ? "PROVIDER_REFUSED" : "OUTCOME_UNKNOWN",
      },
    };
  }
  const resultBox = await encryptProviderReceipt(
    result,
    body.operationId,
    keys,
  );
  const completed = {
    state: "succeeded",
    result_box: resultBox,
    updated_at: new Date().toISOString(),
  };
  let saved = await db
    .from("app_tv_provider_operations")
    .update(completed)
    .eq("id", body.operationId);
  if (saved.error)
    saved = await db
      .from("app_tv_provider_operations")
      .update(completed)
      .eq("id", body.operationId);
  return {
    operation: { ...view(claim.operation), ...completed },
    persisted: !saved.error,
  };
}
